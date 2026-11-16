import { EMPTY_STOCK } from "./stock";
import { describe, expect, it } from "vitest";
import { buyCrew, tierLock } from "./crew";
import { minedMountain, reloaded, NONE_OWNED } from "./test-fixtures";
import { type Mountain, BARE_MOUNTAIN, createMountain } from "./mountain";
import { effectiveRates } from "./rates";
import { withFactors } from "./economy/factors";
import { UPGRADES, upgradePrice } from "./upgrades";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "./mine-levels";
import { PART_THREE_OFF, PART_TWO_OFF, PLAY_FACTORS } from "./part-switch";
import {
  HELPER_COST_GROWTH,
  LINE_MACHINE_COST_GROWTH,
  MACHINE_IDS,
  TIER_IDS,
  machineRecord,
  setOwned,
  tierRecord,
  TIERS,
  isShownTier,
  tierInPlay,
  buyTier,
  tierById,
  tierCost,
  tierGood,
  tierQuote,
  type TierId,
} from "./tiers";

const at = (fields: Partial<Omit<Mountain, "startedAt">>): Mountain => ({
  ...BARE_MOUNTAIN,
  stock: { ...BARE_MOUNTAIN.stock, stones: 0 },
  owned: {
    ...BARE_MOUNTAIN.owned,
    helper: 0,
    cart: 0,
    drill: 0,
    borer: 0,
    machine: 0,
    kid: 0,
  },
  ...fields,
});

describe("tiers", () => {
  it("lists the machines: every staffed tier, in tier order (#388)", () => {
    // A new staffed tier (#359) lands here and fails this pin, so the lab
    // measures that read MACHINE_IDS are checked on purpose, not skipped.
    expect(MACHINE_IDS).toEqual([
      "cart",
      "hoist",
      "drill",
      "borer",
      "train",
      "machine",
    ]);
    // MachineId is TierId minus these, so a new unstaffed tier fails here.
    expect(
      TIERS.filter((tier) => tier.staff === 0).map((tier) => tier.id),
    ).toEqual(["helper", "kid"]);
  });

  it("lists every tier cheapest first, each a big jump in speed", () => {
    expect(TIERS.map(({ id, perSecond }) => [id, perSecond])).toEqual([
      ["helper", 1],
      ["cart", 6],
      ["hoist", 20],
      ["drill", 36],
      ["borer", 357],
      ["train", 1_067],
      ["machine", 2_100],
      ["kid", 25],
    ]);
    // Machines climb; kids are a late helper tier, not a machine. The
    // line's hoist and pit train fill a stage each, not a rung (#533).
    const machines = TIERS.filter(
      (tier) => !["kid", "hoist", "train"].includes(tier.id),
    );
    for (const [index, tier] of machines.entries()) {
      const next = machines[index + 1];
      if (next !== undefined) {
        expect(next.perSecond).toBeGreaterThanOrEqual(tier.perSecond * 5);
        // M12 retune (#252): the Great Machine is about five borers.
        expect(next.firstCost).toBeGreaterThanOrEqual(tier.firstCost * 4.5);
      }
    }
  });

  it("buys only when the pocket covers the cost, and pays for it", () => {
    const cart = tierById("cart");
    const first = tierCost(cart, 0);
    const second = tierCost(cart, 1);
    const poor = at({ stock: { ...EMPTY_STOCK, stones: first - 1 } });
    expect(buyTier(poor, "cart")).toBe(poor);
    const one = buyTier(
      at({ stock: { ...EMPTY_STOCK, stones: first + second + 110 } }),
      "cart",
    );
    expect(one).toEqual(
      at({
        stock: { ...EMPTY_STOCK, stones: second + 110 },
        owned: { ...NONE_OWNED, cart: 1 },
      }),
    );
    expect(buyTier(one, "cart")).toEqual(
      at({
        stock: { ...EMPTY_STOCK, stones: 110 },
        owned: { ...NONE_OWNED, cart: 2 },
      }),
    );
    const worker = tierCost(tierById("helper"), 0);
    expect(
      buyTier(at({ stock: { ...EMPTY_STOCK, stones: worker + 5 } }), "helper"),
    ).toEqual(
      at({
        stock: { ...EMPTY_STOCK, stones: 5 },
        owned: { ...NONE_OWNED, helper: 1 },
      }),
    );
  });
});

