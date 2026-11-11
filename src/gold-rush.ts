import type { Mountain } from "./mountain";

/**
 * The Gold rush (#468, docs/superpowers/specs/2026-11-11-gold-rush-design.md).
 * Tapping the quick vein, the first glint after at least an hour away, sets
 * the live crew digging this many times faster for a short while.
 */
export const RUSH_MULTIPLIER = 10;
/** How long a Gold rush lasts, in live play. */
export const RUSH_MS = 90 * 1000;
/** Time away that makes the next vein a quick one, and ends a paused rush. */
export const QUICK_VEIN_AWAY_MS = 60 * 60 * 1000;

/** Starts a Gold rush now. A rush already running starts over at full length. */
export function startRush(mountain: Mountain, now: number): Mountain {
  return { ...mountain, rushUntil: now + RUSH_MS };
}

/** Milliseconds left on the rush; 0 when none runs or the mountain is dug out. */
export function rushLeft(mountain: Mountain, now: number): number {
  const until = mountain.rushUntil;
  if (until === undefined || mountain.remaining === 0) {
    return 0;
  }
  // Capped at the full length, so a clock set back can't stretch a rush.
  return Math.min(RUSH_MS, Math.max(0, until - now));
}

/**
 * The rush's share of the live crew speed. Away pay passes no `now`, so it is
 * 1 there, and time away never earns the rush.
 */
export function rushMultiplier(
  mountain: Mountain,
  now: number | undefined,
): number {
  return now !== undefined && rushLeft(mountain, now) > 0 ? RUSH_MULTIPLIER : 1;
}

/**
 * Close is pause: a rush running when the game closed keeps its time left
 * over a short break. After an hour away the next vein is a quick one, so a
 * part-used rush is dropped. An ended rush is dropped too.
 */
export function resumeRush(
  mountain: Mountain,
  from: number,
  to: number,
): Mountain {
  if (mountain.rushUntil === undefined) {
    return mountain;
  }
  const gap = Math.max(0, to - from);
  const left = rushLeft(mountain, from);
  if (left === 0 || gap >= QUICK_VEIN_AWAY_MS) {
    const rest: Mountain = { ...mountain };
    delete (rest as { rushUntil?: number }).rushUntil;
    return rest;
  }
  return { ...mountain, rushUntil: mountain.rushUntil + gap };
}
