import { describe, expect, it } from "vitest";
import { RUSH_MS } from "../gold-rush";
import { minedMountain } from "../test-fixtures";
import { withFactors } from "../economy/factors";
import { LINE_OFF } from "../line";
import { tapQuickVein, tendBest } from "./run";
import { createWorld } from "./world";

describe("the lab's quick vein (#468)", () => {
  it("starts the Gold rush on the held stones, and leaves the vein's pay out", () => {
    const mountain = {
      ...minedMountain(0),
      helpers: 10,
      kids: 0,
      rushBank: 8_100,
    };
    const world = { ...createWorld(1, mountain), clock: 5_000 };
    const tapped = tapQuickVein(world);
    expect(tapped.mountain.pocket).toBe(mountain.pocket);
    expect(tapped.mountain.rushUntil).toBe(5_000 + RUSH_MS);
    // nothing held, no rush
    const none = { ...createWorld(1, minedMountain(0)), clock: 5_000 };
    expect(tapQuickVein(none).mountain).toHaveProperty("rushUntil", 0);
  });
});

describe("where a best-tending dad sends her (#543)", () => {
  const crew = {
    ...minedMountain(130_000_000),
    helpers: 60,
    carts: 10,
    drills: 20,
    borers: 2,
    hoists: 20,
    machines: 1,
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
        carts: 0,
        drills: 0,
        borers: 0,
        hoists: 0,
        machines: 0,
      };
      expect(tendBest(idle)).toBe(idle);
    });
  });
});
