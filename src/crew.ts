import { grantFirstEngineer } from "./engineers";
import { graniteOpen } from "./mine-levels";
import type { Mountain } from "./mountain";
import {
  buyTier,
  freshDoor,
  type FreshDoor,
  tierById,
  tierInPlay,
  type Tier,
  type TierId,
} from "./tiers";

/** What a locked tier waits for: a later part (slice 1, rule 1, #653). */
export type TierLock = {
  /** A later part's door: never for sale in part 1. */
  readonly kind: "later";
  readonly at: Extract<FreshDoor, { kind: "later" }>["at"];
};

/**
 * Why this tier is not for sale yet, or undefined when it is: a tier whose
 * door is a later part's is always locked; the rest are for sale from the
 * start (rule 1's table, rule 2.6, #689).
 */
export function tierLock(mountain: Mountain, tier: Tier): TierLock | undefined {
  const door = freshDoor(tier.id);
  if (door.kind !== "later") {
    return undefined;
  }
  // The Granite's door is open once the shaft is sunk (#673).
  return door.at === "granite" && graniteOpen(mountain)
    ? undefined
    : { kind: "later", at: door.at };
}

/** A tier he can buy now, price aside: in play, shown, and with no lock (#659, #660). */
export function tierOnSale(mountain: Mountain, tier: Tier): boolean {
  return tierInPlay(tier) && tierLock(mountain, tier) === undefined;
}

/** A tier waiting on a later part: shown, but not for sale. */
export function tierLocked(mountain: Mountain, tier: Tier): boolean {
  return tierLock(mountain, tier) !== undefined;
}

/**
 * Buys one of a tier if it is unlocked and affordable; otherwise the same
 * mountain. The first borer brings the first engineer, already tending it.
 * Later purchases leave her post alone: the engineers sheet chooses it.
 */
export function buyCrew(mountain: Mountain, id: TierId): Mountain {
  const tier = tierById(id);
  // A tier behind a later part's door is not for sale (#653).
  const bought =
    !tierInPlay(tier) || tierLocked(mountain, tier)
      ? mountain
      : buyTier(mountain, id);
  if (mountain.owned.borer > 0 || bought.owned.borer === 0) {
    return bought;
  }
  return grantFirstEngineer(bought).mountain;
}
