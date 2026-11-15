import { stillRequired, stockyardTimes } from "./city";
import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import { partTwoOn } from "./part-switch";
import { pay, type GoodId, type Price } from "./stock";

/**
 * The stockyard (slice 1, rule 4, #666): one stockpile for each good, and one
 * level that sets the room of all of them. A full stockpile takes no more
 * (src/mine-piles.ts). It opens when the Light Tower is operational, in part
 * 2; before that the pocket has no limit. "Expand the stockyard" costs
 * brick, and the Warehouse doubles the room (rule 6).
 */

/**
 * Each stockpile's room at level 0, as the lab set it (#667): twice the
 * spec's guess: a casual dad's long night that fills it fills it late, and
 * the dads away a whole day sit on a full stockpile less than at 3M. Cut
 * stone's comes with part 3. A good with no row
 * has no limit. The lab sweeps it with `room.stockyard`; above about 1.9 the
 * last level's room is past a safe integer, so a sweep stays below that.
 */
const ROOM_AT_ZERO: Readonly<Partial<Record<GoodId, number>>> = {
  stones: 6_000_000,
  brick: 1_000_000,
};

/** The goods with a stockpile in the stockyard: the rows above (#667). */
export const STOCKPILE_GOODS: readonly GoodId[] = (
  Object.keys(ROOM_AT_ZERO) as GoodId[]
).filter((good) => ROOM_AT_ZERO[good] !== undefined);

/** What each level multiplies the room by. */
const ROOM_GROWTH = 3;

/** The first expansion's price in brick, and what each one after costs more. */
const EXPAND_FIRST = 150_000;
const EXPAND_GROWTH = 3;

/**
 * The last level (#666, PR review): every room and price up to it is still
 * a whole number a save holds exactly. A save past it is a newer build's.
 */
export const MAX_STOCKYARD_LEVEL = 18;

/** Whether the stockyard is open: part 2 plays, and the Light Tower is operational. */
export function stockyardOpen(
  mountain: Pick<Mountain, "operational">,
): boolean {
  return partTwoOn() && mountain.operational.includes("lightTower");
}

/** A stockpile's room now: Infinity before the stockyard, or for a good with no stockpile. */
export function stockpileRoom(
  mountain: Pick<Mountain, "operational" | "stockyard">,
  good: GoodId,
): number {
  const base = ROOM_AT_ZERO[good];
  if (base === undefined || !stockyardOpen(mountain)) {
    return Infinity;
  }
  return (
    base *
    factor("room.stockyard") *
    ROOM_GROWTH ** mountain.stockyard *
    stockyardTimes(mountain)
  );
}

/** The next level's price, in brick. It never costs more than the brick stockpile holds. */
export function expandPrice(mountain: Pick<Mountain, "stockyard">): Price {
  return [
    {
      good: "brick",
      amount: EXPAND_FIRST * EXPAND_GROWTH ** mountain.stockyard,
    },
  ];
}

/** One more level, at once (rule 7.14); a closed stockyard, the last level or a short stock buys none. */
export function expandStockyard(mountain: Mountain): Mountain {
  if (!stockyardOpen(mountain) || mountain.stockyard >= MAX_STOCKYARD_LEVEL) {
    return mountain;
  }
  const paid = pay(mountain, expandPrice(mountain));
  return paid === mountain
    ? mountain
    : { ...paid, stockyard: paid.stockyard + 1 };
}

/**
 * Whether every line of a price fits its stockpile. One that does not reads
 * "Needs a bigger stockyard" (rule 4).
 */
export function priceFits(
  mountain: Pick<Mountain, "operational" | "stockyard">,
  price: Price,
): boolean {
  return price.every(
    (line) => line.amount <= stockpileRoom(mountain, line.good),
  );
}

/** Whether a stockpile holds its room or more: it takes no more (rule 4). */
export function stockpileFull(
  mountain: Pick<Mountain, "operational" | "stockyard" | "stock">,
  good: GoodId,
): boolean {
  return mountain.stock[good] >= stockpileRoom(mountain, good);
}

/**
 * The goods whose stockpile sits dead: full while nothing takes its good, no
 * order delivering or the step in hand requiring none of it (#667). The
 * night log adds up this time stretch by stretch, and the lab's `deadGood`
 * reads it live.
 */
export function deadStockpiles(mountain: Mountain): readonly GoodId[] {
  const project = mountain.project;
  const need =
    project.kind === "delivering" ? stillRequired(project.site) : undefined;
  return STOCKPILE_GOODS.filter(
    (good) =>
      stockpileFull(mountain, good) && (need === undefined || need[good] <= 0),
  );
}
