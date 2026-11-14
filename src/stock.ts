import type { LayerId, MaterialId } from "./layers";

/**
 * Everything he can hold, and the one place that takes from it or adds to it
 * (#560, spec "One stock, and prices as lists"). On screen the four
 * materials are still called materials.
 */

/** A good: the stones, or one band's material. */
export type GoodId = "stones" | MaterialId;

/** One row of the goods table: its id and where it comes from. */
export type GoodRow = {
  readonly id: GoodId;
  /** The mountain itself, or the band whose digging turns it up. */
  readonly from: "mountain" | LayerId;
};

/** Each material is the one its band names in `layers` (the test holds them together). */
export const GOOD_ROWS: readonly GoodRow[] = [
  { id: "stones", from: "mountain" },
  { id: "clay", from: "topsoil" },
  { id: "iron", from: "granite" },
  { id: "crystal", from: "crystal" },
  { id: "heartstone", from: "heart" },
];

export const GOOD_IDS: readonly GoodId[] = GOOD_ROWS.map((row) => row.id);

/** How much of every good he holds. Complete: a good he has none of is 0. */
export type Stock = Readonly<Record<GoodId, number>>;

export const EMPTY_STOCK: Stock = Object.fromEntries(
  GOOD_IDS.map((id) => [id, 0]),
) as Record<GoodId, number>;

/** One good and how much of it a price asks. */
type PriceLine = { readonly good: GoodId; readonly amount: number };

/** What something costs: a short list of goods. Most prices have one line. */
export type Price = readonly PriceLine[];

export function stonesPrice(amount: number): Price {
  return [{ good: "stones", amount }];
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
  const stock: Record<GoodId, number> = { ...holder.stock };
  for (const line of price) {
    stock[line.good] -= line.amount;
  }
  return { ...holder, stock };
}

/** The holder with these gains added. Goods left out are unchanged. */
export function add<T extends { readonly stock: Stock }>(
  holder: T,
  gains: Partial<Stock>,
): T {
  const stock: Record<GoodId, number> = { ...holder.stock };
  for (const id of GOOD_IDS) {
    stock[id] += gains[id] ?? 0;
  }
  return { ...holder, stock };
}

/**
 * The holder with every line of the price taken out, covered or not. Only
 * for goods the same step has just put in, such as the Gold rush hold on
 * the stones an absence paid. A buy uses `pay`, which refuses.
 */
export function take<T extends { readonly stock: Stock }>(
  holder: T,
  price: Price,
): T {
  return refund(
    holder,
    price.map((line) => ({ ...line, amount: -line.amount })),
  );
}

/** The holder with every line of the price put back: a refund. */
export function refund<T extends { readonly stock: Stock }>(
  holder: T,
  price: Price,
): T {
  const stock: Record<GoodId, number> = { ...holder.stock };
  for (const line of price) {
    stock[line.good] += line.amount;
  }
  return { ...holder, stock };
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
