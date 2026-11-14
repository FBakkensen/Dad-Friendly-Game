import type { Stage } from "../line";
import { mean, median } from "./stats";
import { MS_PER_SECOND } from "./targets";

/**
 * Sitting-level pacing (balance review, Nov 2026). The minute samples say
 * what the table looked like. These events say what a check-in felt like:
 * how many things the dad bought, and whether the best buy on his table
 * was in reach when he came back.
 */

/** The best buy by stones a second per stone, on this dad's table, at the open. */
export type SittingOpen =
  | { readonly kind: "affordable" }
  | { readonly kind: "waiting"; readonly waitSec: number }
  | { readonly kind: "nothing" };

export type SittingEvent = {
  /** 0-based, counted the same way as the reveal log's sitting clock. */
  readonly sitting: number;
  readonly openedAtMs: number;
  /** Rises in the owned count (crew, kids, engineers, upgrade levels). */
  readonly buys: number;
  /**
   * Taps those buys take with the Buys drawer on Max (#358): one for every tier bought,
   * however many, and one for every other buy (an upgrade level, an engineer).
   */
  readonly taps: number;
  readonly open: SittingOpen;
  /** With the line on (#534): the narrow stage as the dad sits down. */
  readonly narrow?: Stage;
  /** With the line on (#534): machines bought that added nothing to the line. */
  readonly zeroGainBuys?: number;
};

type Observation = {
  readonly clock: number;
  readonly owned: number;
  /** Owned of each tier, in one fixed order. */
  readonly tiers: readonly number[];
  /** Asked once per sitting, at its first observation. */
  readonly open: () => SittingOpen;
  /** Asked with `open`; undefined while the line is off (#534). */
  readonly narrow?: () => Stage | undefined;
  /** Machines bought since the last observation that added nothing to the line. */
  readonly zeroGainBuys?: number | undefined;
};

type Current = {
  readonly sitting: number;
  readonly openedAtMs: number;
  readonly open: SittingOpen;
  readonly narrow: Stage | undefined;
  buys: number;
  /** Undefined while the line is off. */
  zeroGainBuys: number | undefined;
  owned: number;
  tiers: readonly number[];
  /** The tiers bought this sitting, by their place in `tiers`. */
  readonly tiersBought: Set<number>;
  /** Buys that are not a tier's. */
  otherBuys: number;
  /** Seen again after the open: a sitting the run ended on is not one. */
  played: boolean;
};

export type SittingLog = {
  /** Call after every live second and every gap. Returns sittings that closed. */
  readonly observe: (observation: Observation) => readonly SittingEvent[];
  /** Closes the sitting still open at the end of a run. */
  readonly flush: () => readonly SittingEvent[];
};

/** One live observation's buys, added to the open sitting. */
function played(current: Current, observation: Observation): void {
  const rise = Math.max(0, observation.owned - current.owned);
  let tierRise = 0;
  for (const [index, count] of observation.tiers.entries()) {
    const gained = count - (current.tiers[index] ?? 0);
    if (gained > 0) {
      tierRise += gained;
      current.tiersBought.add(index);
    }
  }
  current.buys += rise;
  if (observation.zeroGainBuys !== undefined) {
    current.zeroGainBuys =
      (current.zeroGainBuys ?? 0) + observation.zeroGainBuys;
  }
  current.otherBuys += Math.max(0, rise - tierRise);
  current.owned = observation.owned;
  current.tiers = observation.tiers;
}

/**
 * A clock step longer than one second is time away. The observation after
 * it is the next sitting's open: away pay is in, nothing is bought yet.
 * The first sitting opens on the first observation of the run, after the
 * first live second, so its opening view and buys miss that second. Scoped
 * rows start after day one and are not affected. A sitting
 * that is only an open (the run ended after the last gap) is dropped.
 */
