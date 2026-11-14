import { describe, expect, it } from "vitest";
import { minedMountain } from "../test-fixtures";
import {
  handsCarryOf,
  narrowAt,
  narrowRunOf,
  narrowShareOf,
  zeroGainBuysBetween,
  zeroGainBuysOf,
} from "./line-view";
import type { DecisionSample } from "./measure";
import type { SittingEvent } from "./sittings";

function opens(
  ...stages: (SittingEvent["narrow"] | { zero: number })[]
): SittingEvent[] {
  return stages.map((stage, at) => ({
    sitting: at,
    openedAtMs: at * 1000,
    buys: 0,
    taps: 0,
    open: { kind: "nothing" },
    ...(typeof stage === "object"
      ? { zeroGainBuys: stage.zero }
      : stage === undefined
        ? {}
        : { narrow: stage }),
  }));
}

describe("the line's readings in the lab (#534)", () => {
  it("narrowRun is the longest run of sittings opening on one stage", () => {
    expect(
      narrowRunOf(opens("haul", "haul", "lift", "lift", "lift", "face")),
    ).toBe(3);
    expect(narrowRunOf(opens("face"))).toBe(1);
    expect(narrowRunOf(opens(undefined, undefined))).toBeNaN();
  });

  it("narrowShare is the largest share one stage opens as the narrow one", () => {
    expect(narrowShareOf(opens("haul", "lift", "haul", "face"))).toBe(0.5);
    expect(narrowShareOf([])).toBeNaN();
  });

  it("zeroGainBuys adds the sittings' counts, NaN with the line off", () => {
    expect(zeroGainBuysOf(opens({ zero: 2 }, { zero: 0 }, { zero: 1 }))).toBe(
      3,
    );
    expect(zeroGainBuysOf(opens(undefined))).toBeNaN();
  });

  it("handsCarry is the median of the samples' shares, NaN with none", () => {
    const sample = (handsCarry?: number): DecisionSample =>
      ({
        ...(handsCarry === undefined
          ? {}
          : { line: { narrow: "face", handsCarry } }),
      }) as DecisionSample;
    expect(handsCarryOf([sample(0.1), sample(0.5), sample(0.3)])).toBe(0.3);
    expect(handsCarryOf([sample()])).toBeNaN();
  });

  it("reads nothing while the line is off", () => {
    const mountain = {
      ...minedMountain(1_000_000),
      owned: { ...minedMountain(1_000_000).owned, helper: 4, cart: 2 },
    };
    expect(narrowAt(mountain, 0)).toBeUndefined();
    expect(
      zeroGainBuysBetween(
        mountain,
        { ...mountain, owned: { ...mountain.owned, cart: 3 } },
        0,
      ),
    ).toBeUndefined();
  });

  it("names the narrow stage, and counts a machine that adds nothing", () => {
    const mountain = {
      ...minedMountain(1_000_000),
      owned: {
        ...minedMountain(1_000_000).owned,
        helper: 4,
        cart: 4,
        drill: 0,
      },
    };
    // Four carts and no drill or hoist: the face and the lift are narrow,
    // and the face comes first in rock order.
    expect(narrowAt(mountain, 0)).toBe("face");
    // A fifth cart: the haul is not narrow and no hand is free for it.
    expect(
      zeroGainBuysBetween(
        mountain,
        { ...mountain, owned: { ...mountain.owned, cart: 5 } },
        0,
      ),
    ).toBe(1);
    // A hoist with a free hand lifts the line.
    const free = { ...mountain, owned: { ...mountain.owned, helper: 6 } };
    expect(
      zeroGainBuysBetween(
        free,
        { ...free, owned: { ...free.owned, hoist: 1 } },
        0,
      ),
    ).toBe(0);
    expect(zeroGainBuysBetween(free, free, 0)).toBe(0);
    // A worker bought in the same second lifts the line, but not the cart.
    expect(
      zeroGainBuysBetween(
        mountain,
        { ...mountain, owned: { ...mountain.owned, helper: 5, cart: 5 } },
        0,
      ),
    ).toBe(1);
  });
});
