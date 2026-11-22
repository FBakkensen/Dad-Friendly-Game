import { describe, expect, it } from "vitest";
import {
  EMPTY_STOCK,
  GOOD_IDS,
  GOOD_ROWS,
  add,
  canPay,
  pay,
  priceAmount,
  refund,
  samePrice,
  stockMoved,
  stonesPrice,
  UNSHOWN_PRICE,
  type Price,
  type Stock,
} from "./stock";

const holding = (stock: Partial<Stock>) => ({
  stock: { ...EMPTY_STOCK, ...stock },
});

const order: Price = [
  { good: "stones", amount: 500 },
  { good: "brick", amount: 3 },
];

describe("the goods table (#560, #769)", () => {
  it("lists stones, brick, and cut stone in order", () => {
    expect(GOOD_IDS).toEqual(["stones", "brick", "cutStone"]);
    expect(EMPTY_STOCK).toEqual({
      stones: 0,
      brick: 0,
      cutStone: 0,
    });
  });

  it("says where each good comes from", () => {
    const from = Object.fromEntries(GOOD_ROWS.map((row) => [row.id, row.from]));
    expect(from.stones).toBe("mountain");
    expect(from.brick).toBe("kilns");
    expect(from.cutStone).toBe("saws");
  });
});

describe("prices", () => {
  it("a stones price is one line, and reads back by good", () => {
    expect(stonesPrice(120)).toEqual([{ good: "stones", amount: 120 }]);
    expect(priceAmount(order, "stones")).toBe(500);
    expect(priceAmount(order, "brick")).toBe(3);
    expect(priceAmount(order, "cutStone")).toBe(0);
  });

  it("two prices are the same only when every good matches, in any order", () => {
    expect(samePrice(order, [order[1], order[0]] as Price)).toBe(true);
    expect(samePrice(order, stonesPrice(500))).toBe(false);
    expect(
      samePrice(order, [
        { good: "stones", amount: 500 },
        { good: "brick", amount: 4 },
      ]),
    ).toBe(false);
    expect(samePrice(stonesPrice(0), [])).toBe(true);
  });

  it("the unshown price matches no price, not even a free one", () => {
    expect(samePrice(UNSHOWN_PRICE, [])).toBe(false);
    expect(samePrice(UNSHOWN_PRICE, stonesPrice(0))).toBe(false);
    expect(samePrice(UNSHOWN_PRICE, UNSHOWN_PRICE)).toBe(false);
    expect(samePrice(UNSHOWN_PRICE, order)).toBe(false);
  });
});

describe("paying and adding", () => {
  it("pays every good at once, and only when each is covered", () => {
    const rich = holding({ stones: 600, brick: 3 });
    expect(canPay(rich.stock, order)).toBe(true);
    expect(pay(rich, order).stock).toEqual({
      ...EMPTY_STOCK,
      stones: 100,
      brick: 0,
    });
    const shortBrick = holding({ stones: 1e9, brick: 2 });
    expect(canPay(shortBrick.stock, order)).toBe(false);
    expect(pay(shortBrick, order)).toBe(shortBrick);
    const shortStones = holding({ stones: 499, brick: 30 });
    expect(pay(shortStones, order)).toBe(shortStones);
  });

  it("a free price always pays and changes nothing", () => {
    const empty = holding({});
    expect(canPay(empty.stock, [])).toBe(true);
    expect(pay(empty, stonesPrice(0)).stock).toEqual(EMPTY_STOCK);
  });

  it("adds gains by good and keeps the rest of the mountain", () => {
    const mountain = { ...holding({ stones: 10, cutStone: 1 }), rockDug: 7 };
    const next = add(mountain, { stones: 5, brick: 2 });
    expect(next.stock).toEqual({
      ...EMPTY_STOCK,
      stones: 15,
      cutStone: 1,
      brick: 2,
    });
    expect(next.rockDug).toBe(7);
    expect(mountain.stock.stones).toBe(10);
  });

  it("a refund puts every line of a price back", () => {
    const paid = pay(holding({ stones: 600, brick: 3, cutStone: 1 }), order);
    expect(refund(paid, order).stock).toEqual({
      ...EMPTY_STOCK,
      stones: 600,
      brick: 3,
      cutStone: 1,
    });
    expect(refund(paid, [])).toEqual(paid);
  });

  it("adds to every good in the goods table", () => {
    const one = Object.fromEntries(GOOD_IDS.map((id) => [id, 1]));
    const twice = add(add(holding({}), one), one).stock;
    for (const id of GOOD_IDS) {
      expect(twice[id]).toBe(2);
    }
  });

  it("reports what a move spent and gained, by good", () => {
    const before = { ...EMPTY_STOCK, stones: 100, cutStone: 4 };
    const after = { ...EMPTY_STOCK, stones: 40, cutStone: 4, brick: 2 };
    expect(stockMoved(before, after)).toEqual({
      spent: { ...EMPTY_STOCK, stones: 60 },
      gained: { ...EMPTY_STOCK, brick: 2 },
    });
  });
});
