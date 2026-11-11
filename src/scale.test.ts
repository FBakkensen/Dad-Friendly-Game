import { describe, expect, it } from "vitest";
import { BOOSTS, boostById, boostCost } from "./boosts";
import { tierLock } from "./crew";
import { ENGINEER_NAMES, PROMOTE_BASE_COST, promoteCost } from "./engineers";
import { howItWorks } from "./how-it-works";
import {
  accrueAway,
  createMountain,
  digStones,
  MOUNTAIN_STONES,
  mineByHand,
  type Mountain,
} from "./mountain";
import { mineVein } from "./veins";
import { parseSaveValue, serializeSave } from "./persist";
import { withFactors } from "./economy/factors";
import {
  BAND_SCALE,
  BAND_STARTS,
  KID_MACHINE_OPENS,
  KID_RUN_GROWTH,
  MAX_STRETCH,
  depthAfterStones,
  kidStretch,
  oneOffStretch,
  shownStones,
  stonesLeft,
  stretch,
} from "./scale";
import { minedMountain } from "./test-fixtures";
import { TIERS, tierById, tierCost } from "./tiers";
import { lockBodyLine } from "./tier-lock-words";
import { UPGRADES, buyUpgrade, upgradeById, upgradeCost } from "./upgrades";
import { veinReward } from "./veins";
import {
  RECIPE_IDS,
  recipeCost,
  startCraft,
  TOPSOIL_BENCH_FROM,
} from "./workshop";
import { formatCompact } from "./format";

