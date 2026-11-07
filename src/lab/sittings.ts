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
  readonly open: SittingOpen;
};

type Observation = {
  readonly clock: number;
  readonly owned: number;
  /** Asked once per sitting, at its first observation. */
  readonly open: () => SittingOpen;
};

type Current = {
  readonly sitting: number;
  readonly openedAtMs: number;
  readonly open: SittingOpen;
  buys: number;
  owned: number;
  /** Seen again after the open: a sitting the run ended on is not one. */
  played: boolean;
};

export type SittingLog = {
  /** Call after every live second and every gap. Returns sittings that closed. */
  readonly observe: (observation: Observation) => readonly SittingEvent[];
  /** Closes the sitting still open at the end of a run. */
  readonly flush: () => readonly SittingEvent[];
};

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
      open: closing.open,
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
          buys: 0,
          owned: observation.owned,
          played: false,
        };
        return closed;
      }
      current.played = true;
      if (observation.owned > current.owned) {
        current.buys += observation.owned - current.owned;
      }
      current.owned = observation.owned;
      return closed;
    },
    flush: close,
  };
}

/**
 * Every sitting that opened inside this window of samples, in order. A
 * sitting closes at the next open, so its event rides on a later sample:
 * a scope that starts at hour 24 would otherwise count the last sitting
 * of day one.
 */
export function sittingsOf(
  samples: readonly {
    readonly atMs: number;
    readonly sittings?: readonly SittingEvent[];
  }[],
): readonly SittingEvent[] {
  let from = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    from = Math.min(from, sample.atMs);
  }
  return samples
    .flatMap((sample) => sample.sittings ?? [])
    .filter((event) => event.openedAtMs >= from)
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
