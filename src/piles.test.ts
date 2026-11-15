import { describe, expect, it } from "vitest";
import {
  chainChange,
  chainFlows,
  flowChain,
  flowWhole,
  type Chain,
} from "./piles";

/** A pile holding `held` of `holds`. */
const pile = (held: number, holds: number) => ({ held, holds });

/** The mine's shape: drilling, haulage and hoisting, with drilled rock and rock at the shaft. */
function mine(
  rates: readonly number[],
  face = pile(0, 500),
  shaft = pile(0, 500),
): Chain {
  return { source: Infinity, rates, piles: [face, shaft] };
}

describe("a chain of stages and piles (#703)", () => {
  it("moves the slowest stage's rate once the piles settle", () => {
    const after = flowChain(mine([9, 3, 6]), 1_000);
    expect(after.moved[2]).toBeCloseTo(3_000, 6);
    expect(after.piles[0]).toBeCloseTo(500, 6);
    expect(after.piles[1]).toBeCloseTo(0, 6);
  });

  it("stops drilling at full drilled rock", () => {
    const chain = mine([3, 0, 0]);
    expect(chainChange(chain)).toBeCloseTo(500 / 3, 9);
    const after = flowChain(chain, 1_000);
    expect(after.moved[0]).toBeCloseTo(500, 6);
    expect(after.piles).toEqual([500, 0]);
  });

  it("a lone hauler empties the drilled rock into the shaft pile", () => {
    const after = flowChain(mine([0, 3, 0], pile(300, 500)), 200);
    expect(after.moved[1]).toBeCloseTo(300, 6);
    expect(after.piles).toEqual([0, 300]);
  });

  it("piles of room 0 run in step, as today's line", () => {
    expect(chainFlows(mine([9, 3, 6], pile(0, 0), pile(0, 0)))).toEqual([
      3, 3, 3,
    ]);
  });

  it("a pile over its room is full, and nothing is taken away", () => {
    const after = flowChain(mine([3, 0, 0], pile(800, 500)), 1_000);
    expect(after.moved[0]).toBe(0);
    expect(after.piles[0]).toBe(800);
  });

  it("a pile over its room holds the stage before until it is under", () => {
    const chain = mine([9, 3, 3], pile(800, 500));
    expect(chainFlows(chain)).toEqual([0, 3, 3]);
    expect(chainChange(chain)).toBeCloseTo(100, 9);
    const after = flowChain(chain, 200);
    expect(after.piles[0]).toBeCloseTo(500, 6);
    expect(after.moved[0]).toBeCloseTo(300, 6);
  });

  it("a finite source runs out", () => {
    const chain: Chain = { source: 100, rates: [10, 4], piles: [pile(0, 50)] };
    const after = flowChain(chain, 100);
    expect(after.moved[0]).toBeCloseTo(100, 6);
    expect(after.moved[1]).toBeCloseTo(100, 6);
    expect(after.source).toBe(0);
  });

  it("does nothing with no source and empty piles", () => {
    const chain: Chain = { source: 0, rates: [10, 4], piles: [pile(0, 50)] };
    expect(chainFlows(chain)).toEqual([0, 0]);
    expect(chainChange(chain)).toBe(Infinity);
    expect(flowWhole(chain, 100)).toEqual({
      moved: [0, 0],
      piles: [0],
      source: 0,
    });
  });

  it("moves whole goods: each stage's total floored, the piles from those", () => {
    const after = flowWhole(mine([2.5, 1.25, 1]), 3);
    expect(after.moved).toEqual([7, 3, 3]);
    expect(after.piles).toEqual([4, 0]);
    expect(after.source).toBe(Infinity);
  });

  const cases: readonly { readonly chain: Chain; readonly seconds: number }[] =
    [
      { chain: mine([9, 3, 6]), seconds: 1_000 },
      { chain: mine([3, 0, 0]), seconds: 1_000 },
      { chain: mine([0, 3, 0], pile(300, 500)), seconds: 200 },
      { chain: mine([9, 3, 6], pile(0, 0), pile(0, 0)), seconds: 77 },
      { chain: mine([3, 0, 0], pile(800, 500)), seconds: 1_000 },
      { chain: mine([9, 3, 0], pile(800, 500)), seconds: 333 },
      {
        chain: { source: 100, rates: [10, 4], piles: [pile(0, 50)] },
        seconds: 100,
      },
      { chain: mine([2, 7, 3], pile(120, 500), pile(7, 40)), seconds: 61.7 },
      { chain: mine([5.5, 5.5, 5.5], pile(13, 20), pile(20, 20)), seconds: 9 },
      {
        chain: { source: 1_234, rates: [9], piles: [] },
        seconds: 50,
      },
      {
        chain: { source: 37, rates: [9, 8], piles: [pile(499, 500)] },
        seconds: 28_800,
      },
    ];

  it("nothing is made or lost", () => {
    for (const { chain, seconds } of cases) {
      const before = chain.piles.reduce((sum, p) => sum + p.held, 0);
      const exact = flowChain(chain, seconds);
      const whole = flowWhole(chain, seconds);
      for (const after of [exact, whole]) {
        const last = after.moved[after.moved.length - 1] ?? 0;
        const held = after.piles.reduce((sum, p) => sum + p, 0);
        const used = after.moved[0] ?? 0;
        expect(used + before - (last + held)).toBeCloseTo(0, 6);
        if (Number.isFinite(chain.source)) {
          expect(chain.source - after.source).toBeCloseTo(used, 6);
        }
        for (const [index, p] of after.piles.entries()) {
          const holds = chain.piles[index]?.holds ?? 0;
          const top = Math.max(holds, chain.piles[index]?.held ?? 0);
          expect(p).toBeGreaterThanOrEqual(-1e-9);
          expect(p).toBeLessThanOrEqual(top + 1e-9);
        }
      }
      const wholeLast = whole.moved[whole.moved.length - 1] ?? 0;
      expect((whole.moved[0] ?? 0) + before).toBe(
        wholeLast + whole.piles.reduce((sum, p) => sum + p, 0),
      );
    }
  });
});