describe("kid-run stretch (M13, #253)", () => {
  it("grows the stretch every generation", () => {
    expect(kidStretch(0)).toBe(1);
    expect(kidStretch(1)).toBeCloseTo(1.5 * (1 + KID_RUN_GROWTH) ** 2);
    const ks = Array.from({ length: 12 }, (_, i) => kidStretch(i));
    ks.slice(1).forEach((k, i) => {
      expect(k).toBeGreaterThan(ks[i] as number);
    });
  });

  it("leaves a save without a stretch as it is", () => {
    const fresh = createMountain();
    expect(stretch(fresh)).toBe(1);
    expect(stonesLeft(fresh)).toBe(shownStones(fresh, MOUNTAIN_STONES));
    expect(shownStones(fresh, 7_000_000)).toBe(7_000_000);
  });

  it("makes a kid's mountain k times the stones, and every price k times", () => {
    const kid = { ...createMountain(), stretch: 2 };
    expect(stonesLeft(kid)).toBe(2 * stonesLeft(createMountain()));
    const dug = digStones(kid, 1_000);
    expect(dug.pocket).toBe(1_000);
    expect(kid.remaining - dug.remaining).toBe(500);
    expect(digStones(kid, stonesLeft(kid)).remaining).toBe(0);
    const cart = tierById("cart");
    expect(tierCost(cart, 0, 2)).toBe(2 * tierCost(cart, 0));
    const tap = upgradeById("tap");
    expect(upgradeCost(tap, 0, 2)).toBe(2 * (upgradeCost(tap, 0) ?? 0));
    const pricing = { crewPerSecond: 0, tapYield: 0 };
    const sharper = boostById("sharper");
    expect(boostCost(sharper, pricing, 2)).toBe(
      2 * boostCost(sharper, pricing),
    );
    expect(promoteCost(kid)).toBe(2 * promoteCost(createMountain()));
    expect(veinReward(kid)).toBe(2 * veinReward(createMountain()));
  });

  it("opens the Great Machine sooner from run 2 on, and names this run's stones", () => {
    const machine = tierById("machine");
    const runOne = minedMountain(25_000_000);
    expect(tierLock(runOne, machine)).toMatchObject({
      depth: 120_000_000,
      // 10M x s1 + 35M x s2 + 75M x s3; the scales are pinned in src/tuning.test.ts.
      at:
        10_000_000 * BAND_SCALE[0] +
        35_000_000 * BAND_SCALE[1] +
        75_000_000 * BAND_SCALE[2],
    });
    const kid = { ...runOne, stretch: 1.75 };
    const lock = tierLock(kid, machine);
    expect(lock).toEqual({
      kind: "depth",
      depth: 120_000_000 * KID_MACHINE_OPENS,
      at: shownStones(kid, 120_000_000 * KID_MACHINE_OPENS),
    });
    expect(
      lockBodyLine(machine, lock ?? { kind: "depth", depth: 0, at: 0 }),
    ).toBe(
      `The Great Machine joins your crew at ${formatCompact(shownStones(kid, 120_000_000 * KID_MACHINE_OPENS))} stones. Keep digging, Dad!`,
    );
    const borer = tierLock(
      { ...minedMountain(0), stretch: 2 },
      tierById("borer"),
    );
    expect(borer).toEqual({ kind: "depth", depth: 10_000_000, at: 20_000_000 });
  });

  it("prices the how-it-works copy in this run's stones", () => {
    expect(howItWorks(2).engineers.steps[0]?.[1]).not.toBe(
      howItWorks(1).engineers.steps[0]?.[1],
    );
  });

  it("saves the stretch beside the mountain, whole depth for the cloud", () => {
    const kid = digStones({ ...createMountain(), stretch: 1.75 }, 1);
    expect(Number.isInteger(kid.remaining)).toBe(false);
    const saved = serializeSave({ mountain: kid, lastSeen: 1 });
    expect(saved.mountain.remaining).toBe(MOUNTAIN_STONES);
    expect(parseSaveValue(saved)?.mountain.stretch).toBe(1.75);
    const old = serializeSave({ mountain: createMountain(), lastSeen: 1 });
    expect(parseSaveValue(old)?.mountain.stretch).toBeUndefined();
    for (const bad of [0.5, 1e9, "2"]) {
      expect(
        parseSaveValue({
          ...saved,
          workshop: { ...saved.workshop, stretch: bad },
        }),
      ).toBeUndefined();
    }
  });

  it("stretches workshop recipe stones with the mountain, not materials", () => {
    expect(recipeCost("blasting-charge").stones).toBe(100_000);
    expect(recipeCost("blasting-charge", 2).stones).toBe(200_000);
    expect(recipeCost("blasting-charge", 2).materials.clay).toBe(
      recipeCost("blasting-charge").materials.clay,
    );
    const kid = {
      ...minedMountain(TOPSOIL_BENCH_FROM),
      stretch: 2,
      pocket: 250_000,
      materials: { clay: 10, iron: 0, crystal: 0, heartstone: 0 },
    };
    const spent = startCraft(kid, "blasting-charge", 1);
    expect(spent).not.toBe(kid);
    expect(spent.pocket).toBe(50_000);
  });

  it("keeps run 10-12 numbers sane: short text, safe whole numbers, a good save", () => {
    for (const legacy of [9, 10, 11]) {
      const k = kidStretch(legacy);
      const kid = { ...createMountain(), legacy, stretch: k };
      expect(formatCompact(stonesLeft(kid))).toMatch(/^\d+(\.\d)?B$/);
      const priciest = tierCost(tierById("machine"), 3, k);
      expect(Number.isSafeInteger(Math.round(priciest))).toBe(true);
      expect(formatCompact(priciest).length).toBeLessThanOrEqual(6);
      const saved = serializeSave({
        mountain: digStones(kid, 1e9),
        lastSeen: 1,
      });
      expect(parseSaveValue(saved)?.mountain.stretch).toBe(k);
    }
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
    expect(shownStones(fresh, 10 * M)).toBe(at10);
    expect(shownStones(fresh, 45 * M)).toBe(at45);
    expect(shownStones(fresh, MOUNTAIN_STONES)).toBe(full);
  });

  it("multiplies the whole count by the kid-run stretch", () => {
    const kid = { ...fresh, stretch: 1.75 };
    expect(shownStones(kid, 10 * M)).toBeCloseTo(at10 * 1.75);
    expect(shownStones(kid, 45 * M)).toBeCloseTo(at45 * 1.75);
    expect(shownStones(kid, MOUNTAIN_STONES)).toBeCloseTo(full * 1.75);
  });

  it("counts the stones left", () => {
    expect(stonesLeft(fresh)).toBe(shownStones(fresh, MOUNTAIN_STONES));
    expect(stonesLeft(minedMountain(9 * M))).toBe(full - 9 * M * BAND_SCALE[0]);
  });

  it("walks bands when digging", () => {
    const m = minedMountain(9 * M);
    expect(
      depthAfterStones(m, 1 * M * BAND_SCALE[0] + 3 * M * BAND_SCALE[1]),
    ).toBe(13 * M);
    expect(depthAfterStones(m, stonesLeft(m) * 2)).toBe(MOUNTAIN_STONES);
  });

  it("lets the lab scale one band", () => {
    const granite = 35 * M * BAND_SCALE[1];
    expect(
      withFactors({ "band.2.scale": 2 }, () => shownStones(fresh, 45 * M)),
    ).toBe(at10 + 2 * granite);
  });

  const whole = (m: { pocket: number; remaining: number }) => {
    expect(Number.isInteger(m.pocket)).toBe(true);
  };
  const roundTrips = (m: Mountain) => {
    const back = parseSaveValue(
      JSON.parse(JSON.stringify(serializeSave({ mountain: m, lastSeen: 1 }))),
    );
    expect(back).toBeDefined();
  };

  it.each([
    ["Crystal", 100_000_000, 1, 1_000_000],
    ["Heart", 239_999_000, 1, 3_000],
    ["Heart, kid run", 239_999_000, 1.75, 3_000],
  ])(
    "keeps the pocket whole all the way down from the %s",
    (_name, at, k, haul) => {
      let m: Mountain = {
        ...minedMountain(at),
        stretch: k,
        helpers: 3,
        remaining: MOUNTAIN_STONES - at - 1 / 3,
      };
      for (let step = 0; step < 5_000 && m.remaining > 0; step += 1) {
        const turn = step % 3;
        if (turn === 0) {
          m = mineByHand({ ...m, upgrades: { tap: 5 }, helpers: 500 });
        } else if (turn === 1) {
          m = accrueAway({
            mountain: { ...m, helpers: haul },
            lastSeen: 0,
            now: 7_000,
          }).mountain;
        } else {
          m = mineVein({ ...m, helpers: 40 });
        }
        whole(m);
        roundTrips(m);
      }
      expect(m.remaining).toBe(0);
    },
  );
});

