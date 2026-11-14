import { crewCounts } from "./crew-count";
import { tierLocked } from "./crew";
import { staffForBuy } from "./engineers";
import type { Trouble } from "./hazards";
import { stonesPerSecond, type Mountain } from "./mountain";
import { MACHINE_STAGE, stageSpeeds, stagesLowFirst } from "./line";
import {
  effectiveRates,
  handsGain,
  machineGain,
  startedTier,
  type TendTier,
} from "./rates";
import { stonesLeft, stretch } from "./scale";
import {
  MACHINE_IDS,
  owned,
  tierById,
  tierCost,
  tierShown,
  type MachineId,
} from "./tiers";

/** What the Ready now plate can offer: a machine, or a worker. Never a kid. */
export type ReadyTier = MachineId | "helper";

/**
 * The plate's pick (#372): buy it now, save for it, or nothing left to dig.
 * `gain` is what one more adds, as the Buys card shows it; `free` is the
 * crew plate's free workers. A worker who would start an idle machine names
 * it in `starts`, and his gain counts it (#490). A worker on a mountain with
 * no crew and nothing idle is the `firstWorker` (#517).
 */
export type ReadyPick =
  | {
      readonly kind: "ready";
      readonly tier: ReadyTier;
      readonly price: number;
      readonly gain: number;
      readonly free: number;
      readonly starts?: TendTier;
      readonly firstWorker?: true;
    }
  | {
      readonly kind: "saving";
      readonly tier: ReadyTier;
      readonly price: number;
      readonly gain: number;
      readonly free: number;
      readonly starts?: TendTier;
      readonly firstWorker?: true;
      /**
       * At the current speed; undefined when that speed gives no time, or
       * when the mountain runs out before the pocket reaches the price (#610).
       */
      readonly etaMs: number | undefined;
    }
  | { readonly kind: "mined-out" };

type Priced = {
  readonly tier: ReadyTier;
  readonly price: number;
  readonly gain?: number;
};

/** What a candidate needs before the plate weighs it: shown, unlocked, and hands to run it. */
type Weigh = {
  readonly mountain: Mountain;
  readonly now: number;
  readonly trouble: Trouble | undefined;
  readonly free: number;
  readonly priceOf: (id: ReadyTier) => number;
};

/**
 * The machine Ready now offers (#536): stage by stage, lowest first by what
 * its running machines move, the first stage with a machine that is shown,
 * unlocked, runnable by the free hands, and adds something to the line. In
 * it, the biggest the pocket covers, else the cheapest to save for (a tie
 * keeps tier order). Undefined when no stage has one.
 */
function machinePick(weigh: Weigh): Priced | undefined {
  const { mountain, now, trouble, free, priceOf } = weigh;
  const rates = effectiveRates(mountain, now, trouble);
  const order = stagesLowFirst(stageSpeeds(rates.tierSpeed, rates.running));
  const runnable = MACHINE_IDS.filter((id) => {
    const tier = tierById(id);
    return (
      tierShown(mountain, tier) &&
      !tierLocked(mountain, tier) &&
      free >= staffForBuy(mountain, tier)
    );
  });
  for (const stage of order) {
    const helps: readonly Priced[] = runnable
      .filter((id) => MACHINE_STAGE[id] === stage)
      .map((id) => ({
        tier: id,
        price: priceOf(id),
        gain: machineGain(mountain, id, 1, now, trouble),
      }))
      .filter(({ gain }) => gain > 0);
    const affordable = [...helps]
      .reverse()
      .find(({ price }) => mountain.stock.stones >= price);
    // A stable sort keeps tier order on a tie.
    const pick = affordable ?? [...helps].sort((a, b) => a.price - b.price)[0];
    if (pick !== undefined) {
      return pick;
    }
  }
  return undefined;
}

/**
 * The thing to buy next. Display only: it reads the mountain and never
 * buys; only a tap buys. A machine for the lowest stage that one can lift
 * (`machinePick`), else a worker. It never offers a machine that adds
 * nothing (#536).
 */
export function readyNow(
  mountain: Mountain,
  now: number,
  trouble?: Trouble,
): ReadyPick {
  if (mountain.remaining === 0) {
    return { kind: "mined-out" };
  }
  const { free, crew } = crewCounts(mountain, now, trouble);
  const k = stretch(mountain);
  const priceOf = (id: ReadyTier): number => {
    const tier = tierById(id);
    return tierCost(tier, owned(mountain, tier), k);
  };
  // Every machine takes a hand, so with none free, or none that helps, the
  // pick falls to a worker.
  const pick: Priced = machinePick({
    mountain,
    now,
    trouble,
    free,
    priceOf,
  }) ?? { tier: "helper", price: priceOf("helper") };

  const { gain, started } = pickGain(mountain, pick, now, trouble, crew);
  if (mountain.stock.stones >= pick.price) {
    return {
      kind: "ready",
      tier: pick.tier,
      price: pick.price,
      gain,
      free,
      ...started,
    };
  }
  return {
    kind: "saving",
    tier: pick.tier,
    price: pick.price,
    gain,
    free,
    ...started,
    etaMs: savingEta(mountain, pick.price, now, trouble),
  };
}

/**
 * When the pocket reaches the price at the current speed (D1), or undefined
 * when no time is true: a speed that gives none, or a price past the pocket
 * plus the stones left, since digging stops at the bottom first (#610).
 */
function savingEta(
  mountain: Mountain,
  price: number,
  now: number,
  trouble: Trouble | undefined,
): number | undefined {
  const short = price - mountain.stock.stones;
  if (short > stonesLeft(mountain)) {
    return undefined;
  }
  const speed = stonesPerSecond(mountain, now, trouble);
  const etaMs = (short / speed) * 1000;
  return speed > 0 && Number.isFinite(speed) && Number.isFinite(etaMs)
    ? etaMs
    : undefined;
}

/** What the pick adds: a machine the line's gain, a worker the crew's rise and what he starts. */
function pickGain(
  mountain: Mountain,
  { tier, gain: machine }: Priced,
  now: number,
  trouble: Trouble | undefined,
  crew: number,
): {
  readonly gain: number;
  readonly started:
    { readonly starts?: TendTier } | { readonly firstWorker: true };
} {
  if (tier !== "helper") {
    return {
      gain: machine ?? machineGain(mountain, tier, 1, now, trouble),
      started: {},
    };
  }
  const starts = startedTier(mountain, now, trouble);
  const gain = handsGain(mountain, "helper", 1, now, trouble);
  if (starts !== undefined) {
    return { gain, started: { starts } };
  }
  return { gain, started: crew === 0 ? { firstWorker: true } : {} };
}