export function createSittingLog(): SittingLog {
  let current: Current | undefined;
  let lastClock: number | undefined;
  let index = 0;
  const close = (): readonly SittingEvent[] => {
    const closing = current;
    current = undefined;
    if (closing === undefined || !closing.played) {
      return [];
    }
    const event: SittingEvent = {
      sitting: closing.sitting,
      openedAtMs: closing.openedAtMs,
      buys: closing.buys,
      taps: closing.tiersBought.size + closing.otherBuys,
      open: closing.open,
      ...(closing.narrow === undefined ? {} : { narrow: closing.narrow }),
      ...(closing.zeroGainBuys === undefined
        ? {}
        : { zeroGainBuys: closing.zeroGainBuys }),
    };
    return [event];
  };
  return {
    observe(observation) {
      const away =
        lastClock !== undefined &&
        observation.clock - lastClock > MS_PER_SECOND;
      lastClock = observation.clock;
      let closed: readonly SittingEvent[] = [];
      if (away) {
        closed = close();
        index += 1;
      }
      if (current === undefined) {
        current = {
          sitting: index,
          openedAtMs: observation.clock,
          open: observation.open(),
          narrow: observation.narrow?.(),
          buys: 0,
          zeroGainBuys: undefined,
          owned: observation.owned,
          tiers: observation.tiers,
          tiersBought: new Set(),
          otherBuys: 0,
          played: false,
        };
        return closed;
      }
      current.played = true;
      played(current, observation);
      return closed;
    },
    flush: close,
  };
}

type Carrier = {
  readonly atMs: number;
  readonly sittings?: readonly SittingEvent[];
};

/**
 * Hangs each closed sitting on its own first sample: the first one taken at
 * or after its open. A sitting lasts longer than the sample interval, so it
 * always has one. A scope that keeps a window of samples then keeps exactly
 * the sittings whose first sample is inside it, with no boundary sums in the
 * measures. With no sample that late, the newest sample carries it.
 * Returns the same array, changed in place.
 */
export function placeSittings<T extends Carrier>(
  samples: T[],
  events: readonly SittingEvent[],
): T[] {
  for (const event of events) {
    let index = samples.length - 1;
    for (const [at, sample] of samples.entries()) {
      if (sample.atMs >= event.openedAtMs) {
        index = at;
        break;
      }
    }
    const carrier = samples[index];
    if (carrier === undefined) {
      continue;
    }
    const placed: T = {
      ...carrier,
      sittings: [...(carrier.sittings ?? []), event],
    };
    samples[index] = placed;
  }
  return samples;
}

/** Every sitting riding on these samples, in order. */
export function sittingsOf(
  samples: readonly Carrier[],
): readonly SittingEvent[] {
  return samples
    .flatMap((sample) => sample.sittings ?? [])
    .sort((left, right) => left.sitting - right.sitting);
}

/** Share of sittings with no buy. NaN with none. */
export function zeroBuyShare(events: readonly SittingEvent[]): number {
  if (events.length === 0) {
    return Number.NaN;
  }
  return mean(events.map((event) => (event.buys === 0 ? 1 : 0)));
}

/** Median buys in a sitting. NaN with none. */
export function medianBuys(events: readonly SittingEvent[]): number {
  if (events.length === 0) {
    return Number.NaN;
  }
  return median(events.map((event) => event.buys));
}

/** Median taps a sitting's buys take on Max (#358). NaN with none. */
export function medianTaps(events: readonly SittingEvent[]): number {
  if (events.length === 0) {
    return Number.NaN;
  }
  return median(events.map((event) => event.taps));
}

/** Share of sittings whose best buy is affordable at the open. Empty tables are left out. */
export function bestOpenShare(events: readonly SittingEvent[]): number {
  const priced = events.filter((event) => event.open.kind !== "nothing");
  if (priced.length === 0) {
    return Number.NaN;
  }
  return mean(
    priced.map((event) => (event.open.kind === "affordable" ? 1 : 0)),
  );
}

/** Longest run of sittings in a row that open with the best buy out of reach. NaN with none. */
export function longestBestWait(events: readonly SittingEvent[]): number {
  if (events.length === 0) {
    return Number.NaN;
  }
  let longest = 0;
  let run = 0;
  for (const event of events) {
    run = event.open.kind === "waiting" ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}
