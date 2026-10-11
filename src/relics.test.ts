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

describe("relics after the 100M rescale", () => {
  it("keeps a v3 dad's found relics found", async () => {
    const { parseSaveValue } = await import("./persist");
    const v3 = (remaining: number) =>
      parseSaveValue({
        version: 3,
        mountain: { remaining, pocket: 0, helpers: 0 },
        lastSeen: 0,
      })?.mountain;
    const justLantern = v3(1_000_000 - 20_000);
    const old = v3(1_000_000 - 100_000);
    if (justLantern === undefined || old === undefined) {
      throw new Error("v3 save did not parse");
    }
    expect(foundRelics(justLantern).map((r) => r.id)).toEqual(["lantern"]);
    expect(foundRelics(old).map((r) => r.id)).toEqual(["lantern", "shield"]);
  });
});
