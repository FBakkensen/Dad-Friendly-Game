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
import type { Mountain } from "../mountain";
import { effectiveRates } from "../rates";
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

/** What `valueOf` says a move is worth. Payback is seconds. */
export type ActionValue = {
  /** Extra crew stones a second, spread across `horizon` for a boost. */
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
 * Values a move from `effectiveRates` before and after, never from a second
 * copy of the upgrade maths. Tiers and workers use the same numbers as
 * `pacing.ts` `bestValue`: a worker is the crew delta of hiring one, and a
 * machine is that tier's current speed with the missing workers added to
 * the cost. `horizon` is seconds. A boost's extra speed is spread across
 * it; a permanent move is not. The caller supplies the horizon.
 */
export function valueOf(
  mountain: Mountain,
  action: Action,
  horizon: number,
): ActionValue {
  switch (action.kind) {
    case "buyTier":
      return valueTier(mountain, action.id, horizon);
    case "buyUpgrade":
      return valueUpgrade(mountain, action.id, horizon);
    case "buyBoost":
      return valueBoost(mountain, action.id, horizon);
    case "promote": {
      const cost = promoteCost(mountain);
      return rateValue(
        mountain,
        crewGain(mountain, promote(funded(mountain, cost))),
        cost,
        horizon,
      );
    }
    case "station":
      return rateValue(
        mountain,
        crewGain(mountain, station(mountain, action.index, action.post)),
        0,
        horizon,
      );
    case "send":
      return rateValue(
        mountain,
        crewGain(mountain, send(mountain, action.index, action.tunnel, 0)),
        0,
        horizon,
      );
    case "recall":
      return rateValue(
        mountain,
        crewGain(mountain, recall(mountain, action.index)),
        0,
        horizon,
      );
    case "fixTrouble":
      return rateValue(mountain, troubleGain(mountain, action), 0, horizon);
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
): ActionValue {
  const tier = tierById(id);
  const price = tierCost(tier, owned(mountain, tier));
  const cost = price + staffBill(mountain, tier);
  if (tierLocked(mountain, tier)) {
    return rateValue(mountain, 0, cost, horizon);
  }
  // Workers and kids: the crew delta, including any idle machine they start.
  // A machine: its current per-unit speed. Folding the buy into a funded
  // mountain would also count the first borer's engineer and any synergy
  // the bundled workers add, which the sim does not score.
  const gain =
    tier.staff === 0
      ? crewGain(mountain, buyCrew(funded(mountain, price), id))
      : effectiveRates(mountain).tierSpeed[id];
  return rateValue(mountain, gain, cost, horizon);
}

function valueUpgrade(
  mountain: Mountain,
  id: UpgradeId,
  horizon: number,
): ActionValue {
  const upgrade = upgradeById(id);
  const price = upgradeCost(upgrade, upgradeLevel(mountain, id));
  if (price === undefined || !upgradeUnlocked(mountain, upgrade)) {
    return rateValue(mountain, 0, price ?? 0, horizon);
  }
  return rateValue(
    mountain,
    crewGain(mountain, buyUpgrade(funded(mountain, price), id)),
    price,
    horizon,
  );
}

function valueBoost(
  mountain: Mountain,
  id: BoostId,
  horizon: number,
): ActionValue {
  const boost = boostById(id);
  const pricing = effectiveRates(mountain);
  const cost = boostCost(boost, pricing);
  // After every boost already on the clock, so this purchase is the only
  // one running when its speed is read.
  const now = clockAfterBoosts(mountain);
  const bought = buyBoost({
    mountain: funded(mountain, cost),
    id,
    now,
    pricing,
  });
  return rateValue(
    mountain,
    effectiveRates(bought, now).crewPerSecond -
      effectiveRates(mountain, now).crewPerSecond,
    cost,
    horizon,
    boost.durationMs / 1000,
  );
}

function troubleGain(
  mountain: Mountain,
  action: Extract<Action, { kind: "fixTrouble" }>,
): number {
  const trouble: Trouble = {
    kind: kindForTier(action.tier),
    tier: action.tier,
    startedAt: action.startedAt,
  };
  return (
    effectiveRates(mountain, action.startedAt).crewPerSecond -
    effectiveRates(mountain, action.startedAt, trouble).crewPerSecond
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

function crewGain(before: Mountain, after: Mountain): number {
  return (
    effectiveRates(after).crewPerSecond - effectiveRates(before).crewPerSecond
  );
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
  durationSec = Number.POSITIVE_INFINITY,
): ActionValue {
  const gainPerSec = instantGain * activeShare(horizon, durationSec);
  return {
    gainPerSec,
    cost,
    paybackSec: payback(
      mountain.pocket,
      effectiveRates(mountain).crewPerSecond,
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
