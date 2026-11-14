import { describe, expect, it } from "vitest";
import { MOUNTAIN_STONES } from "./mountain";
import {
  RELICS,
  depthHint,
  foundRelics,
  hasRelic,
  nextRelic,
  relicGoal,
  relicsUncovered,
} from "./relics";
import { minedMountain } from "./test-fixtures";

describe("relics", () => {
  it("lists six relics, Lantern first and Mantle at the very bottom", () => {
    expect(RELICS.map((relic) => relic.id)).toEqual([
      "lantern",
      "shield",
      "hammer",
      "heart",
      "crown",
      "mantle",
    ]);
    const depths = RELICS.map((relic) => relic.depth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    expect(depths.at(-1)).toBe(MOUNTAIN_STONES);
  });

  it("the Mantle's power points to passing the mine now, not later (#326)", () => {
    const mantle = RELICS.find((relic) => relic.id === "mantle");
    expect(mantle?.boost).toBe(
      "Ends the run as a Legend. Pass the mine to your kid when you are ready.",
    );
    expect(mantle?.boost).not.toMatch(/later/i);
  });

  it("finds the Lantern at exactly 1,000,000 stones mined", () => {
    expect(hasRelic(minedMountain(999_999), "lantern")).toBe(false);
    expect(hasRelic(minedMountain(1_000_000), "lantern")).toBe(true);
    expect(foundRelics(minedMountain(1_000_000)).map((r) => r.id)).toEqual([
      "lantern",
    ]);
    expect(nextRelic(minedMountain(0))?.id).toBe("lantern");
    expect(nextRelic(minedMountain(1_000_000))?.id).toBe("shield");
    expect(nextRelic(minedMountain(MOUNTAIN_STONES))).toBeUndefined();
  });

  it("reports relics crossed by a dig, shallowest first, and none when going back", () => {
    expect(
      relicsUncovered({ before: 999_999, after: 1_000_000 }).map((r) => r.id),
    ).toEqual(["lantern"]);
    expect(
      relicsUncovered({ before: 0, after: 30_000_000 }).map((r) => r.id),
    ).toEqual(["lantern", "shield", "hammer"]);
    expect(relicsUncovered({ before: 1_000_000, after: 1_000_001 })).toEqual(
      [],
    );
    expect(relicsUncovered({ before: 3_000_000, after: 1_000_000 })).toEqual(
      [],
    );
  });
});

describe("depthHint", () => {
  it("says how near the next relic is in words, never numbers", () => {
    expect(depthHint(minedMountain(1_000_000))).toBe("Far below");
    expect(depthHint(minedMountain(4_000_000))).toBe("Getting closer");
    expect(depthHint(minedMountain(7_000_000))).toBe("Close now");
    expect(depthHint(minedMountain(9_500_000))).toBe("Almost there");
    expect(depthHint(minedMountain(MOUNTAIN_STONES))).toBeUndefined();
    for (const relic of RELICS) {
      expect(relic.tease).not.toMatch(/\d|\?/);
    }
  });
});

describe("relicGoal (#336)", () => {
  it("has no goal before the Lantern lights the way", () => {
    expect(relicGoal(minedMountain(0))).toEqual({ kind: "unguided" });
    expect(relicGoal(minedMountain(999_999))).toEqual({ kind: "unguided" });
  });

  it("names the next relic, a vague hint, and the bar's percent", () => {
    const shield = RELICS.find((relic) => relic.id === "shield");
    const from = 1_000_000;
    const to = shield?.depth ?? 0;
    const goal = relicGoal(minedMountain(from + Math.floor((to - from) / 2)));
    expect(goal).toEqual({
      kind: "next",
      name: "Shield of Protection",
      hint: "Getting closer",
      percent: 50,
    });
  });

  it("is done once every relic is found", () => {
    expect(relicGoal(minedMountain(MOUNTAIN_STONES))).toEqual({ kind: "done" });
  });

  it("never says a depth or a stone count in its words", () => {
    const goal = relicGoal(minedMountain(3_000_000));
    expect(goal.kind).toBe("next");
    if (goal.kind === "next") {
      expect(`${goal.name} ${goal.hint}`).not.toMatch(/\d/);
    }
  });
});