describe("crew staffing", () => {
  it("needs workers to run each machine: cart 1, drill 1, borer 8, Great Machine 10", () => {
    expect(TIERS.map(({ id, staff }) => [id, staff])).toEqual([
      ["helper", 0],
      ["cart", 1],
      ["hoist", 1],
      ["drill", 1],
      ["borer", 8],
      ["train", 8],
      ["machine", 10],
      ["kid", 0],
    ]);
  });
});

// #356 gentler curves: every tier climbs its growth from its first price.
describe("cost curves (#356)", () => {
  const ceil12 = (n: number) => Math.ceil(Number(n.toPrecision(12)));
  /** From the first price play charges (the line's, #543). */
  const curve = (id: TierId, n: number, growth: number) =>
    ceil12(tierCost(tierById(id), 0) * growth ** n);

  it("machines climb the line's machine curve", () => {
    for (const [id, n] of [
      ["cart", 13],
      ["hoist", 7],
      ["drill", 11],
      ["borer", 3],
      ["machine", 2],
    ] as const) {
      expect(tierCost(tierById(id), n)).toBe(
        curve(id, n, LINE_MACHINE_COST_GROWTH),
      );
    }
  });

  it("workers and kids climb the worker curve", () => {
    expect(tierCost(tierById("helper"), 32)).toBe(
      curve("helper", 32, HELPER_COST_GROWTH),
    );
    expect(tierCost(tierById("kid"), 5)).toBe(
      curve("kid", 5, HELPER_COST_GROWTH),
    );
  });

  it("the sweep growth factors still multiply", () => {
    withFactors({ "growth.machine": 2 }, () => {
      expect(tierCost(tierById("cart"), 3)).toBe(
        curve("cart", 3, LINE_MACHINE_COST_GROWTH * 2),
      );
    });
    withFactors({ "growth.worker": 2 }, () => {
      expect(tierCost(tierById("helper"), 3)).toBe(
        curve("helper", 3, HELPER_COST_GROWTH * 2),
      );
    });
  });

  it("an old crew still prices every machine", () => {
    const old = at({
      owned: { ...NONE_OWNED, helper: 32, cart: 13, drill: 11, borer: 0 },
    });
    const m = reloaded(old);
    if (m === undefined) {
      throw new Error("the old crew did not load");
    }
    for (const id of ["cart", "drill", "borer"] as const) {
      const t = tierById(id);
      const cost = tierCost(t, m.owned[t.id]);
      expect(Number.isFinite(cost)).toBe(true);
      expect(cost).toBeGreaterThan(0);
    }
  });
});

