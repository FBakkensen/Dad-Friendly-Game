import { stillRequired, stockyardTimes } from "./city";
import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import { partThreeOn, partTwoOn, slice2Part2On } from "./part-switch";
import { researchStillRequired } from "./research";
import { pay, type GoodId, type Price } from "./stock";

/**
 * The stockyard (slice 1, rule 4, #666; slice 2, rule 3.1, #771): one
 * stockpile for each of the five goods, and one level that sets the room of
 * all of them. A full stockpile takes no more (src/mine-piles.ts,
 * src/slice2-flow.ts). It opens when the Light Tower is operational, in part
 * 2; before that the pocket has no limit. "Expand the stockyard" costs brick,
 * and the Warehouse doubles the room (rule 6).
 */

/**
 * Unified starting stockpile room at level 0 across all five Slice 2 goods
 * (spec rule 3.1). `cutStone` activates with part 3, and `glass`/`parts` with
 * Slice 2 Part 2. The lab sweeps them with `room.stockyard`; above about 1.9
 * the last level's room passes a safe integer, so sweeps stay below that.
 */
const ROOM_AT_ZERO: Readonly<Record<GoodId, number>> = {
  stones: 6_000_000,
  brick: 1_000_000,
  cutStone: 250_000,
  glass: 150_000,
  parts: 100_000,
};

/** Unified list of all five goods with a stockpile in the stockyard (spec rule 3.1). */
export const STOCKPILE_GOODS: readonly GoodId[] = [
  "stones",
  "brick",
  "cutStone",
  "glass",
  "parts",
];

/** Part 1 / Slice 1 Part 2 base stockpiles before Part 3 and Slice 2 Part 2. */
const PART_TWO_STOCKPILES: readonly GoodId[] = ["stones", "brick"];

/** What each level multiplies the room by: "capacity ×3" (#671). */
export const ROOM_GROWTH = 3;

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

function goodHasStockpile(good: GoodId): boolean {
  if (good === "stones" || good === "brick") {
    return true;
  }
  if (good === "cutStone") {
    return partThreeOn();
  }
  return slice2Part2On();
}

/** A stockpile's room now: Infinity before the stockyard, or for a good not yet in play. */
export function stockpileRoom(
  mountain: Pick<Mountain, "operational" | "stockyard">,
  good: GoodId,
): number {
  if (!stockyardOpen(mountain) || !goodHasStockpile(good)) {
    return Infinity;
  }
  return (
    ROOM_AT_ZERO[good] *
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

/** Whether Glassworks, Factory, or Research currently draws `good` from the stockyard. */
function hasPartTwoDemand(mountain: Mountain, good: GoodId): boolean {
  if (
    mountain.research.active !== undefined &&
    researchStillRequired(mountain.research.active)[good] > 0
  ) {
    return true;
  }
  if (good === "stones") {
    return mountain.makers.glassworks > 0;
  }
  if (good === "brick" || good === "cutStone") {
    return (
      mountain.makers.partsPress > 0 || mountain.makers.precisionAssembly > 0
    );
  }
  if (good === "glass") {
    return mountain.makers.precisionAssembly > 0;
  }
  return false;
}

/** Stockpile goods active for dead/nearly-full checks (Part 1: stones+brick; Part 2: all 5). */
export function activeStockpileGoods(): readonly GoodId[] {
  return slice2Part2On() ? STOCKPILE_GOODS : PART_TWO_STOCKPILES;
}

/**
 * The goods whose stockpile sits dead: full while nothing takes its good, no
 * City order delivering it (and under Slice 2 Part 2, no Glassworks, Factory,
 * or Research demand for it; spec rule 3.1).
 */
export function deadStockpiles(mountain: Mountain): readonly GoodId[] {
  const project = mountain.project;
  const need =
    project.kind === "delivering" ? stillRequired(project.site) : undefined;
  const part2 = slice2Part2On();
  return activeStockpileGoods().filter(
    (good) =>
      stockpileFull(mountain, good) &&
      (need === undefined || need[good] <= 0) &&
      (!part2 || !hasPartTwoDemand(mountain, good)),
  );
}
