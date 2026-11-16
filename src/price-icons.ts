import brickUrl from "./assets/board/res-brick.png";
import clayUrl from "./assets/board/res-clay.png";
import cutStoneUrl from "./assets/board/res-cut-stone.png";
import ironUrl from "./assets/board/res-iron.png";
import stoneUrl from "./assets/board/res-stone.png";
import type { GoodId } from "./stock";

/**
 * The one table of a good's icon on the frame (#680): the price on a key
 * (stone, brick, and cut stone, which the borer and the locomotive cost in
 * part 3), what a building's step requires (the city), and what a work order
 * requires (the factory's clay and iron).
 */
const GOOD_ICONS: Readonly<Partial<Record<GoodId, string>>> = {
  stones: stoneUrl,
  brick: brickUrl,
  cutStone: cutStoneUrl,
  clay: clayUrl,
  iron: ironUrl,
};

/** The icon for `good`, or undefined for a good with no icon. */
export function priceIcon(good: GoodId): string | undefined {
  return GOOD_ICONS[good];
}
