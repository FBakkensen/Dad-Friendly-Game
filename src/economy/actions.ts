import {
  BOOSTS,
  boostById,
  boostCost,
  boostLeft,
  buyBoost,
  type BoostId,
} from "../boosts";
import { buyCrew, tierLocked } from "../crew";
import {
  ENGINEER_POSTS,
  MAX_ENGINEERS,
  promote,
  promoteCost,
  staffForBuy,
  staffNeeded,
  station,
  type Engineer,
  type EngineerPost,
} from "../engineers";
import {
  MAX_EXPEDITIONS,
  TUNNELS,
  recall,
  send,
  type TunnelId,
} from "../expeditions";
import { kindForTier, type Trouble, type TroubleTier } from "../hazards";
import { expeditionAwayMs } from "../lost-tools";
import { mineByHand, type Mountain } from "../mountain";
import { effectiveRates, heartBonus } from "../rates";
import {
  TIERS,
  owned,
  tierById,
  tierCost,
  tierShown,
  type Tier,
  type TierId,
} from "../tiers";
import {
  UPGRADES,
  buyUpgrade,
  upgradeById,
  upgradeCost,
  upgradeLevel,
  upgradeUnlocked,
  type UpgradeId,
} from "../upgrades";

/**
 * One legal player move. A new kind has to be handled in `listActions`,
 * `applyAction`, and `valueOf` or the switch stops typechecking.
 */
export type Action =
  | { readonly kind: "buyTier"; readonly id: TierId }
  | { readonly kind: "buyUpgrade"; readonly id: UpgradeId }
  | { readonly kind: "buyBoost"; readonly id: BoostId }
  | { readonly kind: "promote" }
  | {
      readonly kind: "station";
      readonly index: number;
      readonly post: EngineerPost;
    }
  | { readonly kind: "send"; readonly index: number; readonly tunnel: TunnelId }
  | { readonly kind: "recall"; readonly index: number }
  | {
      readonly kind: "fixTrouble";
      readonly tier: TroubleTier;
      readonly startedAt: number;
    };

/**
 * How a player spends the horizon. The player type's schedule supplies it
 * (`src/lab/policies`, #172). The catalogue does not pick a dad of its own.
 */
export type ValueContext = {
  /** Taps while they are at the mountain. Zero when they never tap. */
  readonly tapsPerSecond: number;
  /** Seconds at the mountain in one cycle of the schedule. */
  readonly liveSeconds: number;
  /** Seconds away in that same cycle, before the away cap. */
  readonly awaySeconds: number;
};

/** What `valueOf` says a move is worth. Payback is seconds. */
export type ActionValue = {
  /** Extra income, stones a second, spread across `horizon` for a boost. */
  readonly gainPerSec: number;
  /** Stones to pay. A machine includes the workers it still needs. */
  readonly cost: number;
  /**
   * Cookie Monster: `max(cost - pocket, 0) / income + cost / gain`.
   * Infinite when the move does not raise the crew's speed.
   */
  readonly paybackSec: number;
};

/**
 * Every move the rules allow right now, affordable or not. A buy you cannot
 * pay for stays listed, because its payback includes the wait. Pass `trouble`
 * while a machine is in trouble so the fix is on the list. The horizon lives
 * with the caller.
 */
