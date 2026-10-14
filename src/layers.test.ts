import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import {
  EMPTY_MATERIALS,
  LAYERS,
  MATERIAL_EVERY,
  MAX_MATERIAL,
  addMaterials,
  hardnessFactorId,
  hardnessOf,
  layerOf,
  materialsFromMined,
  materialsGained,
  type LayerId,
  type MaterialId,
} from "./layers";
import { MOUNTAIN_STONES } from "./scale";
import { parseSaveValue } from "./persist";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import { TIERS } from "./tiers";

/** The design table, written out here so the module cannot drift from it. */
const BANDS = [
  {
    id: "topsoil",
    index: 1,
    name: "The Topsoil",
    from: 0,
    until: 10_000_000,
    material: "clay",
  },
  {
    id: "granite",
    index: 2,
    name: "The Granite",
    from: 10_000_000,
    until: 45_000_000,
    material: "iron",
  },
  {
    id: "crystal",
    index: 3,
    name: "The Crystal Caves",
    from: 45_000_000,
    until: 120_000_000,
    material: "crystal",
  },
  {
    id: "heart",
    index: 4,
    name: "The Deep Heart",
    from: 120_000_000,
    until: MOUNTAIN_STONES,
    material: "heartstone",
  },
] as const satisfies readonly {
  readonly id: LayerId;
  readonly index: 1 | 2 | 3 | 4;
  readonly name: string;
  readonly from: number;
  readonly until: number;
  readonly material: MaterialId;
}[];

const listSpeed = Object.fromEntries(
  TIERS.map((tier) => [tier.id, tier.perSecond]),
);

describe("layers", () => {
  it("names four bands, and each one starts where the last one ends", () => {
    expect(LAYERS.map((layer) => layer.id)).toEqual(
      BANDS.map((band) => band.id),
    );
    for (const [index, band] of BANDS.entries()) {
      const layer = LAYERS[index];
      if (layer === undefined) {
        throw new Error(`Missing band ${band.id}`);
      }
      expect(layer).toEqual({
        id: band.id,
        index: band.index,
        name: band.name,
        from: band.from,
        material: band.material,
      });
      const next = BANDS[index + 1];
      expect(next === undefined ? MOUNTAIN_STONES : next.from).toBe(band.until);
    }
  });

  it("steps into the next band at each edge, and stays there just above", () => {
    expect(layerOf(minedMountain(-1)).id).toBe("topsoil");
    for (const [index, band] of BANDS.entries()) {
      const previous = BANDS[index - 1];
      if (previous !== undefined) {
        expect(layerOf(minedMountain(band.from - 1)).id).toBe(previous.id);
      }
      expect(layerOf(minedMountain(band.from)).id).toBe(band.id);
      expect(layerOf(minedMountain(band.from + 1)).id).toBe(band.id);
      expect(layerOf(minedMountain(band.until - 1)).id).toBe(band.id);
    }
    expect(layerOf(minedMountain(MOUNTAIN_STONES)).id).toBe("heart");
    expect(layerOf(minedMountain(MOUNTAIN_STONES + 1)).id).toBe("heart");
  });

  it("keeps bare hands at 1 and shifts the machines with the rock", () => {
    for (const stones of [-1, 0, 1, 10_000_000 - 1]) {
      expect(effectiveRates(minedMountain(stones)).tierSpeed).toEqual(
        listSpeed,
      );
    }
    const granite = effectiveRates(minedMountain(10_000_000)).tierSpeed;
    expect(granite.helper).toBe(1);
    expect(granite.kid).toBe(1);
    expect(granite.cart).toBeCloseTo(8.5);
    expect(granite.drill).toBeCloseTo(67.2);
    expect(granite.borer).toBe(595);
    expect(granite.machine).toBe(3_500);
    const crystal = effectiveRates(minedMountain(45_000_000)).tierSpeed;
    expect(crystal.helper).toBe(1);
    expect(crystal.cart).toBe(10);
    expect(crystal.drill).toBeCloseTo(52.8);
    expect(crystal.borer).toBeCloseTo(654.5);
    expect(crystal.machine).toBe(3_500);
    const heart = effectiveRates(minedMountain(120_000_000)).tierSpeed;
    expect(heart.helper).toBe(1);
    expect(heart.kid).toBe(1);
    expect(heart.cart).toBeCloseTo(9);
    expect(heart.drill).toBeCloseTo(54);
    expect(heart.borer).toBeCloseTo(535.5);
    expect(heart.machine).toBe(3_500);
    expect(hardnessOf(2, "helper")).toBe(1);
    expect(hardnessOf(4, "kid")).toBe(1);
    expect(hardnessOf(4, "machine")).toBe(1);
  });

  it("scales one tier in the current band and leaves the other bands at 1", () => {
    const mountain = {
      ...minedMountain(45_000_000),
      helpers: 3,
      carts: 1,
      drills: 1,
    };
    expect(layerOf(mountain).id).toBe("crystal");
    const plain = effectiveRates(mountain);
    expect(plain.tierSpeed.drill).toBeCloseTo(52.8);
    const harder = withFactors({ [hardnessFactorId(3, "drill")]: 0.85 }, () =>
      effectiveRates(mountain),
    );
    expect(harder.tierSpeed.drill).toBeCloseTo(52.8 * 0.85, 8);
    expect(harder.tierSpeed.cart).toBe(plain.tierSpeed.cart);
    expect(harder.tierSpeed.helper).toBe(plain.tierSpeed.helper);
    const otherBand = withFactors(
      { [hardnessFactorId(2, "drill")]: 0.85 },
      () => effectiveRates(mountain),
    );
    expect(otherBand.tierSpeed).toEqual(plain.tierSpeed);
    const restored = effectiveRates(mountain);
    expect(restored.tierSpeed).toEqual(plain.tierSpeed);
  });

  it("reads the band from stones already mined, and stores nothing", () => {
    const mountain = minedMountain(10_000_000);
    expect(layerOf(mountain).id).toBe("granite");
    expect(mountain).not.toHaveProperty("layer");

    const grid = {
      width: 3,
      height: 3,
      cells: Array.from({ length: 9 }, () => ({ kind: "covered" })),
    };
    const fresh = parseSaveValue({ version: 1, grid });
    const gridSave = parseSaveValue({ version: 2, grid, lastSeen: 1 });
    const scaled = parseSaveValue({
      version: 3,
      mountain: { remaining: 900_000, pocket: 0, helpers: 0 },
      lastSeen: 1,
    });
    const deepened = parseSaveValue({
      version: 4,
      mountain: { remaining: 90_000_000, pocket: 0, helpers: 0 },
      lastSeen: 1,
    });
    const current = parseSaveValue({
      version: 5,
      mountain,
      lastSeen: 1,
    });
    if (
      fresh === undefined ||
      gridSave === undefined ||
      scaled === undefined ||
      deepened === undefined ||
      current === undefined
    ) {
      throw new Error("an older save did not load");
    }
    expect(layerOf(fresh.mountain).id).toBe("topsoil");
    expect(layerOf(gridSave.mountain).id).toBe("topsoil");
    expect(layerOf(scaled.mountain).id).toBe("granite");
    expect(layerOf(deepened.mountain).id).toBe("granite");
    expect(layerOf(current.mountain).id).toBe("granite");
    for (const save of [fresh, gridSave, scaled, deepened, current]) {
      expect(save.mountain).not.toHaveProperty("layer");
    }
  });
});

