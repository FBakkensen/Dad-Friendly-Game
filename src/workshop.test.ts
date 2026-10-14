import { describe, expect, it } from "vitest";
import { MAX_MATERIAL } from "./layers";
import {
  MAX_CRAFTED_LEVEL,
  MAX_CRAFT_MS,
  RECIPE_IDS,
  STARTING_RECIPE_IDS,
  isRecipeId,
  parseBench,
  parseCrafted,
  parseMaterials,
  parseRecipes,
  recipesForMined,
} from "./workshop";

const materials = { clay: 1, iron: 2, crystal: 3, heartstone: 4 };

describe("recipes granted from stones mined", () => {
  it("starts with three, and adds a layer recipe when that band is reached", () => {
    expect(recipesForMined(-1)).toEqual([...STARTING_RECIPE_IDS]);
    expect(recipesForMined(0)).toEqual([...STARTING_RECIPE_IDS]);
    expect(recipesForMined(45_000_000 - 1)).toEqual([...STARTING_RECIPE_IDS]);
    expect(recipesForMined(45_000_000)).toEqual([
      ...STARTING_RECIPE_IDS,
      "diamond-bits",
    ]);
    expect(recipesForMined(120_000_000 - 1)).toEqual([
      ...STARTING_RECIPE_IDS,
      "diamond-bits",
    ]);
    expect(recipesForMined(120_000_000)).toEqual([
      ...STARTING_RECIPE_IDS,
      "diamond-bits",
      "heartstone-core",
    ]);
    expect(recipesForMined(120_000_000)).not.toContain("crystal-lamp");
    expect(recipesForMined(120_000_000)).not.toContain("engineers-kit");
  });
});

describe("workshop save fields", () => {
  it("names the closed recipe list", () => {
    expect(isRecipeId("iron-rails")).toBe(true);
    expect(isRecipeId("crystal-lamp")).toBe(true);
    expect(isRecipeId("turbo")).toBe(false);
    expect(isRecipeId(1)).toBe(false);
    expect(RECIPE_IDS).toHaveLength(7);
  });

  it("accepts the four materials and rejects a bad pocket", () => {
    expect(parseMaterials(materials)).toEqual(materials);
    expect(
      parseMaterials({ ...materials, clay: MAX_MATERIAL.clay }),
    ).toMatchObject({ clay: MAX_MATERIAL.clay });
    for (const bad of [
      null,
      "clay",
      [],
      {},
      { ...materials, gold: 1 },
      { clay: 1, iron: 2, crystal: 3 },
      { ...materials, clay: 1.5 },
      { ...materials, clay: -1 },
      { ...materials, iron: MAX_MATERIAL.iron + 1 },
    ]) {
      expect(parseMaterials(bad)).toBeUndefined();
    }
  });

  it("accepts one bench and rejects a bad craft", () => {
    const bench = {
      recipe: "heartstone-core" as const,
      startedAt: 10,
      endsAt: 10 + MAX_CRAFT_MS,
    };
    expect(parseBench(bench)).toEqual(bench);
    for (const bad of [
      null,
      [],
      "bench",
      { recipe: "iron-rails", startedAt: 1 },
      { ...bench, note: "soon" },
      { ...bench, recipe: "turbo" },
      { ...bench, startedAt: 1.5 },
      { ...bench, endsAt: "later" },
      { ...bench, startedAt: 20, endsAt: 20 },
      { ...bench, endsAt: bench.startedAt + MAX_CRAFT_MS + 1 },
    ]) {
      expect(parseBench(bad)).toBeUndefined();
    }
  });

  it("accepts crafted levels and rejects a bad map", () => {
    expect(parseCrafted({})).toEqual({});
    expect(parseCrafted({ "iron-rails": 0, "engineers-kit": 1 })).toEqual({
      "iron-rails": 0,
      "engineers-kit": 1,
    });
    expect(parseCrafted({ "diamond-bits": MAX_CRAFTED_LEVEL })).toEqual({
      "diamond-bits": MAX_CRAFTED_LEVEL,
    });
    expect(parseCrafted({ turbo: 1, "iron-rails": 2 })).toEqual({
      "iron-rails": 2,
    });
    expect(parseCrafted({ turbo: 1 })).toEqual({});
    for (const bad of [
      null,
      [],
      { "iron-rails": 1.5 },
      { "blasting-charge": -1 },
      { "crystal-lamp": MAX_CRAFTED_LEVEL + 1 },
      { turbo: 1, "iron-rails": -1 },
    ]) {
      expect(parseCrafted(bad)).toBeUndefined();
    }
  });

  it("drops an unknown or repeated recipe and keeps the ones it knows", () => {
    expect(parseRecipes([])).toEqual([]);
    expect(parseRecipes(["engineers-kit", "iron-rails"])).toEqual([
      "engineers-kit",
      "iron-rails",
    ]);
    expect(parseRecipes([...RECIPE_IDS])).toEqual([...RECIPE_IDS]);
    expect(parseRecipes(["iron-rails", "future-bit", "iron-rails"])).toEqual([
      "iron-rails",
    ]);
    expect(parseRecipes(["nope"])).toEqual([]);
    expect(
      parseRecipes(new Array(RECIPE_IDS.length + 1).fill("iron-rails")),
    ).toEqual(["iron-rails"]);
    expect(parseRecipes("iron-rails")).toBeUndefined();
  });
});
