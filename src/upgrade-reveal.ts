import { BOOSTS, type Boost } from "./boosts";
import type { Mountain } from "./mountain";
import { owned, tierById } from "./tiers";
import {
  UPGRADES,
  upgradeCost,
  upgradeLevel,
  upgradeUnlocked,
  type Upgrade,
} from "./upgrades";

/**
 * When an upgrade or boost row shows in the Upgrades sheet. M12-2 (#250)
 * drops the old "nearly affordable" share of the pocket (D2, #245): a row
 * shows at a fixed, predictable point in the climb, never because of what
 * the pocket holds at that moment.
 *
 * - An upgrade shows once its owned-count unlock is met (`upgradeUnlocked`).
 * - A boost shows once the crew owns its first machine of the boost's tier.
 *
 * Once shown, a row stays: it is bought before (taught), or the dad has
 * had it in front of him (its id is in `seen`). The sheet never shows how
 * long the wait is; this is only whether the row is there.
 */
export type RevealRowId = `upgrade:${string}` | `boost:${string}`;

export const upgradeRowId = (upgrade: Upgrade): RevealRowId =>
  `upgrade:${upgrade.id}`;
export const boostRowId = (boost: Boost): RevealRowId => `boost:${boost.id}`;

function seen(mountain: Mountain, id: RevealRowId): boolean {
  return mountain.seen?.includes(id) ?? false;
}

export function upgradeUsed(mountain: Mountain, upgrade: Upgrade): boolean {
  return upgradeLevel(mountain, upgrade.id) > 0;
}

export function boostUsed(mountain: Mountain, boost: Boost): boolean {
  return mountain.boosts?.[boost.id] !== undefined;
}

/** The row shows: open to this crew, or already bought or seen. */
export function upgradeShown(mountain: Mountain, upgrade: Upgrade): boolean {
  return (
    upgradeUnlocked(mountain, upgrade) ||
    upgradeUsed(mountain, upgrade) ||
    seen(mountain, upgradeRowId(upgrade))
  );
}

/** The row shows once the crew owns the boost's first machine. */
export function boostShown(mountain: Mountain, boost: Boost): boolean {
  return (
    boostUsed(mountain, boost) ||
    seen(mountain, boostRowId(boost)) ||
    owned(mountain, tierById(boost.unlock.tier)) >= boost.unlock.count
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
