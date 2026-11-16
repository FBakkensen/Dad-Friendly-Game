import { describe, expect, it } from "vitest";
import { EMPTY_MATERIALS, materialsGained } from "./layers";
import { accrueAway, type Mountain } from "./mountain";
import { minedOut } from "./scale";
import { AWAY_MATERIALS_USE, awayMaterialsWords } from "./screen-words";
import { minedMountain } from "./test-fixtures";

/** A Granite crew: 12M mined, enough machines to bring up iron in an hour. */
const granite = (): Mountain => ({
  ...minedMountain(12_000_000),
  owned: {
    ...minedMountain(12_000_000).owned,
    helper: 60,
    cart: 10,
    drill: 6,
    borer: 2,
  },
});

describe("welcome-back ore (#247)", () => {
  it("reports exactly the ore the away dig added to the pocket", () => {
    const mountain = granite();
    const result = accrueAway({ mountain, lastSeen: 0, now: 3 * 3_600_000 });
    expect(result.report.materials).toEqual(
      materialsGained(12_000_000, minedOut(result.mountain)),
    );
    expect(result.report.materials.iron).toBeGreaterThan(0);
    expect(result.mountain.stock.iron).toBe(
      mountain.stock.iron + result.report.materials.iron,
    );
  });

  it("names each ore that came up, shallow first, and nothing when none did", () => {
    expect(awayMaterialsWords(EMPTY_MATERIALS)).toBeUndefined();
    expect(
      awayMaterialsWords({ clay: 3, iron: 12_500, crystal: 0, heartstone: 1 }),
    ).toBe("Ore for the Workshop: +3 clay · +12.5K iron · +1 heartstone");
    expect(AWAY_MATERIALS_USE).not.toMatch(/\?|\d/);
  });
});
