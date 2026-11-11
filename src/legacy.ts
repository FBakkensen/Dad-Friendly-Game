import { createMountain, runStartedAt, type Mountain } from "./mountain";
import { hasRelic } from "./relics";
import { kidStretch } from "./scale";
import { NOTHING_KEPT } from "./workshop";

/** The bonus itself lives in rates.ts with every other multiplier. */
export { LEGACY_STEP, legacyBonus } from "./rates";

/**
 * Pass the mine to your kid (M6): only at the bottom, with the Mantle found.
 * Everything starts fresh except the Legacy, which grows by one, and the
 * kid's mountain is stretched by kidStretch. The new run
 * starts later than the old one, so a stale cloud snapshot can't bring it back.
 */
export function passTheMine(
  mountain: Mountain,
  now: number,
): Mountain | undefined {
  if (mountain.remaining > 0 || !hasRelic(mountain, "mantle")) {
    return undefined;
  }
  const fresh = createMountain();
  const legacy = mountain.legacy + 1;
  return {
    ...fresh,
    legacy,
    // The kid's mountain is bigger (M13): k from this pass on, never before.
    stretch: kidStretch(legacy),
    startedAt: Math.max(now, runStartedAt(mountain) + 1),
    recipes: mountain.recipes,
    // A newer build's recipes and teach marks pass on; its bench and gear do not.
    kept: {
      ...NOTHING_KEPT,
      recipes: mountain.kept.recipes,
      seen: mountain.kept.seen,
      taught: mountain.kept.taught,
    },
    seen: mountain.seen,
    taught: mountain.taught,
  };
}
