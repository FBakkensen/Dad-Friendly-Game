import brickUrl from "./assets/board/res-brick.png";
import cutStoneUrl from "./assets/board/res-cut-stone.png";
import partsUrl from "./assets/board/res-parts.png";
import stoneUrl from "./assets/board/res-stone.png";
import type { GoodId } from "./stock";

/**
 * The one table of a good's icon on the frame (#680, #769, #773): the price on
 * a key (stone, brick, cut stone, and parts) and what a building's step
 * requires in the city.
 */
const GOOD_ICONS: Readonly<Partial<Record<GoodId, string>>> = {
  stones: stoneUrl,
  brick: brickUrl,
  cutStone: cutStoneUrl,
  parts: partsUrl,
};

/** The icon for `good`, or undefined for a good with no icon. */
export function priceIcon(good: GoodId): string | undefined {
  return GOOD_ICONS[good];
}
