/** Stones in the whole mountain. A leaf module, so relics and rates can share it without an import cycle. */
export const MOUNTAIN_STONES = 100_000_000;

/** Stones dug out so far. Here (not in mountain.ts) so relics can use it without a cycle. */
export function minedOut(mountain: { readonly remaining: number }): number {
  return MOUNTAIN_STONES - mountain.remaining;
}
