import { grantFirstEngineer, tendBestTier } from "./engineers";
import { STAFF_GRANT, type Mountain } from "./mountain";
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

/**
 * Buys one of a tier if it is unlocked and affordable; otherwise the same
 * mountain. The first borer brings the first engineer. Until there is a
 * sheet to post her, she tends the borers, and moves onto a Great Machine
 * when one is bought (see tendBestTier).
 */
export function buyCrew(mountain: Mountain, id: TierId): Mountain {
  const bought = tierLocked(mountain, tierById(id))
    ? mountain
    : buyTier(mountain, id);
  const withEngineer =
    mountain.borers > 0 || bought.borers === 0
      ? bought
      : grantFirstEngineer(bought).mountain;
  return tendBestTier(withEngineer);
}

/**
 * One time, hire enough free workers that every machine already owned can run,
 * then mark the save so it never repeats. `#89` did this for the first staffing
 * numbers (`staffed` true or 1). M7 (#140) does it once more for the heavier
 * crew (`staffed` 2): a save already at 2 is returned unchanged. Kids already
 * on the crew count, so they aren't hired again.
 */
export function staffExisting(mountain: Mountain): {
  mountain: Mountain;
  joined: number;
} {
  if (mountain.staffed === STAFF_GRANT) {
    return { mountain, joined: 0 };
  }
  const needed = TIERS.reduce(
    (total, tier) => total + owned(mountain, tier) * tier.staff,
    0,
  );
  const joined = Math.max(0, needed - mountain.helpers - mountain.kids);
  return {
    mountain: {
      ...mountain,
      helpers: mountain.helpers + joined,
      staffed: STAFF_GRANT,
    },
    joined,
  };
}
