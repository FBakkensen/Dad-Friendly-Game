import type { Mountain } from "../mountain";
import { stockyardOpen } from "../stockyard";
import { deadGoods } from "./fresh-view";
import type { DecisionSample } from "./measure";
import { median } from "./stats";
import { MS_PER_SECOND, NIGHT_MIN_MS, SAMPLE_INTERVAL_SEC } from "./targets";
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
  /**
   * How long of it a stockpile sat dead, by the live minutes' rule
   * (`deadGoods`): each stockpile full at morning with no order taking its
   * good counts from when it filled (or the night's start) to morning. The
   * order is read at morning.
   */
  readonly deadMs: number;
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
  const deadMs = deadStretch(world.mountain, night);
  return fullAtMs === undefined || fullAtMs <= 0
    ? { awayMs: night.awayMs, endedFull, deadMs }
    : { awayMs: night.awayMs, endedFull, fullAtMs, deadMs };
}

/** From the first dead stockpile's filling to morning; 0 with none dead at morning. */
function deadStretch(
  morning: Mountain,
  night: NonNullable<World["night"]>,
): number {
  const filled = deadGoods(morning).map(
    (good) => night.report.fullAtMs?.[good] ?? night.awayMs,
  );
  return filled.length === 0 ? 0 : night.awayMs - Math.min(...filled);
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

/** A live sample stands for one sampling interval of play. */
const SAMPLE_MS = SAMPLE_INTERVAL_SEC * MS_PER_SECOND;

/**
 * `deadGood` weighed by time (slice 1, Lab, #667, PR review): each live
 * sample with the stockyard open counts its minute, dead while a stockpile
 * is full and no order delivering takes its good, and each long night counts
 * its whole length, dead from when its first dead stockpile filled (`deadMs`). Gaps
 * shorter than a night count only through the samples. NaN with none.
 */
export function deadGoodShare(
  samples: readonly Pick<DecisionSample, "fresh" | "nights">[],
): number {
  let kept = 0;
  let dead = 0;
  for (const sample of samples) {
    if (sample.fresh?.yardOpen === true) {
      kept += SAMPLE_MS;
      dead += sample.fresh.deadGood ? SAMPLE_MS : 0;
    }
    for (const night of sample.nights ?? []) {
      kept += night.awayMs;
      dead += night.deadMs;
    }
  }
  return kept === 0 ? Number.NaN : dead / kept;
}
