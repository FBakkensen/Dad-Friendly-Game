import { describe, expect, it } from "vitest";
import { RUSH_MS } from "../gold-rush";
import { minedMountain } from "../test-fixtures";
import { tapQuickVein } from "./run";
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
    expect(tapQuickVein(none).mountain).not.toHaveProperty("rushUntil");
  });
});
