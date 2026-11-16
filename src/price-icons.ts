import brickUrl from "./assets/board/res-brick.png";
import cutStoneUrl from "./assets/board/res-cut-stone.png";
import stoneUrl from "./assets/board/res-stone.png";
import type { GoodId } from "./stock";

/**
 * The icon a price is shown with, by the good it is paid in (#680): stone,
 * brick, and cut stone, which the borer and the locomotive cost in part 3.
 */
const PRICE_ICONS: Readonly<Partial<Record<GoodId, string>>> = {
  stones: stoneUrl,
  brick: brickUrl,
  cutStone: cutStoneUrl,
};

/** The icon for a price in `good`, or undefined for a good no price is paid in. */
export function priceIcon(good: GoodId): string | undefined {
  return PRICE_ICONS[good];
}
