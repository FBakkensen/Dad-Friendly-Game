import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import {
  LAYERS,
  hardnessFactorId,
  layerOf,
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

  it("keeps today's tier speeds in every band while hardness is 1", () => {
    const mined = [
      -1,
      0,
      1,
      10_000_000 - 1,
      10_000_000,
      10_000_000 + 1,
      45_000_000 - 1,
      45_000_000,
      45_000_000 + 1,
      120_000_000 - 1,
      120_000_000,
      120_000_000 + 1,
      MOUNTAIN_STONES - 1,
      MOUNTAIN_STONES,
      MOUNTAIN_STONES + 1,
    ];
    for (const stones of mined) {
      expect(effectiveRates(minedMountain(stones)).tierSpeed).toEqual(
        listSpeed,
      );
    }
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
    expect(plain.tierSpeed.drill).toBe(60);
    const harder = withFactors({ [hardnessFactorId(3, "drill")]: 0.85 }, () =>
      effectiveRates(mountain),
    );
    expect(harder.tierSpeed.drill).toBeCloseTo(51, 8);
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
    expect(mountain).not.toHaveProperty("materials");

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
