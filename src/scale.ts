import { factor } from "./economy/factors";

/** Stones in the whole mountain. A leaf module, so relics and rates can share it without an import cycle. */
export const MOUNTAIN_STONES = 240_000_000;

/**
 * Lab-only stretch for kid runs (M13, #253): a run k times bigger. Each stone
 * dug takes 1/k of a stone of depth, so the mountain, layer starts and relic
 * depths are k times deeper in stones, and stone prices are k times higher.
 * Unset in play, so 1.
 */
export function stretch(): number {
  return factor("generation.k");
}

/** Stones still to dig before the bottom, in pocket stones. */
export function stonesLeft(mountain: { readonly remaining: number }): number {
  return mountain.remaining * stretch();
}

/** Stones dug out so far. Here (not in mountain.ts) so relics can use it without a cycle. */
export function minedOut(mountain: { readonly remaining: number }): number {
  return MOUNTAIN_STONES - mountain.remaining;
}
