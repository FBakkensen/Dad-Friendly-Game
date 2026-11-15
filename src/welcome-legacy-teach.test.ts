// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { legacyCardWords } from "./legacy-panel";
import { EMPTY_MATERIALS, materialsGained } from "./layers";
import { accrueAway, createMountain, type Mountain } from "./mountain";
import { MOUNTAIN_STONES, minedOut } from "./scale";
import { AWAY_MATERIALS_USE, awayMaterialsWords } from "./screen-words";
import { minedMountain } from "./test-fixtures";
import { recipesForMined } from "./workshop";

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

describe("pass-to-kid card (#247)", () => {
  const bottom = (legacy: number): Mountain => ({
    ...minedMountain(MOUNTAIN_STONES),
    legacy,
    recipes: recipesForMined(MOUNTAIN_STONES),
  });

  it("states the first Legacy with real crew numbers, and no tap that rounds away", () => {
    const words = legacyCardWords(bottom(0));
    expect(words.lead).toBe("Legacy ×1.5, for good");
    expect(words.rates).toEqual(["Workers 1/s to 1.5/s", "Carts 6/s to 9/s"]);
    expect(words.keeps).toBe(
      `A bigger mountain for your kid, with the Legacy and ${String(recipesForMined(MOUNTAIN_STONES).length)} recipes.`,
    );
  });

  it("says Grandpa stays on to tend the machines (#338)", () => {
    expect(legacyCardWords(bottom(0)).legend).toBe(
      "You'll always be the Legend who began it. Grandpa stays on to tend the machines.",
    );
  });

  it("names the step from the current Legacy, and the tap once it grows", () => {
    const words = legacyCardWords(bottom(1));
    expect(words.lead).toBe("Legacy ×1.5 to ×2, for good");
    expect(words.rates).toEqual([
      "Workers 1.5/s to 2/s",
      "Carts 9/s to 12/s",
      "Taps 1 to 2 stones",
    ]);
  });

  it("counts the starting recipes on a mountain without a list, and stays plain", () => {
    const bare: Mountain = createMountain();
    const words = legacyCardWords(bare);
    expect(words.keeps).toBe(
      `A bigger mountain for your kid, with the Legacy and ${String(recipesForMined(0).length)} recipes.`,
    );
    const all = [
      words.lead,
      ...words.rates,
      words.keeps,
      words.fresh,
      words.legend,
    ];
    for (const line of all) {
      expect(line).not.toMatch(/\?/);
    }
  });
});
