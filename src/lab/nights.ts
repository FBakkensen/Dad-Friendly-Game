import { stockyardOpen } from "../stockyard";
import type { DecisionSample } from "./measure";
import { median } from "./stats";
import { NIGHT_MIN_MS } from "./targets";
import type { World } from "./world";

/**
 * How a long night went once the stockyard is open (slice 1, Lab,
 * `nightFull`, #667): how long it was, whether a full stockyard ended it
 * (the night report's own `stop`: the mine stood at the end with its stone
 * stockpile full), and when the stone stockpile filled, if it filled in the
 * night rather than starting full.
 */
export type NightRecord = {
  readonly awayMs: number;
  readonly endedFull: boolean;
  /** When the stone stockpile was first full, from the night's start; left out when it was full from the start. */
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
  const endedFull = night.report.stop === "stockyard";
  const fullAtMs = night.report.fullAtMs?.stones;
  return fullAtMs === undefined || fullAtMs <= 0
    ? { awayMs: night.awayMs, endedFull }
    : { awayMs: night.awayMs, endedFull, fullAtMs };
}

function nightsOf(samples: readonly DecisionSample[]): readonly NightRecord[] {
  return samples.flatMap((sample) => sample.nights ?? []);
}

/** Share of the long nights that a full stockyard ended. NaN with none. */
export function nightFullShare(samples: readonly DecisionSample[]): number {
  const nights = nightsOf(samples);
  const full = nights.filter((night) => night.endedFull);
  return nights.length === 0 ? Number.NaN : full.length / nights.length;
}

/**
 * How far into those nights the stone stockpile filled, as a share of the
 * night: the median, leaving out nights it was full from the start. NaN with none.
 */
export function nightFullAt(samples: readonly DecisionSample[]): number {
  const shares = nightsOf(samples).flatMap((night) =>
    night.endedFull && night.fullAtMs !== undefined
      ? [night.fullAtMs / night.awayMs]
      : [],
  );
  return shares.length === 0 ? Number.NaN : median(shares);
}
