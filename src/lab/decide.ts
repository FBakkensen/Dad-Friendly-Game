import type { Trouble } from "../hazards";
import { boostById, boostCost } from "../boosts";
import {
  incomePerSecond,
  listActions,
  valueOf,
  type Action,
} from "../economy/actions";
import { promoteCost, staffNeeded } from "../engineers";
import type { TunnelId } from "../expeditions";
import type { Mountain } from "../mountain";
import { effectiveRates } from "../rates";
import { owned, tierById, tierCost, TIERS, type Tier } from "../tiers";
import { upgradeById, upgradeCost, upgradeLevel } from "../upgrades";
import {
  valueContext,
  type DecideInput,
  type PolicyParams,
  type SpendWeights,
} from "./policy";
import {
  HORIZON_SEC,
  LOOKAHEAD_SESSIONS,
  SAMPLE_INTERVAL_SEC,
  VALUE_TIE,
} from "./targets";

/**
 * The purchase this dad wants most, or nothing if every legal spend is
 * refused. Affordability and the hoard live with the runner.
 */
export function parameterisedDecide(input: DecideInput): Action | undefined {
  const { mountain, now, params } = input;
  const context = valueContext(params);
  let best: { readonly action: Action; readonly value: number } | undefined;
  for (const action of listActions(mountain, now)) {
    const key = spendKey(mountain, action, params);
    if (key === undefined) {
      continue;
    }
    const weight = params.spend[key];
    if (!(weight > 0)) {
      continue;
    }
    const priced = valueOf(mountain, action, HORIZON_SEC, context, now);
    // A listed purchase has a price. A zero cost would divide the ranking.
    /* v8 ignore next 3 -- catalogue prices stay above zero */
    if (!(priced.cost > 0)) {
      continue;
    }
    const value = (weight * priced.gainPerSec) / priced.cost;
    if (best === undefined || outranks(value, best.value)) {
      best = { action, value };
    }
  }
  return best?.action;
}

/**
 * Greedy lowest payback. A move that is not affordable yet still competes
 * when its wait fits in the lookahead. If that move wins, the dad saves
 * and buys nothing. One step: the next purchase only, not a chain.
 * Boosts stay off the purchase. Overtime is still weighed on the menu, so
 * a save for the borer or the Great Machine is not an empty sitting.
 * Buying it would take that button off the table.
 */
export function optimizerDecide(input: DecideInput): Action | undefined {
  const { mountain, now, params } = input;
  const context = valueContext(params);
  const income = incomePerSecond(mountain, context);
  const windowSec = lookaheadSeconds(params);
  let best: { readonly action: Action; readonly payback: number } | undefined;
  for (const action of listActions(mountain, now)) {
    if (!isPurchase(action) || action.kind === "buyBoost") {
      continue;
    }
    const priced = valueOf(mountain, action, HORIZON_SEC, context, now);
    if (!Number.isFinite(priced.paybackSec)) {
      continue;
    }
    const wait = affordSeconds(mountain.pocket, income, priced.cost);
    if (wait > windowSec) {
      continue;
    }
    if (best === undefined || outranks(best.payback, priced.paybackSec)) {
      best = { action, payback: priced.paybackSec };
    }
  }
  if (best === undefined || !paidNow(mountain, best.action)) {
    return undefined;
  }
  return best.action;
}

/**
 * Real seconds the optimizer may wait. `LOOKAHEAD_SESSIONS` day-cycles:
 * each sitting plus the gap before it, because away pay shows up first.
 */
export function lookaheadSeconds(params: PolicyParams): number {
  const live = params.minutesPerSession * SAMPLE_INTERVAL_SEC;
  const away = Math.max(0, valueContext(params).awaySeconds);
  return LOOKAHEAD_SESSIONS * (live + away);
}

/**
 * The pocket can pay the sticker, and a hoarder also holds `hoardK` times
 * that price. A hoard of one is the plain "buy it when you can".
 */
export function canPay(
  mountain: Mountain,
  action: Action,
  hoardK: number,
): boolean {
  const price = sticker(mountain, action);
  if (!(price <= mountain.pocket)) {
    return false;
  }
  if (!(hoardK > 1)) {
    return true;
  }
  return mountain.pocket >= hoardK * price;
}

