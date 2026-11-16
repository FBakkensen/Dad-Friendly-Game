import { describe, expect, it } from "vitest";
import type { Mountain } from "../mountain";
import type { TierId } from "../tiers";
import { activeFactors, factor, holdFactors, withFactors } from "./factors";
import { engineerTenths } from "../engineers";
import { effectiveRates } from "../rates";
import {
  HELPER_COST_GROWTH,
  LINE_MACHINE_COST_GROWTH,
  tierById,
  tierCost,
} from "../tiers";
import { BARE_MOUNTAIN } from "../mountain";

/** A tier's tending tenths from the engineers at home. */
function tenthsOf(mountain: Mountain, tierId: TierId): number {
  return engineerTenths(mountain, tierId);
}

const posted = {
  ...BARE_MOUNTAIN,
  remaining: 1_000,
  stock: { ...BARE_MOUNTAIN.stock, stones: 0 },
  owned: {
    ...BARE_MOUNTAIN.owned,
    helper: 8,
    cart: 0,
    drill: 0,
    borer: 1,
    machine: 0,
    kid: 0,
  },
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
  it("holds a map for the page until another replaces it", () => {
    holdFactors({ "price.borer": 2 });
    try {
      expect(factor("price.borer")).toBe(2);
      withFactors({ "price.borer": 3 }, () => {
        expect(factor("price.borer")).toBe(3);
      });
      expect(factor("price.borer")).toBe(2);
    } finally {
      holdFactors({});
    }
    expect(activeFactors()).toBeUndefined();
  });

  it("stays at 1 outside a sweep, and a sweep of 1 matches today's prices", () => {
    expect(factor("price.cart")).toBe(1);
    const helper = tierById("helper");
    // The line's sticker is the first price (#738).
    const sticker = tierCost(helper, 0);
    const second = Math.ceil(
      Number((sticker * HELPER_COST_GROWTH).toPrecision(12)),
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
    const cart = tierCost(tierById("cart"), 0);
    expect(tierCost(tierById("cart"), 1)).toBe(
      Math.ceil(Number((cart * LINE_MACHINE_COST_GROWTH).toPrecision(12))),
    );
    withFactors({ "growth.machine": 2 }, () => {
      expect(tierCost(tierById("cart"), 1)).toBe(
        Math.ceil(
          Number((cart * LINE_MACHINE_COST_GROWTH * 2).toPrecision(12)),
        ),
      );
    });
    // The borer at the line's rating, with Ada's tending (#738).
    const borer = effectiveRates(posted).tierSpeed.borer;
    expect(borer).toBeCloseTo(357 * 3 * 1.21875, 8);
    withFactors({ "output.borer": 2 }, () => {
      expect(effectiveRates(posted).tierSpeed.borer).toBeCloseTo(borer * 2, 8);
    });
    expect(tenthsOf(posted, "borer")).toBe(1.25);
    withFactors({ "tending.gain": 2 }, () => {
      expect(tenthsOf(posted, "borer")).toBe(2.5);
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
