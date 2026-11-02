import { BOOSTS, boostCost, type Boost } from "./boosts";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import {
  UPGRADES,
  upgradeCost,
  upgradeLevel,
  upgradeUnlocked,
  type Upgrade,
} from "./upgrades";

/**
 * When an upgrade or boost row shows in the Upgrades sheet (M11-7, #245,
 * plan decision D2). A row the dad cannot nearly afford stays hidden, so
 * the sheet never lists a wall of "Locked" or out-of-reach prices.
 *
 * Nearly affordable, from the pocket and the crew:
 * - the pocket already holds at least half the price, or
 * - the pocket plus five minutes of the crew (unboosted) covers it.
 *
 * Once shown, a row stays: it is bought before (taught), or the dad has
 * had it in front of him (its id is in `seen`). The sheet never shows how
 * long the wait is; this is only whether the row is there.
 */
export const NEAR_SHARE = 0.5;
export const NEAR_CREW_SEC = 5 * 60;

export type RevealRowId = `upgrade:${string}` | `boost:${string}`;

export const upgradeRowId = (upgrade: Upgrade): RevealRowId =>
  `upgrade:${upgrade.id}`;
export const boostRowId = (boost: Boost): RevealRowId => `boost:${boost.id}`;

/** Pocket and crew bring this price within reach soon. */
export function nearlyAffordable(mountain: Mountain, cost: number): boolean {
  if (mountain.pocket >= cost * NEAR_SHARE) {
    return true;
  }
  const crew = effectiveRates(mountain).exactCrewPerSecond;
  return mountain.pocket + crew * NEAR_CREW_SEC >= cost;
}

function seen(mountain: Mountain, id: RevealRowId): boolean {
  return mountain.seen?.includes(id) ?? false;
}

export function upgradeUsed(mountain: Mountain, upgrade: Upgrade): boolean {
  return upgradeLevel(mountain, upgrade.id) > 0;
}

export function boostUsed(mountain: Mountain, boost: Boost): boolean {
  return mountain.boosts?.[boost.id] !== undefined;
}

/** The row shows: open to this crew, and bought, seen, or nearly affordable. */
export function upgradeShown(mountain: Mountain, upgrade: Upgrade): boolean {
  if (!upgradeUnlocked(mountain, upgrade)) {
    return false;
  }
  if (upgradeUsed(mountain, upgrade) || seen(mountain, upgradeRowId(upgrade))) {
    return true;
  }
  const cost = upgradeCost(upgrade, upgradeLevel(mountain, upgrade.id));
  return cost !== undefined && nearlyAffordable(mountain, cost);
}

export function boostShown(mountain: Mountain, boost: Boost): boolean {
  return (
    boostUsed(mountain, boost) ||
    seen(mountain, boostRowId(boost)) ||
    nearlyAffordable(mountain, boostCost(boost, effectiveRates(mountain)))
  );
}

/** Every row showing now, for marking them seen. */
export function shownRows(mountain: Mountain): readonly RevealRowId[] {
  return [
    ...BOOSTS.filter((boost) => boostShown(mountain, boost)).map(boostRowId),
    ...UPGRADES.filter((upgrade) => upgradeShown(mountain, upgrade)).map(
      upgradeRowId,
    ),
  ];
}

/** Rows still hidden that the dad could one day buy. */
export function anyHiddenRow(mountain: Mountain): boolean {
  return (
    UPGRADES.some(
      (upgrade) =>
        upgradeCost(upgrade, upgradeLevel(mountain, upgrade.id)) !==
          undefined && !upgradeShown(mountain, upgrade),
    ) || BOOSTS.some((boost) => !boostShown(mountain, boost))
  );
}
