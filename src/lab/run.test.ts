import { describe, expect, it } from "vitest";
import { minedMountain } from "../test-fixtures";
import { withFactors } from "../economy/factors";
import { FRESH_OFF, LINE_OFF } from "../line-switch";
import { createMountain, MOUNTAIN_STONES } from "../mountain";
import casual from "./fresh-policies/casual-2x10";
import { runDone, runPolicy, tendBest } from "./run";

describe("where a best-tending dad sends her (#543)", () => {
  const crew = {
    ...minedMountain(130_000_000),
    owned: {
      ...minedMountain(130_000_000).owned,
      helper: 60,
      cart: 10,
      drill: 20,
      borer: 2,
      hoist: 20,
      machine: 1,
    },
    legacy: 0,
    engineers: [
      {
        name: "Ada" as const,
        rank: 0 as const,
        trips: 0,
        post: "borer" as const,
      },
    ],
  };

  it("on the line, to the post where the line gains most", () => {
    withFactors({ [LINE_OFF]: 0 }, () => {
      expect(tendBest(crew).engineers[0]?.post).toBe("cart");
    });
  });

  it("off the line, to the Great Machine as always", () => {
    expect(tendBest(crew).engineers[0]?.post).toBe("machine");
  });

  it("leaves an engineer who is out exploring where she is", () => {
    withFactors({ [LINE_OFF]: 0 }, () => {
      const away = {
        ...crew,
        expeditions: [
          {
            engineer: "Ada" as const,
            tunnel: "side-seam" as const,
            sentAt: 0,
            returnsAt: 60_000,
            find: { kind: "quiet" as const },
          },
        ],
      };
      expect(tendBest(away)).toBe(away);
    });
  });

  it("leaves her where she is when no post lifts the line", () => {
    withFactors({ [LINE_OFF]: 0 }, () => {
      const idle = {
        ...crew,
        owned: {
          ...crew.owned,
          cart: 0,
          drill: 0,
          borer: 0,
          hoist: 0,
          machine: 0,
        },
      };
      expect(tendBest(idle)).toBe(idle);
    });
  });
});

describe("a fresh mine's run (#655)", () => {
  const FRESH = { [FRESH_OFF]: 0 };

  it("ends when the last building built so far stands", () => {
    withFactors(FRESH, () => {
      const start = createMountain();
      expect(runDone(start)).toBe(false);
      expect(runDone({ ...start, operational: ["lightTower"] })).toBe(true);
    });
  });

  it("ends today's run when the mountain is empty", () => {
    const start = createMountain();
    expect(start.remaining).toBe(MOUNTAIN_STONES);
    expect(runDone(start)).toBe(false);
    expect(runDone({ ...start, remaining: 0 })).toBe(true);
  });

  it("plays a fresh type the old way while the fresh mine is off", () => {
    const run = runPolicy({ policy: casual, seed: 1, maxLiveSeconds: 1 });
    // Today's dad taps by hand; part 1's dad never does.
    expect(casual.params.tapsPerSecond).toBeGreaterThan(0);
    expect(run.world.mountain.remaining).toBeLessThan(MOUNTAIN_STONES);
  });

  it("plays part 1's dad: he orders in his first second", () => {
    withFactors(FRESH, () => {
      const run = runPolicy({ policy: casual, seed: 1, maxLiveSeconds: 1 });
      expect(run.world.mountain.project.kind).not.toBe("unordered");
    });
  });
});
