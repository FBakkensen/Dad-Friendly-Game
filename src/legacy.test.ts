import { describe, expect, it } from "vitest";
import { LEGACY_STEP, legacyBonus, passTheMine } from "./legacy";
import {
  MOUNTAIN_STONES,
  createMountain,
  parseMountain,
  type Mountain,
} from "./mountain";
import { effectiveRates } from "./rates";
import { hasRelic } from "./relics";
import { minedMountain } from "./test-fixtures";

const bottom: Mountain = {
  ...minedMountain(MOUNTAIN_STONES),
  pocket: 123_456,
  helpers: 400,
  carts: 50,
  drills: 20,
  borers: 5,
  machines: 2,
  kids: 7,
  upgrades: { tap: 3, boots: 1 },
  boosts: { overtime: 9_999_999 },
  startedAt: 1_000,
  staffed: true,
};

describe("legacy bonus", () => {
  it("is 1 + 0.5 × legacies", () => {
    expect(LEGACY_STEP).toBe(0.5);
    expect(legacyBonus(createMountain())).toBe(1);
    expect(legacyBonus({ ...createMountain(), legacy: 1 })).toBe(1.5);
    expect(legacyBonus({ ...createMountain(), legacy: 2 })).toBe(2);
  });

  it("speeds up the crew and every tap, but not the away pay share", () => {
    const crew = {
      ...createMountain(),
      helpers: 100,
      carts: 10,
      upgrades: { tap: 5 },
    };
    const plain = effectiveRates(crew);
    const heir = effectiveRates({ ...crew, legacy: 2 });
    expect(heir.crewPerSecond).toBe(plain.crewPerSecond * 2);
    expect(heir.tierSpeed.cart).toBe(plain.tierSpeed.cart * 2);
    expect(heir.tapYield).toBe(plain.tapYield * 2);
    expect(heir.awayPay).toBe(plain.awayPay);
    expect(effectiveRates({ ...createMountain(), legacy: 1 }).tapYield).toBe(1);
  });
});

describe("passing the mine to your kid", () => {
  it("is only possible at the bottom, with the Mantle found", () => {
    expect(passTheMine(minedMountain(99_999_999), 5_000)).toBeUndefined();
    expect(hasRelic(bottom, "mantle")).toBe(true);
  });

  it("starts a fresh mountain, keeps the Legacy (+1) and starts a newer run", () => {
    const next = passTheMine(bottom, 5_000);
    expect(next).toEqual({ ...createMountain(), legacy: 1, startedAt: 5_000 });
    const again = passTheMine({ ...bottom, legacy: 1 }, 6_000);
    expect(again?.legacy).toBe(2);
  });

  it("never lets a run start before the one it replaces", () => {
    expect(passTheMine(bottom, 500)?.startedAt).toBe(1_001);
  });

  it("keeps the recipes and clears materials, the bench, and crafted gear", () => {
    const parent = {
      ...bottom,
      materials: { clay: 9, iron: 8, crystal: 7, heartstone: 6 },
      bench: {
        recipe: "heartstone-core" as const,
        startedAt: 1,
        endsAt: 2,
      },
      crafted: { "diamond-bits": 2 },
      chargeUntil: 9_000,
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "diamond-bits",
        "crystal-lamp",
        "heartstone-core",
      ] as const,
    };
    const next = passTheMine(parent, 5_000);
    expect(next?.recipes).toEqual([...parent.recipes]);
    expect(next?.materials).toEqual({
      clay: 0,
      iron: 0,
      crystal: 0,
      heartstone: 0,
    });
    expect(next?.bench).toBeUndefined();
    expect(next?.crafted).toBeUndefined();
    expect(next?.chargeUntil).toBeUndefined();
    expect(next?.legacy).toBe(1);
    const { recipes, ...bare } = bottom;
    expect(passTheMine(bare, 5_000)?.recipes).toEqual(
      passTheMine(bottom, 5_000)?.recipes,
    );
    expect(recipes).toEqual(passTheMine(bare, 5_000)?.recipes);
  });
});

describe("legacy in the save", () => {
  it("reads old saves as no Legacy and keeps a saved one", () => {
    expect(parseMountain(createMountain())?.legacy).toBeUndefined();
    expect(
      legacyBonus(parseMountain(createMountain()) ?? createMountain()),
    ).toBe(1);
    expect(parseMountain({ ...createMountain(), legacy: 3 })?.legacy).toBe(3);
  });

  it("rejects a bad Legacy", () => {
    for (const legacy of [-1, 1.5, "2", 1001]) {
      expect(parseMountain({ ...createMountain(), legacy })).toBeUndefined();
    }
  });

  it("doesn't write legacy: 0", () => {
    expect(
      parseMountain({ ...createMountain(), legacy: 0 }),
    ).not.toHaveProperty("legacy");
  });
});
