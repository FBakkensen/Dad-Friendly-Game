import { stretch } from "../scale";
import { tierLocked } from "../crew";
import { LAYER_FAVOURS, LAYERS, layerOf, type LayerId } from "../layers";
import type { Mountain } from "../mountain";
import { MOUNTAIN_STONES, minedOut } from "../scale";
import { owned, tierById, tierCost, tierShown, type TierId } from "../tiers";
import type { DecisionSample } from "./measure";
import type { RevealEvent } from "./reveal";
import { mean } from "./stats";
import {
  MS_PER_SECOND,
  SAMPLE_INTERVAL_SEC,
  REPORT_MACHINE_SITTINGS,
  REPORT_SMALL_SITTINGS,
} from "./targets";

/**
 * Per-band report for M12 (#249). Report only: no guardrail reads it.
 * A band's share runs from 0 where it starts to 1 where the next begins.
 */

export const MACHINE_IDS = [
  "cart",
  "drill",
  "borer",
  "machine",
] as const satisfies readonly TierId[];

type MachineId = (typeof MACHINE_IDS)[number];

export type BandEvent =
  | {
      readonly kind: "available";
      readonly tier: MachineId;
      readonly layer: LayerId;
    }
  | {
      readonly kind: "affordable" | "bought";
      readonly tier: MachineId;
      readonly layer: LayerId;
      readonly share: number;
      /** Machines bought in this second. 0 on an affordable event. */
      readonly count: number;
    };

/** How far through its band this many stones mined is, from 0 to 1. */
export function bandShare(mined: number): number {
  const layer = layerOf({ remaining: MOUNTAIN_STONES - mined });
  const next = LAYERS.find((band) => band.from > layer.from);
  const end = next?.from ?? MOUNTAIN_STONES;
  return Math.min(1, (mined - layer.from) / (end - layer.from));
}

/**
 * Watches the machines. Logs, once per band, the first moment each one can
 * be bought (shown and not waiting on a relic) and the first moment the
 * pocket covers it, and logs every purchase with the band it fell in.
 */
export function createBandLog(): (mountain: Mountain) => readonly BandEvent[] {
  const seen = new Set<string>();
  const last = new Map<MachineId, number>();
  return (mountain) => {
    const events: BandEvent[] = [];
    const layer = layerOf(mountain).id;
    const share = bandShare(minedOut(mountain));
    for (const id of MACHINE_IDS) {
      const tier = tierById(id);
      const count = owned(mountain, tier);
      const bought = count - (last.get(id) ?? 0);
      last.set(id, count);
      if (!tierShown(mountain, tier) || tierLocked(mountain, tier)) {
        continue;
      }
      if (!seen.has(`a:${layer}:${id}`)) {
        seen.add(`a:${layer}:${id}`);
        events.push({ kind: "available", tier: id, layer });
      }
      const covers =
        mountain.pocket >= tierCost(tier, count, stretch(mountain));
      if ((covers || bought > 0) && !seen.has(`p:${layer}:${id}`)) {
        seen.add(`p:${layer}:${id}`);
        events.push({ kind: "affordable", tier: id, layer, share, count: 0 });
      }
      if (bought > 0) {
        events.push({ kind: "bought", tier: id, layer, share, count: bought });
      }
    }
    return events;
  };
}

/** One machine's first reveal in a run and its wait to the first buy. */
type MachineReveal = {
  readonly layer: LayerId;
  readonly share: number;
  /** Live minutes, then sittings started, from showing up to the first buy. */
  readonly minutes?: number;
  readonly sittings?: number;
};

export type RunBands = {
  /** First affordable and first bought share, for each band's favoured machine. */
  readonly favoured: ReadonlyMap<
    LayerId,
    { readonly afford?: number; readonly buy?: number }
  >;
  /** Purchases per machine per band, for every machine on sale in that band. */
  readonly buys: ReadonlyMap<LayerId, ReadonlyMap<MachineId, number>>;
  readonly machines: ReadonlyMap<MachineId, MachineReveal>;
  /** Other things' waits, in sittings and live minutes. */
  readonly small: readonly {
    readonly id: string;
    readonly sittings: number;
    readonly minutes: number;
  }[];
};

const FAVOURED: ReadonlyMap<LayerId, MachineId | undefined> = new Map(
  LAYERS.map((layer) => [
    layer.id,
    MACHINE_IDS.find((id) => id === LAYER_FAVOURS[layer.index]?.suits),
  ]),
);

function favouredOf(layer: LayerId): MachineId | undefined {
  return FAVOURED.get(layer);
}

const MACHINE_PREFIX = "tier:";

