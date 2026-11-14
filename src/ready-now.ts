import { crewCounts } from "./crew-count";
import { tierLocked } from "./crew";
import { staffForBuy } from "./engineers";
import type { Trouble } from "./hazards";
import { stonesPerSecond, type Mountain } from "./mountain";
import { effectiveRates, handsGain, startedTier, type TendTier } from "./rates";
import { stretch } from "./scale";
import {
  MACHINE_IDS,
  owned,
  tierById,
  tierCost,
  isShownTier,
  type ShownMachineId,
} from "./tiers";

/** What the Ready now plate can offer: a machine, or a worker. Never a kid. */
export type ReadyTier = ShownMachineId | "helper";

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
      /** At the current speed; undefined when that speed gives no time. */
      readonly etaMs: number | undefined;
    }
  | { readonly kind: "mined-out" };

type Priced = { readonly tier: ReadyTier; readonly price: number };

/**
 * The machine to buy next. Display only: it reads the mountain and never
 * buys; only a tap buys.
 * 1. The biggest unlocked machine the free hands can run and the pocket covers.
 * 2. Else the cheapest one they can run, to save for (a tie keeps tier order).
 * 3. Else, with no hand free, a worker.
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
  const runnable: readonly Priced[] = MACHINE_IDS.filter(isShownTier)
    .filter((id) => {
      const tier = tierById(id);
      return !tierLocked(mountain, tier) && free >= staffForBuy(mountain, tier);
    })
    .map((id) => ({ tier: id, price: priceOf(id) }));

  const affordable = [...runnable]
    .reverse()
    .find(({ price }) => mountain.pocket >= price);
  // A stable sort keeps tier order on a tie. Every machine takes a hand, so
  // with none free nothing is runnable and the pick falls to a worker.
  const cheapest = [...runnable].sort((a, b) => a.price - b.price)[0];
  const pick: Priced = affordable ??
    cheapest ?? { tier: "helper", price: priceOf("helper") };

  const { gain, started } = pickGain(mountain, pick.tier, now, trouble, crew);
  if (mountain.pocket >= pick.price) {
    return {
      kind: "ready",
      tier: pick.tier,
      price: pick.price,
      gain,
      free,
      ...started,
    };
  }
  const speed = stonesPerSecond(mountain, now, trouble);
  const etaMs = ((pick.price - mountain.pocket) / speed) * 1000;
  return {
    kind: "saving",
    tier: pick.tier,
    price: pick.price,
    gain,
    free,
    ...started,
    etaMs:
      speed > 0 && Number.isFinite(speed) && Number.isFinite(etaMs)
        ? etaMs
        : undefined,
  };
}

/** What the pick adds: a machine its own speed, a worker the crew's rise and what he starts. */
function pickGain(
  mountain: Mountain,
  tier: ReadyTier,
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
      gain: effectiveRates(mountain, now, trouble).tierSpeed[tier],
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
