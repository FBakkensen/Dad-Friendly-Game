import { createMountain, runStartedAt, type Mountain } from "./mountain";
import { hasRelic } from "./relics";
import { recipesForMined } from "./workshop";

/** The bonus itself lives in rates.ts with every other multiplier. */
export { LEGACY_STEP, legacyBonus } from "./rates";

/**
 * Pass the mine to your kid (M6): only at the bottom, with the Mantle found.
 * Everything starts fresh except the Legacy, which grows by one. The new run
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
  return {
    ...fresh,
    legacy: (mountain.legacy ?? 0) + 1,
    startedAt: Math.max(now, runStartedAt(mountain) + 1),
    recipes: mountain.recipes ?? recipesForMined(0),
  };
}