describe("tierQuote: what ×1, ×10 and Max cost (#358)", () => {
  const cart = tierById("cart");
  /** Ten carts after the six owned, unit by unit, as buyTier charges them. */
  const tenFrom6 = Array.from({ length: 10 }, (_, i) =>
    tierCost(cart, 6 + i),
  ).reduce((sum, price) => sum + price, 0);

  it("×1 is one at today's price", () => {
    const m = at({
      stock: { ...EMPTY_STOCK, stones: 0 },
      owned: { ...NONE_OWNED, cart: 6 },
    });
    expect(tierQuote(m, cart, "one")).toEqual({
      count: 1,
      cost: tierCost(cart, 6),
    });
  });

  it("×10 is exactly ten, the sum buyTier would charge, affordable or not", () => {
    const m = at({
      stock: { ...EMPTY_STOCK, stones: 0 },
      owned: { ...NONE_OWNED, cart: 6 },
    });
    expect(tierQuote(m, cart, "ten")).toEqual({ count: 10, cost: tenFrom6 });
    let bought = { ...m, stock: { ...m.stock, stones: tenFrom6 } };
    for (let i = 0; i < 10; i += 1) {
      bought = buyTier(bought, "cart");
    }
    expect(bought).toMatchObject({
      stock: { stones: 0 },
      owned: { cart: 16 },
    });
  });

  it("Max is as many as the pocket holds", () => {
    const m = at({
      owned: { ...NONE_OWNED, cart: 6 },
      stock: { ...EMPTY_STOCK, stones: tenFrom6 + tierCost(cart, 16) - 1 },
    });
    expect(tierQuote(m, cart, "max")).toEqual({ count: 10, cost: tenFrom6 });
  });

  it("Max with nothing affordable quotes one, at its price", () => {
    const m = at({
      stock: { ...EMPTY_STOCK, stones: 5 },
      owned: { ...NONE_OWNED, cart: 6 },
    });
    expect(tierQuote(m, cart, "max")).toEqual({
      count: 1,
      cost: tierCost(cart, 6),
    });
  });

  it("Max on the workers' gentle curve counts every hand the pocket holds", () => {
    const worker = tierById("helper");
    const m = at({
      stock: { ...EMPTY_STOCK, stones: 1e12 },
      owned: { ...NONE_OWNED, helper: 40 },
    });
    const { count, cost } = tierQuote(m, worker, "max");
    expect(cost).toBeLessThanOrEqual(1e12);
    expect(cost + tierCost(worker, 40 + count)).toBeGreaterThan(1e12);
  });
});

describe("the line's machines (#533)", () => {
  const hoist = tierById("hoist");
  const train = tierById("train");

  it("are the spec's hoist (the lift) and pit train (the haul)", () => {
    expect(hoist).toMatchObject({
      name: "Hoist",
      stage: "lift",
      firstCost: 6_000,
      staff: 1,
    });
    expect(train).toMatchObject({
      name: "Pit train",
      stage: "haul",
      firstCost: 30_000_000,
      staff: 8,
    });
    expect(isShownTier("hoist")).toBe(false);
    expect(isShownTier("train")).toBe(false);
    expect(isShownTier("cart")).toBe(true);
  });
});

describe("the line's prices (#543)", () => {
  it("climbs ×1.219 a machine, prices the first worker at 60 and the Great Machine at 96.48M", () => {
    const cart = tierById("cart");
    expect(tierCost(cart, 0)).toBe(600);
    expect(tierCost(cart, 1)).toBe(Math.ceil(600 * LINE_MACHINE_COST_GROWTH));
    const helper = tierById("helper");
    expect(tierCost(helper, 0)).toBe(60);
    expect(tierCost(helper, 1)).toBe(Math.ceil(60 * HELPER_COST_GROWTH));
    expect(tierCost(tierById("machine"), 0)).toBe(96_480_000);
  });
});

/**
 * The deliberate pins on the prices play charges (#381, kept in #738 when
 * `tuning.test.ts` went with today's game). A price-only retune breaks these
 * and nothing else: every other test computes its prices from `tierCost`.
 * They match docs/DESIGN.md "Numbers now"; change both together.
 */
