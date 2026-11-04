import { factor } from "./economy/factors";
import { grantFirstEngineer } from "./engineers";
import { STAFF_GRANT, type Mountain } from "./mountain";
import { hasRelic, RELICS, type Relic } from "./relics";
import { KID_MACHINE_OPENS, minedOut, shownStones } from "./scale";
import {
  TIERS,
  buyTier,
  owned,
  tierById,
  type Tier,
  type TierId,
} from "./tiers";

/** What a locked tier waits for: a depth (M12-2, #250) or a relic. */
export type TierLock =
  | {
      readonly kind: "depth";
      readonly depth: number;
      /** The depth in this run's stones, for the card (M13). */
      readonly at: number;
    }
  | { readonly kind: "relic"; readonly relic: Relic; readonly at: number };

/**
 * From run 2 on (a stretched run), the Great Machine opens a little sooner,
 * so a once-a-day dad gets a full sitting with it on sale (M13, #253).
 */
function kidOpens(mountain: Mountain, tier: Tier): number {
  return tier.id === "machine" && mountain.stretch !== undefined
    ? KID_MACHINE_OPENS
    : 1;
}

/** Why this tier is not for sale yet, or undefined when it is. */
export function tierLock(mountain: Mountain, tier: Tier): TierLock | undefined {
  // An older save that already runs one keeps buying: the depth only
  // gates the first, so nothing it owns ever shows as locked.
  const opensAt =
    tier.opensAt === undefined
      ? undefined
      : tier.opensAt * kidOpens(mountain, tier) * factor(`opens.${tier.id}`);
  if (
    opensAt !== undefined &&
    owned(mountain, tier) === 0 &&
    minedOut(mountain) < opensAt
  ) {
    return { kind: "depth", depth: opensAt, at: shownStones(mountain, opensAt) };
  }
  const relic = RELICS.find((candidate) => candidate.id === tier.needs);
  if (relic !== undefined && !hasRelic(mountain, relic.id)) {
    return { kind: "relic", relic, at: shownStones(mountain, relic.depth) };
  }
  return undefined;
}

/** A tier waiting on a depth or a relic: shown, but not for sale. */
export function tierLocked(mountain: Mountain, tier: Tier): boolean {
  return tierLock(mountain, tier) !== undefined;
}

/**
 * Buys one of a tier if it is unlocked and affordable; otherwise the same
 * mountain. The first borer brings the first engineer, already tending it.
 * Later purchases leave her post alone: the engineers sheet chooses it.
 * The pacing sim still moves her, through tendBestTier.
 */
export function buyCrew(mountain: Mountain, id: TierId): Mountain {
  const bought = tierLocked(mountain, tierById(id))
    ? mountain
    : buyTier(mountain, id);
  if (mountain.borers > 0 || bought.borers === 0) {
    return bought;
  }
  return grantFirstEngineer(bought).mountain;
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
