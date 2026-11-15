import { stockyardOpen } from "../stockyard";
import type { DecisionSample } from "./measure";
import { median } from "./stats";
import { NIGHT_MIN_MS } from "./targets";
import type { World } from "./world";

/**
 * How a long night went once the stockyard is open (slice 1, Lab,
 * `nightFull`, #667): how long it was, and when the stone stockpile filled,
 * if it did. A full stone stockpile stops the line (rule 4).
 */
export type NightRecord = {
  readonly awayMs: number;
  /** When the stone stockpile was first full, from the night's start. */
  readonly fullAtMs?: number;
};

/** The night that just ended, if the world's last step was a long one with the stockyard open after it. */
export function nightRecord(world: World): NightRecord | undefined {
  const night = world.night;
  if (
    night === undefined ||
    night.awayMs < NIGHT_MIN_MS ||
    !stockyardOpen(world.mountain)
  ) {
    return undefined;
  }
  const fullAtMs = night.report.fullAtMs?.stones;
  return fullAtMs === undefined
    ? { awayMs: night.awayMs }
    : { awayMs: night.awayMs, fullAtMs };
}

function nightsOf(samples: readonly DecisionSample[]): readonly NightRecord[] {
  return samples.flatMap((sample) => sample.nights ?? []);
}

/** Share of the long nights that a full stone stockpile ended. NaN with none. */
export function nightFullShare(samples: readonly DecisionSample[]): number {
  const nights = nightsOf(samples);
  const full = nights.filter((night) => night.fullAtMs !== undefined);
  return nights.length === 0 ? Number.NaN : full.length / nights.length;
}

/** How far into those nights the stockpile filled, as a share of the night: the median. NaN with none. */
export function nightFullAt(samples: readonly DecisionSample[]): number {
  const shares = nightsOf(samples).flatMap((night) =>
    night.fullAtMs === undefined ? [] : [night.fullAtMs / night.awayMs],
  );
  return shares.length === 0 ? Number.NaN : median(shares);
}
