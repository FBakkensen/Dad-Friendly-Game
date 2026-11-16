import type { Stage } from "../line";
import type { Mountain } from "../mountain";
import { machinesInPlay, owned, tierById, type MachineId } from "../tiers";
import type { DecisionSample } from "./measure";
import type { RevealEvent } from "./reveal";
import { mean, median } from "./stats";
import { DAY_MS, MS_PER_SECOND, SAMPLE_INTERVAL_SEC } from "./targets";

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
  /** Rises in the owned count (crew, machines, upgrade levels). */
  readonly buys: number;
  /**
   * Taps those buys take with the Buys drawer on Max (#358): one for every tier bought,
   * however many, and one for every other buy (an upgrade level).
   */
  readonly taps: number;
  readonly open: SittingOpen;
  /** With the line on (#534): the narrow stage as the dad sits down. */
  readonly narrow?: Stage;
  /** With the line on (#534): machines bought that added nothing to the line. */
  readonly zeroGainBuys?: number;
  /** In a fresh mine (#655): taps that hired and moved workers. */
  readonly workerTaps?: number;
  /** With the Granite open (#675): taps that set the share between the levels. */
  readonly shareTaps?: number;
  /** From part 3 (#675): the cages played against the rates, at the open (`cageGap`). */
  readonly cageGap?: number;
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
  /** In a fresh mine: taps that hired and moved workers since the last observation. */
  readonly workerTaps?: number | undefined;
  /** With the Granite open: taps that set the share between the levels since the last observation. */
  readonly shareTaps?: number | undefined;
  /** Asked with `open`; undefined before part 3. */
  readonly cageGap?: () => number | undefined;
};

type Current = {
  readonly sitting: number;
  readonly openedAtMs: number;
  readonly open: SittingOpen;
  readonly narrow: Stage | undefined;
  buys: number;
  /** Undefined while the line is off. */
  zeroGainBuys: number | undefined;
  /** Undefined outside a fresh mine. */
  workerTaps: number | undefined;
  /** Undefined while the Granite is shut. */
  shareTaps: number | undefined;
  readonly cageGap: number | undefined;
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
  if (observation.workerTaps !== undefined) {
    current.workerTaps = (current.workerTaps ?? 0) + observation.workerTaps;
  }
  if (observation.shareTaps !== undefined) {
    current.shareTaps = (current.shareTaps ?? 0) + observation.shareTaps;
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
      ...(closing.workerTaps === undefined
        ? {}
        : { workerTaps: closing.workerTaps }),
      ...(closing.shareTaps === undefined
        ? {}
        : { shareTaps: closing.shareTaps }),
      ...(closing.cageGap === undefined ? {} : { cageGap: closing.cageGap }),
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
          workerTaps: undefined,
          shareTaps: undefined,
          cageGap: observation.cageGap?.(),
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

/** 1-based day, the same clock the pacing ledger prints. */
export function dayNumber(ms: number): number {
  return ms / DAY_MS + 1;
}

/** A sample second: every play-minute, which includes the session start. */
export function isSampleSecond(second: number): boolean {
  return second % SAMPLE_INTERVAL_SEC === 0;
}

/** Stamps the finish day onto every sample. An unfinished run is unchanged. */
export function withFinish(
  samples: readonly DecisionSample[],
  finishDay: number | undefined,
): readonly DecisionSample[] {
  if (finishDay === undefined) {
    return samples;
  }
  return samples.map((sample) => ({ ...sample, finishDay }));
}

/**
 * Counts sittings for the reveal log. A clock step longer than one second
 * is time away, so the next live second starts a new sitting.
 */
export function createSittingClock(): (clock: number) => number {
  let sitting = 0;
  let last: number | undefined;
  return (clock) => {
    if (last !== undefined && clock - last > MS_PER_SECOND) {
      sitting += 1;
    }
    last = clock;
    return sitting;
  };
}

/** Machines of one tier bought since the last look (#357). */
export type MachineBuy = {
  readonly tier: MachineId;
  readonly count: number;
};

/** Watches the machines in play and logs every purchase. */
export function createMachineBuyLog(): (
  mountain: Mountain,
) => readonly MachineBuy[] {
  const last = new Map<MachineId, number>();
  return (mountain) => {
    const events: MachineBuy[] = [];
    for (const id of machinesInPlay()) {
      const count = owned(mountain, tierById(id));
      const bought = count - (last.get(id) ?? 0);
      last.set(id, count);
      if (bought > 0) {
        events.push({ tier: id, count: bought });
      }
    }
    return events;
  };
}

/**
 * #357. The smallest total of machines bought of any one tier in a run. A
 * tier never bought counts 0, so one idle tier pulls the whole row to 0.
 */
export function fewestMachineBuys(samples: readonly DecisionSample[]): number {
  const totals = new Map<MachineId, number>();
  for (const event of samples.flatMap((sample) => sample.machineBuys ?? [])) {
    totals.set(event.tier, (totals.get(event.tier) ?? 0) + event.count);
  }
  let fewest = Number.POSITIVE_INFINITY;
  for (const id of machinesInPlay()) {
    fewest = Math.min(fewest, totals.get(id) ?? 0);
  }
  return fewest;
}

const MACHINE_PREFIX = "tier:";

function isMachineId(id: string): boolean {
  return machinesInPlay().some(
    (machine) => `${MACHINE_PREFIX}${machine}` === id,
  );
}

/**
 * Sittings started from a thing showing to its first use (M12-4, #252). A
 * machine keeps its first wait only; each small thing's wait is kept.
 */
function revealWaits(samples: readonly DecisionSample[]): {
  readonly machines: readonly number[];
  readonly small: readonly number[];
} {
  const machines = new Map<string, number>();
  const small: number[] = [];
  const start = new Map<string, RevealEvent>();
  for (const event of samples.flatMap((sample) => sample.reveals ?? [])) {
    if (event.kind === "appeared") {
      start.set(event.id, event);
      continue;
    }
    const from = start.get(event.id);
    if (from === undefined) {
      continue;
    }
    start.delete(event.id);
    const sittings = (event.sitting ?? 0) - (from.sitting ?? 0);
    if (!isMachineId(event.id)) {
      small.push(sittings);
    } else if (!machines.has(event.id)) {
      machines.set(event.id, sittings);
    }
  }
  return { machines: [...machines.values()], small };
}

/** Worst sittings from a machine showing to its first buy. NaN with none. */
export function machineRevealSittings(
  samples: readonly DecisionSample[],
): number {
  const waits = revealWaits(samples).machines;
  return waits.length === 0 ? Number.NaN : Math.max(...waits);
}

/** Worst sittings from a small thing showing to its first use. NaN with none. */
export function smallRevealSittings(
  samples: readonly DecisionSample[],
): number {
  const waits = revealWaits(samples).small;
  return waits.length === 0 ? Number.NaN : Math.max(...waits);
}