/** One run's band report, from its samples' events. */
export function runBands(samples: readonly DecisionSample[]): RunBands {
  const favoured = new Map<LayerId, { afford?: number; buy?: number }>();
  const buys = new Map<LayerId, Map<MachineId, number>>();
  for (const event of samples.flatMap((sample) => sample.bands ?? [])) {
    const band = buys.get(event.layer) ?? new Map<MachineId, number>();
    buys.set(event.layer, band);
    const added = event.kind === "available" ? 0 : event.count;
    band.set(event.tier, (band.get(event.tier) ?? 0) + added);
    if (event.kind === "available" || favouredOf(event.layer) !== event.tier) {
      continue;
    }
    const entry = favoured.get(event.layer) ?? {};
    const key = event.kind === "affordable" ? "afford" : "buy";
    entry[key] ??= event.share;
    favoured.set(event.layer, entry);
  }
  const { machines, small } = revealsOf(
    samples.flatMap((sample) => sample.reveals ?? []),
  );
  return { favoured, buys, machines, small };
}

function revealsOf(events: readonly RevealEvent[]): {
  machines: Map<MachineId, MachineReveal>;
  small: { id: string; sittings: number; minutes: number }[];
} {
  const machines = new Map<MachineId, MachineReveal>();
  const small: { id: string; sittings: number; minutes: number }[] = [];
  const start = new Map<string, RevealEvent>();
  for (const event of events) {
    const machine = MACHINE_IDS.find(
      (id) => `${MACHINE_PREFIX}${id}` === event.id,
    );
    if (event.kind === "appeared") {
      start.set(event.id, event);
      if (machine !== undefined && !machines.has(machine)) {
        const mined = event.mined ?? 0;
        machines.set(machine, {
          layer: layerOf({ remaining: MOUNTAIN_STONES - mined }).id,
          share: bandShare(mined),
        });
      }
      continue;
    }
    const from = start.get(event.id);
    if (from === undefined) {
      continue;
    }
    start.delete(event.id);
    const minutes = (event.liveSec - from.liveSec) / SAMPLE_INTERVAL_SEC;
    const sittings = (event.sitting ?? 0) - (from.sitting ?? 0);
    const shown = machine === undefined ? undefined : machines.get(machine);
    if (shown === undefined) {
      small.push({ id: event.id, sittings, minutes });
    } else if (shown.minutes === undefined) {
      machines.set(machine as MachineId, { ...shown, minutes, sittings });
    }
  }
  return { machines, small };
}

/** One player type's band report, over every seed. */
export type BandSummary = {
  readonly runs: number;
  readonly favoured: readonly {
    readonly layer: LayerId;
    readonly machine: MachineId;
    readonly afford: Spread;
    readonly buy: Spread;
  }[];
  /** A machine on sale in a band and never bought there, in some runs. */
  readonly unbought: readonly {
    readonly layer: LayerId;
    readonly machine: MachineId;
    readonly runs: number;
    readonly of: number;
  }[];
  readonly buys: readonly {
    readonly layer: LayerId;
    readonly machine: MachineId;
    readonly mean: number;
  }[];
  readonly machines: readonly {
    readonly machine: MachineId;
    readonly layer: LayerId;
    readonly share: number;
    readonly minutes: Spread;
    readonly sittings: Spread;
    readonly flagged: boolean;
  }[];
  /** Small things that waited more than one sitting in some run. */
  readonly small: readonly {
    readonly id: string;
    readonly sittings: number;
    readonly minutes: number;
  }[];
};

/** The mean where it happened, the worst, and in how many runs. */
export type Spread = {
  readonly mean: number;
  readonly max: number;
  readonly runs: number;
};

function spread(values: readonly (number | undefined)[]): Spread {
  const known = values.filter((value) => value !== undefined);
  return {
    mean: mean(known),
    max: Math.max(0, ...known),
    runs: known.length,
  };
}

/** The band seen most often. A tie keeps the earliest run's band. */
function mostCommon(layers: readonly LayerId[]): LayerId {
  const count = (layer: LayerId) =>
    layers.filter((other) => other === layer).length;
  return layers.reduce((best, layer) =>
    count(layer) > count(best) ? layer : best,
  );
}

