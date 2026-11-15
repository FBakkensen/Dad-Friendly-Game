import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  chainChange,
  chainFlows,
  chainSettled,
  chainSpill,
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

  it("settles past the changes within its first seconds, and says when the last came", () => {
    // A stone short of its room: full in a quarter of a second at 4 a second net.
    const chain = refinery(18, 12, pile(300, 300), {
      held: 999,
      holds: 1_000,
      drain: 2,
    });
    const settled = chainSettled(chain, 1);
    expect(settled.after).toBeCloseTo(0.25, 9);
    expect(chainSpill(settled.chain)).toBeCloseTo(2, 9);
    expect(chainChange(settled.chain)).toBe(Infinity);
    // A change past the first second is left for the stretch to end at.
    const later = chainSettled(refinery(18, 12), 1);
    expect(later.after).toBe(0);
    expect(chainChange(later.chain)).toBeCloseTo(50, 9);
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

/**
 * A recipe (#723): a stage that takes more than one of what is in front of it
 * for each it makes, the way a kiln takes two rock for one brick. Its rate is
 * what it makes; its pile in front goes down by its take times that.
 */
describe("a stage with a recipe (#723)", () => {
  /** Hoisting at `lift`, kilns making `kilns` brick a second at two rock each. */
  function kilnsAtTwo(
    lift: number,
    kilns: number,
    kilnPile = pile(0, 300),
    side = { held: 0, holds: Infinity, drain: 0 },
    brick = pile(0, Infinity),
    take = 0,
  ): Chain {
    return {
      source: Infinity,
      rates: [lift, kilns, take],
      piles: [kilnPile, brick],
      takes: [1, 2, 1],
      spill: { from: 0, ...side },
    };
  }

  it("takes two rock from its pile for each brick it makes", () => {
    const chain = kilnsAtTwo(0, 12, pile(300, 300));
    expect(chainFlows(chain)).toEqual([0, 12, 0]);
    // 24 rock a second leave a pile of 300: empty in 12.5 seconds.
    expect(chainChange(chain)).toBeCloseTo(12.5, 9);
    const after = flowChain(chain, 100);
    expect(after.moved[1]).toBeCloseTo(150, 6);
    expect(after.piles[0]).toBeCloseTo(0, 6);
  });

  it("makes nothing from a rock short of its take (#723 review)", () => {
    // One rock waits in the kilns' pile and nothing comes up: no brick.
    const chain = kilnsAtTwo(0, 12, pile(1, 300));
    expect(chainFlows(chain)).toEqual([0, 0, 0]);
    expect(chainChange(chain)).toBe(Infinity);
    // Rock coming up makes brick at half its rate, and the rock still waits.
    expect(chainFlows(kilnsAtTwo(6, 12, pile(1, 300)))).toEqual([6, 3, 0]);
  });

  it("makes no more than half the rock brought once its pile is empty", () => {
    const flows = chainFlows(kilnsAtTwo(18, 12));
    expect(flows[1]).toBeCloseTo(9, 9);
    expect(chainSpill(kilnsAtTwo(18, 12))).toBe(0);
  });

  it("spills what it cannot take once its pile is full", () => {
    // 30 a second come up, the kilns take 24: 6 bypass to stone.
    const chain = kilnsAtTwo(30, 12, pile(300, 300));
    expect(chainSpill(chain)).toBeCloseTo(6, 9);
    expect(flowChain(chain, 10).spilled).toBeCloseTo(60, 6);
  });

  it("a full stockpile after it holds the stage before it at twice the brick taken", () => {
    // The brick stockpile is full and drained at 5 a second: the kilns make 5
    // brick, take 10 rock, and the full kilns' pile lets hoisting bring only
    // those 10 and what the full stone stockpile drains.
    const chain = kilnsAtTwo(
      30,
      12,
      pile(300, 300),
      { held: 1_000, holds: 1_000, drain: 3 },
      pile(500, 500),
      5,
    );
    expect(chainFlows(chain)).toEqual([13, 5, 5]);
  });

  it("in whole goods, a full side pile takes no part-brick's rock: it waits in the pile", () => {
    // The brick stockpile is full and drained at 4.05 a second, so the kilns
    // make 4.05 brick of 8.1 rock and hoisting brings those 8.1. Over 13
    // seconds that is 105 rock and 52 brick in whole goods: one rock is left
    // of the part-brick. The stone stockpile is full and nothing drains it,
    // so the rock stays in the kilns' pile, over its room, and the next
    // stretch brings nothing up until the kilns take it down.
    const chain = kilnsAtTwo(
      30,
      12,
      pile(300, 300),
      { held: 1_000, holds: 1_000, drain: 0 },
      pile(500, 500),
      4.05,
    );
    const whole = flowWhole(chain, 13);
    expect(whole.moved).toEqual([105, 52, 52]);
    expect(whole.spilled).toBe(0);
    expect(whole.piles[0]).toBe(301);
    const next: Chain = {
      ...chain,
      piles: [pile(301, 300), pile(500, 500)],
    };
    expect(chainFlows(next)[0]).toBe(0);
  });

  /** Whole hundredths up to `most`, so rates and stretches leave part-goods often. */
  const hundredths = (most: number) =>
    fc.integer({ min: 0, max: most }).map((n) => n / 100);

  it("in whole goods, nothing is lost and a full side pile never grows, at any rates", () => {
    fc.assert(
      fc.property(
        hundredths(4_000),
        hundredths(2_000),
        hundredths(2_000),
        fc.oneof(fc.constant(300), fc.integer({ min: 0, max: 300 })),
        fc.integer({ min: 0, max: 4 }),
        hundredths(500),
        hundredths(60_000).map((seconds) => seconds + 0.1),
        (lift, kilns, take, held, sideState, drain, seconds) => {
          const side = [
            { held: 0, holds: Infinity, drain: 0 },
            { held: 1_000, holds: 1_000, drain },
            { held: 1_000, holds: 1_000, drain: 0 },
            { held: 999, holds: 1_000, drain: 0 },
            { held: 1_200, holds: 1_000, drain: 0 },
          ][sideState] ?? { held: 0, holds: Infinity, drain: 0 };
          const chain = kilnsAtTwo(
            lift,
            kilns,
            pile(held, 300),
            side,
            pile(500, 500),
            take,
          );
          const exact = flowChain(chain, seconds);
          const whole = flowWhole(chain, seconds);
          const [up = 0, brick = 0] = whole.moved;
          const after = whole.piles[0] ?? 0;
          expect(up + held).toBe(2 * brick + after + whole.spilled);
          expect(after).toBeGreaterThanOrEqual(0);
          // A part-brick's rock may wait over the room: less than one recipe.
          expect(after).toBeLessThan(Math.max(300, held) + 2);
          // A side pile that nothing drains, and one over its room, never
          // ends over its room for a part-brick's rock.
          if (side.held > side.holds || side.drain === 0) {
            expect(whole.spilled).toBeLessThanOrEqual(
              Math.max(
                Math.floor(exact.spilled + 1e-9),
                Math.max(0, side.holds - side.held),
              ),
            );
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("in whole goods, the rock that leaves its pile is the brick made times two", () => {
    const chains = [
      kilnsAtTwo(18, 12),
      kilnsAtTwo(30.7, 12.3, pile(299, 300)),
      kilnsAtTwo(5.5, 12, pile(300, 300)),
      kilnsAtTwo(0, 12, pile(7, 300)),
      kilnsAtTwo(30, 12, pile(300, 300), { held: 900, holds: 1_000, drain: 2 }),
    ];
    for (const chain of chains) {
      for (const seconds of [0.4, 1, 7, 61.3, 3_600]) {
        const whole = flowWhole(chain, seconds);
        const [lift = 0, brick = 0] = whole.moved;
        const before = chain.piles[0]?.held ?? 0;
        const after = whole.piles[0] ?? 0;
        expect(lift + before - after - whole.spilled).toBe(2 * brick);
        expect(after).toBeGreaterThanOrEqual(0);
        expect(after).toBeLessThanOrEqual(Math.max(300, before));
        expect(whole.piles[1]).toBe((chain.piles[1]?.held ?? 0) + brick);
      }
    }
  });
});
