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
  it("lists helpers, carts, drills, borers, then the Great Machine, each faster and dearer", () => {
    expect(TIERS.map((tier) => tier.id)).toEqual([
      "helper",
      "cart",
      "drill",
      "borer",
      "machine",
    ]);
    expect(tierById("machine")).toMatchObject({
      firstCost: 600_000,
      perSecond: 3_500,
      needs: "hammer",
    });
    expect(tierById("borer")).toMatchObject({
      firstCost: 40_000,
      perSecond: 450,
    });
    expect(tierById("cart")).toMatchObject({ firstCost: 150, perSecond: 8 });
    expect(tierById("drill")).toMatchObject({
      firstCost: 2_500,
      perSecond: 60,
    });
    for (const [cheaper, dearer] of TIERS.slice(0, -1).map(
      (tier, index) => [tier, TIERS[index + 1]] as const,
    )) {
      expect(dearer?.firstCost).toBeGreaterThan(cheaper.firstCost * 10);
      expect(dearer?.perSecond).toBeGreaterThan(cheaper.perSecond * 5);
    }
  });

  it("prices drills 2,500, then 15% more each", () => {
    expect([0, 1, 2].map((n) => tierCost(tierById("drill"), n))).toEqual([
      2_500, 2_875, 3_307,
    ]);
    expect(buyTier(at({ pocket: 2_499 }), "drill").drills).toBe(0);
    expect(buyTier(at({ pocket: 2_600 }), "drill")).toEqual(
      at({ pocket: 100, drills: 1 }),
    );
  });

  it("shows drills once a cart is owned, and counts them in speed and accrue", () => {
    const drill = tierById("drill");
    expect(tierShown(at({ helpers: 5 }), drill)).toBe(false);
    expect(tierShown(at({ carts: 1 }), drill)).toBe(true);
    const crew = at({ helpers: 1, carts: 1, drills: 2 });
    expect(stonesPerSecond(crew)).toBe(129);
    expect(accrue({ mountain: crew, from: 0, to: 3_000 }).mined).toBe(387);
  });

  it("costs grow 15% each, rounded up", () => {
    const helper = tierById("helper");
    const cart = tierById("cart");
    expect([0, 1, 2, 3, 10].map((n) => tierCost(helper, n))).toEqual([
      10, 12, 14, 16, 41,
    ]);
    expect([0, 1, 2].map((n) => tierCost(cart, n))).toEqual([150, 173, 199]);
  });

  it("buys only when the pocket covers the cost, and pays for it", () => {
    const poor = at({ pocket: 149 });
    expect(buyTier(poor, "cart")).toBe(poor);
    const one = buyTier(at({ pocket: 330 }), "cart");
    expect(one).toEqual(at({ pocket: 180, carts: 1 }));
    expect(buyTier(one, "cart")).toEqual(at({ pocket: 7, carts: 2 }));
    expect(buyTier(at({ pocket: 25 }), "helper")).toEqual(
      at({ pocket: 15, helpers: 1 }),
    );
  });

  it("adds every tier into the speed, and accrue pays carts too", () => {
    const crew = at({ helpers: 3, carts: 2 });
    expect(stonesPerSecond(crew)).toBe(19);
    expect(accrue({ mountain: crew, from: 0, to: 10_000 }).mined).toBe(190);
  });

  it("shows carts once a helper is owned", () => {
    const cart = tierById("cart");
    expect(tierShown(at({}), tierById("helper"))).toBe(true);
    expect(tierShown(at({ pocket: 10_000 }), cart)).toBe(false);
    expect(tierShown(at({ helpers: 1 }), cart)).toBe(true);
    expect(tierShown(at({ carts: 1 }), cart)).toBe(true);
  });

  it("prices borers 40,000 then 15% more, shows them once a drill is owned", () => {
    const borer = tierById("borer");
    expect([0, 1, 2].map((n) => tierCost(borer, n))).toEqual([
      40_000, 46_000, 52_900,
    ]);
    expect(tierShown(at({ carts: 9 }), borer)).toBe(false);
    expect(tierShown(at({ drills: 1 }), borer)).toBe(true);
    expect(buyTier(at({ pocket: 40_000 }), "borer")).toEqual(
      at({ pocket: 0, borers: 1 }),
    );
    expect(stonesPerSecond(at({ drills: 1, borers: 2 }))).toBe(960);
  });
});
