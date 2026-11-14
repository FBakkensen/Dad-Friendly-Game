import { factor } from "./economy/factors";
import { lineOn } from "./line";

/** Stones in the whole mountain. A leaf module, so relics and rates can share it without an import cycle. */
export const MOUNTAIN_STONES = 240_000_000;

/**
 * How much longer each kid's run should feel (M13, #253): about this share
 * of run 1 added per generation (Flemming, 4 Nov 2026: "the whole idea is
 * they take longer and longer"), until MAX_STRETCH at about Legacy 240
 * (#366). The lab sweeps it as
 * `stretch.growth`; the game reads 1. #356 raised it from 1/8 so the
 * marathon dad's second run still finishes a day later on the new curve.
 */
export const KID_RUN_GROWTH = 3 / 8;

/**
 * The biggest stretch a run reaches (#366). At this k the whole mountain is
 * about 4.5e15 stones, half of JavaScript's safe-integer limit, so the pocket
 * and the save stay exact whole numbers. kidStretch reaches it at about
 * Legacy 240, years of play past any real run; until then runs keep growing.
 */
export const MAX_STRETCH = 1_000_000;

/** The kid bonus per Legacy (mirrors LEGACY_STEP in rates.ts, a leaf here). */
const BONUS_STEP = 0.5;

/**
 * The stretch for the run after `legacy` passes to the kid:
 * k = bonus × (1 + g·legacy)². A run lasts about run 1 × √(k / bonus)
 * (the lab fit), so run N lasts about run 1 × (1 + g·(N-1)): a steady step
 * longer every run, until MAX_STRETCH holds it (#366).
 */
export function kidStretch(legacy: number): number {
  const g = KID_RUN_GROWTH * factor("stretch.growth");
  const bonus = 1 + BONUS_STEP * legacy;
  return Math.min(MAX_STRETCH, bonus * (1 + g * legacy) ** 2);
}

/** From run 2 on, the Great Machine opens at this share of its depth. */
export const KID_MACHINE_OPENS = 0.9;

/** What a run carries to know its size: depth left, and its stretch if any. */
export type Sized = { readonly remaining: number; readonly stretch?: number };

/**
 * The run's stretch k: each stone dug takes 1/k of a stone of depth, so the
 * mountain, layer starts and relic depths are k times deeper in stones, and
 * stone prices are k times higher. Saves from before M13 have none, so 1.
 */
export function stretch(mountain: { readonly stretch?: number }): number {
  return mountain.stretch ?? 1;
}

/** Depth (run-1 stones) where each band begins. `LAYERS[i].from` reads these. */
export const BAND_STARTS = [0, 10_000_000, 45_000_000, 120_000_000] as const;

/**
 * Stones to dig per stone of depth in each band, at stretch 1. Deeper bands
 * take more. #357 retuned bands 2–4 for the milestone marks.
 */
export const BAND_SCALE = [1, 2.625, 6.3, 32.4] as const;

/**
 * On the line (#543, labs only until #536) the Deep Heart is 1.1 times
 * deeper (35.64), so the optimizer's run ends a sitting later and stays
 * within a quarter of the evening dad's.
 */
const LINE_BAND_SCALE = [1, 2.625, 6.3, 35.64] as const;

type Band = 0 | 1 | 2 | 3;
const BANDS: readonly Band[] = [0, 1, 2, 3];

/** A band's scale: `BAND_SCALE` times the lab's knob (1 in play). */
function bandScale(band: Band): number {
  const scale = lineOn() ? LINE_BAND_SCALE : BAND_SCALE;
  return scale[band] * factor(`band.${String(band + 1)}.scale`);
}

/**
 * What one-off buys (upgrades, promotions) scale by: the kid-run stretch times
 * the scale of the band the run stands in, so deeper rock costs more (#356).
 * A band begins at its start, inclusive. Machines, workers, recipes and boosts
 * never use this.
 */
export function oneOffStretch(mountain: Sized): number {
  const mined = minedOut(mountain);
  let band: Band = 0;
  for (const b of BANDS) {
    if (mined >= BAND_STARTS[b]) {
      band = b;
    }
  }
  return stretch(mountain) * bandScale(band);
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

/** A depth (in run-1 stones) as the stones this run shows for it. */
export function shownStones(
  mountain: { readonly stretch?: number },
  depth: number,
): number {
  let stones = 0;
  for (const band of BANDS) {
    const span = Math.min(depth, bandEnd(band)) - BAND_STARTS[band];
    if (span > 0) {
      stones += span * bandScale(band);
    }
  }
  return stones * stretch(mountain);
}

/**
 * Stones still to dig before the bottom, in whole pocket stones. Deep bands
 * leave `remaining` fractional, so the sum drifts off a whole number by
 * float error; rounding up (past the drift) keeps every dig, and the pocket,
 * whole, so the save still reads back.
 */
export function stonesLeft(mountain: Sized): number {
  const raw =
    shownStones(mountain, MOUNTAIN_STONES) -
    shownStones(mountain, minedOut(mountain));
  return Math.max(0, Math.ceil(raw - 1e-6));
}

/**
 * The mined-out depth after digging `stones` more pocket stones, walking
 * band by band from where the run stands. Capped at the bottom.
 */
export function depthAfterStones(mountain: Sized, stones: number): number {
  const k = stretch(mountain);
  let depth = minedOut(mountain);
  let left = stones;
  for (const band of BANDS) {
    const end = bandEnd(band);
    if (depth >= end) {
      continue;
    }
    const perDepth = k * bandScale(band);
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

/** Stones dug out so far. Here (not in mountain.ts) so relics can use it without a cycle. */
export function minedOut(mountain: { readonly remaining: number }): number {
  return MOUNTAIN_STONES - mountain.remaining;
}
