/**
 * Everything he can hold, and the one place that takes from it or adds to it
 * (#560, #769, #771): all five Slice 2 goods share one stockyard and physical
 * transport network. `glass` and `parts` stay hidden in UI until Part 2 turns on.
 */

export type GoodId = "stones" | "brick" | "cutStone" | "glass" | "parts";

/** One row of the goods table: its id and where it comes from. */
export type GoodRow = {
  readonly id: GoodId;
  readonly from: "mountain" | "kilns" | "saws" | "glassworks" | "factory";
};

export const GOOD_ROWS: readonly GoodRow[] = [
  { id: "stones", from: "mountain" },
  { id: "brick", from: "kilns" },
  { id: "cutStone", from: "saws" },
  { id: "glass", from: "glassworks" },
  { id: "parts", from: "factory" },
];

export const GOOD_IDS: readonly GoodId[] = GOOD_ROWS.map((row) => row.id);

/** How much of every good he holds. Complete: a good he has none of is 0. */
export type Stock = Readonly<Record<GoodId, number>>;

export const EMPTY_STOCK: Stock = {
  stones: 0,
  brick: 0,
  cutStone: 0,
  glass: 0,
  parts: 0,
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
    brick: stock.brick + (gains.brick ?? 0),
    cutStone: stock.cutStone + (gains.cutStone ?? 0),
    glass: stock.glass + (gains.glass ?? 0),
    parts: stock.parts + (gains.parts ?? 0),
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
