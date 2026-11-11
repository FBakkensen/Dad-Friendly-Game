import { describe, expect, it } from "vitest";
import { tierLocked } from "./crew";
import { minedMountain } from "./test-fixtures";
import {
  accrue,
  accrueAway,
  stonesPerSecond,
  type Mountain,
  BARE_MOUNTAIN,
} from "./mountain";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import { MOUNTAIN_STONES, stonesLeft } from "./scale";
import { parseSaveValue, serializeSave } from "./persist";
import { withFactors } from "./economy/factors";
import {
  HELPER_COST_GROWTH,
  MACHINE_COST_GROWTH,
  MACHINE_IDS,
  TIERS,
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
  pocket: 0,
  helpers: 0,
  carts: 0,
  drills: 0,
  borers: 0,
  machines: 0,
  kids: 0,
  ...fields,
});

describe("tiers", () => {
  it("lists the machines: every staffed tier, in tier order (#388)", () => {
    // A new staffed tier (#359) lands here and fails this pin, so the lab
    // measures that read MACHINE_IDS are checked on purpose, not skipped.
    expect(MACHINE_IDS).toEqual(["cart", "drill", "borer", "machine"]);
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
      ["drill", 36],
      ["borer", 357],
      ["machine", 2_100],
      ["kid", 25],
    ]);
    expect(tierById("machine").needs).toBe("hammer");
    expect(tierById("kid").needs).toBe("crown");
    // #356: the borer opens at the Granite start, the band that suits it.
    expect(tierById("borer").opensAt).toBe(10_000_000);
    // M12 retune (#252): the Great Machine opens at the Deep Heart.
    expect(tierById("machine").opensAt).toBe(120_000_000);
    // Machines climb; kids are a late helper tier, not a machine.
    const machines = TIERS.filter((tier) => tier.id !== "kid");
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
    const poor = at({ pocket: first - 1 });
    expect(buyTier(poor, "cart")).toBe(poor);
    const one = buyTier(at({ pocket: first + second + 110 }), "cart");
    expect(one).toEqual(at({ pocket: second + 110, carts: 1 }));
    expect(buyTier(one, "cart")).toEqual(at({ pocket: 110, carts: 2 }));
    const worker = tierCost(tierById("helper"), 0);
    expect(buyTier(at({ pocket: worker + 5 }), "helper")).toEqual(
      at({ pocket: 5, helpers: 1 }),
    );
  });

  it("adds every tier into the speed, and accrue pays them all", () => {
    const crew = at({
      helpers: 21, // 2 carts + 1 + 8 + 10
      carts: 2,
      drills: 1,
      borers: 1,
      machines: 1,
      kids: 0,
    });
    expect(stonesPerSecond(crew)).toBe(21 + 12 + 36 + 357 + 2_100);
    expect(
      accrue({
        mountain: { ...crew, remaining: 240_000_000 },
        from: 0,
        to: 1_000,
      }).mined,
    ).toBe(2_526);
  });

  it("shows each tier once the one before it is owned", () => {
    expect(tierShown(at({}), tierById("helper"))).toBe(true);
    expect(tierShown(at({ pocket: 10_000 }), tierById("cart"))).toBe(false);
    expect(tierShown(at({ helpers: 1 }), tierById("cart"))).toBe(true);
    expect(tierShown(at({ helpers: 5 }), tierById("drill"))).toBe(false);
    expect(tierShown(at({ carts: 1 }), tierById("drill"))).toBe(true);
    expect(tierShown(at({ drills: 1 }), tierById("borer"))).toBe(true);
    expect(tierShown(at({ borers: 1 }), tierById("machine"))).toBe(true);
    expect(tierShown(at({ machines: 1 }), tierById("machine"))).toBe(true);
  });
});

