import { describe, expect, it } from "vitest";
import { LAYERS } from "./layers";
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
  take,
  materialsOf,
  UNSHOWN_PRICE,
  type Price,
  type Stock,
} from "./stock";

const holding = (stock: Partial<Stock>) => ({
  stock: { ...EMPTY_STOCK, ...stock },
});

const rails: Price = [
  { good: "stones", amount: 500 },
  { good: "iron", amount: 3 },
];

describe("the goods table (#560)", () => {
  it("lists the stones and each band's material, in that order", () => {
    expect(GOOD_IDS).toEqual([
      "stones",
      "clay",
      "iron",
      "crystal",
      "heartstone",
      "brick",
    ]);
    expect(EMPTY_STOCK).toEqual({
      stones: 0,
      clay: 0,
      iron: 0,
      crystal: 0,
      heartstone: 0,
      brick: 0,
    });
  });

  it("says where each good comes from: the mountain, or its band", () => {
    const from = Object.fromEntries(GOOD_ROWS.map((row) => [row.id, row.from]));
    expect(from.stones).toBe("mountain");
    expect(from.brick).toBe("kilns");
    for (const layer of LAYERS) {
      expect(from[layer.material]).toBe(layer.id);
    }
  });
});

describe("prices", () => {
  it("a stones price is one line, and reads back by good", () => {
    expect(stonesPrice(120)).toEqual([{ good: "stones", amount: 120 }]);
    expect(priceAmount(rails, "stones")).toBe(500);
    expect(priceAmount(rails, "iron")).toBe(3);
    expect(priceAmount(rails, "clay")).toBe(0);
  });

  it("two prices are the same only when every good matches, in any order", () => {
    expect(samePrice(rails, [rails[1], rails[0]] as Price)).toBe(true);
    expect(samePrice(rails, stonesPrice(500))).toBe(false);
    expect(
      samePrice(rails, [
        { good: "stones", amount: 500 },
        { good: "iron", amount: 4 },
      ]),
    ).toBe(false);
    expect(samePrice(stonesPrice(0), [])).toBe(true);
  });

  it("the unshown price matches no price, not even a free one", () => {
    expect(samePrice(UNSHOWN_PRICE, [])).toBe(false);
    expect(samePrice(UNSHOWN_PRICE, stonesPrice(0))).toBe(false);
    expect(samePrice(UNSHOWN_PRICE, UNSHOWN_PRICE)).toBe(false);
    expect(samePrice(UNSHOWN_PRICE, rails)).toBe(false);
  });

  it("reads the four materials out of a stock, without the stones", () => {
    expect(
      materialsOf({ ...EMPTY_STOCK, stones: 9, clay: 1, heartstone: 2 }),
    ).toEqual({ clay: 1, iron: 0, crystal: 0, heartstone: 2 });
  });
});

describe("paying and adding", () => {
  it("pays every good at once, and only when each is covered", () => {
    const rich = holding({ stones: 600, iron: 3 });
    expect(canPay(rich.stock, rails)).toBe(true);
    expect(pay(rich, rails).stock).toEqual({
      ...EMPTY_STOCK,
      stones: 100,
      iron: 0,
    });
    const shortIron = holding({ stones: 1e9, iron: 2 });
    expect(canPay(shortIron.stock, rails)).toBe(false);
    expect(pay(shortIron, rails)).toBe(shortIron);
    const shortStones = holding({ stones: 499, iron: 30 });
    expect(pay(shortStones, rails)).toBe(shortStones);
  });

  it("a free price always pays and changes nothing", () => {
    const empty = holding({});
    expect(canPay(empty.stock, [])).toBe(true);
    expect(pay(empty, stonesPrice(0)).stock).toEqual(EMPTY_STOCK);
  });

  it("adds gains by good and keeps the rest of the mountain", () => {
    const mountain = { ...holding({ stones: 10, clay: 1 }), remaining: 7 };
    const next = add(mountain, { stones: 5, iron: 2 });
    expect(next.stock).toEqual({
      ...EMPTY_STOCK,
      stones: 15,
      clay: 1,
      iron: 2,
    });
    expect(next.remaining).toBe(7);
    expect(mountain.stock.stones).toBe(10);
  });

  it("a refund puts every line of a price back", () => {
    const paid = pay(holding({ stones: 600, iron: 3, clay: 1 }), rails);
    expect(refund(paid, rails).stock).toEqual({
      ...EMPTY_STOCK,
      stones: 600,
      iron: 3,
      clay: 1,
    });
    expect(refund(paid, [])).toEqual(paid);
  });

  it("takes back goods the same step put in, without asking if they are covered", () => {
    const paidOut = holding({ stones: 8_000 });
    expect(take(paidOut, stonesPrice(8_100)).stock.stones).toBe(-100);
    expect(take(paidOut, stonesPrice(100)).stock).toEqual({
      ...EMPTY_STOCK,
      stones: 7_900,
    });
  });

  it("adds to every good in the goods table", () => {
    const one = Object.fromEntries(GOOD_IDS.map((id) => [id, 1]));
    const twice = add(add(holding({}), one), one).stock;
    for (const id of GOOD_IDS) {
      expect(twice[id]).toBe(2);
    }
  });

  it("reports what a move spent and gained, by good", () => {
    const before = { ...EMPTY_STOCK, stones: 100, clay: 4 };
    const after = { ...EMPTY_STOCK, stones: 40, clay: 4, iron: 2 };
    expect(stockMoved(before, after)).toEqual({
      spent: { ...EMPTY_STOCK, stones: 60 },
      gained: { ...EMPTY_STOCK, iron: 2 },
    });
  });
});
