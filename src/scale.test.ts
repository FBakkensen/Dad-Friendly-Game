import { priceAmount } from "./stock";
import { describe, expect, it } from "vitest";
import { ENGINEER_NAMES, PROMOTE_BASE_COST, promoteCost } from "./engineers";
import { createMountain, MOUNTAIN_STONES, type Mountain } from "./mountain";
import { withFactors } from "./economy/factors";
import {
  BAND_SCALE,
  BAND_STARTS,
  depthAfterStones,
  minedOut,
  oneOffStretch,
  shownStones,
  stonesLeft,
} from "./scale";
import { minedMountain } from "./test-fixtures";
import { TIERS, tierCost } from "./tiers";
import { UPGRADES, buyUpgrade, upgradeById, upgradeCost } from "./upgrades";
import { RECIPE_IDS, recipePrice } from "./workshop";

describe("the mountain's size (M13, #729)", () => {
  it("counts the stones band by band, and a fresh mine never runs out (#653)", () => {
    expect(stonesLeft()).toBe(Infinity);
    expect(shownStones(7_000_000)).toBe(7_000_000);
  });
});

describe("band scales (#356)", () => {
  const M = 1_000_000;
  const at10 = 10 * M * BAND_SCALE[0];
  const at45 = at10 + 35 * M * BAND_SCALE[1];
  const at120 = at45 + 75 * M * BAND_SCALE[2];
  const full = at120 + (MOUNTAIN_STONES - 120 * M) * BAND_SCALE[3];

  it("counts stones band by band", () => {
    expect(shownStones(10 * M)).toBe(at10);
    expect(shownStones(45 * M)).toBe(at45);
    expect(shownStones(MOUNTAIN_STONES)).toBe(full);
  });

  it("walks bands when digging", () => {
    const m = minedMountain(9 * M);
    expect(
      depthAfterStones(m, 1 * M * BAND_SCALE[0] + 3 * M * BAND_SCALE[1]),
    ).toBe(13 * M);
    expect(depthAfterStones(m, shownStones(MOUNTAIN_STONES) * 2)).toBe(
      MOUNTAIN_STONES,
    );
  });
});

describe("band scale knobs (#365)", () => {
  const M = 1_000_000;
  const ENDS = [
    BAND_STARTS[1],
    BAND_STARTS[2],
    BAND_STARTS[3],
    MOUNTAIN_STONES,
  ] as const;
  const fresh = createMountain();

  const BANDS = [0, 1, 2, 3] as const;
  type Band = (typeof BANDS)[number];

  /** Stones still to dig inside one band, as the run shows them. */
  const bandLeft = (m: Mountain, band: Band): number => {
    const end = ENDS[band];
    const from = Math.min(end, Math.max(BAND_STARTS[band], minedOut(m)));
    return shownStones(end) - shownStones(from);
  };
  const doubled = <T>(id: string, body: () => T): T =>
    withFactors({ [id]: 2 }, body);

  it("band.2.scale moves the Granite's stones left and not the Topsoil's", () => {
    const inTopsoil = minedMountain(4 * M);
    const inGranite = minedMountain(20 * M);
    const topsoil = bandLeft(inTopsoil, 0);
    const granite = bandLeft(inGranite, 1);
    expect(topsoil).toBe(6 * M * BAND_SCALE[0]);
    expect(granite).toBe(25 * M * BAND_SCALE[1]);

    expect(doubled("band.2.scale", () => bandLeft(inTopsoil, 0))).toBe(topsoil);
    expect(doubled("band.2.scale", () => bandLeft(inGranite, 1))).toBe(
      2 * granite,
    );
  });

  it.each(BANDS.map((b) => [b + 1, b] as const))(
    "band.%s.scale scales only that band",
    (knob, band) => {
      const id = `band.${String(knob)}.scale`;
      const counts = () => BANDS.map((b) => bandLeft(fresh, b));
      const plain = counts();
      const knobbed = doubled(id, counts);
      expect(knobbed).toEqual(
        plain.map((stones, b) => (b === band ? 2 * stones : stones)),
      );

      // One-off buys follow the knob only while the run stands in that band.
      const standing = BAND_STARTS.map((start) => minedMountain(start));
      expect(doubled(id, () => standing.map(oneOffStretch))).toEqual(
        standing.map((m, b) =>
          b === band ? 2 * oneOffStretch(m) : oneOffStretch(m),
        ),
      );

      // Digging follows the knob too: half the knobbed band lands mid-band.
      const above = knobbed.slice(0, band).reduce((a, b) => a + b, 0);
      const half = (knobbed[band] ?? Number.NaN) / 2;
      const middle = (BAND_STARTS[band] + ENDS[band]) / 2;
      expect(
        doubled(id, () => depthAfterStones(fresh, above + half)),
      ).toBeCloseTo(middle, 0);
    },
  );
});

