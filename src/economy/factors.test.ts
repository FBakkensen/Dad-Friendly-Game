import { describe, expect, it } from "vitest";
import { activeFactors, factor, withFactors } from "./factors";
import { tendingTenths } from "../engineers";
import { effectiveRates } from "../rates";
import { tierById, tierCost } from "../tiers";

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
    expect(tierCost(tierById("helper"), 1)).toBe(22);
    expect(tierCost(tierById("cart"), 2)).toBe(192);
    withFactors({ "price.helper": 1, "growth.worker": 1 }, () => {
      expect(tierCost(tierById("helper"), 1)).toBe(22);
    });
    expect(tierCost(tierById("helper"), 1)).toBe(22);
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
    expect(tierCost(tierById("borer"), 0)).toBe(4_940_000);
    withFactors({ "price.borer": 2 }, () => {
      expect(tierCost(tierById("borer"), 0)).toBe(9_880_000);
      withFactors({ "price.borer": 3 }, () => {
        expect(tierCost(tierById("borer"), 0)).toBe(14_820_000);
      });
      expect(tierCost(tierById("borer"), 0)).toBe(9_880_000);
    });
    expect(tierCost(tierById("borer"), 0)).toBe(4_940_000);
    expect(factor("price.borer")).toBe(1);
  });

  it("scales growth, output, and tending, and restores them after a throw", () => {
    expect(tierCost(tierById("cart"), 1)).toBe(170);
    withFactors({ "growth.machine": 2 }, () => {
      expect(tierCost(tierById("cart"), 1)).toBe(339);
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
        expect(tierCost(tierById("cart"), 0)).toBe(600);
        throw new Error("stop");
      }),
    ).toThrow("stop");
    expect(tierCost(tierById("cart"), 0)).toBe(150);
  });
});