/**
 * What the pocket pays. A machine's workers are not in this price.
 * A listed upgrade still has a level to buy, so the price is present.
 */
export function sticker(mountain: Mountain, action: Action): number {
  switch (action.kind) {
    case "buyTier": {
      const tier = tierById(action.id);
      return tierCost(tier, owned(mountain, tier));
    }
    case "buyUpgrade": {
      const price = upgradeCost(
        upgradeById(action.id),
        upgradeLevel(mountain, action.id),
      );
      return price ?? Number.POSITIVE_INFINITY;
    }
    case "buyBoost":
      return boostCost(boostById(action.id), effectiveRates(mountain));
    case "promote":
      return promoteCost(mountain);
    case "station":
    case "send":
    case "recall":
    case "fixTrouble":
      return 0;
  }
}

/** True when sending this engineer raises the schedule's income. */
export function sendWorthIt(
  mountain: Mountain,
  index: number,
  tunnel: TunnelId,
  params: PolicyParams,
): boolean {
  const priced = valueOf(
    mountain,
    { kind: "send", index, tunnel },
    HORIZON_SEC,
    valueContext(params),
  );
  return priced.gainPerSec > 0;
}

/**
 * Purchases this dad will weigh. Free posts, recalls, and fixes stay off,
 * and so does a spend whose weight is zero. Dead stretch reads this list:
 * a zero price pays back at once, and a refused upgrade is not a decision.
 */
export function actionsOnTable(
  mountain: Mountain,
  now: number,
  params: PolicyParams,
  trouble?: Trouble,
): readonly Action[] {
  return listActions(mountain, now, trouble).filter((action) => {
    const key = spendKey(mountain, action, params);
    return key !== undefined && params.spend[key] > 0;
  });
}

function spendKey(
  mountain: Mountain,
  action: Action,
  params: PolicyParams,
): keyof SpendWeights | undefined {
  switch (action.kind) {
    case "buyTier":
      return tierKey(mountain, tierById(action.id), params);
    case "buyUpgrade":
      return "upgrade";
    case "buyBoost":
      return params.boosts === "never" ? undefined : "boost";
    case "promote":
      return params.promote === "on-value" ? "promote" : undefined;
    case "station":
    case "send":
    case "recall":
    case "fixTrouble":
      return undefined;
  }
}

function tierKey(
  mountain: Mountain,
  tier: Tier,
  params: PolicyParams,
): keyof SpendWeights | undefined {
  if (tier.staff > 0) {
    return "machine";
  }
  if (params.workers === "never") {
    return undefined;
  }
  if (params.workers === "staff-only" && staffShort(mountain) <= 0) {
    return undefined;
  }
  return "worker";
}

/** Workers still needed so every machine already owned can run. */
function staffShort(mountain: Mountain): number {
  const needed = TIERS.reduce(
    (total, tier) =>
      total + owned(mountain, tier) * staffNeeded(mountain, tier),
    0,
  );
  return Math.max(0, needed - mountain.helpers - mountain.kids);
}

function isPurchase(
  action: Action,
): action is Extract<
  Action,
  { kind: "buyTier" | "buyUpgrade" | "buyBoost" | "promote" }
> {
  return (
    action.kind === "buyTier" ||
    action.kind === "buyUpgrade" ||
    action.kind === "buyBoost" ||
    action.kind === "promote"
  );
}

function paidNow(mountain: Mountain, action: Action): boolean {
  return sticker(mountain, action) <= mountain.pocket;
}

function affordSeconds(pocket: number, income: number, cost: number): number {
  const shortfall = Math.max(cost - pocket, 0);
  if (shortfall === 0) {
    return 0;
  }
  // A quiet mountain (no income) waits forever: dividing by zero is Infinity.
  return shortfall / Math.max(income, 0);
}

function outranks(candidate: number, current: number): boolean {
  const scale = Math.max(Math.abs(candidate), Math.abs(current), 1);
  return (candidate - current) / scale > VALUE_TIE;
}
