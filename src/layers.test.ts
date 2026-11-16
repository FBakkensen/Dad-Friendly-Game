import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import {
  EMPTY_MATERIALS,
  FAVOURED_SPEED,
  LAYERS,
  LINE_TOUGH,
  ROCK_STAGE_OFF,
  MATERIAL_EVERY,
  hardnessFactorId,
  bandSuits,
  hardnessOf,
  layerFavours,
  layerOf,
  layersEntered,
  materialsFromMined,
  materialsGained,
  materialLeftToDig,
  type LayerId,
  type MaterialId,
} from "./layers";
import { MOUNTAIN_STONES } from "./scale";
import { effectiveRates } from "./rates";
import { minedMountain, reloaded } from "./test-fixtures";

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

  it("uses table A at the line's own tough factor, and keeps hands at 1 (#543)", () => {
    expect(layerFavours(1)).toBeUndefined();
    expect(layerFavours(2)).toEqual({ suits: "borer", tough: "drill" });
    expect(layerFavours(3)).toEqual({ suits: "train", tough: "cart" });
    expect(layerFavours(4)).toEqual({ suits: "machine", tough: "hoist" });
    expect(hardnessOf(2, "drill")).toBe(LINE_TOUGH);
    expect(hardnessOf(2, "borer")).toBe(FAVOURED_SPEED);
    expect(hardnessOf(3, "cart")).toBe(LINE_TOUGH);
    expect(hardnessOf(3, "train")).toBe(FAVOURED_SPEED);
    expect(hardnessOf(3, "borer")).toBe(1);
    expect(hardnessOf(4, "hoist")).toBe(LINE_TOUGH);
    expect(hardnessOf(4, "borer")).toBe(1);
    expect(hardnessOf(4, "machine")).toBe(FAVOURED_SPEED);
    expect(hardnessOf(1, "cart")).toBe(1);
    expect(hardnessOf(2, "helper")).toBe(1);
    expect(hardnessOf(4, "kid")).toBe(1);
  });

  it("slows the tough stage's every machine in the whole-stage form, and suits none (#543)", () => {
    withFactors({ [ROCK_STAGE_OFF]: 0 }, () => {
      for (const tier of ["drill", "borer"] as const) {
        expect(hardnessOf(2, tier)).toBe(LINE_TOUGH);
      }
      for (const tier of ["cart", "train"] as const) {
        expect(hardnessOf(3, tier)).toBe(LINE_TOUGH);
      }
      for (const tier of ["hoist", "machine"] as const) {
        expect(hardnessOf(4, tier)).toBe(LINE_TOUGH);
      }
      expect(hardnessOf(2, "cart")).toBe(1);
      expect(hardnessOf(3, "drill")).toBe(1);
      expect(hardnessOf(4, "helper")).toBe(1);
      expect(hardnessOf(1, "drill")).toBe(1);
    });
    withFactors({ [ROCK_STAGE_OFF]: 0 }, () => {
      expect(bandSuits(2)).toBeUndefined();
      expect(bandSuits(4)).toBeUndefined();
    });
    expect(bandSuits(3)).toBe("train");
    expect(bandSuits(1)).toBeUndefined();
  });

  it("scales one tier in the current band and leaves the other bands at 1", () => {
    const mountain = {
      ...minedMountain(45_000_000),
      owned: {
        ...minedMountain(45_000_000).owned,
        helper: 3,
        cart: 1,
        drill: 1,
      },
    };
    expect(layerOf(mountain).id).toBe("crystal");
    const plain = effectiveRates(mountain);
    const harder = withFactors({ [hardnessFactorId(3, "drill")]: 0.85 }, () =>
      effectiveRates(mountain),
    );
    expect(harder.tierSpeed.drill).toBeCloseTo(plain.tierSpeed.drill * 0.85, 8);
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

    const loaded = reloaded(mountain);
    expect(loaded === undefined ? undefined : layerOf(loaded).id).toBe(
      "granite",
    );
    expect(loaded).not.toHaveProperty("layer");
  });
});

