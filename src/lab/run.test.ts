import { describe, expect, it } from "vitest";
import { RUSH_MS } from "../gold-rush";
import { minedMountain } from "../test-fixtures";
import { withFactors } from "../economy/factors";
import { FRESH_OFF, LINE_OFF } from "../line-switch";
import { createMountain, MOUNTAIN_STONES } from "../mountain";
import casual from "./fresh-policies/casual-2x10";
import { runDone, runPolicy, tapQuickVein, tendBest } from "./run";
import { createWorld } from "./world";

describe("the lab's quick vein (#468)", () => {
  it("starts the Gold rush on the held stones, and leaves the vein's pay out", () => {
    const mountain = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 10, kid: 0 },
      rushBank: 8_100,
    };
    const world = { ...createWorld(1, mountain), clock: 5_000 };
    const tapped = tapQuickVein(world);
    expect(tapped.mountain.stock.stones).toBe(mountain.stock.stones);
    expect(tapped.mountain.rushUntil).toBe(5_000 + RUSH_MS);
    // nothing held, no rush
    const none = { ...createWorld(1, minedMountain(0)), clock: 5_000 };
    expect(tapQuickVein(none).mountain).toHaveProperty("rushUntil", 0);
  });
});

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
    expect(run.world.mountain.project.kind).toBe("unordered");
  });

  it("plays part 1's dad: he orders in his first second", () => {
    withFactors(FRESH, () => {
      const run = runPolicy({ policy: casual, seed: 1, maxLiveSeconds: 1 });
      expect(run.world.mountain.project.kind).not.toBe("unordered");
    });
  });
});