describe("the prices play charges (#738)", () => {
  it("prices the first of each machine and worker as the page does", () => {
    withFactors(PLAY_FACTORS, () => {
      expect(TIERS.map((tier) => [tier.id, tierCost(tier, 0)])).toEqual([
        ["helper", 60],
        ["cart", 600],
        ["hoist", 6_000],
        ["drill", 73_080],
        ["borer", 4_940_000],
        ["train", 30_000_000],
        ["machine", 96_480_000],
        ["kid", 250_000],
      ]);
    });
  });

  it("climbs machines x1.219 a unit and workers x1.06", () => {
    expect(LINE_MACHINE_COST_GROWTH).toBe(1.219);
    expect(HELPER_COST_GROWTH).toBe(1.06);
    withFactors(PLAY_FACTORS, () => {
      // Anchors on the rounded curves.
      expect(tierCost(tierById("cart"), 12)).toBe(6_460);
      expect(tierCost(tierById("helper"), 50)).toBe(1_106);
    });
  });

  it("prices each crew upgrade as the page does", () => {
    withFactors(PLAY_FACTORS, () => {
      const fresh = createMountain();
      expect(
        UPGRADES.map(({ id, costGrowth }) => [
          id,
          upgradePrice(fresh, id),
          costGrowth,
        ]),
      ).toEqual([
        ["boots", [{ good: "stones", amount: 1_625_000 }], 1],
        ["cartSyn", [{ good: "stones", amount: 2_000_000 }], 1],
        ["drillSyn", [{ good: "stones", amount: 3_000_000 }], 1],
        ["borerSyn", [{ good: "stones", amount: 15_000_000 }], 1],
        ["machineSyn", [{ good: "stones", amount: 30_000_000 }], 1],
      ]);
    });
  });

  it("prices part 3's borer and locomotive in cut stone", () => {
    withFactors({ ...PLAY_FACTORS, [PART_THREE_OFF]: 0 }, () => {
      expect(
        [tierById("borer"), tierById("train")].map((tier) => [
          tierGood(tier.id),
          tierCost(tier, 0),
        ]),
      ).toEqual([
        ["cutStone", 40_000],
        ["cutStone", 60_000],
      ]);
    });
  });
});

describe("counts by id (#559)", () => {
  it("every machine row names its stage, and only the machines do", () => {
    const stages = Object.fromEntries(
      TIERS.flatMap((tier) =>
        tier.stage === undefined ? [] : [[tier.id, tier.stage]],
      ),
    );
    expect(stages).toEqual({
      cart: "haul",
      hoist: "lift",
      drill: "face",
      borer: "face",
      train: "haul",
      machine: "lift",
    });
    expect(Object.keys(stages)).toEqual([...MACHINE_IDS]);
  });

  it("the records are built from the table, one entry per id", () => {
    expect(Object.keys(tierRecord(0))).toEqual(TIER_IDS);
    expect(Object.keys(machineRecord(0))).toEqual([...MACHINE_IDS]);
    expect(Object.values(machineRecord("x"))).toEqual(
      MACHINE_IDS.map(() => "x"),
    );
    expect(Object.keys(BARE_MOUNTAIN.owned)).toEqual(TIER_IDS);
  });

  it("a buy moves its own count and leaves every other one", () => {
    const start: Mountain = {
      ...BARE_MOUNTAIN,
      stock: { ...BARE_MOUNTAIN.stock, stones: 1e12 },
      owned: { ...NONE_OWNED, helper: 9, cart: 2, hoist: 1, kid: 3 },
    };
    const bought = buyTier(start, "cart");
    expect(bought.owned).toEqual({ ...start.owned, cart: 3 });
    expect(setOwned(start, "train", 4).owned).toEqual({
      ...start.owned,
      train: 4,
    });
    // The original is untouched.
    expect(start.owned.cart).toBe(2);
  });

  it("a save keeps every count by id, the line's machines included", () => {
    const counted: Mountain = {
      ...minedMountain(50_000_000),
      owned: Object.fromEntries(
        TIER_IDS.map((id, at) => [id, at + 1]),
      ) as Mountain["owned"],
    };
    expect(reloaded(counted)?.owned).toEqual(counted.owned);
  });
});

