import { describe, expect, it } from "vitest";
import { tierLocked } from "./crew";
import { minedMountain } from "./test-fixtures";
import { accrue, accrueAway, stonesPerSecond, type Mountain } from "./mountain";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import { TIERS, buyTier, tierById, tierCost, tierShown } from "./tiers";

const at = (
  fields: Partial<Omit<Mountain, "remaining" | "startedAt">>,
): Mountain => ({
  remaining: 1_000,
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
  it("lists every tier cheapest first, each a big jump in speed", () => {
    expect(
      TIERS.map(({ id, firstCost, perSecond }) => [id, firstCost, perSecond]),
    ).toEqual([
      ["helper", 20, 1],
      ["cart", 100, 10],
      ["drill", 20_000, 60],
      ["borer", 8_000_000, 350],
      ["machine", 80_000_000, 3_500],
      ["kid", 1_000_000, 1],
    ]);
    expect(tierById("machine").needs).toBe("hammer");
    expect(tierById("kid").needs).toBe("crown");
    // Machines climb; kids are a late helper tier, not a machine.
    const machines = TIERS.filter((tier) => tier.id !== "kid");
    for (const [index, tier] of machines.entries()) {
      const next = machines[index + 1];
      if (next !== undefined) {
        expect(next.perSecond).toBeGreaterThanOrEqual(tier.perSecond * 5);
        expect(next.firstCost).toBeGreaterThanOrEqual(tier.firstCost * 5);
      }
    }
  });

  it("machines cost double each; helpers grow gently (they staff machines)", () => {
    expect(
      [0, 1, 2, 3, 10, 50].map((n) => tierCost(tierById("helper"), n)),
    ).toEqual([20, 23, 27, 31, 81, 21_674]);
    expect([0, 1, 2].map((n) => tierCost(tierById("cart"), n))).toEqual([
      100, 200, 400,
    ]);
    expect([0, 1].map((n) => tierCost(tierById("machine"), n))).toEqual([
      80_000_000, 160_000_000,
    ]);
  });

  it("buys only when the pocket covers the cost, and pays for it", () => {
    const poor = at({ pocket: 99 });
    expect(buyTier(poor, "cart")).toBe(poor);
    const one = buyTier(at({ pocket: 350 }), "cart");
    expect(one).toEqual(at({ pocket: 250, carts: 1 }));
    expect(buyTier(one, "cart")).toEqual(at({ pocket: 50, carts: 2 }));
    expect(buyTier(at({ pocket: 25 }), "helper")).toEqual(
      at({ pocket: 5, helpers: 1 }),
    );
  });

  it("adds every tier into the speed, and accrue pays them all", () => {
    const crew = at({
      helpers: 18, // 2 carts + 2 + 4 + 10
      carts: 2,
      drills: 1,
      borers: 1,
      machines: 1,
      kids: 0,
    });
    expect(stonesPerSecond(crew)).toBe(18 + 20 + 60 + 350 + 3_500);
    expect(
      accrue({ mountain: { ...crew, remaining: 10_000 }, from: 0, to: 1_000 })
        .mined,
    ).toBe(3_948);
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
  it("needs helpers to run each machine: cart 1, drill 2, borer 4, Great Machine 10", () => {
    expect(TIERS.map(({ id, staff }) => [id, staff])).toEqual([
      ["helper", 0],
      ["cart", 1],
      ["drill", 2],
      ["borer", 4],
      ["machine", 10],
      ["kid", 0],
    ]);
  });

  it("leaves machines without helpers idle", () => {
    expect(stonesPerSecond(at({ carts: 5 }))).toBe(0);
    const rates = effectiveRates(at({ helpers: 3, carts: 5 }));
    expect(rates.running.cart).toBe(3);
    expect(rates.helpersShort).toBe(2);
    expect(rates.crewPerSecond).toBe(3 + 30);
  });

  it("staffs the fastest machines first", () => {
    // 6 helpers: the borer takes 4, the drill 2, the carts wait.
    const rates = effectiveRates(
      at({ helpers: 6, carts: 3, drills: 1, borers: 1 }),
    );
    expect(rates.running).toEqual({
      helper: 6,
      kid: 0,
      machine: 0,
      borer: 1,
      drill: 1,
      cart: 0,
    });
    expect(rates.helpersShort).toBe(3);
    expect(rates.crewPerSecond).toBe(6 + 60 + 350);
  });

  it("idles a machine rather than half-run it, and away pay agrees", () => {
    // 9 helpers can't run a Great Machine (10); they run the carts instead.
    const crew = {
      ...at({ helpers: 9, carts: 4, machines: 1 }),
      remaining: 1e6,
    };
    const rates = effectiveRates(crew);
    expect(rates.running.machine).toBe(0);
    expect(rates.running.cart).toBe(4);
    expect(rates.crewPerSecond).toBe(9 + 40);
    expect(accrueAway({ mountain: crew, lastSeen: 0, now: 10_000 }).mined).toBe(
      Math.floor(10 * 49 * AWAY_PAY_RATE),
    );
    const staffed = effectiveRates({ ...crew, helpers: 14 });
    expect(staffed.crewPerSecond).toBe(14 + 40 + 3_500);
    expect(staffed.helpersShort).toBe(0);
  });
});

describe("Crown of Wisdom: kid helpers", () => {
  it("are locked until the Crown, then for sale on the helpers' curve", () => {
    const kid = tierById("kid");
    expect(tierLocked(minedMountain(69_999_999), kid)).toBe(true);
    expect(tierLocked(minedMountain(70_000_000), kid)).toBe(false);
    expect(tierCost(kid, 0)).toBe(1_000_000);
    expect(tierCost(kid, 1)).toBe(1_150_000);
  });

  it("mine, staff machines, and make every helper and kid 2% faster each", () => {
    // 5 kids: ×1.1 for helpers and kids; kids staff the cart and the drill.
    const rates = effectiveRates(
      at({ helpers: 10, kids: 5, carts: 1, drills: 1, borers: 1 }),
    );
    expect(rates.tierSpeed.helper).toBeCloseTo(1.1);
    expect(rates.tierSpeed.kid).toBeCloseTo(1.1);
    expect(rates.running).toMatchObject({ borer: 1, drill: 1, cart: 1 });
    expect(rates.helpersShort).toBe(0);
    expect(rates.crewPerSecond).toBe(Math.floor(15 * 1.1 + 10 + 60 + 350));
  });
});
