import { describe, expect, it } from "vitest";
import { activeFactors, factor, withFactors } from "./factors";
import { tendingTenths } from "../engineers";
import { effectiveRates } from "../rates";
import {
  HELPER_COST_GROWTH,
  MACHINE_COST_GROWTH,
  tierById,
  tierCost,
} from "../tiers";

const posted = {
  remaining: 1_000,
  pocket: 0,
  helpers: 8,
  carts: 0,
  drills: 0,
  borers: 1,
  machines: 0,
  kids: 0,
  engineers: [
    {
      name: "Ada" as const,
      rank: 0 as const,
      trips: 0,
      post: "borer" as const,
    },
  ],
};

describe("economy factors", () => {
  it("stays at 1 outside a sweep, and a sweep of 1 matches today's prices", () => {
    expect(factor("price.cart")).toBe(1);
    const helper = tierById("helper");
    const second = Math.ceil(
      Number((helper.firstCost * HELPER_COST_GROWTH).toPrecision(12)),
    );
    expect(tierCost(helper, 1)).toBe(second);
    withFactors({ "price.helper": 1, "growth.worker": 1 }, () => {
      expect(tierCost(helper, 1)).toBe(second);
    });
    expect(tierCost(helper, 1)).toBe(second);
  });

  it("treats an empty sweep as no sweep, even inside another", () => {
    expect(activeFactors()).toBeUndefined();
    withFactors({}, () => {
      expect(activeFactors()).toBeUndefined();
    });
    withFactors({ "price.borer": 2 }, () => {
      withFactors({}, () => {
        expect(activeFactors()).toBeUndefined();
        expect(factor("price.borer")).toBe(1);
      });
      expect(factor("price.borer")).toBe(2);
    });
  });

  it("scales a sticker, then puts the old prices back", () => {
    const sticker = tierById("borer").firstCost;
    expect(tierCost(tierById("borer"), 0)).toBe(sticker);
    withFactors({ "price.borer": 2 }, () => {
      expect(tierCost(tierById("borer"), 0)).toBe(sticker * 2);
      withFactors({ "price.borer": 3 }, () => {
        expect(tierCost(tierById("borer"), 0)).toBe(sticker * 3);
      });
      expect(tierCost(tierById("borer"), 0)).toBe(sticker * 2);
    });
    expect(tierCost(tierById("borer"), 0)).toBe(sticker);
    expect(factor("price.borer")).toBe(1);
  });

  it("scales growth, output, and tending, and restores them after a throw", () => {
    // One cart up the curve, and twice the growth under the sweep.
    const cart = tierById("cart").firstCost;
    expect(tierCost(tierById("cart"), 1)).toBe(
      Math.ceil(Number((cart * MACHINE_COST_GROWTH).toPrecision(12))),
    );
    withFactors({ "growth.machine": 2 }, () => {
      expect(tierCost(tierById("cart"), 1)).toBe(
        Math.ceil(Number((cart * MACHINE_COST_GROWTH * 2).toPrecision(12))),
      );
    });
    expect(effectiveRates(posted).tierSpeed.borer).toBeCloseTo(
      357 * 0.8 * 1.21875,
      8,
    );
    withFactors({ "output.borer": 2 }, () => {
      expect(effectiveRates(posted).tierSpeed.borer).toBeCloseTo(
        714 * 0.8 * 1.21875,
        8,
      );
    });
    expect(tendingTenths(posted, "borer")).toBe(1.25);
    withFactors({ "tending.gain": 2 }, () => {
      expect(tendingTenths(posted, "borer")).toBe(2.5);
    });
    expect(() =>
      withFactors({ "price.cart": 4 }, () => {
        expect(tierCost(tierById("cart"), 0)).toBe(cart * 4);
        throw new Error("stop");
      }),
    ).toThrow("stop");
    expect(tierCost(tierById("cart"), 0)).toBe(cart);
  });
});
