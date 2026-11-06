import { describe, expect, it } from "vitest";
import type { DecisionSample } from "./measure";
import { deadStretches } from "./stretch";
import { DEAD_STRETCH, HOUR_MS } from "./targets";

/** A sample waiting a whole sitting for its best move, nothing affordable. */
function waiting(atMs: number, boughtSince?: boolean): DecisionSample {
  const view = {
    liveCount: 1,
    affordableLive: 0,
    waitToAffordSec: DEAD_STRETCH.minWaitSec + 1,
    bestId: "buyTier:borer",
  };
  return {
    atMs,
    stretch: { payback: view, value: view, nextPaybackRatio: 1 },
    ...(boughtSince === undefined ? {} : { boughtSince }),
  } as unknown as DecisionSample;
}

describe("deadStretches (#335)", () => {
  it("counts waiting samples in a row as one stretch", () => {
    const stretches = deadStretches(
      [waiting(0), waiting(HOUR_MS), waiting(2 * HOUR_MS)],
      "payback",
    );
    expect(stretches.map((stretch) => stretch.hours)).toEqual([2]);
  });

  it("ends the stretch at a sample after a buy, even if the next save is long", () => {
    // A sitting opens, the dad buys, and the first sample after is already
    // waiting for the next borer. The buy still broke the wait.
    const stretches = deadStretches(
      [
        waiting(0),
        waiting(HOUR_MS),
        waiting(24 * HOUR_MS, true),
        waiting(25 * HOUR_MS),
      ],
      "payback",
    );
    expect(stretches.map((stretch) => stretch.hours)).toEqual([24, 0]);
  });
});
