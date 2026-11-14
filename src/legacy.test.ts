import { describe, expect, it } from "vitest";
import { kidStretch } from "./scale";
import { LEGACY_STEP, legacyBonus, passTheMine } from "./legacy";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { writeGame } from "./save-format";
import { gameOf } from "./test-fixtures";
import { effectiveRates } from "./rates";
import { hasRelic } from "./relics";
import { minedMountain } from "./test-fixtures";
import { NOTHING_CRAFTED, COLD_CLOCKS } from "./workshop";
import { NO_BOOSTS } from "./boosts";
import { NO_UPGRADES } from "./upgrades";

const bottom: Mountain = {
  ...minedMountain(MOUNTAIN_STONES),
  pocket: 123_456,
  helpers: 400,
  carts: 50,
  drills: 20,
  borers: 5,
  machines: 2,
  kids: 7,
  upgrades: { ...NO_UPGRADES, tap: 3, boots: 1 },
  boosts: { ...NO_BOOSTS, overtime: 9_999_999 },
  startedAt: 1_000,
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
      // No machines: Grandpa (#338) has nothing to tend, so this compares
      // the Legacy alone. A cart's own speed still shows the Legacy.
      upgrades: { ...NO_UPGRADES, tap: 5 },
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
    expect(next).toEqual({
      ...createMountain(),
      legacy: 1,
      stretch: kidStretch(1),
      startedAt: 5_000,
    });
    const again = passTheMine({ ...bottom, legacy: 1 }, 6_000);
    expect(again?.legacy).toBe(2);
    expect(again?.stretch).toBe(kidStretch(2));
  });

  it("carries what the dad was already shown and taught", () => {
    const next = passTheMine(
      { ...bottom, seen: ["workshop"], taught: ["workshop"] },
      5_000,
    );
    expect(next?.seen).toEqual(["workshop"]);
    expect(next?.taught).toEqual(["workshop"]);
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
      crafted: { ...NOTHING_CRAFTED, "diamond-bits": 2 },
      clocks: {
        ...COLD_CLOCKS,
        "blasting-charge": 9_000,
        "crystal-flare": 9_001,
        "heartstone-ember": 9_002,
      },
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
    expect(next?.crafted).toEqual(NOTHING_CRAFTED);
    expect(next?.clocks).toEqual(COLD_CLOCKS);
    expect(next?.legacy).toBe(1);
  });
});

describe("legacy in the save", () => {
  it("reads a save without a generation as no Legacy, and keeps a saved one", () => {
    expect(gameOf({})?.legacy).toBe(0);
    expect(legacyBonus(gameOf({}) ?? createMountain())).toBe(1);
    expect(gameOf({ run: { generation: 3 } })?.legacy).toBe(3);
  });

  it("rejects a bad Legacy", () => {
    for (const generation of [-1, 1.5, "2", 1001]) {
      expect(gameOf({ run: { generation } })).toBeUndefined();
    }
  });

  it("doesn't write a generation of 0", () => {
    expect(writeGame(createMountain()).run).toBeUndefined();
    expect(writeGame({ ...createMountain(), legacy: 2 }).run).toEqual({
      generation: 2,
    });
  });
});
