import { factor } from "./economy/factors";
import { freshMineOn, lineOn } from "./line-switch";

/** Stones in the whole mountain. Near-leaf (it reads only factors and line), so rates and layers can share it without an import cycle. */
export const MOUNTAIN_STONES = 240_000_000;

/** What a run carries to know its size: depth left. */
export type Sized = { readonly remaining: number };

/** Depth (in stones) where each band begins. `LAYERS[i].from` reads these. */
export const BAND_STARTS = [0, 10_000_000, 45_000_000, 120_000_000] as const;

/**
 * Stones to dig per stone of depth in each band. Deeper bands
 * take more. #357 retuned bands 2–4 for the milestone marks.
 */
export const BAND_SCALE = [1, 2.625, 6.3, 32.4] as const;

/**
 * On the line (#543, labs only until #536) the Deep Heart is 1.21 times
 * deeper (39.204): the optimizer's run ends a sitting later and stays within
 * a quarter of the evening dad's, and the 3-hour marathon no longer finishes
 * inside its day-4 sitting, a day and a half before the casual dad.
 */
const LINE_BAND_SCALE = [1, 2.625, 6.3, 39.204] as const;

type Band = 0 | 1 | 2 | 3;
const BANDS: readonly Band[] = [0, 1, 2, 3];

/** A band's scale: `BAND_SCALE` times the lab's knob (1 in play). */
function bandScale(band: Band): number {
  const scale = lineOn() ? LINE_BAND_SCALE : BAND_SCALE;
  return scale[band] * factor(`band.${String(band + 1)}.scale`);
}

/**
 * What one-off buys (upgrades, promotions) scale by: the scale of the band
 * the run stands in, so deeper rock costs more (#356).
 * A band begins at its start, inclusive. Machines, workers and recipes never
 * use this.
 */
export function oneOffStretch(mountain: Sized): number {
  const mined = minedOut(mountain);
  let band: Band = 0;
  for (const b of BANDS) {
    if (mined >= BAND_STARTS[b]) {
      band = b;
    }
  }
  return bandScale(band);
}

/** Where each band ends: the next band's start, or the bottom. */
const BAND_ENDS = [
  BAND_STARTS[1],
  BAND_STARTS[2],
  BAND_STARTS[3],
  MOUNTAIN_STONES,
] as const;

function bandEnd(band: Band): number {
  return BAND_ENDS[band];
}

/** A depth as the stones a run shows for it. */
export function shownStones(depth: number): number {
  let stones = 0;
  for (const band of BANDS) {
    const span = Math.min(depth, bandEnd(band)) - BAND_STARTS[band];
    if (span > 0) {
      stones += span * bandScale(band);
    }
  }
  return stones;
}

/**
 * Stones still to dig before the bottom, in whole pocket stones. Deep bands
 * leave `remaining` fractional, so the sum drifts off a whole number by
 * float error; rounding up (past the drift) keeps every dig, and the pocket,
 * whole, so the save still reads back.
 */
export function stonesLeft(mountain: Sized): number {
  // A fresh mine's level never runs out (slice 1, rule 1, #653).
  if (freshMineOn()) {
    return Infinity;
  }
  const raw = shownStones(MOUNTAIN_STONES) - shownStones(minedOut(mountain));
  return Math.max(0, Math.ceil(raw - 1e-6));
}

/**
 * Pocket stones to dig before the next band begins, where the crew's speed
 * changes (#592), or Infinity in the last band and in a fresh mine, which
 * has no depth to cross (#653).
 */
export function stonesToNextBand(mountain: Sized): number {
  if (freshMineOn()) {
    return Infinity;
  }
  const mined = minedOut(mountain);
  const next = BAND_STARTS.find((start) => start > mined);
  return next === undefined ? Infinity : shownStones(next) - shownStones(mined);
}

/**
 * The mined-out depth after digging `stones` more pocket stones, walking
 * band by band from where the run stands. Capped at the bottom.
 */
export function depthAfterStones(mountain: Sized, stones: number): number {
  let depth = minedOut(mountain);
  let left = stones;
  for (const band of BANDS) {
    const end = bandEnd(band);
    if (depth >= end) {
      continue;
    }
    const perDepth = bandScale(band);
    const room = (end - depth) * perDepth;
    if (left < room) {
      const reached = depth + left / perDepth;
      // A hair short of the bottom is the bottom (float drift).
      return reached > MOUNTAIN_STONES - 1e-9 ? MOUNTAIN_STONES : reached;
    }
    left -= room;
    depth = end;
  }
  return MOUNTAIN_STONES;
}

/** Stones dug out so far. Here (not in mountain.ts) so layers and crew can use it without a cycle. */
export function minedOut(mountain: { readonly remaining: number }): number {
  return MOUNTAIN_STONES - mountain.remaining;
}