describe("materials", () => {
  it("tunes the gap so fixed recipes can absorb clay, crystal, and heartstone", () => {
    expect(MATERIAL_EVERY).toEqual({
      clay: 1_000_000,
      iron: 250_000,
      crystal: 4_000_000,
      heartstone: 8_000_000,
    });
    expect(MATERIAL_EVERY.crystal).toBeGreaterThan(MATERIAL_EVERY.iron);
    expect(MATERIAL_EVERY.heartstone).toBeGreaterThan(MATERIAL_EVERY.crystal);
    expect(MAX_MATERIAL).toEqual({
      clay: 10_000_000,
      iron: 35_000_000,
      crystal: 75_000_000,
      heartstone: 120_000_000,
    });
  });

  it("grants one unit per gap in that band, and keeps the remainder", () => {
    expect(materialsFromMined(0)).toEqual(EMPTY_MATERIALS);
    expect(materialsFromMined(-1)).toEqual(EMPTY_MATERIALS);
    expect(materialsFromMined(999_999)).toEqual(EMPTY_MATERIALS);
    expect(materialsFromMined(1_000_000)).toEqual({
      ...EMPTY_MATERIALS,
      clay: 1,
    });
    expect(materialsFromMined(10_000_000)).toEqual({
      ...EMPTY_MATERIALS,
      clay: 10,
    });
    expect(materialsFromMined(10_000_000 + 249_999)).toEqual({
      clay: 10,
      iron: 0,
      crystal: 0,
      heartstone: 0,
    });
    expect(materialsFromMined(12_000_000)).toEqual({
      clay: 10,
      iron: 8,
      crystal: 0,
      heartstone: 0,
    });
    expect(materialsFromMined(45_000_000)).toEqual({
      clay: 10,
      iron: 140,
      crystal: 0,
      heartstone: 0,
    });
    expect(materialsFromMined(60_000_000)).toEqual({
      clay: 10,
      iron: 140,
      crystal: 3,
      heartstone: 0,
    });
    expect(materialsFromMined(120_000_000)).toEqual({
      clay: 10,
      iron: 140,
      crystal: 18,
      heartstone: 0,
    });
    expect(materialsFromMined(MOUNTAIN_STONES)).toEqual({
      clay: 10,
      iron: 140,
      crystal: 18,
      heartstone: 15,
    });
  });

  it("adds only the units the new stones crossed, including across a band", () => {
    expect(materialsGained(-5, 1_000_000)).toEqual({
      ...EMPTY_MATERIALS,
      clay: 1,
    });
    expect(materialsGained(1_000_000, 999_000)).toEqual(EMPTY_MATERIALS);
    expect(materialsGained(999_000, 1_000_100)).toEqual({
      ...EMPTY_MATERIALS,
      clay: 1,
    });
    expect(materialsGained(9_999_900, 10_250_000)).toEqual({
      clay: 1,
      iron: 1,
      crystal: 0,
      heartstone: 0,
    });
    expect(addMaterials(undefined, EMPTY_MATERIALS)).toEqual(EMPTY_MATERIALS);
    expect(
      addMaterials(
        { clay: 2, iron: 0, crystal: 0, heartstone: 0 },
        { clay: 1, iron: 4, crystal: 0, heartstone: 0 },
      ),
    ).toEqual({ clay: 3, iron: 4, crystal: 0, heartstone: 0 });
  });
});
