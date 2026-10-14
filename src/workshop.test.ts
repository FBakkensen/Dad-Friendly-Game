import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { nextTrouble } from "./hazards";
import { LAYERS, MAX_MATERIAL, type MaterialId } from "./layers";
import { expeditionAwayMs } from "./lost-tools";
import {
  MOUNTAIN_STONES,
  accrue,
  accrueAway,
  createMountain,
  type Mountain,
} from "./mountain";
import { parseSaveValue, serializeSave } from "./persist";
import { effectiveRates } from "./rates";
import {
  CHARGE_MS,
  MAX_CRAFTED_LEVEL,
  MAX_CRAFT_MS,
  RECIPE_IDS,
  RECIPES,
  STARTING_RECIPE_IDS,
  cancelCraft,
  cancelRefund,
  hotTimers,
  recipeWindowMs,
  reinforceTier,
  AXLE_MS,
  axleCrewMultiplier,
  chargeCrewMultiplier,
  craftedLevel,
  expeditionCraftScale,
  gearMultiplier,
  isRecipeId,
  parseBench,
  parseChargeUntil,
  parseCrafted,
  parseMaterials,
  parseRecipes,
  recipeById,
  recipeCost,
  recipesForMined,
  settleBench,
  startCraft,
  troubleGapScale,
  veinOftenScale,
  workshopUnlocked,
  type RecipeId,
} from "./workshop";

const materials = { clay: 1, iron: 2, crystal: 3, heartstone: 4 };

describe("recipes granted from stones mined", () => {
  it("starts with three, and adds a layer recipe when that band is reached", () => {
    expect(recipesForMined(-1)).toEqual([...STARTING_RECIPE_IDS]);
    expect(recipesForMined(0)).toEqual([...STARTING_RECIPE_IDS]);
    expect(recipesForMined(10_000_000 - 1)).toEqual([...STARTING_RECIPE_IDS]);
    expect(recipesForMined(10_000_000)).toEqual([
      ...STARTING_RECIPE_IDS,
      "reinforce",
      "axle-grease",
    ]);
    expect(recipesForMined(45_000_000 - 1)).toEqual([
      ...STARTING_RECIPE_IDS,
      "reinforce",
      "axle-grease",
    ]);
    expect(recipesForMined(45_000_000)).toEqual([
      ...STARTING_RECIPE_IDS,
      "reinforce",
      "axle-grease",
      "diamond-bits",
      "crystal-flare",
    ]);
    expect(recipesForMined(120_000_000 - 1)).toEqual([
      ...STARTING_RECIPE_IDS,
      "reinforce",
      "axle-grease",
      "diamond-bits",
      "crystal-flare",
    ]);
    expect(recipesForMined(120_000_000)).toEqual([
      ...STARTING_RECIPE_IDS,
      "reinforce",
      "axle-grease",
      "diamond-bits",
      "crystal-flare",
      "heartstone-core",
      "heartstone-ember",
    ]);
    expect(recipesForMined(MOUNTAIN_STONES)).not.toContain("crystal-lamp");
    expect(recipesForMined(MOUNTAIN_STONES)).not.toContain("engineers-kit");
  });
});

describe("workshop save fields", () => {
  it("names the closed recipe list", () => {
    expect(isRecipeId("iron-rails")).toBe(true);
    expect(isRecipeId("crystal-lamp")).toBe(true);
    expect(isRecipeId("turbo")).toBe(false);
    expect(isRecipeId(1)).toBe(false);
    expect(RECIPE_IDS).toHaveLength(11);
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

  it("reads a whole charge time and rejects anything else", () => {
    expect(parseChargeUntil(0)).toBe(0);
    expect(parseChargeUntil(4)).toBe(4);
    for (const bad of [undefined, null, -1, 1.5, "1"]) {
      expect(parseChargeUntil(bad)).toBeUndefined();
    }
  });
});

const FULL: Mountain["materials"] = {
  clay: 80,
  iron: 80,
  crystal: 80,
  heartstone: 80,
};

/** Granite is open, the pocket can pay, and every recipe is known. */
function openShed(extra: Partial<Mountain> = {}): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - LAYERS[1].from,
    pocket: 80_000_000,
    materials: FULL,
    recipes: [...RECIPE_IDS],
    ...extra,
  } as Mountain;
}

