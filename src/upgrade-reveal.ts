import type { Mountain } from "./mountain";
import {
  upgradeLevel,
  upgradeUnlocked,
  type Upgrade,
  type UpgradeId,
} from "./upgrades";

/**
 * When an upgrade row shows in the Upgrades sheet. M12-2 (#250) drops the
 * old "nearly affordable" share of the pocket (D2, #245): a row shows at a
 * fixed, predictable point in the climb, never because of what the pocket
 * holds at that moment. An upgrade shows once its owned-count unlock is met
 * (`upgradeUnlocked`).
 *
 * Once shown, a row stays: it is bought before (taught), or the dad has
 * had it in front of him (its id is in `seen`). The sheet never shows how
 * long the wait is; this is only whether the row is there.
 */
export type RevealRowId = `upgrade:${UpgradeId}`;

export const upgradeRowId = (upgrade: Upgrade): RevealRowId =>
  `upgrade:${upgrade.id}`;

function seen(mountain: Mountain, id: RevealRowId): boolean {
  return mountain.seen.includes(id);
}

export function upgradeUsed(mountain: Mountain, upgrade: Upgrade): boolean {
  return upgradeLevel(mountain, upgrade.id) > 0;
}

/** The row shows: open to this crew, or already bought or seen. */
export function upgradeShown(mountain: Mountain, upgrade: Upgrade): boolean {
  return (
    upgradeUnlocked(mountain, upgrade) ||
    upgradeUsed(mountain, upgrade) ||
    seen(mountain, upgradeRowId(upgrade))
  );
}
