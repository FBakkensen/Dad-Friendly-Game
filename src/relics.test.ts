import { describe, expect, it } from "vitest";
import { MOUNTAIN_STONES } from "./mountain";
import {
  RELICS,
  foundRelics,
  hasRelic,
  nextRelic,
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

  it("finds the Lantern at exactly 20,000 stones mined", () => {
    expect(hasRelic(minedMountain(19_999), "lantern")).toBe(false);
    expect(hasRelic(minedMountain(20_000), "lantern")).toBe(true);
    expect(foundRelics(minedMountain(20_000)).map((r) => r.id)).toEqual([
      "lantern",
    ]);
    expect(nextRelic(minedMountain(0))?.id).toBe("lantern");
    expect(nextRelic(minedMountain(20_000))?.id).toBe("shield");
    expect(nextRelic(minedMountain(MOUNTAIN_STONES))).toBeUndefined();
  });

  it("reports relics crossed by a dig, shallowest first, and none when going back", () => {
    expect(
      relicsUncovered({ before: 19_999, after: 20_000 }).map((r) => r.id),
    ).toEqual(["lantern"]);
    expect(
      relicsUncovered({ before: 0, after: 300_000 }).map((r) => r.id),
    ).toEqual(["lantern", "shield", "hammer"]);
    expect(relicsUncovered({ before: 20_000, after: 20_001 })).toEqual([]);
    expect(relicsUncovered({ before: 30_000, after: 10_000 })).toEqual([]);
  });
});