export function listActions(
  mountain: Mountain,
  now: number,
  trouble?: Trouble,
): readonly Action[] {
  const actions: Action[] = [];
  for (const tier of TIERS) {
    if (tierShown(mountain, tier) && !tierLocked(mountain, tier)) {
      actions.push({ kind: "buyTier", id: tier.id });
    }
  }
  for (const upgrade of UPGRADES) {
    if (
      upgradeUnlocked(mountain, upgrade) &&
      upgradeCost(upgrade, upgradeLevel(mountain, upgrade.id)) !== undefined
    ) {
      actions.push({ kind: "buyUpgrade", id: upgrade.id });
    }
  }
  for (const boost of BOOSTS) {
    if (boostLeft(mountain, boost.id, now) === 0) {
      actions.push({ kind: "buyBoost", id: boost.id });
    }
  }
  if (
    (mountain.engineers?.length ?? 0) < MAX_ENGINEERS &&
    mountain.helpers >= 1
  ) {
    actions.push({ kind: "promote" });
  }
  for (const [index, hand] of (mountain.engineers ?? []).entries()) {
    if (onTrip(mountain, hand.name)) {
      actions.push({ kind: "recall", index });
      continue;
    }
    for (const post of ENGINEER_POSTS) {
      if (post !== "tunnel" && post !== hand.post) {
        actions.push({ kind: "station", index, post });
      }
    }
    for (const spec of TUNNELS) {
      if (canSend(mountain, hand, spec, now)) {
        actions.push({ kind: "send", index, tunnel: spec.id });
      }
    }
  }
  if (trouble !== undefined) {
    actions.push({
      kind: "fixTrouble",
      tier: trouble.tier,
      startedAt: trouble.startedAt,
    });
  }
  return actions;
}

/**
 * Plays the move through the function the game already uses. Fixing trouble
 * does not change the mountain: that state lives on the session, and
 * `hazards.fix` is what clears it.
 */