describe("one-off stretch (#356)", () => {
  const at = (mined: number): Mountain => ({
    ...createMountain(),
    remaining: MOUNTAIN_STONES - mined,
  });

  it("is 1 on a fresh mountain", () => {
    expect(oneOffStretch(createMountain())).toBe(1);
  });

  it("takes the scale of the band the run stands in, a band starting inclusive", () => {
    expect(oneOffStretch(at(9_999_999))).toBe(BAND_SCALE[0]);
    expect(oneOffStretch(at(10_000_000))).toBe(BAND_SCALE[1]);
    expect(oneOffStretch(at(45_000_000))).toBe(BAND_SCALE[2]);
    expect(oneOffStretch(at(120_000_000))).toBe(BAND_SCALE[3]);
  });

  it("prices Work boots and a promotion by the band", () => {
    const base = at(45_000_000);
    const caves = { ...base, stock: { ...base.stock, stones: 1e12 } };
    const boots = upgradeById("boots").firstCost * BAND_SCALE[2];
    expect(upgradeCost(upgradeById("boots"), 0, oneOffStretch(caves))).toBe(
      boots,
    );
    const bought = buyUpgrade(
      {
        ...caves,
        stock: { ...caves.stock, stones: boots },
        owned: { ...caves.owned, helper: 10 },
      },
      "boots",
    );
    expect(bought.stock.stones).toBe(0);
    const granite = {
      ...at(10_000_000),
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
    } as Mountain;
    // Nils is the second engineer: twice the base price.
    expect(promoteCost(granite)).toBe(PROMOTE_BASE_COST * 2 * BAND_SCALE[1]);
  });
});

describe("every price is a whole, safe count (#366)", () => {
  /** Every price a buy can show at this mountain: stones only. */
  function prices(m: Mountain): number[] {
    const oneOff = oneOffStretch(m);
    return [
      ...TIERS.flatMap((tier) =>
        Array.from({ length: 31 }, (_, owned) => tierCost(tier, owned)),
      ),
      ...UPGRADES.flatMap((upgrade) =>
        Array.from(
          { length: upgrade.maxLevel },
          (_, level) => upgradeCost(upgrade, level, oneOff) ?? 0,
        ),
      ),
      ...ENGINEER_NAMES.map((_, hired) =>
        promoteCost({
          ...m,
          engineers: ENGINEER_NAMES.slice(0, hired).map((name) => ({
            name,
            rank: 0,
            trips: 0,
            post: "camp",
          })),
        }),
      ),
      ...RECIPE_IDS.map((id) => priceAmount(recipePrice(id), "stones")),
    ];
  }

  it.each(BAND_STARTS.map((start, band) => [band + 1, start] as const))(
    "in band %d, every price is a whole number of stones",
    (_band, start) => {
      const m: Mountain = {
        ...createMountain(),
        remaining: MOUNTAIN_STONES - start,
      };
      // A price under the whole mountain is then a safe count. One above it
      // is never paid (below).
      for (const price of prices(m)) {
        expect(Number.isInteger(price)).toBe(true);
        expect(price).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it("prices every upgrade under every stone of the run, so the pocket stays safe", () => {
    const deep: Mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - BAND_STARTS[3],
      owned: { ...createMountain().owned, machine: 1 },
    };
    // The most a pocket can hold: every stone of this run.
    const full = {
      ...deep,
      stock: {
        ...deep.stock,
        stones: shownStones(MOUNTAIN_STONES),
      },
    };
    // Every upgrade has one level (#728), so its first price is its dearest.
    for (const upgrade of UPGRADES) {
      const price = upgradeCost(upgrade, 0, oneOffStretch(deep)) ?? 0;
      expect(Number.isSafeInteger(price)).toBe(true);
      expect(price).toBeLessThan(full.stock.stones);
    }
    expect(buyUpgrade(full, "machineSyn").upgrades.machineSyn).toBe(1);
  });
});

describe("the line's Deep Heart (#543)", () => {
  it("takes 1.21 times the old 32.4 stones per stone of depth", () => {
    const deep = { remaining: MOUNTAIN_STONES - BAND_STARTS[3] };
    expect(oneOffStretch(deep)).toBe(BAND_SCALE[3]);
    expect(oneOffStretch(deep)).toBeCloseTo(32.4 * 1.21, 9);
    expect(oneOffStretch({ remaining: MOUNTAIN_STONES })).toBe(1);
  });
});