describe("workshop rules", () => {
  it("lists a tuned cost, time, and effect for every recipe", () => {
    expect(RECIPES.map((recipe) => recipe.id)).toEqual([...RECIPE_IDS]);
    expect(recipeById("iron-rails")).toMatchObject({
      stones: 500_000,
      materials: { iron: 4 },
      craftMs: 600_000,
      maxLevel: 2,
    });
    expect(recipeById("sturdy-props").materials).toEqual({ clay: 10, iron: 4 });
    expect(recipeById("axle-grease")).toMatchObject({
      stones: 0,
      materials: { iron: 1 },
      craftMs: 600_000,
    });
    expect(recipeById("axle-grease").maxLevel).toBeUndefined();
    expect(recipeById("blasting-charge")).toMatchObject({
      stones: 100_000,
      materials: { clay: 4 },
      craftMs: 600_000,
    });
    expect(recipeById("blasting-charge").effect).toMatchObject({
      multiplier: 2,
      durationMs: CHARGE_MS,
    });
    expect(recipeById("reinforce")).toMatchObject({
      stones: 0,
      materials: { iron: 5 },
    });
    expect(recipeById("reinforce").maxLevel).toBe(5);
    expect(recipeById("crystal-flare").effect).toMatchObject({
      often: 0.25,
      durationMs: 3_600_000,
    });
    expect(recipeById("heartstone-ember").effect).toMatchObject({
      bonus: 0.25,
      durationMs: CHARGE_MS,
    });
    expect(recipeCost("crystal-lamp").stones).toBe(0);
    expect(recipeCost("engineers-kit").materials).toMatchObject({
      iron: 4,
      crystal: 4,
    });
    for (const recipe of RECIPES) {
      expect([600_000, 3_600_000, 14_400_000]).toContain(recipe.craftMs);
    }
  });

  it("gives every material a recipe that can be crafted again", () => {
    const sinks: Record<MaterialId, RecipeId> = {
      clay: "blasting-charge",
      iron: "axle-grease",
      crystal: "crystal-flare",
      heartstone: "heartstone-ember",
    };
    for (const material of Object.keys(sinks) as MaterialId[]) {
      const sink = recipeById(sinks[material]);
      expect(sink.maxLevel === undefined || sink.maxLevel > 1).toBe(true);
      expect(sink.materials[material]).toBeGreaterThan(0);
      const once = startCraft(openShed(), sink.id, 0);
      const fitted = settleBench(once, once.bench?.endsAt ?? 0);
      const twice = startCraft(fitted, sink.id, once.bench?.endsAt ?? 0);
      expect(twice.bench?.recipe).toBe(sink.id);
      expect(craftedLevel(fitted, sink.id)).toBe(1);
    }
  });

  it("stays shut until the Granite, and spends nothing it cannot pay", () => {
    const locked = {
      ...createMountain(),
      pocket: 80_000_000,
      materials: FULL,
    };
    expect(workshopUnlocked(locked)).toBe(false);
    expect(workshopUnlocked(openShed())).toBe(true);
    expect(startCraft(locked, "iron-rails", 1)).toBe(locked);
    const shed = openShed();
    expect(startCraft(shed, "iron-rails", -1)).toBe(shed);
    expect(startCraft(shed, "iron-rails", 1.5)).toBe(shed);
    const { recipes, ...unknown } = shed;
    expect(recipes).toEqual([...RECIPE_IDS]);
    expect(startCraft(unknown, "iron-rails", 1)).toBe(unknown);
    const onlyProps = { ...shed, recipes: ["sturdy-props" as const] };
    expect(startCraft(onlyProps, "iron-rails", 1)).toBe(onlyProps);
    const started = startCraft(shed, "iron-rails", 1);
    expect(startCraft(started, "sturdy-props", 2)).toBe(started);
    const maxed = { ...shed, crafted: { "iron-rails": 3 } };
    expect(startCraft(maxed, "iron-rails", 1)).toBe(maxed);
    const capped = {
      ...shed,
      crafted: { "crystal-flare": MAX_CRAFTED_LEVEL },
    };
    expect(startCraft(capped, "crystal-flare", 1)).toBe(capped);
    const poor = { ...shed, pocket: 10 };
    expect(startCraft(poor, "iron-rails", 1)).toBe(poor);
    const { materials, ...bare } = shed;
    expect(materials).toEqual(FULL);
    expect(startCraft(bare, "reinforce", 1)).toBe(bare);
    const shortClay = { ...shed, materials: { ...FULL, clay: 0 } };
    expect(startCraft(shortClay, "blasting-charge", 1)).toBe(shortClay);
    const shortIron = { ...shed, materials: { ...FULL, iron: 0 } };
    expect(startCraft(shortIron, "reinforce", 1)).toBe(shortIron);
    const shortCrystal = { ...shed, materials: { ...FULL, crystal: 0 } };
    expect(startCraft(shortCrystal, "crystal-flare", 1)).toBe(shortCrystal);
    const shortHeart = { ...shed, materials: { ...FULL, heartstone: 0 } };
    expect(startCraft(shortHeart, "heartstone-ember", 1)).toBe(shortHeart);
  });

  it("puts one craft on the bench and returns every stone and material on cancel", () => {
    const shed = openShed();
    const started = startCraft(shed, "sturdy-props", 5_000);
    expect(started).not.toBe(shed);
    expect(shed.pocket).toBe(80_000_000);
    expect(started.pocket).toBe(shed.pocket - 250_000);
    expect(started.materials).toEqual({ ...FULL, clay: 70, iron: 76 });
    expect(started.bench).toEqual({
      recipe: "sturdy-props",
      startedAt: 5_000,
      endsAt: 5_000 + 600_000,
    });
    const back = cancelCraft(started, 5_000);
    expect(back.pocket).toBe(shed.pocket);
    expect(back.materials).toEqual(FULL);
    expect(back.bench).toBeUndefined();
    expect(back.crafted).toBeUndefined();
    expect(cancelCraft(shed, 1)).toBe(shed);
    const late = cancelCraft(started, started.bench?.endsAt ?? 0);
    expect(late.crafted?.["sturdy-props"]).toBe(1);
    expect(late.pocket).toBe(started.pocket);
    expect(late.materials).toEqual(started.materials);
    expect(late.bench).toBeUndefined();
  });

  it("fits a finished craft once across time away and a reload", () => {
    const started = startCraft(openShed(), "iron-rails", 1_000);
    const endsAt = started.bench?.endsAt ?? 0;
    expect(settleBench(started, endsAt - 1)).toBe(started);
    const away = accrueAway({
      mountain: started,
      lastSeen: 1_000,
      now: endsAt + 5_000,
    });
    expect(away.mountain.crafted?.["iron-rails"]).toBe(1);
    expect(away.mountain.bench).toBeUndefined();
    const saved = serializeSave({
      mountain: away.mountain,
      lastSeen: endsAt,
    });
    const loaded = parseSaveValue(saved)?.mountain ?? started;
    const again = accrueAway({
      mountain: loaded,
      lastSeen: endsAt,
      now: endsAt + 60_000,
    });
    expect(again.mountain.crafted?.["iron-rails"]).toBe(1);
    expect(
      settleBench(again.mountain, endsAt + 60_000).crafted?.["iron-rails"],
    ).toBe(1);
    const backwards = accrue({
      mountain: started,
      from: endsAt,
      to: 1_000,
    });
    expect(backwards.mountain).toBe(started);
    expect(backwards.mined).toBe(0);
  });

  it("fits gear that is already done before the window, and a charge while idle", () => {
    const due = {
      ...openShed(),
      helpers: 1,
      carts: 1,
      bench: {
        recipe: "iron-rails" as const,
        startedAt: 0,
        endsAt: 0,
      },
    };
    const fitted = accrue({ mountain: due, from: 0, to: 10_000 });
    expect(fitted.mountain.crafted?.["iron-rails"]).toBe(1);
    expect(fitted.mined).toBe(110);
    const working = startCraft(
      { ...openShed(), helpers: 1, carts: 1 },
      "iron-rails",
      0,
    );
    const during = accrue({
      mountain: working,
      from: 0,
      to: working.bench?.endsAt ?? 0,
    });
    expect(during.mined).toBe(9 * 600);
    expect(during.mountain.crafted?.["iron-rails"]).toBe(1);
    const idle = startCraft(openShed(), "blasting-charge", 0);
    const done = accrue({
      mountain: idle,
      from: 0,
      to: idle.bench?.endsAt ?? 0,
    });
    expect(done.mined).toBe(0);
    expect(done.mountain.chargeUntil).toBe(CHARGE_MS);
    expect(chargeCrewMultiplier(idle, 1)).toBe(2);
    expect(chargeCrewMultiplier(idle, undefined)).toBe(1);
    expect(done.mountain.bench).toBeUndefined();
  });

  it("adds another twenty minutes when a second charge finishes while one is hot", () => {
    const first = settleBench(
      startCraft(openShed(), "blasting-charge", 0),
      600_000,
    );
    expect(first.chargeUntil).toBe(CHARGE_MS);
    const next = startCraft(first, "blasting-charge", 600_000);
    const second = settleBench(next, next.bench?.endsAt ?? 0);
    expect(second.crafted?.["blasting-charge"]).toBe(2);
    expect(second.chargeUntil).toBe((first.chargeUntil ?? 0) + CHARGE_MS);
    const cooled = { ...first, chargeUntil: 1 };
    const restarted = startCraft(cooled, "blasting-charge", 100);
    const fresh = settleBench(restarted, restarted.bench?.endsAt ?? 0);
    expect(fresh.chargeUntil).toBe(100 + CHARGE_MS);
    const full = {
      ...openShed(),
      crafted: { "blasting-charge": MAX_CRAFTED_LEVEL },
      bench: {
        recipe: "blasting-charge" as const,
        startedAt: 0,
        endsAt: 1,
      },
    };
    const held = settleBench(full, 1);
    expect(held.crafted?.["blasting-charge"]).toBe(MAX_CRAFTED_LEVEL);
    expect(held.bench).toBeUndefined();
    expect(held.chargeUntil).toBe(CHARGE_MS);
  });

  it("doubles the live crew for a hot charge and leaves time away alone", () => {
    const crew = { ...openShed(), helpers: 10, chargeUntil: 1_000_000 };
    const { chargeUntil: _hot, ...cool } = crew;
    expect(_hot).toBe(1_000_000);
    expect(accrueAway({ mountain: crew, lastSeen: 0, now: 10_000 }).mined).toBe(
      accrueAway({ mountain: cool, lastSeen: 0, now: 10_000 }).mined,
    );
    expect(
      accrue({ mountain: crew, from: 0, to: 10_000, live: true }).mined,
    ).toBe(200);
    expect(
      accrue({ mountain: cool, from: 0, to: 10_000, live: true }).mined,
    ).toBe(100);
    expect(chargeCrewMultiplier(crew, undefined)).toBe(1);
    expect(chargeCrewMultiplier(cool, 1)).toBe(1);
    expect(chargeCrewMultiplier({ ...crew, chargeUntil: 5 }, 5)).toBe(1);
    expect(chargeCrewMultiplier(crew, 1)).toBe(2);
  });

  it("runs a flare and an ember while they are still on the bench", () => {
    const flare = startCraft(openShed(), "crystal-flare", 1_000);
    expect(veinOftenScale(flare, 1_000)).toBeCloseTo(1.25);
    expect(veinOftenScale(flare)).toBe(1);
    expect(veinOftenScale(flare, 999)).toBe(1);
    const ember = startCraft(
      { ...openShed(), helpers: 25, machines: 1 },
      "heartstone-ember",
      1_000,
    );
    const plain = effectiveRates(
      { ...openShed(), helpers: 25, machines: 1 },
      1_000,
    );
    expect(effectiveRates(ember, 1_000).tierSpeed.machine).toBeCloseTo(
      plain.tierSpeed.machine * 1.25,
    );
    expect(effectiveRates(ember).tierSpeed.machine).toBe(
      plain.tierSpeed.machine,
    );
    const early = {
      ...openShed(),
      helpers: 10,
      bench: {
        recipe: "blasting-charge" as const,
        startedAt: 5_000,
        endsAt: 5_000 + CHARGE_MS,
      },
    };
    expect(chargeCrewMultiplier(early, 4_999)).toBe(1);
    expect(chargeCrewMultiplier(early, 5_000 + CHARGE_MS)).toBe(1);
    expect(chargeCrewMultiplier({ ...openShed(), helpers: 10 }, 1)).toBe(1);
  });

  it("speeds the crew while axle grease is hot and does not stack a second coat", () => {
    const crew = { ...openShed(), helpers: 0, carts: 4 };
    const plain = effectiveRates(crew, 1).crewPerSecond;
    const started = startCraft(crew, "axle-grease", 0);
    expect(axleCrewMultiplier(started, 1)).toBeCloseTo(2);
    expect(effectiveRates(started, 1).crewPerSecond).toBe(plain * 2);
    expect(effectiveRates(started).crewPerSecond).toBe(plain);
    const fitted = settleBench(started, started.bench?.endsAt ?? 0);
    expect(fitted.axleUntil).toBe(AXLE_MS);
    const again = startCraft(fitted, "axle-grease", 600_000);
    const twice = settleBench(again, again.bench?.endsAt ?? 0);
    expect(craftedLevel(twice, "axle-grease")).toBe(2);
    expect(twice.axleUntil).toBe(600_000 + AXLE_MS);
    expect(axleCrewMultiplier(twice, 600_001)).toBeCloseTo(2);
  });

  it("runs the crew at the strongest timer when grease, a charge, and Overtime overlap", () => {
    const now = 1;
    const cool = { ...openShed(), helpers: 500 };
    const plain = effectiveRates(cool, now);
    expect(plain.crewPerSecond).toBe(500);
    const until = 30 * 60_000;
    const hot = {
      ...cool,
      boosts: { overtime: until },
      chargeUntil: until,
      axleUntil: until,
      upgrades: { tap: 1 },
    };
    const doubled = effectiveRates(hot, now);
    expect(doubled.crewPerSecond).toBe(plain.crewPerSecond * 2);
    expect(doubled.exactCrewPerSecond).toBe(plain.exactCrewPerSecond * 2);
    expect(effectiveRates(hot).crewPerSecond).toBe(plain.crewPerSecond);
    expect(
      effectiveRates({ ...cool, axleUntil: until }, now).crewPerSecond,
    ).toBe(plain.crewPerSecond * 2);
    expect(
      effectiveRates({ ...cool, chargeUntil: until }, now).crewPerSecond,
    ).toBe(plain.crewPerSecond * 2);
    expect(
      effectiveRates({ ...cool, boosts: { overtime: until } }, now)
        .crewPerSecond,
    ).toBe(plain.crewPerSecond * 2);
    // Strong arms reads the unboosted crew, the same rule as Overtime alone.
    expect(doubled.tapYield).toBe(
      effectiveRates({ ...cool, upgrades: { tap: 1 } }, now).tapYield,
    );
    expect(doubled.tapYield).toBe(9);
    const stronger = withFactors(
      { "recipe.blasting-charge.strength": 2 },
      () => effectiveRates(hot, now).crewPerSecond,
    );
    expect(stronger).toBe(plain.crewPerSecond * 3);
  });

  it("does not come out ahead by cancelling a live timer and starting it again", () => {
    const crew = {
      ...openShed(),
      helpers: 0,
      carts: 4,
      materials: { ...FULL, iron: 40 },
    };
    const horizon = AXLE_MS;
    const kept = accrue({
      mountain: startCraft(crew, "axle-grease", 0),
      from: 0,
      to: horizon,
      live: true,
    });
    const halfway = 5 * 60_000;
    const mid = accrue({
      mountain: startCraft(crew, "axle-grease", 0),
      from: 0,
      to: halfway,
      live: true,
    });
    const cancelled = cancelCraft(mid.mountain, halfway);
    expect(axleCrewMultiplier(cancelled, halfway + 1)).toBe(1);
    expect(cancelled.materials?.iron ?? 0).toBeLessThan(40);
    const restarted = startCraft(cancelled, "axle-grease", halfway);
    const again = accrue({
      mountain: restarted,
      from: halfway,
      to: horizon,
      live: true,
    });
    const keptWorth = kept.mined + kept.mountain.pocket;
    const againWorth = mid.mined + again.mined + again.mountain.pocket;
    expect(againWorth).toBeLessThanOrEqual(keptWorth);
    expect(again.mountain.materials?.iron ?? 0).toBeLessThanOrEqual(
      kept.mountain.materials?.iron ?? 0,
    );
  });

  it("refunds only the unused share of a blasting charge", () => {
    const crew = {
      ...openShed(),
      helpers: 4,
      materials: { ...FULL, clay: 20 },
      pocket: 500_000,
    };
    const started = startCraft(crew, "blasting-charge", 0);
    const halfway = 5 * 60_000;
    const cancelled = cancelCraft(started, halfway);
    expect(chargeCrewMultiplier(cancelled, halfway + 1)).toBe(1);
    expect(cancelled.bench).toBeUndefined();
    expect(cancelled.pocket).toBeGreaterThan(crew.pocket - 100_000);
    expect(cancelled.pocket).toBeLessThan(crew.pocket);
    expect(cancelled.materials?.clay ?? 0).toBeGreaterThan(16);
    expect(cancelled.materials?.clay ?? 0).toBeLessThan(20);
  });

  it("refunds the unused share of a flare and an ember", () => {
    const flare = startCraft(
      { ...openShed(), materials: { ...FULL, crystal: 10 } },
      "crystal-flare",
      0,
    );
    const flareBack = cancelCraft(flare, 60_000);
    expect(flareBack.bench).toBeUndefined();
    expect(flareBack.materials?.crystal ?? 0).toBeGreaterThan(6);
    expect(flareBack.materials?.crystal ?? 0).toBeLessThan(10);
    const ember = startCraft(
      {
        ...openShed(),
        helpers: 25,
        machines: 1,
        materials: { ...FULL, heartstone: 10 },
      },
      "heartstone-ember",
      0,
    );
    const emberBack = cancelCraft(ember, 60_000);
    expect(emberBack.bench).toBeUndefined();
    expect(emberBack.materials?.heartstone ?? 0).toBeGreaterThan(8);
    expect(emberBack.materials?.heartstone ?? 0).toBeLessThan(10);
  });

  it("changes the crew the gear names, and stays quiet when nothing is fitted", () => {
    const shed = openShed();
    const plain = effectiveRates(shed);
    const stocked = effectiveRates({
      ...shed,
      materials: { clay: 1, iron: 1, crystal: 1, heartstone: 1 },
      crafted: {},
    });
    expect(stocked).toEqual(plain);
    const factors = Object.fromEntries(
      RECIPE_IDS.flatMap((id) => [
        [`recipe.${id}.strength`, 1],
        [`recipe.${id}.cost`, 1],
      ]),
    );
    expect(withFactors(factors, () => effectiveRates(shed))).toEqual(plain);
    const rails = { ...shed, crafted: { "iron-rails": 1 } };
    expect(effectiveRates(rails).tierSpeed.cart).toBeCloseTo(
      plain.tierSpeed.cart * 1.25,
    );
    expect(
      gearMultiplier({ ...shed, crafted: { "iron-rails": 9 } }, "cart"),
    ).toBeCloseTo(1.25 ** 2);
    expect(
      effectiveRates({ ...shed, crafted: { "diamond-bits": 1 } }).tierSpeed
        .drill,
    ).toBeCloseTo(plain.tierSpeed.drill * 1.25);
    expect(
      effectiveRates({ ...shed, crafted: { "heartstone-core": 1 } }).tierSpeed
        .machine,
    ).toBeCloseTo(plain.tierSpeed.machine * 1.1);
    const emberHot = { ...shed, emberUntil: 500, helpers: 25, machines: 1 };
    expect(effectiveRates(emberHot, 100).tierSpeed.machine).toBeCloseTo(
      effectiveRates({ ...shed, helpers: 25, machines: 1 }, 100).tierSpeed
        .machine * 1.25,
    );
    expect(effectiveRates(emberHot).tierSpeed.machine).toBe(
      effectiveRates({ ...shed, helpers: 25, machines: 1 }).tierSpeed.machine,
    );
    const pit = { ...shed, borers: 1 };
    const open = nextTrouble(1, 0, pit);
    const propped = nextTrouble(1, 0, {
      ...pit,
      crafted: { "sturdy-props": 1 },
    });
    expect(propped?.gapMs).toBeCloseTo((open?.gapMs ?? 0) / 0.7);
    expect(troubleGapScale(shed)).toBe(1);
    expect(veinOftenScale(shed)).toBe(1);
    expect(veinOftenScale({ crafted: { "crystal-lamp": 1 } })).toBeCloseTo(
      1.25,
    );
    expect(veinOftenScale({ crafted: { "crystal-flare": 40 } })).toBe(1);
    expect(
      veinOftenScale(
        { crafted: { "crystal-flare": 40 }, flareUntil: 5_000 },
        1,
      ),
    ).toBeCloseTo(1.25);
    expect(
      veinOftenScale({ crafted: { "crystal-flare": 1 }, flareUntil: 5_000 }, 1),
    ).toBeCloseTo(1.25);
    const hour = 3_600_000;
    expect(expeditionAwayMs(hour, {})).toBe(hour);
    expect(expeditionAwayMs(hour, { crafted: { "engineers-kit": 1 } })).toBe(
      hour * 0.8,
    );
    const doubled = withFactors({ "recipe.iron-rails.strength": 2 }, () =>
      gearMultiplier({ ...shed, crafted: { "iron-rails": 1 } }, "cart"),
    );
    expect(doubled).toBeCloseTo(1.5);
    expect(
      withFactors({ "recipe.iron-rails.cost": 2 }, () =>
        recipeCost("iron-rails"),
      ),
    ).toMatchObject({ stones: 1_000_000, materials: { iron: 8 } });
    expect(
      withFactors({ "recipe.sturdy-props.strength": 10 }, () =>
        troubleGapScale({ crafted: { "sturdy-props": 1 } }),
      ),
    ).toBeCloseTo(20);
    expect(
      withFactors({ "recipe.engineers-kit.strength": 10 }, () =>
        expeditionCraftScale({ crafted: { "engineers-kit": 1 } }),
      ),
    ).toBeCloseTo(0.1);
  });

  it("puts Reinforce on the tier after the highest machine you already run", () => {
    const level = { crafted: { reinforce: 2 } };
    expect(gearMultiplier({ ...openShed(), ...level }, "drill")).toBe(1);
    expect(
      gearMultiplier({ ...openShed(), carts: 1, ...level }, "drill"),
    ).toBeCloseTo(1.05 ** 2);
    expect(gearMultiplier({ ...openShed(), carts: 1, ...level }, "cart")).toBe(
      1,
    );
    expect(
      gearMultiplier({ ...openShed(), drills: 1, ...level }, "borer"),
    ).toBeCloseTo(1.05 ** 2);
    expect(
      gearMultiplier({ ...openShed(), borers: 1, ...level }, "machine"),
    ).toBeCloseTo(1.05 ** 2);
    expect(
      gearMultiplier(
        { ...openShed(), machines: 1, borers: 0, ...level },
        "machine",
      ),
    ).toBeCloseTo(1.05 ** 2);
    expect(gearMultiplier({ ...openShed(), carts: 1 }, "drill")).toBe(1);
    expect(
      gearMultiplier(
        { ...openShed(), machines: 1, crafted: { reinforce: 9 } },
        "machine",
      ),
    ).toBeCloseTo(1.05 ** 5);
  });

  it("refreshes a flare and an ember instead of stacking them", () => {
    const flare = settleBench(
      startCraft(openShed(), "crystal-flare", 0),
      600_000,
    );
    expect(flare.flareUntil).toBe(3_600_000);
    const flareAgain = startCraft(flare, "crystal-flare", 600_000);
    const flareSecond = settleBench(flareAgain, flareAgain.bench?.endsAt ?? 0);
    expect(flareSecond.flareUntil).toBe(600_000 + 3_600_000);
    expect(flareSecond.crafted?.["crystal-flare"]).toBe(2);
    expect(
      veinOftenScale(flareSecond, (flareSecond.flareUntil ?? 1) - 1),
    ).toBeCloseTo(1.25);
    expect(veinOftenScale({ flareUntil: 5 }, 5)).toBe(1);
    const ember = settleBench(
      startCraft(openShed(), "heartstone-ember", 0),
      600_000,
    );
    const emberAgain = startCraft(ember, "heartstone-ember", 600_000);
    const emberSecond = settleBench(emberAgain, emberAgain.bench?.endsAt ?? 0);
    expect(emberSecond.emberUntil).toBe(600_000 + CHARGE_MS);
    expect(emberSecond.emberUntil).not.toBe(
      (ember.emberUntil ?? 0) + CHARGE_MS,
    );
    const stretched = withFactors(
      { "recipe.crystal-flare.strength": 2 },
      () => {
        const started = startCraft(openShed(), "crystal-flare", 0);
        const done = settleBench(started, started.bench?.endsAt ?? 0);
        return {
          until: done.flareUntil,
          veins: veinOftenScale(done, (done.flareUntil ?? 1) - 1),
        };
      },
    );
    expect(stretched.until).toBe(2 * 3_600_000);
    expect(stretched.veins).toBeCloseTo(1.5);
  });

  it("keeps output under a ceiling after many repeatable crafts", () => {
    const rich = {
      clay: 10_000,
      iron: 10_000,
      crystal: 10_000,
      heartstone: 10_000,
    };
    const crew = openShed({
      pocket: 400_000_000,
      materials: rich,
      helpers: 25,
      machines: 1,
    });
    let mountain = crew;
    let clock = 1_000_000;
    const spam = (id: RecipeId, times: number) => {
      for (let n = 0; n < times; n += 1) {
        const started = startCraft(mountain, id, clock);
        if (started.bench === undefined) {
          return;
        }
        clock = started.bench.endsAt;
        mountain = settleBench(started, clock);
      }
    };
    spam("blasting-charge", 30);
    spam("reinforce", 30);
    spam("crystal-flare", 30);
    spam("heartstone-ember", 30);
    spam("crystal-flare", 1);
    spam("heartstone-ember", 1);
    spam("blasting-charge", 1);
    const bare = effectiveRates(crew, clock).crewPerSecond;
    const live = effectiveRates(mountain, clock);
    const away = effectiveRates(mountain);
    const capped: Mountain = {
      ...crew,
      crafted: { reinforce: 5 },
      ...(mountain.chargeUntil === undefined
        ? {}
        : { chargeUntil: mountain.chargeUntil }),
      ...(mountain.flareUntil === undefined
        ? {}
        : { flareUntil: mountain.flareUntil }),
      ...(mountain.emberUntil === undefined
        ? {}
        : { emberUntil: mountain.emberUntil }),
    };
    expect(craftedLevel(mountain, "reinforce")).toBe(5);
    expect(craftedLevel(mountain, "crystal-flare")).toBeGreaterThan(5);
    expect(craftedLevel(mountain, "heartstone-ember")).toBeGreaterThan(5);
    expect(live.crewPerSecond).toBe(
      effectiveRates(capped, clock).crewPerSecond,
    );
    expect(live.crewPerSecond).toBeGreaterThan(away.crewPerSecond);
    expect(live.crewPerSecond).toBeLessThan(bare * 4);
    expect(away.crewPerSecond).toBeLessThan(bare * 2);
    expect(away.crewPerSecond).toBe(effectiveRates(capped).crewPerSecond);
    expect(reinforceTier(capped)).toBe("machine");
    expect(
      reinforceTier({ ...capped, machines: 0, borers: 0, drills: 1 }),
    ).toBe("borer");
    expect(
      reinforceTier({
        ...capped,
        machines: 0,
        borers: 0,
        drills: 0,
        carts: 1,
      }),
    ).toBe("drill");
    expect(
      reinforceTier({
        ...capped,
        machines: 0,
        borers: 0,
        drills: 0,
        carts: 0,
      }),
    ).toBeUndefined();
    expect(recipeWindowMs("iron-rails")).toBeUndefined();
    expect(recipeWindowMs("blasting-charge")).toBe(CHARGE_MS);
    expect(hotTimers(capped, 1.5)).toEqual([]);
    expect(hotTimers(capped, -1)).toEqual([]);
    expect(veinOftenScale(mountain, clock)).toBeCloseTo(
      veinOftenScale(capped, clock),
    );
    expect(
      accrueAway({ mountain, lastSeen: clock - 5_000, now: clock }).mined,
    ).toBe(
      accrueAway({
        mountain: capped,
        lastSeen: clock - 5_000,
        now: clock,
      }).mined,
    );
  });

  it("names the refund and the hot timers", () => {
    expect(cancelRefund(openShed(), 1)).toBeUndefined();
    const props = startCraft(openShed(), "sturdy-props", 1_000);
    expect(cancelRefund(props, 1_000)).toEqual({
      stones: 250_000,
      materials: { clay: 10, iron: 4, crystal: 0, heartstone: 0 },
    });
    expect(cancelRefund(props, props.bench?.endsAt ?? 0)?.stones).toBe(0);
    const charge = startCraft(openShed(), "blasting-charge", 0);
    const halfway = cancelRefund(charge, 5 * 60_000);
    expect(halfway?.stones).toBe(75_000);
    expect(halfway?.materials.clay).toBe(3);
    const early = cancelRefund(charge, -5);
    expect(early?.stones).toBe(100_000);
    const stored = openShed({
      chargeUntil: 50_000,
      axleUntil: 40_000,
      flareUntil: 30_000,
      emberUntil: 20_000,
      bench: {
        recipe: "blasting-charge",
        startedAt: 0,
        endsAt: 600_000,
      },
    });
    expect(hotTimers(stored, 1_000).map((timer) => timer.id)).toEqual([
      "blasting-charge",
      "axle-grease",
      "crystal-flare",
      "heartstone-ember",
    ]);
    const chargeTimer = hotTimers(stored, 1_000).find(
      (timer) => timer.id === "blasting-charge",
    );
    expect(chargeTimer?.until).toBe(CHARGE_MS);
    expect(hotTimers(openShed(), 1_000)).toEqual([]);
    const future = openShed({
      bench: {
        recipe: "axle-grease",
        startedAt: 10_000,
        endsAt: 610_000,
      },
    });
    expect(hotTimers(future, 1_000)).toEqual([]);
    const done = openShed({ axleUntil: 500 });
    expect(hotTimers(done, 500)).toEqual([]);
    const longer = openShed({
      chargeUntil: 9_999_999,
      bench: {
        recipe: "blasting-charge",
        startedAt: 0,
        endsAt: 600_000,
      },
    });
    expect(
      hotTimers(longer, 1_000).find((timer) => timer.id === "blasting-charge")
        ?.until,
    ).toBe(9_999_999);
    const cooled = withFactors({ "recipe.crystal-flare.strength": 0.01 }, () =>
      hotTimers(
        openShed({
          bench: {
            recipe: "crystal-flare",
            startedAt: 0,
            endsAt: 600_000,
          },
        }),
        60_000,
      ),
    );
    expect(cooled).toEqual([]);
  });
});
