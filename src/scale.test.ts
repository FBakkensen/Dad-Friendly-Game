import { priceAmount } from "./stock";
import { describe, expect, it } from "vitest";
import { tierLock } from "./crew";
import { ENGINEER_NAMES, PROMOTE_BASE_COST, promoteCost } from "./engineers";
import {
  accrueAway,
  createMountain,
  digStones,
  MOUNTAIN_STONES,
  type Mountain,
} from "./mountain";
import { reloaded } from "./test-fixtures";
import { withFactors } from "./economy/factors";
import { LINE_OFF } from "./line-switch";
import {
  BAND_SCALE,
  BAND_STARTS,
  depthAfterStones,
  minedOut,
  oneOffStretch,
  shownStones,
  stonesLeft,
  stonesToNextBand,
} from "./scale";
import { minedMountain } from "./test-fixtures";
import { TIERS, tierById, tierCost } from "./tiers";
import { UPGRADES, buyUpgrade, upgradeById, upgradeCost } from "./upgrades";
import { RECIPE_IDS, recipePrice } from "./workshop";

describe("the mountain's size (M13, #729)", () => {
  it("counts a fresh mountain's stones band by band", () => {
    const fresh = createMountain();
    expect(stonesLeft(fresh)).toBe(shownStones(MOUNTAIN_STONES));
    expect(shownStones(7_000_000)).toBe(7_000_000);
  });

  it("digs one stone of depth per stone in the Topsoil", () => {
    const fresh = createMountain();
    const dug = digStones(fresh, 1_000);
    expect(dug.stock.stones).toBe(1_000);
    expect(fresh.remaining - dug.remaining).toBe(1_000);
    expect(digStones(fresh, stonesLeft(fresh)).remaining).toBe(0);
  });

  it("locks a tier at its depth, named in stones", () => {
    const machine = tierById("machine");
    const runOne = minedMountain(25_000_000);
    expect(tierLock(runOne, machine)).toMatchObject({
      depth: 120_000_000,
      // 10M x s1 + 35M x s2 + 75M x s3.
      at:
        10_000_000 * BAND_SCALE[0] +
        35_000_000 * BAND_SCALE[1] +
        75_000_000 * BAND_SCALE[2],
    });
    const borer = tierLock(minedMountain(0), tierById("borer"));
    expect(borer).toEqual({ kind: "depth", depth: 10_000_000, at: 10_000_000 });
  });
});

describe("stones to the next band (#592)", () => {
  const at = (mined: number) => ({ remaining: MOUNTAIN_STONES - mined });

  it("counts the stones left in this band, at its scale", () => {
    expect(stonesToNextBand(at(0))).toBe(BAND_STARTS[1] * BAND_SCALE[0]);
    expect(stonesToNextBand(at(BAND_STARTS[1] - 500))).toBe(500);
    expect(stonesToNextBand(at(BAND_STARTS[2] - 100))).toBeCloseTo(
      100 * BAND_SCALE[1],
      6,
    );
  });

  it("from a band's first stone, counts to the band after it", () => {
    expect(stonesToNextBand(at(BAND_STARTS[1]))).toBeCloseTo(
      (BAND_STARTS[2] - BAND_STARTS[1]) * BAND_SCALE[1],
      3,
    );
  });

  it("is endless in the last band", () => {
    expect(stonesToNextBand(at(BAND_STARTS[3]))).toBe(Infinity);
    expect(stonesToNextBand(at(MOUNTAIN_STONES))).toBe(Infinity);
  });
});

describe("band scales (#356)", () => {
  const fresh = createMountain();
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

  it("counts the stones left", () => {
    expect(stonesLeft(fresh)).toBe(shownStones(MOUNTAIN_STONES));
    expect(stonesLeft(minedMountain(9 * M))).toBe(full - 9 * M * BAND_SCALE[0]);
  });

  it("walks bands when digging", () => {
    const m = minedMountain(9 * M);
    expect(
      depthAfterStones(m, 1 * M * BAND_SCALE[0] + 3 * M * BAND_SCALE[1]),
    ).toBe(13 * M);
    expect(depthAfterStones(m, stonesLeft(m) * 2)).toBe(MOUNTAIN_STONES);
  });

  const whole = (m: Pick<Mountain, "stock" | "remaining">) => {
    expect(Number.isInteger(m.stock.stones)).toBe(true);
  };
  const roundTrips = (m: Mountain) => {
    expect(reloaded(m)).toBeDefined();
  };

  it.each([
    ["Crystal", 100_000_000, 1_000_000],
    ["Heart", 239_999_000, 3_000],
  ])(
    "keeps the pocket whole all the way down from the %s",
    (_name, at, haul) => {
      let m: Mountain = {
        ...minedMountain(at),
        owned: { ...minedMountain(at).owned, helper: 3 },
        remaining: MOUNTAIN_STONES - at - 1 / 3,
      };
      for (let step = 0; step < 5_000 && m.remaining > 0; step += 1) {
        if (step % 2 === 0) {
          m = digStones(m, Math.min(stonesLeft(m), 331));
        } else {
          m = accrueAway({
            mountain: { ...m, owned: { ...m.owned, helper: haul } },
            lastSeen: 0,
            now: 7_000,
          }).mountain;
        }
        whole(m);
        roundTrips(m);
      }
      expect(m.remaining).toBe(0);
    },
  );
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
    // The whole mountain's count grows by just the Granite's extra stones.
    expect(doubled("band.2.scale", () => stonesLeft(inGranite))).toBe(
      stonesLeft(inGranite) + granite,
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
        stones: stonesLeft({ ...deep, remaining: MOUNTAIN_STONES }),
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

describe("the line's Deep Heart, labs only (#543)", () => {
  it("takes 1.21 times the stones per stone of depth while the line is on", () => {
    const deep = { remaining: MOUNTAIN_STONES - BAND_STARTS[3] };
    const off = oneOffStretch(deep);
    expect(off).toBe(BAND_SCALE[3]);
    withFactors({ [LINE_OFF]: 0 }, () => {
      expect(oneOffStretch(deep)).toBeCloseTo(39.204, 9);
      expect(oneOffStretch({ remaining: MOUNTAIN_STONES })).toBe(1);
    });
  });
});
