import { describe, expect, it } from "vitest";
import { accrue, stonesPerSecond, type Mountain } from "./mountain";
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
      ["borer", 1_600_000, 350],
      ["machine", 80_000_000, 3_500],
    ]);
    expect(tierById("machine").needs).toBe("hammer");
    for (const [index, tier] of TIERS.entries()) {
      const next = TIERS[index + 1];
      if (next !== undefined) {
        expect(next.perSecond).toBeGreaterThanOrEqual(tier.perSecond * 5);
        expect(next.firstCost).toBeGreaterThanOrEqual(tier.firstCost * 5);
      }
    }
  });

  it("costs double each, rounded up", () => {
    expect([0, 1, 2, 3].map((n) => tierCost(tierById("helper"), n))).toEqual([
      20, 40, 80, 160,
    ]);
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
      helpers: 3,
      carts: 2,
      drills: 1,
      borers: 1,
      machines: 1,
    });
    expect(stonesPerSecond(crew)).toBe(3 + 20 + 60 + 350 + 3_500);
    expect(
      accrue({ mountain: { ...crew, remaining: 10_000 }, from: 0, to: 1_000 })
        .mined,
    ).toBe(3_933);
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
