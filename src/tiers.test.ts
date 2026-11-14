import { EMPTY_STOCK } from "./stock";
import { describe, expect, it } from "vitest";
import { tierLocked } from "./crew";
import { minedMountain, reloaded, NONE_OWNED } from "./test-fixtures";
import {
  accrue,
  accrueAway,
  stonesPerSecond,
  type Mountain,
  BARE_MOUNTAIN,
} from "./mountain";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import { MOUNTAIN_STONES, stonesLeft } from "./scale";
import { withFactors } from "./economy/factors";
import { listActions } from "./economy/actions";
import { buyCrew } from "./crew";
import {
  HELPER_COST_GROWTH,
  CART_SHOWN_AT,
  MACHINE_COST_GROWTH,
  MACHINE_IDS,
  TIER_IDS,
  machineRecord,
  setOwned,
  tierRecord,
  TIERS,
  isShownTier,
  buyTier,
  tierById,
  tierCost,
  tierQuote,
  tierShown,
  type TierId,
} from "./tiers";

const at = (
  fields: Partial<Omit<Mountain, "remaining" | "startedAt">>,
): Mountain => ({
  ...BARE_MOUNTAIN,
  remaining: 240_000_000,
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
    // First prices are pinned once, in src/tuning.test.ts (#381).
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
    expect(tierById("machine").needs).toBe("hammer");
    expect(tierById("kid").needs).toBe("crown");
    // #356: the borer opens at the Granite start, the band that suits it.
    expect(tierById("borer").opensAt).toBe(10_000_000);
    // M12 retune (#252): the Great Machine opens at the Deep Heart.
    expect(tierById("machine").opensAt).toBe(120_000_000);
    // Machines climb; kids are a late helper tier, not a machine. The
    // line's machines fill a stage each, not a rung (#533).
    const machines = TIERS.filter(
      (tier) => tier.id !== "kid" && tier.id !== "hoist" && tier.id !== "train",
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

  it("moves at its lowest stage with the hands' help, and accrue pays it (#536)", () => {
    const crew = at({
      // 21 workers: 2 carts + 1 + 8 + 10.
      owned: {
        ...NONE_OWNED,
        helper: 21,
        cart: 2,
        drill: 1,
        borer: 1,
        machine: 1,
        kid: 0,
      },
    });
    // The haul (two carts, 36) is the lowest stage; the 21 hands lift it by
    // three each, to 99, still under the face (1,179) and the lift (6,300).
    expect(stonesPerSecond(crew)).toBe(2 * 18 + 3 * 21);
    expect(
      accrue({
        mountain: { ...crew, remaining: 240_000_000 },
        from: 0,
        to: 1_000,
      }).mined,
    ).toBe(99);
  });

  it("shows each machine once the one before it on the line is owned", () => {
    expect(tierShown(at({}), tierById("helper"))).toBe(true);
    expect(
      tierShown(
        at({ stock: { ...EMPTY_STOCK, stones: 10_000 } }),
        tierById("cart"),
      ),
    ).toBe(false);
    expect(
      tierShown(at({ owned: { ...NONE_OWNED, helper: 5 } }), tierById("drill")),
    ).toBe(false);
    const chain = [
      ["cart", "hoist"],
      ["hoist", "drill"],
      ["drill", "borer"],
      ["borer", "train"],
      ["train", "machine"],
    ] as const;
    for (const [before, after] of chain) {
      expect(
        tierShown(
          at({ owned: { ...NONE_OWNED, [before]: 1 } }),
          tierById(after),
        ),
        after,
      ).toBe(true);
      expect(tierShown(at({}), tierById(after)), after).toBe(false);
    }
    expect(
      tierShown(
        at({ owned: { ...NONE_OWNED, machine: 1 } }),
        tierById("machine"),
      ),
    ).toBe(true);
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

  it("leaves machines without helpers idle", () => {
    expect(stonesPerSecond(at({ owned: { ...NONE_OWNED, cart: 5 } }))).toBe(0);
    const rates = effectiveRates(
      at({ owned: { ...NONE_OWNED, helper: 3, cart: 5 } }),
    );
    expect(rates.running.cart).toBe(3);
    expect(rates.helpersShort).toBe(2);
    // The face and the lift move nothing, so the three hands share them.
    expect(rates.crewPerSecond).toBe(Math.floor((3 * 3) / 2));
  });

  it("staffs the fastest machines first", () => {
    // 11 workers: the borer takes 8, the drill 1, two carts run.
    const rates = effectiveRates(
      at({ owned: { ...NONE_OWNED, helper: 11, cart: 3, drill: 1, borer: 1 } }),
    );
    expect(rates.running).toEqual({
      helper: 11,
      kid: 0,
      machine: 0,
      train: 0,
      borer: 1,
      drill: 1,
      hoist: 0,
      cart: 2,
    });
    expect(rates.helpersShort).toBe(1);
    // No hoist, so the hands carry the lift alone.
    expect(rates.crewPerSecond).toBe(3 * 11);
  });

  it("idles a machine rather than half-run it, and away pay agrees", () => {
    // 9 workers can't run a Great Machine (10); they run the carts instead.
    const crew = {
      ...at({ owned: { ...NONE_OWNED, helper: 9, cart: 4, machine: 1 } }),
      remaining: 1e6,
    };
    const rates = effectiveRates(crew);
    expect(rates.running.machine).toBe(0);
    expect(rates.running.cart).toBe(4);
    // The face and the lift move nothing: the hands share them.
    const speed = (3 * 9) / 2;
    expect(rates.crewPerSecond).toBe(Math.floor(speed));
    expect(accrueAway({ mountain: crew, lastSeen: 0, now: 10_000 }).mined).toBe(
      Math.floor(10 * Math.floor(speed) * AWAY_PAY_RATE),
    );
    const staffed = effectiveRates({
      ...crew,
      owned: { ...crew.owned, helper: 14 },
    });
    // The Great Machine runs the lift; the hands carry the face alone.
    expect(staffed.crewPerSecond).toBe(3 * 14);
    expect(staffed.helpersShort).toBe(0);
  });
});

describe("Crown of Wisdom: kid helpers", () => {
  it("are locked until the Crown, then for sale on the helpers' curve", () => {
    const kid = tierById("kid");
    expect(tierLocked(minedMountain(69_999_999), kid)).toBe(true);
    expect(tierLocked(minedMountain(70_000_000), kid)).toBe(false);
    // Kids share the workers' curve (the price is pinned in src/tuning.test.ts).
    expect(tierCost(kid, 0)).toBe(kid.firstCost);
    expect(tierCost(kid, 1)).toBe(
      Math.ceil(Number((kid.firstCost * HELPER_COST_GROWTH).toPrecision(12))),
    );
  });

  it("mine, staff machines, and make every helper and kid 2% faster each", () => {
    // 5 kids: ×1.1 for helpers and kids; kids staff the cart and the drill.
    const rates = effectiveRates(
      at({
        owned: {
          ...NONE_OWNED,
          helper: 10,
          kid: 5,
          cart: 1,
          drill: 1,
          borer: 1,
        },
      }),
    );
    expect(rates.tierSpeed.helper).toBeCloseTo(1.1);
    expect(rates.tierSpeed.kid).toBeCloseTo(27.5);
    expect(rates.running).toMatchObject({ borer: 1, drill: 1, cart: 1 });
    expect(rates.helpersShort).toBe(0);
    // The hands lift the empty lift to the haul's cart, then both together.
    expect(rates.crewPerSecond).toBe(
      Math.floor((3 * (10 * 1.1 + 5 * 27.5) + 18) / 2),
    );
  });
});

// #356 gentler curves: every tier climbs its growth from its first price.
describe("cost curves (#356)", () => {
  const ceil12 = (n: number) => Math.ceil(Number(n.toPrecision(12)));
  const curve = (id: TierId, n: number, growth: number) =>
    ceil12(tierById(id).firstCost * growth ** n);

  it("machines climb the machine curve", () => {
    for (const [id, n] of [
      ["cart", 13],
      ["drill", 11],
      ["borer", 3],
      ["machine", 2],
    ] as const) {
      expect(tierCost(tierById(id), 0)).toBe(tierById(id).firstCost);
      expect(tierCost(tierById(id), n)).toBe(curve(id, n, MACHINE_COST_GROWTH));
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
        curve("cart", 3, MACHINE_COST_GROWTH * 2),
      );
    });
    withFactors({ "growth.worker": 2 }, () => {
      expect(tierCost(tierById("helper"), 3)).toBe(
        curve("helper", 3, HELPER_COST_GROWTH * 2),
      );
    });
  });

  it("an old crew still prices every machine and the mountain is not smaller", () => {
    const old = {
      ...at({
        owned: { ...NONE_OWNED, helper: 32, cart: 13, drill: 11, borer: 0 },
      }),
      remaining: MOUNTAIN_STONES - 12_000_000,
    };
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
    expect(stonesLeft(m)).toBeGreaterThan(MOUNTAIN_STONES - 12_000_000);
  });
});

describe("tierQuote: what ×1, ×10 and Max cost (#358)", () => {
  const cart = tierById("cart");
  /** Ten carts after the six owned, unit by unit, as buyTier charges them. */
  const tenFrom6 = Array.from({ length: 10 }, (_, i) =>
    tierCost(cart, 6 + i, 2),
  ).reduce((sum, price) => sum + price, 0);

  it("×1 is one at today's price", () => {
    const m = at({
      stock: { ...EMPTY_STOCK, stones: 0 },
      stretch: 2,
      owned: { ...NONE_OWNED, cart: 6 },
    });
    expect(tierQuote(m, cart, "one")).toEqual({
      count: 1,
      cost: tierCost(cart, 6, 2),
    });
  });

  it("×10 is exactly ten, the sum buyTier would charge, affordable or not", () => {
    const m = at({
      stock: { ...EMPTY_STOCK, stones: 0 },
      stretch: 2,
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
      stock: { ...EMPTY_STOCK, stones: tenFrom6 + tierCost(cart, 16, 2) - 1 },
      stretch: 2,
    });
    expect(tierQuote(m, cart, "max")).toEqual({ count: 10, cost: tenFrom6 });
  });

  it("Max with nothing affordable quotes one, at its price", () => {
    const m = at({
      stock: { ...EMPTY_STOCK, stones: 5 },
      stretch: 2,
      owned: { ...NONE_OWNED, cart: 6 },
    });
    expect(tierQuote(m, cart, "max")).toEqual({
      count: 1,
      cost: tierCost(cart, 6, 2),
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

describe("the line's machines (#533, on in play since #536)", () => {
  const hoist = tierById("hoist");
  const train = tierById("train");

  it("are the spec's hoist (the lift) and pit train (the haul)", () => {
    expect(hoist).toMatchObject({
      name: "Hoist",
      stage: "lift",
      firstCost: 6_000,
      staff: 1,
    });
    expect(hoist.opensAt).toBeUndefined();
    expect(train).toMatchObject({
      name: "Pit train",
      stage: "haul",
      firstCost: 30_000_000,
      staff: 8,
      // The Crystal Caves.
      opensAt: 45_000_000,
    });
    expect(isShownTier("hoist")).toBe(false);
    expect(isShownTier("train")).toBe(false);
    expect(isShownTier("cart")).toBe(true);
  });

  it("are shown in price order, bought, and running in their stages", () => {
    const carts = at({
      stock: { ...EMPTY_STOCK, stones: 1e9 },
      owned: { ...NONE_OWNED, helper: 12, cart: 1 },
    });
    expect(tierShown(carts, hoist)).toBe(true);
    // The drill now follows the hoist (spec: "once he owns a hoist").
    expect(tierShown(carts, tierById("drill"))).toBe(false);
    const bought = buyCrew(carts, "hoist");
    expect(bought.owned.hoist).toBe(1);
    expect(tierShown(bought, tierById("drill"))).toBe(true);
    const offered = listActions(carts, 0).flatMap((action) =>
      action.kind === "buyTier" ? [action.id] : [],
    );
    expect(offered).toContain("hoist");
    // The train shows after a borer and waits for the Crystal Caves.
    const granite = {
      ...minedMountain(20_000_000),
      owned: { ...minedMountain(20_000_000).owned, borer: 1 },
    };
    expect(tierShown(granite, train)).toBe(true);
    expect(tierLocked(granite, train)).toBe(true);
    const caves = {
      ...minedMountain(45_000_000),
      owned: { ...minedMountain(45_000_000).owned, borer: 1 },
    };
    expect(tierLocked(caves, train)).toBe(false);
    // A hoist runs on a hand and lifts with the hands.
    const rates = effectiveRates({
      ...bought,
      owned: { ...bought.owned, helper: 13 },
    });
    expect(rates.running.hoist).toBe(1);
    expect(rates.running.cart).toBe(1);
  });
});

describe("the line's prices (#543, in play since #536)", () => {
  it("climbs ×1.219 a machine, prices the first worker at 60 and the Great Machine at 96.48M", () => {
    const cart = tierById("cart");
    expect(tierCost(cart, 0)).toBe(600);
    expect(tierCost(cart, 1)).toBe(Math.ceil(600 * MACHINE_COST_GROWTH));
    expect(tierCost(cart, 1)).toBe(732);
    const helper = tierById("helper");
    expect(tierCost(helper, 0)).toBe(60);
    expect(tierCost(helper, 1)).toBe(Math.ceil(60 * HELPER_COST_GROWTH));
    expect(tierCost(tierById("machine"), 0)).toBe(96_480_000);
  });
});

describe("the cart waits for eight workers (#536)", () => {
  it("is shown at eight workers owned, or with a cart, never before", () => {
    const cart = tierById("cart");
    const hands = (helper: number, carts = 0) =>
      at({ owned: { ...NONE_OWNED, helper, cart: carts } });
    expect(CART_SHOWN_AT).toBe(8);
    expect(tierShown(hands(0), cart)).toBe(false);
    expect(tierShown(hands(7), cart)).toBe(false);
    expect(tierShown(hands(8), cart)).toBe(true);
    // A cart he owns stays shown, whatever the hands.
    expect(tierShown(hands(0, 1), cart)).toBe(true);
  });

  it("reads +4 a second as the first buy at eight workers, and its full +6 at twelve", () => {
    const gain = (helper: number) => {
      const hands = at({ owned: { ...NONE_OWNED, helper } });
      const before = effectiveRates(hands).exactCrewPerSecond;
      const after = effectiveRates({
        ...hands,
        owned: { ...hands.owned, cart: 1 },
      }).exactCrewPerSecond;
      expect(before).toBeCloseTo(helper);
      return after - before;
    };
    expect(gain(8)).toBeCloseTo(4);
    expect(gain(12)).toBeCloseTo(6);
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