/** Adds the runs of one player type together. */
export function summarizeBands(runs: readonly RunBands[]): BandSummary {
  const favoured = LAYERS.flatMap((layer) => {
    const machine = favouredOf(layer.id);
    if (machine === undefined) {
      return [];
    }
    const entries = runs.map((run) => run.favoured.get(layer.id));
    return [
      {
        layer: layer.id,
        machine,
        afford: spread(entries.map((entry) => entry?.afford)),
        buy: spread(entries.map((entry) => entry?.buy)),
      },
    ];
  });
  const unbought: BandSummary["unbought"][number][] = [];
  const buys: BandSummary["buys"][number][] = [];
  for (const layer of LAYERS) {
    for (const machine of MACHINE_IDS) {
      const counts = runs.flatMap((run) => {
        const count = run.buys.get(layer.id)?.get(machine);
        return count === undefined ? [] : [count];
      });
      if (counts.length === 0) {
        continue;
      }
      buys.push({ layer: layer.id, machine, mean: mean(counts) });
      const zero = counts.filter((count) => count === 0).length;
      if (zero > 0) {
        unbought.push({
          layer: layer.id,
          machine,
          runs: zero,
          of: runs.length,
        });
      }
    }
  }
  const machines = MACHINE_IDS.flatMap((machine) => {
    const seen = runs.flatMap((run) => {
      const entry = run.machines.get(machine);
      return entry === undefined ? [] : [entry];
    });
    if (seen.length === 0) {
      return [];
    }
    const sittings = spread(seen.map((entry) => entry.sittings));
    return [
      {
        machine,
        layer: mostCommon(seen.map((entry) => entry.layer)),
        share: mean(seen.map((entry) => entry.share)),
        minutes: spread(seen.map((entry) => entry.minutes)),
        sittings,
        flagged: sittings.max > REPORT_MACHINE_SITTINGS,
      },
    ];
  });
  const worst = new Map<string, { sittings: number; minutes: number }>();
  for (const wait of runs.flatMap((run) => run.small)) {
    const before = worst.get(wait.id);
    if (before === undefined || wait.sittings > before.sittings) {
      worst.set(wait.id, { sittings: wait.sittings, minutes: wait.minutes });
    }
  }
  const small = [...worst]
    .filter(([, wait]) => wait.sittings > REPORT_SMALL_SITTINGS)
    .sort((left, right) => right[1].sittings - left[1].sittings)
    .map(([id, wait]) => ({ id, ...wait }));
  return { runs: runs.length, favoured, unbought, buys, machines, small };
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

/**
 * M12-4 (#252) guardrail reads. Each takes one run's samples.
 */

/** Bands from the Granite down, where a machine is favoured. */
const FAVOURED_LAYERS: readonly LayerId[] = LAYERS.flatMap((layer) =>
  favouredOf(layer.id) === undefined ? [] : [layer.id],
);

/**
 * The latest share of its band at which a favoured machine was first
 * bought, over the bands where the pocket reached its price. A band where
 * it was affordable and never bought counts as 1. NaN when no favoured
 * machine was affordable in any band (the run never got there).
 */
export function favouredBuyShare(samples: readonly DecisionSample[]): number {
  const { favoured } = runBands(samples);
  const shares = FAVOURED_LAYERS.flatMap((layer) => {
    const entry = favoured.get(layer);
    return entry?.afford === undefined ? [] : [entry.buy ?? 1];
  });
  return shares.length === 0 ? Number.NaN : Math.max(...shares);
}

/**
 * Rule 3, scoped (#252): a machine misses a band when it was buyable there
 * (shown, not locked, and the pocket reached its price) and none was bought,
 * counted only in the band where it opens and in the band that suits it.
 * Older machines may rest in other bands; they are not useless on arrival
 * and the band that suits them brings them back.
 */
export function scopedRule3Misses(samples: readonly DecisionSample[]): number {
  const opened = new Map<MachineId, LayerId>();
  const affordable = new Set<string>();
  const bought = new Set<string>();
  for (const event of samples.flatMap((sample) => sample.bands ?? [])) {
    if (event.kind === "available") {
      if (!opened.has(event.tier)) {
        opened.set(event.tier, event.layer);
      }
      continue;
    }
    const key = `${event.layer}:${event.tier}`;
    if (event.kind === "affordable") {
      affordable.add(key);
    } else if (event.count > 0) {
      bought.add(key);
    }
  }
  let misses = 0;
  for (const id of MACHINE_IDS) {
    const bands = new Set<LayerId>();
    const open = opened.get(id);
    if (open !== undefined) {
      bands.add(open);
    }
    for (const layer of FAVOURED_LAYERS) {
      if (favouredOf(layer) === id) {
        bands.add(layer);
      }
    }
    for (const layer of bands) {
      const key = `${layer}:${id}`;
      if (affordable.has(key) && !bought.has(key)) {
        misses += 1;
      }
    }
  }
  return misses;
}

/** Worst sittings from a machine showing to its first buy. NaN with none. */
export function machineRevealSittings(
  samples: readonly DecisionSample[],
): number {
  const waits = [...runBands(samples).machines.values()].flatMap((reveal) =>
    reveal.sittings === undefined ? [] : [reveal.sittings],
  );
  return waits.length === 0 ? Number.NaN : Math.max(...waits);
}

/** Worst sittings from a small thing showing to its first use. NaN with none. */
export function smallRevealSittings(
  samples: readonly DecisionSample[],
): number {
  const waits = runBands(samples).small.map((item) => item.sittings);
  return waits.length === 0 ? Number.NaN : Math.max(...waits);
}
