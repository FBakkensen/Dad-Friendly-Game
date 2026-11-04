/** Stones in the whole mountain. A leaf module, so relics and rates can share it without an import cycle. */
export const MOUNTAIN_STONES = 240_000_000;

/**
 * How much bigger each kid's run is (M13, #253): runs 1-4, approved by
 * Flemming on 4 Nov 2026. Run 5 on holds the last one.
 */
export const GENERATION_STRETCH: readonly number[] = [1, 1.75, 2.55, 3.5];

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

/** The stretch for the run after `legacy` passes to the kid. */
export function kidStretch(legacy: number): number {
  return GENERATION_STRETCH[
    Math.min(legacy, GENERATION_STRETCH.length - 1)
  ] as number;
}

/** A depth (in run-1 stones) as the stones this run shows for it. */
export function shownStones(mountain: { readonly stretch?: number }, depth: number): number {
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
