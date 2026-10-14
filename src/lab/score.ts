import type { Trouble } from "../hazards";
import { mineByHand, type Mountain } from "../mountain";
import { effectiveRates } from "../rates";
import { station } from "../engineers";
import { TIERS } from "../tiers";
import {
  listActions,
  valueOf,
  type Action,
  type ValueContext,
} from "../economy/actions";
import { MOVE_KINDS, type DecisionSample } from "./measure";
import { HORIZON_SEC, LIVE_RATIO, TENDING_SOURCE, VALUE_TIE } from "./targets";

export type ScoreInput = {
  readonly mountain: Mountain;
  readonly now: number;
  readonly context: ValueContext;
  /** The table this dad is weighing. Defaults to every legal move. */
  readonly actions?: readonly Action[];
  readonly atMs: number;
  readonly trouble?: Trouble;
  /**
   * Spends this dad weighs. When omitted, the stretch uses `actions`
   * (or the whole legal list, when that was omitted too).
   */
  readonly stretchActions?: readonly Action[];
};

type Priced = {
  readonly id: string;
  readonly kind: Action["kind"];
  readonly paybackSec: number;
  readonly perStone: number;
  readonly waitSec: number;
  readonly affordable: boolean;
};

type Summary = {
  readonly liveCount: number;
  readonly affordableLive: number;
  readonly bestId: string;
  readonly bestKind: Action["kind"] | "";
  readonly waitToAffordSec: number;
  readonly perStone: number;
};

const EMPTY: Summary = {
  liveCount: 0,
  affordableLive: 0,
  bestId: "",
  bestKind: "",
  waitToAffordSec: 0,
  perStone: 0,
};

function actionId(action: Action): string {
  switch (action.kind) {
    case "buyTier":
    case "buyUpgrade":
    case "buyBoost":
      return `${action.kind}:${action.id}`;
    case "promote":
      return "promote";
    case "station":
      return `station:${String(action.index)}:${action.post}`;
    case "send":
      return `send:${String(action.index)}:${action.tunnel}`;
    case "recall":
      return `recall:${String(action.index)}`;
    case "fixTrouble":
      return `fixTrouble:${action.tier}`;
  }
}