describe("part 3's machines (#673)", () => {
  const partTwo = <T>(body: () => T): T =>
    withFactors({ [PART_TWO_OFF]: 0 }, body);
  const partThree = <T>(body: () => T): T =>
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);
  const borer = tierById("borer");
  const train = tierById("train");
  const sunk = (
    stock: Partial<Mountain["stock"]>,
    machines: Partial<typeof NO_LEVEL_MACHINES> = {},
  ): Mountain => {
    const start = createMountain();
    return {
      ...start,
      stock: { ...start.stock, ...stock },
      granite: {
        kind: "sunk",
        machines: { ...NO_LEVEL_MACHINES, ...machines },
        piles: NO_GRANITE_PILES,
      },
    };
  };

  it("leaves the borer and the locomotive out of play until part 3, and locks them until the shaft is sunk", () => {
    partTwo(() => {
      expect(tierInPlay(borer)).toBe(false);
      expect(tierInPlay(train)).toBe(false);
    });
    partThree(() => {
      expect(tierInPlay(borer)).toBe(true);
      expect(tierInPlay(train)).toBe(true);
      expect(tierLock(createMountain(), borer)).toEqual({
        kind: "later",
        at: "granite",
      });
      expect(tierLock(createMountain(), train)).toEqual({
        kind: "later",
        at: "granite",
      });
      expect(tierLock(sunk({}), borer)).toBeUndefined();
      expect(tierLock(sunk({}), train)).toBeUndefined();
      // The winding engine and the kids stay out.
      expect(tierInPlay(tierById("machine"))).toBe(false);
      expect(tierInPlay(tierById("kid"))).toBe(false);
    });
  });

  it("prices them in cut stone: 40,000 and 60,000, x1.219", () => {
    partThree(() => {
      const mine = sunk({ cutStone: 40_000, stones: 7 });
      const bought = buyCrew(mine, "borer");
      expect(bought.owned.borer).toBe(1);
      expect(bought.stock.cutStone).toBe(0);
      expect(bought.stock.stones).toBe(7);
      expect(tierCost(borer, 0)).toBe(40_000);
      expect(tierCost(borer, 1)).toBe(48_760);
      expect(tierCost(train, 0)).toBe(60_000);
      const rich = sunk({ cutStone: 100_000 });
      expect(tierQuote(rich, train, "max")).toEqual({ count: 1, cost: 60_000 });
      // Stones do not pay for it.
      const stony = sunk({ stones: 1e12 });
      expect(buyCrew(stony, "borer")).toBe(stony);
    });
  });

  it("rates the borer 1,071 and the locomotive 1,600, each with eight workers", () => {
    partThree(() => {
      const { tierSpeed } = effectiveRates(createMountain());
      expect(tierSpeed.borer).toBeCloseTo(1_071, 6);
      expect(tierSpeed.train).toBeCloseTo(1_600, 6);
      expect(borer.staff).toBe(8);
      expect(train.staff).toBe(8);
    });
  });

  it("counts that kind on both levels for its price and marks", () => {
    partThree(() => {
      const base = sunk({ cutStone: 1e9 }, { borer: 2 });
      const mine = { ...base, owned: { ...base.owned, borer: 3 } };
      expect(tierQuote(mine, borer, "one").cost).toBe(tierCost(borer, 3));
      expect(buyCrew(mine, "borer").owned.borer).toBe(4);
    });
  });

  it("keeps today's price and door with part 3 off", () => {
    partTwo(() => {
      expect(tierCost(borer, 0)).toBe(Math.ceil(borer.firstCost));
      expect(tierCost(train, 0)).toBe(Math.ceil(30_000_000));
      expect(tierGood("borer")).toBe("stones");
      expect(tierGood("train")).toBe("stones");
      expect(tierInPlay(borer)).toBe(false);
      expect(tierLock(createMountain(), borer)).toEqual({
        kind: "later",
        at: "granite",
      });
      // A sunk Granite in a save changes neither the door nor the price.
      expect(tierLock(sunk({}), borer)).toEqual({
        kind: "later",
        at: "granite",
      });
    });
    partThree(() => {
      expect(tierGood("cart")).toBe("stones");
      expect(tierGood("borer")).toBe("cutStone");
    });
  });
});
