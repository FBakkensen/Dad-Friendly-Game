import { factor } from "./economy/factors";

/** Stones in the whole mountain. A leaf module, so relics and rates can share it without an import cycle. */
export const MOUNTAIN_STONES = 240_000_000;

/**
 * How much longer each kid's run should feel (M13, #253): about this share
 * of run 1 added per generation, forever (Flemming, 4 Nov 2026: "the whole
 * idea is they take longer and longer"). The lab sweeps it as
 * `stretch.growth`; the game reads 1.
 */
export const KID_RUN_GROWTH = 1 / 8;

/** The biggest stretch a save may carry (mirrored in firestore.rules, 1..100). */
export const MAX_STRETCH = 100;

/** The kid bonus per Legacy (mirrors LEGACY_STEP in rates.ts, a leaf here). */
const BONUS_STEP = 0.5;

/**
 * The stretch for the run after `legacy` passes to the kid:
 * k = bonus × (1 + g·legacy)². A run lasts about run 1 × √(k / bonus)
 * (the lab fit), so run N lasts about run 1 × (1 + g·(N-1)): a steady step
 * longer every run, with no cap.
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

/** A depth (in run-1 stones) as the stones this run shows for it. */
export function shownStones(
  mountain: { readonly stretch?: number },
  depth: number,
): number {
  return depth * stretch(mountain);
}

/** Stones still to dig before the bottom, in pocket stones. */
export function stonesLeft(mountain: Sized): number {
  return mountain.remaining * stretch(mountain);
}

/** Stones dug out so far. Here (not in mountain.ts) so relics can use it without a cycle. */
export function minedOut(mountain: { readonly remaining: number }): number {
  return MOUNTAIN_STONES - mountain.remaining;
}
