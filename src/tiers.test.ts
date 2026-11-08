import { describe, expect, it } from "vitest";
import { tierLocked } from "./crew";
import { minedMountain } from "./test-fixtures";
import { accrue, accrueAway, stonesPerSecond, type Mountain } from "./mountain";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import { MOUNTAIN_STONES, stonesLeft } from "./scale";
import { parseSaveValue, serializeSave } from "./persist";
import { withFactors } from "./economy/factors";
import {
  MACHINE_IDS,
  TIERS,
  buyTier,
  tierById,
  tierCost,
  tierShown,
} from "./tiers";

const at = (
  fields: Partial<Omit<Mountain, "remaining" | "startedAt">>,
): Mountain => ({
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
    expect(
      TIERS.map(({ id, firstCost, perSecond }) => [id, firstCost, perSecond]),
    ).toEqual([
      ["helper", 20, 1],
      // #357 retune for the milestone marks.
      ["cart", 600, 6],
      ["drill", 73_080, 36],
      ["borer", 4_940_000, 357],
      ["machine", 120_600_000, 2_100],
      ["kid", 250_000, 25],
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

  // #357: machines climb x1.15 and helpers x1.06 after the milestone marks.
  it("machines climb x1.15 a unit, helpers x1.06", () => {
    expect(
      [0, 1, 2, 3, 10, 50].map((n) => tierCost(tierById("helper"), n)),
    ).toEqual([20, 22, 23, 24, 36, 369]);
    expect([0, 1, 2].map((n) => tierCost(tierById("cart"), n))).toEqual([
      600, 690, 794,
    ]);
    expect([0, 1].map((n) => tierCost(tierById("machine"), n))).toEqual([
      120_600_000, 138_690_000,
    ]);
    expect([0, 1, 2].map((n) => tierCost(tierById("drill"), n))).toEqual([
      73_080, 84_042, 96_649,
    ]);
    expect([0, 1, 2].map((n) => tierCost(tierById("borer"), n))).toEqual([
      4_940_000, 5_681_000, 6_533_150,
    ]);
  });

  it("buys only when the pocket covers the cost, and pays for it", () => {
    // #357: a cart is 600, then 690.
    const poor = at({ pocket: 599 });
    expect(buyTier(poor, "cart")).toBe(poor);
    const one = buyTier(at({ pocket: 1_400 }), "cart");
    expect(one).toEqual(at({ pocket: 800, carts: 1 }));
    expect(buyTier(one, "cart")).toEqual(at({ pocket: 110, carts: 2 }));
    expect(buyTier(at({ pocket: 25 }), "helper")).toEqual(
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
    // #327: cheap enough, and quick enough, that a kid pays back in hours.
    expect(tierCost(kid, 0)).toBe(250_000);
    // #357: kids share the workers' x1.06 curve.
    expect(tierCost(kid, 1)).toBe(265_000);
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

// #357 retuned the #356 curves for the milestone marks: x1.15 and x1.06.
describe("gentler cost curves (#356)", () => {
  const ceil12 = (n: number) => Math.ceil(Number(n.toPrecision(12)));

  it("machines climb x1.15 a unit", () => {
    expect(tierCost(tierById("cart"), 13)).toBe(ceil12(600 * 1.15 ** 13));
    expect(tierCost(tierById("cart"), 13)).toBe(3_692);
    expect(tierCost(tierById("drill"), 11)).toBe(ceil12(73_080 * 1.15 ** 11));
    expect(tierCost(tierById("borer"), 3)).toBe(ceil12(4_940_000 * 1.15 ** 3));
    expect(tierCost(tierById("machine"), 2)).toBe(
      ceil12(120_600_000 * 1.15 ** 2),
    );
  });

  it("workers and kids climb x1.06 a unit", () => {
    expect(tierCost(tierById("helper"), 32)).toBe(ceil12(20 * 1.06 ** 32));
    expect(tierCost(tierById("kid"), 5)).toBe(ceil12(250_000 * 1.06 ** 5));
  });

  it("the sweep growth factors still multiply", () => {
    withFactors({ "growth.machine": 2 }, () => {
      expect(tierCost(tierById("cart"), 3)).toBe(ceil12(600 * 2.3 ** 3));
    });
    withFactors({ "growth.worker": 2 }, () => {
      expect(tierCost(tierById("helper"), 3)).toBe(ceil12(20 * 2.12 ** 3));
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