describe("one-off stretch (#356)", () => {
  const at = (mined: number, k?: number): Mountain => ({
    ...createMountain(),
    remaining: MOUNTAIN_STONES - mined,
    ...(k === undefined ? {} : { stretch: k }),
  });

  it("is 1 on a fresh mountain", () => {
    expect(oneOffStretch(createMountain())).toBe(1);
  });

  it("takes the scale of the band the run stands in, a band starting inclusive", () => {
    expect(oneOffStretch(at(9_999_999))).toBe(BAND_SCALE[0]);
    expect(oneOffStretch(at(10_000_000))).toBe(BAND_SCALE[1]);
    expect(oneOffStretch(at(45_000_000))).toBe(BAND_SCALE[2]);
    expect(oneOffStretch(at(120_000_000, 1.75))).toBe(BAND_SCALE[3] * 1.75);
  });

  it("prices Better boots and a promotion by the band", () => {
    const caves = { ...at(45_000_000), pocket: 1e12 };
    const boots = upgradeById("boots").firstCost * BAND_SCALE[2];
    expect(upgradeCost(upgradeById("boots"), 0, oneOffStretch(caves))).toBe(
      boots,
    );
    const bought = buyUpgrade(
      { ...caves, helpers: 10, pocket: boots },
      "boots",
    );
    expect(bought.pocket).toBe(0);
    const granite = {
      ...at(10_000_000),
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
    } as Mountain;
    // Nils is the second engineer: twice the base price.
    expect(promoteCost(granite)).toBe(PROMOTE_BASE_COST * 2 * BAND_SCALE[1]);
  });
});