describe("materials", () => {
  it("tunes the gap so fixed recipes can absorb clay, crystal, and heartstone", () => {
    expect(MATERIAL_EVERY).toEqual({
      clay: 1_000_000,
      iron: 1_000_000,
      crystal: 5_000_000,
      heartstone: 10_000_000,
    });
    expect(MATERIAL_EVERY.crystal).toBeGreaterThan(MATERIAL_EVERY.iron);
    expect(MATERIAL_EVERY.heartstone).toBeGreaterThan(MATERIAL_EVERY.crystal);
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
    expect(materialsFromMined(10_000_000 + 999_999)).toEqual({
      clay: 10,
      iron: 0,
      crystal: 0,
      heartstone: 0,
    });
    expect(materialsFromMined(12_000_000)).toEqual({
      clay: 10,
      iron: 2,
      crystal: 0,
      heartstone: 0,
    });
    expect(materialsFromMined(45_000_000)).toEqual({
      clay: 10,
      iron: 35,
      crystal: 0,
      heartstone: 0,
    });
    expect(materialsFromMined(60_000_000)).toEqual({
      clay: 10,
      iron: 35,
      crystal: 3,
      heartstone: 0,
    });
    expect(materialsFromMined(120_000_000)).toEqual({
      clay: 10,
      iron: 35,
      crystal: 15,
      heartstone: 0,
    });
    expect(materialsFromMined(MOUNTAIN_STONES)).toEqual({
      clay: 10,
      iron: 35,
      crystal: 15,
      heartstone: 12,
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
    expect(materialsGained(9_999_900, 11_000_000)).toEqual({
      clay: 1,
      iron: 1,
      crystal: 0,
      heartstone: 0,
    });
  });
});

describe("what the rest of the mountain still gives (#492)", () => {
  it("counts the clay still in the Topsoil, and none once the Granite starts", () => {
    expect(materialLeftToDig("clay", 0)).toBe(10);
    expect(materialLeftToDig("clay", 4_000_000)).toBe(6);
    expect(materialLeftToDig("clay", 9_500_000)).toBe(1);
    expect(materialLeftToDig("clay", 9_999_999)).toBe(1);
    expect(materialLeftToDig("clay", 10_000_000)).toBe(0);
    expect(materialLeftToDig("clay", 50_000_000)).toBe(0);
  });

  it("keeps a deeper band's material whole until that band is dug", () => {
    const all = materialsFromMined(MOUNTAIN_STONES);
    for (const material of ["iron", "crystal", "heartstone"] as const) {
      expect(materialLeftToDig(material, 0)).toBe(all[material]);
      expect(materialLeftToDig(material, MOUNTAIN_STONES)).toBe(0);
    }
    expect(materialLeftToDig("iron", LAYERS[2].from)).toBe(0);
    expect(materialLeftToDig("iron", LAYERS[2].from - 1)).toBe(1);
    expect(materialLeftToDig("heartstone", LAYERS[3].from)).toBe(
      all.heartstone,
    );
  });

  it("never goes below none, past the bottom or before the top", () => {
    expect(materialLeftToDig("heartstone", MOUNTAIN_STONES + 1)).toBe(0);
    expect(materialLeftToDig("clay", -5)).toBe(10);
  });
});

describe("breaking into a band", () => {
  it("announces each break-in once, and skips the Topsoil", () => {
    expect(layersEntered(0, 0)).toEqual([]);
    expect(layersEntered(5, 4)).toEqual([]);
    expect(layersEntered(0, 9_999_999).map((layer) => layer.id)).toEqual([]);
    expect(
      layersEntered(9_999_999, 10_000_000).map((layer) => layer.id),
    ).toEqual(["granite"]);
    expect(
      layersEntered(10_000_000, 44_999_999).map((layer) => layer.id),
    ).toEqual([]);
    expect(layersEntered(0, 120_000_000).map((layer) => layer.id)).toEqual([
      "granite",
      "crystal",
      "heart",
    ]);
  });
});