export function applyAction(
  mountain: Mountain,
  action: Action,
  now: number,
): Mountain {
  switch (action.kind) {
    case "buyTier":
      return buyCrew(mountain, action.id);
    case "buyUpgrade":
      return buyUpgrade(mountain, action.id);
    case "buyBoost":
      return buyBoost({
        mountain,
        id: action.id,
        now,
        pricing: effectiveRates(mountain),
      });
    case "promote":
      return promote(mountain);
    case "station":
      return station(mountain, action.index, action.post);
    case "send":
      return send(mountain, action.index, action.tunnel, now);
    case "recall":
      return recall(mountain, action.index);
    case "fixTrouble":
      return mountain;
    /* v8 ignore next 3 -- exhaustiveness guard, unreachable */
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

/**
 * Values a move from income before and after. Income mixes the unrounded
 * crew, taps from `mineByHand`, and away pay from the same factor as
 * `accrueAway`, weighted by `context`. No second copy of the upgrade maths.
 * A machine's cost includes the workers it still needs. `horizon` is
 * seconds: a boost's extra income is spread across it, and a permanent
 * move is not.
 */
export function valueOf(
  mountain: Mountain,
  action: Action,
  horizon: number,
  context: ValueContext,
): ActionValue {
  switch (action.kind) {
    case "buyTier":
      return valueTier(mountain, action.id, horizon, context);
    case "buyUpgrade":
      return valueUpgrade(mountain, action.id, horizon, context);
    case "buyBoost":
      return valueBoost(mountain, action.id, horizon, context);
    case "promote": {
      // TODO(#172): finds are valued at 0. Promote, station, and send only
      // change speed until a player type scores a find.
      const cost = promoteCost(mountain);
      return rateValue(
        mountain,
        incomeGain(mountain, promote(funded(mountain, cost)), context),
        cost,
        horizon,
        context,
      );
    }
    case "station":
      return rateValue(
        mountain,
        incomeGain(
          mountain,
          station(mountain, action.index, action.post),
          context,
        ),
        0,
        horizon,
        context,
      );
    case "send":
      return rateValue(
        mountain,
        incomeGain(
          mountain,
          send(mountain, action.index, action.tunnel, 0),
          context,
        ),
        0,
        horizon,
        context,
      );
    case "recall":
      return rateValue(
        mountain,
        incomeGain(mountain, recall(mountain, action.index), context),
        0,
        horizon,
        context,
      );
    case "fixTrouble":
      return rateValue(
        mountain,
        troubleGain(mountain, action, context),
        0,
        horizon,
        context,
      );
    /* v8 ignore next 3 -- exhaustiveness guard, unreachable */
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

function valueTier(
  mountain: Mountain,
  id: TierId,
  horizon: number,
  context: ValueContext,
): ActionValue {
  const tier = tierById(id);
  const price = tierCost(tier, owned(mountain, tier));
  const cost = price + staffBill(mountain, tier);
  if (tierLocked(mountain, tier)) {
    return rateValue(mountain, 0, cost, horizon, context);
  }
  // Workers and kids: hiring one, including any idle machine they start.
  // A machine: the income of that tier once the workers it needs are at
  // work. The first borer's engineer is not part of this score.
  const gain =
    tier.staff === 0
      ? incomeGain(mountain, buyCrew(funded(mountain, price), id), context)
      : machineGain(mountain, tier, context);
  return rateValue(mountain, gain, cost, horizon, context);
}

function machineGain(
  mountain: Mountain,
  tier: Tier,
  context: ValueContext,
): number {
  // Enough hands that every machine already owned keeps running, and one
  // more of this tier runs too. The same hands are on both sides, so their
  // own mining cancels and the gain is this tier. The first borer's
  // engineer is not posted here.
  const pad = TIERS.reduce(
    (total, item) =>
      total + (owned(mountain, item) + 1) * staffNeeded(mountain, item),
    0,
  );
  const rested = { ...mountain, helpers: mountain.helpers + pad };
  const running = { ...rested, [tier.field]: owned(rested, tier) + 1 };
  return incomeGain(rested, running, context);
}

function valueUpgrade(
  mountain: Mountain,
  id: UpgradeId,
  horizon: number,
  context: ValueContext,
): ActionValue {
  const upgrade = upgradeById(id);
  const price = upgradeCost(upgrade, upgradeLevel(mountain, id));
  if (price === undefined || !upgradeUnlocked(mountain, upgrade)) {
    return rateValue(mountain, 0, price ?? 0, horizon, context);
  }
  return rateValue(
    mountain,
    incomeGain(mountain, buyUpgrade(funded(mountain, price), id), context),
    price,
    horizon,
    context,
  );
}

function valueBoost(
  mountain: Mountain,
  id: BoostId,
  horizon: number,
  context: ValueContext,
): ActionValue {
  const boost = boostById(id);
  const pricing = effectiveRates(mountain);
  const cost = boostCost(boost, pricing);
  // After every boost already on the clock, so this purchase is the only
  // one running when its speed is read. Away pay never counts a boost.
  const now = clockAfterBoosts(mountain);
  const bought = buyBoost({
    mountain: funded(mountain, cost),
    id,
    now,
    pricing,
  });
  return rateValue(
    mountain,
    incomeGain(mountain, bought, context, { now }),
    cost,
    horizon,
    context,
    boost.durationMs / 1000,
  );
}

function troubleGain(
  mountain: Mountain,
  action: Extract<Action, { kind: "fixTrouble" }>,
  context: ValueContext,
): number {
  const trouble: Trouble = {
    kind: kindForTier(action.tier),
    tier: action.tier,
    startedAt: action.startedAt,
  };
  const clock = { now: action.startedAt, trouble };
  return (
    incomePerSecond(mountain, context, { now: action.startedAt }) -
    incomePerSecond(mountain, context, clock)
  );
}

/** Workers a machine still needs, priced as the next hires. Zero for a worker. */
function staffBill(mountain: Mountain, tier: Tier): number {
  if (tier.staff === 0) {
    return 0;
  }
  const helper = tierById("helper");
  const short = Math.max(
    0,
    staffForBuy(mountain, tier) - freeHelpers(mountain),
  );
  let cost = 0;
  for (let extra = 0; extra < short; extra += 1) {
    cost += tierCost(helper, mountain.helpers + extra);
  }
  return cost;
}

/** Hands not already running a machine. Matches the sim's spare count. */
function freeHelpers(mountain: Mountain): number {
  const rates = effectiveRates(mountain);
  const used = TIERS.reduce(
    (total, tier) =>
      total + rates.running[tier.id] * staffNeeded(mountain, tier),
    0,
  );
  return mountain.helpers + mountain.kids - used;
}

function incomeGain(
  before: Mountain,
  after: Mountain,
  context: ValueContext,
  clock?: ValueClock,
): number {
  return (
    incomePerSecond(after, context, clock) -
    incomePerSecond(before, context, clock)
  );
}

type ValueClock = {
  readonly now: number;
  readonly trouble?: Trouble;
};

/**
 * Stones a second of the schedule. Live time pays the unrounded crew and
 * each tap (`mineByHand`). Away time pays the same factor as `accrueAway`,
 * and only up to the away cap. The rest of a long absence pays nothing.
 * The lab reads this for its lookahead so it does not keep a second formula.
 */
export function incomePerSecond(
  mountain: Mountain,
  context: ValueContext,
  clock?: ValueClock,
): number {
  const liveRates = effectiveRates(mountain, clock?.now, clock?.trouble);
  const awayRates = effectiveRates(mountain);
  const tap = oneTap(mountain, clock?.now, clock?.trouble);
  const liveSeconds = context.liveSeconds;
  const awaySeconds = context.awaySeconds;
  const cycle = liveSeconds + awaySeconds;
  const capSeconds = awayRates.awayCapMs / 1000;
  const paidAway = awaySeconds <= 0 ? 0 : Math.min(awaySeconds, capSeconds);
  const liveIncome = liveRates.exactCrewPerSecond + context.tapsPerSecond * tap;
  const awayIncome =
    awayRates.exactCrewPerSecond * awayFactor(mountain, paidAway * 1000);
  if (!(cycle > 0)) {
    return liveIncome;
  }
  return (liveSeconds * liveIncome + paidAway * awayIncome) / cycle;
}

/** What one tap adds to the pocket. Zero on an empty mountain. */
function oneTap(mountain: Mountain, now?: number, trouble?: Trouble): number {
  return mineByHand(mountain, now, trouble).pocket - mountain.pocket;
}

/** The pay fraction `accrueAway` applies, including the Heart of Patience. */
function awayFactor(mountain: Mountain, paidMs: number): number {
  const rates = effectiveRates(mountain);
  const heart = heartBonus(mountain, paidMs);
  return Math.round(rates.awayPay * heart * 1e9) / 1e9;
}

function funded(mountain: Mountain, price: number): Mountain {
  return { ...mountain, pocket: mountain.pocket + price };
}

function clockAfterBoosts(mountain: Mountain): number {
  let latest = 0;
  for (const endsAt of Object.values(mountain.boosts ?? {})) {
    if (endsAt > latest) {
      latest = endsAt;
    }
  }
  return latest + 1;
}

function rateValue(
  mountain: Mountain,
  instantGain: number,
  cost: number,
  horizon: number,
  context: ValueContext,
  durationSec = Number.POSITIVE_INFINITY,
): ActionValue {
  const gainPerSec = instantGain * activeShare(horizon, durationSec);
  return {
    gainPerSec,
    cost,
    paybackSec: payback(
      mountain.pocket,
      incomePerSecond(mountain, context),
      cost,
      gainPerSec,
    ),
  };
}

/**
 * Share of the horizon a timed effect is actually running. A permanent move
 * fills the window. A non-positive horizon means "the rate while it lasts".
 */
function activeShare(horizon: number, durationSec: number): number {
  if (!(horizon > 0) || !Number.isFinite(durationSec)) {
    return 1;
  }
  if (!Number.isFinite(horizon)) {
    return 0;
  }
  return Math.min(durationSec, horizon) / horizon;
}

function payback(
  pocket: number,
  income: number,
  cost: number,
  gain: number,
): number {
  if (!(gain > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  const shortfall = Math.max(cost - pocket, 0);
  const afford =
    shortfall === 0
      ? 0
      : income > 0
        ? shortfall / income
        : Number.POSITIVE_INFINITY;
  return afford + cost / gain;
}

function onTrip(mountain: Mountain, name: string): boolean {
  return (mountain.expeditions ?? []).some((trip) => trip.engineer === name);
}

function canSend(
  mountain: Mountain,
  hand: Engineer,
  spec: (typeof TUNNELS)[number],
  now: number,
): boolean {
  // `send` also refuses a full expedition list. Someone still at home
  // usually means there is room; the length check covers a bad save.
  return (
    hand.post !== "tunnel" &&
    hand.rank >= spec.minRank &&
    Number.isSafeInteger(now) &&
    Number.isSafeInteger(now + expeditionAwayMs(spec.awayMs, mountain)) &&
    (mountain.expeditions?.length ?? 0) < MAX_EXPEDITIONS
  );
}
