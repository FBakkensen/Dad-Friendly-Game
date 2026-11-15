import type { LayerId, MaterialId, Materials } from "./layers";

/**
 * Everything he can hold, and the one place that takes from it or adds to it
 * (#560, spec "One stock, and prices as lists"). On screen the four
 * materials are still called materials.
 */

/**
 * A good: the stones, one band's material, or brick, which the kilns make
 * (slice 1, rule 3, #666).
 */
export type GoodId = "stones" | MaterialId | "brick";

/** One row of the goods table: its id and where it comes from. */
export type GoodRow = {
  readonly id: GoodId;
  /** The mountain itself, the band whose digging turns it up, or the maker that makes it. */
  readonly from: "mountain" | LayerId | "kilns";
};

/** Each material is the one its band names in `layers` (the test holds them together). */
export const GOOD_ROWS: readonly GoodRow[] = [
  { id: "stones", from: "mountain" },
  { id: "clay", from: "topsoil" },
  { id: "iron", from: "granite" },
  { id: "crystal", from: "crystal" },
  { id: "heartstone", from: "heart" },
  { id: "brick", from: "kilns" },
];

export const GOOD_IDS: readonly GoodId[] = GOOD_ROWS.map((row) => row.id);

/** How much of every good he holds. Complete: a good he has none of is 0. */
export type Stock = Readonly<Record<GoodId, number>>;

export const EMPTY_STOCK: Stock = {
  stones: 0,
  clay: 0,
  iron: 0,
  crystal: 0,
  heartstone: 0,
  brick: 0,
};

/** One good and how much of it a price asks. */
type PriceLine = { readonly good: GoodId; readonly amount: number };

/** What something costs: a short list of goods. Most prices have one line. */
export type Price = readonly PriceLine[];

export function stonesPrice(amount: number): Price {
  return [{ good: "stones", amount }];
}

/**
 * The price on a buy whose price was never shown (another page, no level
 * left). It matches no price, not even a free one, so it buys nothing (#367).
 */
export const UNSHOWN_PRICE: Price = stonesPrice(Number.NaN);

/** The four materials a stock holds, without the stones. */
export function materialsOf(stock: Stock): Materials {
  return {
    clay: stock.clay,
    iron: stock.iron,
    crystal: stock.crystal,
    heartstone: stock.heartstone,
  };
}

/** How much of `good` the price asks: 0 when it asks none. */
export function priceAmount(price: Price, good: GoodId): number {
  let amount = 0;
  for (const line of price) {
    if (line.good === good) {
      amount += line.amount;
    }
  }
  return amount;
}

/** The same price: every good asks the same amount, whatever the order. */
export function samePrice(left: Price, right: Price): boolean {
  return GOOD_IDS.every(
    (good) => priceAmount(left, good) === priceAmount(right, good),
  );
}

/** Whether the stock covers every line of the price. */
export function canPay(stock: Stock, price: Price): boolean {
  return price.every(
    (line) => stock[line.good] >= priceAmount(price, line.good),
  );
}

/**
 * The holder after paying every line at once, or the same holder when the
 * stock does not cover the price: a refused buy changes nothing.
 */
export function pay<T extends { readonly stock: Stock }>(
  holder: T,
  price: Price,
): T {
  if (!canPay(holder.stock, price)) {
    return holder;
  }
  return { ...holder, stock: addedStock(holder.stock, lines(price, -1)) };
}

/**
 * The stock with these gains added. Goods left out are unchanged. Every dig
 * and tick runs it, so it writes the record out in one literal, not a loop
 * (#560); the `Stock` type makes a new good a compile error here.
 */
export function addedStock(stock: Stock, gains: Partial<Stock>): Stock {
  return {
    stones: stock.stones + (gains.stones ?? 0),
    clay: stock.clay + (gains.clay ?? 0),
    iron: stock.iron + (gains.iron ?? 0),
    crystal: stock.crystal + (gains.crystal ?? 0),
    heartstone: stock.heartstone + (gains.heartstone ?? 0),
    brick: stock.brick + (gains.brick ?? 0),
  };
}

/** The holder with these gains added. Goods left out are unchanged. */
export function add<T extends { readonly stock: Stock }>(
  holder: T,
  gains: Partial<Stock>,
): T {
  return { ...holder, stock: addedStock(holder.stock, gains) };
}

/** The holder with every line of the price put back: a refund. */
export function refund<T extends { readonly stock: Stock }>(
  holder: T,
  price: Price,
): T {
  return { ...holder, stock: addedStock(holder.stock, lines(price, 1)) };
}

/** A price's lines as gains, each times `sign`. */
function lines(price: Price, sign: 1 | -1): Partial<Stock> {
  const gains: Partial<Record<GoodId, number>> = {};
  for (const line of price) {
    gains[line.good] = (gains[line.good] ?? 0) + sign * line.amount;
  }
  return gains;
}

/** What a move took and what it put in, good by good, each at least 0. */
export function stockMoved(
  before: Stock,
  after: Stock,
): { readonly spent: Stock; readonly gained: Stock } {
  const spent: Record<GoodId, number> = { ...EMPTY_STOCK };
  const gained: Record<GoodId, number> = { ...EMPTY_STOCK };
  for (const id of GOOD_IDS) {
    const moved = after[id] - before[id];
    spent[id] = Math.max(0, -moved);
    gained[id] = Math.max(0, moved);
  }
  return { spent, gained };
}