describe("crew staffing", () => {
  it("needs workers to run each machine: cart 1, drill 1, borer 8, Great Machine 10", () => {
    expect(TIERS.map(({ id, staff }) => [id, staff])).toEqual([
      ["helper", 0],
      ["cart", 1],
      ["drill", 1],
      ["borer", 8],
      ["machine", 10],
      ["kid", 0],
    ]);
  });

  it("leaves machines without helpers idle", () => {
    expect(stonesPerSecond(at({ carts: 5 }))).toBe(0);
    const rates = effectiveRates(at({ helpers: 3, carts: 5 }));
    expect(rates.running.cart).toBe(3);
    expect(rates.helpersShort).toBe(2);
    expect(rates.crewPerSecond).toBe(3 + 18);
  });

  it("staffs the fastest machines first", () => {
    // 11 workers: the borer takes 8, the drill 1, two carts run.
    const rates = effectiveRates(
      at({ helpers: 11, carts: 3, drills: 1, borers: 1 }),
    );
    expect(rates.running).toEqual({
      helper: 11,
      kid: 0,
      machine: 0,
      borer: 1,
      drill: 1,
      cart: 2,
    });
    expect(rates.helpersShort).toBe(1);
    expect(rates.crewPerSecond).toBe(11 + 12 + 36 + 357);
  });

  it("idles a machine rather than half-run it, and away pay agrees", () => {
    // 9 workers can't run a Great Machine (10); they run the carts instead.
    const crew = {
      ...at({ helpers: 9, carts: 4, machines: 1 }),
      remaining: 1e6,
    };
    const rates = effectiveRates(crew);
    expect(rates.running.machine).toBe(0);
    expect(rates.running.cart).toBe(4);
    expect(rates.crewPerSecond).toBe(9 + 24);
    expect(accrueAway({ mountain: crew, lastSeen: 0, now: 10_000 }).mined).toBe(
      Math.floor(10 * 33 * AWAY_PAY_RATE),
    );
    const staffed = effectiveRates({ ...crew, helpers: 14 });
    expect(staffed.crewPerSecond).toBe(14 + 24 + 2_310);
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
      at({ helpers: 10, kids: 5, carts: 1, drills: 1, borers: 1 }),
    );
    expect(rates.tierSpeed.helper).toBeCloseTo(1.1);
    expect(rates.tierSpeed.kid).toBeCloseTo(27.5);
    expect(rates.running).toMatchObject({ borer: 1, drill: 1, cart: 1 });
    expect(rates.helpersShort).toBe(0);
    expect(rates.crewPerSecond).toBe(
      Math.floor(10 * 1.1 + 5 * 27.5 + 6 + 36 + 357),
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
      ...at({ helpers: 32, carts: 13, drills: 11, borers: 0 }),
      remaining: MOUNTAIN_STONES - 12_000_000,
    };
    const loaded = parseSaveValue(
      serializeSave({ mountain: old, lastSeen: 1 }),
    );
    if (loaded === undefined) {
      throw new Error("the old crew did not load");
    }
    const m = loaded.mountain;
    for (const id of ["cart", "drill", "borer"] as const) {
      const t = tierById(id);
      const cost = tierCost(t, m[t.field]);
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
    const m = at({ carts: 6, pocket: 0, stretch: 2 });
    expect(tierQuote(m, cart, "one")).toEqual({
      count: 1,
      cost: tierCost(cart, 6, 2),
    });
  });

  it("×10 is exactly ten, the sum buyTier would charge, affordable or not", () => {
    const m = at({ carts: 6, pocket: 0, stretch: 2 });
    expect(tierQuote(m, cart, "ten")).toEqual({ count: 10, cost: tenFrom6 });
    let bought = { ...m, pocket: tenFrom6 };
    for (let i = 0; i < 10; i += 1) {
      bought = buyTier(bought, "cart");
    }
    expect(bought).toMatchObject({ carts: 16, pocket: 0 });
  });

  it("Max is as many as the pocket holds", () => {
    const m = at({
      carts: 6,
      pocket: tenFrom6 + tierCost(cart, 16, 2) - 1,
      stretch: 2,
    });
    expect(tierQuote(m, cart, "max")).toEqual({ count: 10, cost: tenFrom6 });
  });

  it("Max with nothing affordable quotes one, at its price", () => {
    const m = at({ carts: 6, pocket: 5, stretch: 2 });
    expect(tierQuote(m, cart, "max")).toEqual({
      count: 1,
      cost: tierCost(cart, 6, 2),
    });
  });

  it("Max on the workers' gentle curve counts every hand the pocket holds", () => {
    const worker = tierById("helper");
    const m = at({ helpers: 40, pocket: 1e12 });
    const { count, cost } = tierQuote(m, worker, "max");
    expect(cost).toBeLessThanOrEqual(1e12);
    expect(cost + tierCost(worker, 40 + count)).toBeGreaterThan(1e12);
  });
});
