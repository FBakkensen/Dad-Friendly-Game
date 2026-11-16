import { factor } from "./economy/factors";
import { grantFirstEngineer } from "./engineers";
import { graniteOpen } from "./mine-levels";
import type { Mountain } from "./mountain";
import { freshMineOn } from "./line-switch";
import { minedOut, shownStones } from "./scale";
import {
  buyTier,
  freshDoor,
  owned,
  type FreshDoor,
  tierById,
  tierInPlay,
  tierShown,
  type Tier,
  type TierId,
} from "./tiers";

/**
 * What a locked tier waits for: a depth (M12-2, #250), or, in a fresh
 * mine, a later part (slice 1, rule 1, #653).
 */
export type TierLock =
  | {
      readonly kind: "depth";
      readonly depth: number;
      /** The depth in stones, for the card (M13). */
      readonly at: number;
    }
  | {
      /** A later part's door in a fresh mine: never for sale in part 1. */
      readonly kind: "later";
      readonly at: Extract<FreshDoor, { kind: "later" }>["at"];
    };

/**
 * A fresh mine's door (rule 1's table): a tier whose door is a later part's
 * is always locked; the rest are for sale from the start (rule 2.6, #689).
 */
function freshLock(mountain: Mountain, tier: Tier): TierLock | undefined {
  const door = freshDoor(tier.id);
  if (door.kind !== "later") {
    return undefined;
  }
  // The Granite's door is open once the shaft is sunk (#673).
  return door.at === "granite" && graniteOpen(mountain)
    ? undefined
    : { kind: "later", at: door.at };
}

/** Why this tier is not for sale yet, or undefined when it is. */
export function tierLock(mountain: Mountain, tier: Tier): TierLock | undefined {
  if (freshMineOn()) {
    return freshLock(mountain, tier);
  }
  // An older save that already runs one keeps buying: the depth only
  // gates the first, so nothing it owns ever shows as locked.
  const opensAt =
    tier.opensAt === undefined
      ? undefined
      : tier.opensAt * factor(`opens.${tier.id}`);
  if (
    opensAt !== undefined &&
    owned(mountain, tier) === 0 &&
    minedOut(mountain) < opensAt
  ) {
    return {
      kind: "depth",
      depth: opensAt,
      at: shownStones(opensAt),
    };
  }
  return undefined;
}

/** A tier he can buy now, price aside: in play, shown, and with no lock (#659, #660). */
export function tierOnSale(mountain: Mountain, tier: Tier): boolean {
  return (
    tierInPlay(tier) &&
    tierShown(mountain, tier) &&
    tierLock(mountain, tier) === undefined
  );
}

/** A tier waiting on a depth or a later part: shown, but not for sale. */
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
  const tier = tierById(id);
  // A machine of the line is not for sale while the line is off (#533).
  const bought =
    !tierInPlay(tier) || tierLocked(mountain, tier)
      ? mountain
      : buyTier(mountain, id);
  if (mountain.owned.borer > 0 || bought.owned.borer === 0) {
    return bought;
  }
  return grantFirstEngineer(bought).mountain;
}
