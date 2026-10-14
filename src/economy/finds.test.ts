import { describe, expect, it } from "vitest";
import { ENGINEER_NAMES, type Engineer } from "../engineers";
import { KEEPSAKES } from "../expeditions";
import { LOST_TOOLS } from "../lost-tools";
import { createMountain, type Mountain } from "../mountain";
import { expectedFindStones } from "./finds";

const ada: Engineer = { name: "Ada", rank: 0, trips: 0, post: "borer" };

describe("expectedFindStones", () => {
  it("is zero when the horizon is not a stretch of time", () => {
    expect(
      expectedFindStones(createMountain(), [], "old-shaft", 0, () => 1),
    ).toBe(0);
    expect(
      expectedFindStones(createMountain(), [], "old-shaft", -5, () => 1),
    ).toBe(0);
  });

  it("averages tools, keepsakes, and glimmers, and prices a rate change", () => {
    const mountain = createMountain();
    const flat = expectedFindStones(mountain, [], "old-shaft", 100, () => 1);
    // Keepsakes and glimmers are 0. Tools add seconds of income.
    expect(flat).toBeGreaterThan(0);
    const boosted = expectedFindStones(
      mountain,
      [ada],
      "old-shaft",
      100,
      (next) => (next.finds?.includes("pick") ? 5 : 1),
    );
    expect(boosted).toBeGreaterThan(flat);
  });

  it("ignores a negative schedule when a tool does not speed it", () => {
    const stones = expectedFindStones(
      createMountain(),
      [],
      "side-seam",
      60,
      () => -3,
    );
    expect(stones).toBe(0);
  });

  it("counts a free engineer as the promotion plus the post they could tend", () => {
    const mountain: Mountain = { ...createMountain(), helpers: 8, borers: 1 };
    const idle = expectedFindStones(mountain, [ada], "deep-dark", 100, () => 0);
    const busy = expectedFindStones(
      mountain,
      [ada],
      "deep-dark",
      100,
      (next) => {
        const hand = next.engineers?.[1];
        return hand !== undefined && hand.post === "borer" ? 4 : 0;
      },
    );
    expect(busy).toBeGreaterThan(idle);
    expect(idle).toBeGreaterThan(0);
  });

  it("is quiet once nothing new can come home", () => {
    const full: readonly Engineer[] = ENGINEER_NAMES.map((name, index) => ({
      name,
      rank: 0 as const,
      trips: 0,
      post: "camp" as const,
      ...(index === 0 ? { post: "borer" as const } : {}),
    }));
    const mined: Mountain = {
      ...createMountain(),
      remaining: 0,
      finds: [...LOST_TOOLS, ...KEEPSAKES],
      engineers: full,
    };
    expect(expectedFindStones(mined, full, "deep-dark", 1_000, () => 10)).toBe(
      0,
    );
  });
});