describe("the stretch cap keeps every count a safe integer (#366)", () => {
  const roundTrip = (m: Mountain) =>
    parseSaveValue(
      JSON.parse(JSON.stringify(serializeSave({ mountain: m, lastSeen: 1 }))),
    )?.mountain;

  it("stops growing at MAX_STRETCH, where the whole mountain is still a safe count", () => {
    const whole = shownStones({ stretch: MAX_STRETCH }, MOUNTAIN_STONES);
    expect(Number.isSafeInteger(whole)).toBe(true);
    // Half the limit: room for a band retune before the cap has to move.
    expect(2 * whole).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    // Runs keep growing far past any real evening (run 200 is years away)...
    expect(kidStretch(200)).toBeLessThan(MAX_STRETCH);
    // ...and stop at the cap long before the rules' Legacy cap of 1000.
    expect(kidStretch(1_000)).toBe(MAX_STRETCH);
    const ks = Array.from({ length: 1_001 }, (_, legacy) => kidStretch(legacy));
    ks.slice(1).forEach((k, i) => {
      expect(k).toBeGreaterThanOrEqual(ks[i] as number);
      expect(k).toBeLessThanOrEqual(MAX_STRETCH);
    });
  });

  it("digs the whole mountain at the cap into a pocket that saves and loads", () => {
    const kid: Mountain = {
      ...createMountain(),
      legacy: 1_000,
      stretch: kidStretch(1_000),
    };
    const dug = digStones(kid, stonesLeft(kid));
    expect(dug.remaining).toBe(0);
    expect(Number.isSafeInteger(dug.pocket)).toBe(true);
    const back = roundTrip(dug);
    expect(back?.pocket).toBe(dug.pocket);
    expect(back?.stretch).toBe(MAX_STRETCH);
    expect(back?.legacy).toBe(1_000);
  });

  it("loads a stretch an older build wrote above the cap at the cap", () => {
    const saved = serializeSave({ mountain: createMountain(), lastSeen: 1 });
    // Before #366 a Legacy-1000 kid run carried about 70.8M.
    const old = { ...saved, workshop: { ...saved.workshop, stretch: 70.8e6 } };
    expect(parseSaveValue(old)?.mountain.stretch).toBe(MAX_STRETCH);
  });

  const ks = [
    ...Array.from({ length: 11 }, (_, legacy) => kidStretch(legacy)),
    MAX_STRETCH,
  ];
  const cases = ks.flatMap((k) =>
    BAND_STARTS.map((start, band) => [k, band + 1, start] as const),
  );

  /** Every price a buy can show at this mountain: stones only. */
  function prices(m: Mountain): number[] {
    const k = stretch(m);
    const oneOff = oneOffStretch(m);
    const crew = { crewPerSecond: 0, tapYield: 0 };
    return [
      ...TIERS.flatMap((tier) =>
        Array.from({ length: 31 }, (_, owned) => tierCost(tier, owned, k)),
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
      ...BOOSTS.map((boost) => boostCost(boost, crew, k)),
      ...RECIPE_IDS.map((id) => recipeCost(id, k).stones),
      veinReward(m),
    ];
  }

  it.each(cases)(
    "at k %d in band %d, every price is a whole number of stones",
    (k, _band, start) => {
      const m: Mountain = {
        ...createMountain(),
        remaining: MOUNTAIN_STONES - start,
        stretch: k,
      };
      // A price under the whole mountain is then a safe count, since the
      // cap keeps the whole mountain safe. One above it is never paid (below).
      for (const price of prices(m)) {
        expect(Number.isInteger(price)).toBe(true);
        expect(price).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it("never pays a price above every stone of the run, so the pocket stays safe", () => {
    const deep: Mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - BAND_STARTS[3],
      stretch: MAX_STRETCH,
      helpers: 10,
      upgrades: { tap: 9 },
    };
    // The most a pocket can hold: every stone of this run.
    const full = {
      ...deep,
      pocket: stonesLeft({ ...deep, remaining: MOUNTAIN_STONES }),
    };
    const tap = upgradeCost(upgradeById("tap"), 9, oneOffStretch(deep)) ?? 0;
    expect(tap).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(buyUpgrade(full, "tap")).toBe(full);
  });
});
