import { describe, expect, it } from "vitest";
import { accrue, stonesPerSecond } from "./mountain";
import { TIERS, buyTier, tierById, tierCost, tierShown } from "./tiers";

const at = (
  fields: Partial<{ pocket: number; helpers: number; carts: number }>,
) => ({
  remaining: 1_000,
  pocket: 0,
  helpers: 0,
  carts: 0,
  ...fields,
});

describe("tiers", () => {
  it("lists helpers then carts, each faster and dearer", () => {
    expect(TIERS.map((tier) => tier.id)).toEqual(["helper", "cart"]);
    expect(tierById("cart")).toMatchObject({ firstCost: 150, perSecond: 8 });
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
});
