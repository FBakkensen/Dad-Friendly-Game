import { factor } from "./economy/factors";
import { grantFirstEngineer } from "./engineers";
import type { Mountain } from "./mountain";
import { hasRelic, RELICS, type Relic } from "./relics";
import { freshMineOn } from "./line-switch";
import { KID_MACHINE_OPENS, minedOut, shownStones } from "./scale";
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
 * What a locked tier waits for: a depth (M12-2, #250), a relic, or, in a
 * fresh mine, a later part (slice 1, rule 1, #653).
 */
export type TierLock =
  | {
      readonly kind: "depth";
      readonly depth: number;
      /** The depth in this run's stones, for the card (M13). */
      readonly at: number;
    }
  | { readonly kind: "relic"; readonly relic: Relic; readonly at: number }
  | {
      /** A later part's door in a fresh mine: never for sale in part 1. */
      readonly kind: "later";
      readonly at: Extract<FreshDoor, { kind: "later" }>["at"];
    };

/**
 * A fresh mine's door (rule 1's table): a tier whose door is a later part's
 * is always locked; the rest are for sale from the start (rule 2.6, #689).
 */
function freshLock(tier: Tier): TierLock | undefined {
  const door = freshDoor(tier.id);
  return door.kind === "later" ? { kind: "later", at: door.at } : undefined;
}

/**
 * From run 2 on (a stretched run), the Great Machine opens a little sooner,
 * so a once-a-day dad gets a full sitting with it on sale (M13, #253).
 */
function kidOpens(mountain: Mountain, tier: Tier): number {
  // Only a kid's run is stretched: a stretch is always above 1.
  return tier.id === "machine" && mountain.stretch > 1 ? KID_MACHINE_OPENS : 1;
}

/** Why this tier is not for sale yet, or undefined when it is. */
export function tierLock(mountain: Mountain, tier: Tier): TierLock | undefined {
  if (freshMineOn()) {
    return freshLock(tier);
  }
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
    return {
      kind: "depth",
      depth: opensAt,
      at: shownStones(mountain, opensAt),
    };
  }
  const relic = RELICS.find((candidate) => candidate.id === tier.needs);
  if (relic !== undefined && !hasRelic(mountain, relic.id)) {
    return { kind: "relic", relic, at: shownStones(mountain, relic.depth) };
  }
  return undefined;
}

/** A tier waiting on a depth or a relic: shown, but not for sale. */
/** A tier he can buy now, price aside: in play, shown, and with no lock (#659, #660). */
export function tierOnSale(mountain: Mountain, tier: Tier): boolean {
  return (
    tierInPlay(tier) &&
    tierShown(mountain, tier) &&
    tierLock(mountain, tier) === undefined
  );
}

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
