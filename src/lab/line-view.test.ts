import { describe, expect, it } from "vitest";
import { withFactors } from "../economy/factors";
import type { Mountain } from "../mountain";
import { crewedStart } from "../test-fixtures";
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
});

describe("the narrow stage in a fresh mine (#655)", () => {
  it("reads the placed workers' stages, not the spread hands'", () => {
    withFactors({}, () => {
      const start = crewedStart();
      const short = { ...start, jobs: { ...start.jobs, hoisting: 2 } };
      expect(narrowAt(short, 0)).toBe("lift");
    });
  });

  it("names the first narrow stage in rock order, and counts a machine that adds nothing", () => {
    const start = crewedStart();
    // Six on each stage, with tools: every stage moves the same, and the
    // face comes first in rock order.
    expect(narrowAt(start, 0)).toBe("face");
    const buy = (counts: Partial<Mountain["owned"]>): Mountain => ({
      ...start,
      owned: { ...start.owned, ...counts },
    });
    // One machine alone lifts one stage, and the line stays where it was.
    expect(zeroGainBuysBetween(start, buy({ cart: 1 }), 0)).toBe(1);
    expect(zeroGainBuysBetween(start, buy({ drill: 1 }), 0)).toBe(1);
    // One on every stage lifts the line, and each is needed for it.
    expect(
      zeroGainBuysBetween(start, buy({ drill: 1, cart: 1, hoist: 1 }), 0),
    ).toBe(0);
    expect(zeroGainBuysBetween(start, start, 0)).toBe(0);
  });

  it("handles Granite-only machine buys without producing negative Topsoil counts", () => {
    const start = crewedStart();
    const withGranite: Mountain = {
      ...start,
      mineLevels: {
        granite: {
          machines: { cart: 0, drill: 0, borer: 0, train: 0 },
          piles: { face: 0, shaft: 0, saw: 0 },
        },
      },
    };
    const afterBuy: Mountain = {
      ...withGranite,
      owned: { ...withGranite.owned, drill: 1, borer: 1 },
      mineLevels: {
        granite: {
          machines: { cart: 0, drill: 1, borer: 1, train: 0 },
          piles: { face: 0, shaft: 0, saw: 0 },
        },
      },
    };
    expect(() => zeroGainBuysBetween(withGranite, afterBuy, 0)).not.toThrow();
  });
});