function waitToAfford(
  pocket: number,
  cost: number,
  gain: number,
  payback: number,
): number {
  if (!(cost > pocket)) {
    return 0;
  }
  if (!(gain > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  const afford = payback - cost / gain;
  return afford > 0 ? afford : 0;
}

function price(
  mountain: Mountain,
  action: Action,
  context: ValueContext,
  now: number,
): Priced {
  const priced = valueOf(mountain, action, HORIZON_SEC, context, now);
  const gain = priced.gainPerSec;
  const cost = priced.cost;
  const perStone =
    cost > 0 ? gain / cost : gain > 0 ? Number.POSITIVE_INFINITY : 0;
  return {
    id: actionId(action),
    kind: action.kind,
    paybackSec: priced.paybackSec,
    perStone,
    waitSec: waitToAfford(mountain.pocket, cost, gain, priced.paybackSec),
    affordable: !(cost > mountain.pocket),
  };
}

/** Lower payback wins. An equal payback keeps the earlier offer. */
function betterPayback(move: Priced, best: Priced): boolean {
  const scale = Math.max(
    Math.abs(move.paybackSec),
    Math.abs(best.paybackSec),
    1,
  );
  return (best.paybackSec - move.paybackSec) / scale > VALUE_TIE;
}

function byPayback(moves: readonly Priced[]): Summary {
  let best: Priced | undefined;
  for (const move of moves) {
    if (!Number.isFinite(move.paybackSec)) {
      continue;
    }
    if (best === undefined || betterPayback(move, best)) {
      best = move;
    }
  }
  if (best === undefined) {
    return EMPTY;
  }
  const ceiling = best.paybackSec * LIVE_RATIO;
  let liveCount = 0;
  let affordableLive = 0;
  for (const move of moves) {
    if (!(move.paybackSec <= ceiling)) {
      continue;
    }
    liveCount += 1;
    if (move.affordable) {
      affordableLive += 1;
    }
  }
  return {
    liveCount,
    affordableLive,
    bestId: best.id,
    bestKind: best.kind,
    waitToAffordSec: best.waitSec,
    perStone: best.perStone,
  };
}

/**
 * Next finite payback over the best one. The dead-stretch report uses it
 * to say how far the second buy sits from the one the dad is saving for.
 */
function nextPaybackRatio(moves: readonly Priced[]): number {
  let best: number | undefined;
  let next: number | undefined;
  for (const move of moves) {
    if (!Number.isFinite(move.paybackSec)) {
      continue;
    }
    if (best === undefined || move.paybackSec < best) {
      next = best;
      best = move.paybackSec;
      continue;
    }
    if (next === undefined || move.paybackSec < next) {
      next = move.paybackSec;
    }
  }
  if (best === undefined || next === undefined || !(best > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  return next / best;
}

function byValue(moves: readonly Priced[]): Summary {
  let best: Priced | undefined;
  for (const move of moves) {
    if (best === undefined || move.perStone > best.perStone) {
      best = move;
    }
  }
  if (best === undefined || !(best.perStone > 0)) {
    return EMPTY;
  }
  const floor = best.perStone / LIVE_RATIO;
  let liveCount = 0;
  let affordableLive = 0;
  for (const move of moves) {
    if (!(move.perStone >= floor)) {
      continue;
    }
    liveCount += 1;
    if (move.affordable) {
      affordableLive += 1;
    }
  }
  return {
    liveCount,
    affordableLive,
    bestId: best.id,
    bestKind: best.kind,
    waitToAffordSec: best.waitSec,
    perStone: best.perStone,
  };
}

function rested(mountain: Mountain): Mountain {
  let next = mountain;
  for (const [index, engineer] of (mountain.engineers ?? []).entries()) {
    if (engineer.post !== "camp" && engineer.post !== "tunnel") {
      next = station(next, index, "camp");
    }
  }
  return next;
}

function tapStones(
  mountain: Mountain,
  now: number,
  trouble: Trouble | undefined,
): number {
  return mineByHand(mountain, now, trouble).pocket - mountain.pocket;
}

function outputShare(
  mountain: Mountain,
  now: number,
  context: ValueContext,
  trouble: Trouble | undefined,
): Readonly<Record<string, number>> {
  const posted = effectiveRates(mountain, now, trouble);
  const resting = effectiveRates(rested(mountain), now, trouble);
  const parts = new Map<string, number>();
  let total = 0;
  for (const tier of TIERS) {
    const amount = resting.running[tier.id] * resting.tierSpeed[tier.id];
    if (amount > 0) {
      parts.set(tier.id, amount);
      total += amount;
    }
  }
  const tending = posted.exactCrewPerSecond - resting.exactCrewPerSecond;
  if (tending > 0) {
    parts.set(TENDING_SOURCE, tending);
    total += tending;
  }
  const tap = context.tapsPerSecond * tapStones(mountain, now, trouble);
  if (tap > 0) {
    parts.set("tap", tap);
    total += tap;
  }
  if (!(total > 0)) {
    return {};
  }
  const share: Record<string, number> = {};
  for (const [key, amount] of parts) {
    share[key] = amount / total;
  }
  return share;
}

function optionKinds(actions: readonly Action[]): readonly Action["kind"][] {
  const seen = new Set(actions.map((action) => action.kind));
  return MOVE_KINDS.filter((kind) => seen.has(kind));
}

function viewOf(summary: Summary): DecisionSample["stretch"]["payback"] {
  return {
    liveCount: summary.liveCount,
    affordableLive: summary.affordableLive,
    waitToAffordSec: summary.waitToAffordSec,
    bestId: summary.bestId,
  };
}

/** One decision sample from the mountain the dad is looking at. */
export function scoreDecision(input: ScoreInput): DecisionSample {
  const actions =
    input.actions ?? listActions(input.mountain, input.now, input.trouble);
  const priced = actions.map((action) =>
    price(input.mountain, action, input.context, input.now),
  );
  const payback = byPayback(priced);
  const value = byValue(priced);
  const stretchPriced =
    input.stretchActions === undefined
      ? priced
      : input.stretchActions.map((action) =>
          price(input.mountain, action, input.context, input.now),
        );
  const stretchPayback =
    input.stretchActions === undefined ? payback : byPayback(stretchPriced);
  const stretchValue =
    input.stretchActions === undefined ? value : byValue(stretchPriced);
  const rates = effectiveRates(input.mountain, input.now, input.trouble);
  return {
    atMs: input.atMs,
    liveCount: payback.liveCount,
    affordableLive: payback.affordableLive,
    bestId: payback.bestId,
    bestKind: payback.bestKind,
    waitToAffordSec: payback.waitToAffordSec,
    crewPerSec: rates.exactCrewPerSecond,
    pocket: input.mountain.pocket,
    outputShare: outputShare(
      input.mountain,
      input.now,
      input.context,
      input.trouble,
    ),
    optionKinds: optionKinds(actions),
    byValue: {
      liveCount: value.liveCount,
      affordableLive: value.affordableLive,
      bestId: value.bestId,
      waitToAffordSec: value.waitToAffordSec,
      perStone: value.perStone,
    },
    nextPaybackRatio: nextPaybackRatio(priced),
    stretch: {
      payback: viewOf(stretchPayback),
      value: viewOf(stretchValue),
      nextPaybackRatio: nextPaybackRatio(stretchPriced),
    },
  };
}
