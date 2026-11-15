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
      spilled: 0,
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

/**
 * The spill (#666): the mine's hoisting fills the rock at the kilns, and what
 * that pile cannot hold bypasses to the stone stockpile, a side pile with a
 * room and a drain (what transport takes from it).
 */
describe("a pile that spills to a side pile (#666)", () => {
  /** Hoisting at `lift`, the kilns at `kilns`, into rock at the kilns and the brick stockpile. */
  function refinery(
    lift: number,
    kilns: number,
    kilnPile = pile(0, 300),
    side = { held: 0, holds: Infinity, drain: 0 },
    brick = pile(0, Infinity),
  ): Chain {
    return {
      source: Infinity,
      rates: [lift, kilns, 0],
      piles: [kilnPile, brick],
      spill: { from: 0, ...side },
    };
  }

  it("fills the pile first, then spills what the next stage cannot take", () => {
    const chain = refinery(18, 12);
    expect(chainChange(chain)).toBeCloseTo(300 / 6, 9);
    const after = flowChain(chain, 150);
    expect(after.moved[0]).toBeCloseTo(18 * 150, 6);
    expect(after.moved[1]).toBeCloseTo(12 * 150, 6);
    expect(after.piles[0]).toBeCloseTo(300, 6);
    // 50 seconds to fill, then 100 seconds of 6 a second over the top.
    expect(after.spilled).toBeCloseTo(600, 6);
  });

  it("spills everything from a pile of no room", () => {
    const after = flowChain(refinery(18, 0, pile(0, 0)), 10);
    expect(after.moved[0]).toBeCloseTo(180, 6);
    expect(after.spilled).toBeCloseTo(180, 6);
  });

  it("a full side pile holds the stage at the next stage and the drain", () => {
    const chain = refinery(18, 12, pile(300, 300), {
      held: 1_000,
      holds: 1_000,
      drain: 4,
    });
    const flows = chainFlows(chain);
    expect(flows[0]).toBeCloseTo(16, 9);
    const after = flowChain(chain, 10);
    expect(after.spilled).toBeCloseTo(40, 6);
  });

  it("a side pile over its room takes nothing", () => {
    const chain = refinery(18, 12, pile(300, 300), {
      held: 1_200,
      holds: 1_000,
      drain: 0,
    });
    expect(chainFlows(chain)[0]).toBeCloseTo(12, 9);
    expect(flowChain(chain, 10).spilled).toBe(0);
  });

  it("splits where the side pile fills", () => {
    const chain = refinery(18, 12, pile(300, 300), {
      held: 900,
      holds: 1_000,
      drain: 2,
    });
    // 6 a second spills, 2 a second drains: full in 25 seconds.
    expect(chainChange(chain)).toBeCloseTo(25, 9);
    const after = flowChain(chain, 100);
    expect(after.spilled).toBeCloseTo(6 * 25 + 2 * 75, 6);
    expect(after.moved[0]).toBeCloseTo(18 * 25 + 14 * 75, 6);
  });

  it("a full pile over its room spills all it is brought", () => {
    const after = flowChain(refinery(18, 12, pile(400, 300)), 5);
    expect(after.spilled).toBeCloseTo(90, 6);
    expect(after.piles[0]).toBeCloseTo(340, 6);
  });

  it("in whole goods, nothing is made or lost, and the pile stays within its room", () => {
    const chains = [
      refinery(18, 12),
      refinery(18.7, 12.3, pile(299, 300)),
      refinery(5.5, 12, pile(300, 300)),
      refinery(18, 12, pile(300, 300), { held: 900, holds: 1_000, drain: 2 }),
      refinery(17.9, 0, pile(0, 0)),
    ];
    for (const chain of chains) {
      for (const seconds of [1, 7, 61.3, 3_600]) {
        const whole = flowWhole(chain, seconds);
        const [lift = 0, kilns = 0] = whole.moved;
        const pileBefore = chain.piles[0]?.held ?? 0;
        expect(lift + pileBefore).toBe(
          kilns + (whole.piles[0] ?? 0) + whole.spilled,
        );
        expect(whole.spilled).toBeGreaterThanOrEqual(0);
        expect(whole.piles[0]).toBeLessThanOrEqual(
          Math.max(chain.piles[0]?.holds ?? 0, pileBefore),
        );
        expect(Number.isInteger(whole.spilled)).toBe(true);
      }
    }
  });

  it("in whole goods, spills nothing while the pile has room", () => {
    const draining = flowWhole(refinery(0, 5.4, pile(100, 300)), 1);
    expect(draining.spilled).toBe(0);
    expect(draining.moved).toEqual([0, 5, 0]);
    expect(draining.piles[0]).toBe(95);
    for (let seconds = 1; seconds <= 30; seconds += 1) {
      const filling = flowWhole(refinery(8.1, 5.4, pile(100, 300)), seconds);
      expect(filling.spilled).toBe(0);
    }
  });

  it("a chain with no spill spills nothing", () => {
    expect(flowWhole(mine([9, 3, 6]), 10).spilled).toBe(0);
  });
});
