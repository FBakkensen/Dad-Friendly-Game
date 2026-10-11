import type { Mountain } from "./mountain";
import { hasRelic } from "./relics";
import { buyTier, tierById, type Tier, type TierId } from "./tiers";

/** A tier waiting on a relic not yet found: shown, but not for sale. */
export function tierLocked(mountain: Mountain, tier: Tier): boolean {
  return tier.needs !== undefined && !hasRelic(mountain, tier.needs);
}

/** Buys one of a tier if it is unlocked and affordable; otherwise the same mountain. */
export function buyCrew(mountain: Mountain, id: TierId): Mountain {
  return tierLocked(mountain, tierById(id)) ? mountain : buyTier(mountain, id);
}
