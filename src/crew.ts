import type { Mountain } from "./mountain";
import { hasRelic } from "./relics";
import {
  TIERS,
  buyTier,
  owned,
  tierById,
  type Tier,
  type TierId,
} from "./tiers";

/** A tier waiting on a relic not yet found: shown, but not for sale. */
export function tierLocked(mountain: Mountain, tier: Tier): boolean {
  return tier.needs !== undefined && !hasRelic(mountain, tier.needs);
}

/** Buys one of a tier if it is unlocked and affordable; otherwise the same mountain. */
export function buyCrew(mountain: Mountain, id: TierId): Mountain {
  return tierLocked(mountain, tierById(id)) ? mountain : buyTier(mountain, id);
}

/**
 * One time, for saves from before machines needed helpers (#89): hire enough
 * free helpers to run every machine already owned, and mark the save so it
 * never repeats. Returns how many joined (0 when nothing changed).
 */
export function staffExisting(mountain: Mountain): {
  mountain: Mountain;
  joined: number;
} {
  if (mountain.staffed === true) {
    return { mountain, joined: 0 };
  }
  const needed = TIERS.reduce(
    (total, tier) => total + owned(mountain, tier) * tier.staff,
    0,
  );
  const joined = Math.max(0, needed - mountain.helpers);
  return {
    mountain: {
      ...mountain,
      helpers: mountain.helpers + joined,
      staffed: true,
    },
    joined,
  };
}
