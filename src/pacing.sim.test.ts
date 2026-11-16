// Long economy sims: the sim project (npm run gate -- full), not the fast tier.
import { describe, expect, it } from "vitest";
import { ENGINEER_NAMES, promoteCost } from "./engineers";
import { createMountain } from "./mountain";
import { effectiveRates } from "./rates";
import { simulateDad, simulateDadRun, type DadRun } from "./pacing";
import { BAND_SCALE, MOUNTAIN_STONES } from "./scale";

/** The depths the pins read: the first million, 25M, and the bottom. */
const MARKS = { "1M": 1_000_000, "25M": 25_000_000, bottom: MOUNTAIN_STONES };
const depth = (id: keyof typeof MARKS): number => MARKS[id];

// Deterministic dads: two 10-minute sessions a day, 12 hours apart, always
// buying the best speed per stone, paid for time away as the game pays it.
// #198 hardened the rock; D3 (#246) lets each layer favour one machine. The
// M12 retune (#252) opens the Great Machine at 120M; the new curve (#356)
// opens the borer at the Granite start. The days each dad reaches 25M and the
// bottom are the pins below. They are regression pins, not limits: the run
// length is not graded. This sim does not craft. #728 took the upgrades that
// made the crew or away pay stronger (Strong arms, Night foreman) and the
// relic powers: the plain dad reaches 25M on day 2.5 (was 2) and the bottom on
// day 6 (was 4.5), the upgrade dad the bottom on day 5 (was 3.5).
describe.each([
  ["a plain dad (crew only)", {}, 6, 2.5],
  ["a dad who also buys lasting upgrades", { buysUpgrades: true }, 5, 2],
])("pacing: %s", (_, options, bottomDay, day25M) => {
  const reached = simulateDad({
    milestones: [depth("1M"), depth("25M"), depth("bottom")],
    ...options,
  });
  const day = (id: keyof typeof MARKS) =>
    Math.floor(reached.get(depth(id)) ?? Infinity);

  it("reaches 1M on day 1", () => {
    // The sim checks the depth once a tick, so the day can read a hair over.
    expect(reached.get(depth("1M"))).toBeCloseTo(1.5, 1);
    expect(day("1M")).toBe(1);
  });

  it("reaches 25M on the pinned day, after 1M", () => {
    const at25M = reached.get(depth("25M")) ?? Infinity;
    // The sim checks the depth once a tick, so the day can read a hair over.
    expect(at25M).toBeCloseTo(day25M, 1);
    expect(at25M).toBeGreaterThan(reached.get(depth("1M")) ?? Infinity);
  });

  it("reaches the bottom on the pinned day", () => {
    const bottom = reached.get(depth("bottom")) ?? Infinity;
    // The sim checks the depth once a tick, so the day can read a hair over.
    expect(bottom).toBeCloseTo(bottomDay, 1);
  });
});

/** What a player pays for Nils, with Ada already in the crew. */
const NILS_PRICE = promoteCost({
  ...createMountain(),
  engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
});

/**
 * The sim dad spends the sheet's price and one worker for Nils. One-offs cost
 * more in deeper rock (#356), so the price is the Topsoil price times the
 * scale of the band he is hired in (1 the Granite, 2 the Crystal Caves).
 * `gapDays` is the pinned wait after the first borer: 0 in the same sitting.
 */
function expectPaidForNils(run: DadRun, gapDays: number, band: 1 | 2): void {
  expect(NILS_PRICE).toBe(2_000_000);
  const bandPrice = NILS_PRICE * BAND_SCALE[band];
  expect(run.promotions).toHaveLength(1);
  const paid = run.promotions[0];
  expect(paid).toMatchObject({ name: "Nils", price: bandPrice });
  expect(paid?.helpersAfter).toBe((paid?.helpersBefore ?? 0) - 1);
  expect(paid?.pocketAfter).toBe((paid?.pocketBefore ?? 0) - bandPrice);
  const borer = run.buys.find((buy) => buy.id === "borer");
  expect(paid?.day).toBeGreaterThanOrEqual(borer?.day ?? Infinity);
  const gap = (paid?.day ?? 0) - (borer?.day ?? 0);
  expect(gap).toBeCloseTo(gapDays, 2);
}

// Second run (M6): the kid's crew is ×1.5. Since #728 the bottom is day 4
// (day 3 before), still a shorter climb than the first (day 5).
describe("pacing: a second run with one Legacy (×1.5)", () => {
  const run = simulateDadRun({
    milestones: [depth("bottom")],
    legacy: 1,
    buysUpgrades: true,
  });
  it("reaches the bottom on day 4", () => {
    expect(run.reached.get(depth("bottom"))).toBe(4);
  });

  // Grandpa (#338) tends from the first cart; Nils joins in the borer's
  // sitting, in the Crystal Caves.
  it("pays the real promotion for Nils", () => {
    expectPaidForNils(run, 0, 2);
  });
});

/** Longest stretch with nothing bought, from the first borer through `until`. */
function quietStretch(run: DadRun, until: number): number {
  const firstBorer = run.buys.find((buy) => buy.id === "borer")?.day;
  if (firstBorer === undefined || firstBorer > until) {
    return Infinity;
  }
  const marks = run.buys
    .filter((buy) => buy.day >= firstBorer && buy.day <= until)
    .map((buy) => buy.day);
  let worst = 0;
  let previous = firstBorer;
  for (const day of [...marks, until]) {
    worst = Math.max(worst, day - previous);
    previous = day;
  }
  return worst;
}

describe.each([
  // The borer opens at the Granite start (#356). On the #357 retune every
  // dad hires Nils in the borer's sitting on day 2: the plain dad still in
  // the Granite, the upgrade dads already in the Crystal Caves. The first
  // Great Machine comes on day 3, and no dad goes
  // more than half a day without a buy after the first borer. Since away pay
  // splits at a band crossing (#592), the plain dad's comes on day 3.5 and
  // he runs 9 by the bottom (was day 3 and 12). Since #728 the climb is
  // slower: the plain dad hires Nils the sitting after the borer (was the
  // same sitting), buys the first Great Machine on day 4 (was 3.5) and runs
  // 11 by the bottom on day 6 (was 9 by day 4.5). The upgrade dad hires Nils
  // in the borer's sitting while still in the Granite (was the Crystal
  // Caves), buys it on day 3.5 (was 3) and runs 11 by day 5 (was 6 by 3.5).
  ["a plain dad", {}, 6, 0.5, 11, 0.5, 1, 4],
  ["an upgrade-buying dad", { buysUpgrades: true }, 5, 0.5, 11, 0, 1, 3.5],
] as const)(
  "pacing: no dead zone for %s (#140)",
  (
    _,
    options,
    bottomDay,
    quietCap,
    machines,
    nilsGapDays,
    nilsBand,
    machineDay,
  ) => {
    const run = simulateDadRun({
      milestones: [depth("bottom")],
      ...options,
    });
    const bottom = run.reached.get(depth("bottom")) ?? Infinity;

    it("saves for the Great Machine, then runs it before the bottom", () => {
      expect(bottom).toBeCloseTo(bottomDay, 1);
      expect(quietStretch(run, bottom)).toBeLessThanOrEqual(quietCap);
      const machine = run.buys.find((buy) => buy.id === "machine");
      expect(machine).toMatchObject({ count: 1, price: 120_600_000 });
      expect(machine?.day).toBeCloseTo(machineDay, 2);
      expect(machine?.day).toBeLessThan(bottom);
      expect(run.mountain.owned.machine).toBe(machines);
      expect(effectiveRates(run.mountain).running.machine).toBe(machines);
      expect(run.mountain.engineers[0]).toEqual({
        name: ENGINEER_NAMES[0],
        rank: 0,
        trips: 0,
        post: "machine",
      });
    });

    it("pays the real promotion for Nils", () => {
      expectPaidForNils(run, nilsGapDays, nilsBand);
    });
  },
);

describe("pacing: lost tools (#148)", () => {
  const run = simulateDadRun({
    milestones: [depth("bottom")],
    buysUpgrades: true,
  });

  it("keeps Ada tending and sends the others on the old shaft and the deep dark", () => {
    expect(run.mountain.engineers[0]).toEqual({
      name: "Ada",
      rank: 0,
      trips: 0,
      post: "machine",
    });
    const scouts = run.mountain.engineers.slice(1);
    expect(scouts.length).toBeGreaterThan(0);
    // Since #728 Nils joins on day 2 of a 5-day run (3.5 before), so he
    // walks the tunnels seven times (was two), ranks up once (was never) and
    // brings four finds home (was two).
    expect(scouts.reduce((trips, engineer) => trips + engineer.trips, 0)).toBe(
      7,
    );
    expect(scouts.map((engineer) => engineer.rank)).toEqual([1]);
    expect(run.mountain.finds).toHaveLength(4);
  });
});

describe("pacing: the borer's worker bill and the Great Machine (#140)", () => {
  const run = simulateDadRun({
    milestones: [depth("bottom")],
    buysUpgrades: true,
  });

  it("brings spare hands to the first borer, and the machine needs a few hired", () => {
    // On the #357 retune the cheap ×1.06 workers leave spare workers when
    // the borer opens, so its eight come from them and none are hired: 101
    // since #728 (100 before).
    const borer = run.buys.find((buy) => buy.id === "borer");
    expect(borer).toMatchObject({
      count: 1,
      price: 4_940_000,
      spare: 101,
      short: 0,
      shortCost: 0,
    });
    const machine = run.buys.find((buy) => buy.id === "machine");
    expect(machine?.short).toBe(5);
    // Was < 0.15 (#356): on the #357 curve the first machine comes five
    // workers short, 20,687,367 on 120.6M (0.1715). Since #728 he owns more
    // workers by then (each one dearer than the last), so the five cost
    // 34,950,870 (0.2898).
    expect((machine?.shortCost ?? 0) / (machine?.price ?? 1)).toBeCloseTo(
      0.2898,
      4,
    );
  });

  it("runs a Great Machine after the Deep Heart opens, and the bottom is day 5", () => {
    const bottom = run.reached.get(depth("bottom"));
    const machine = run.buys.find((buy) => buy.id === "machine");
    // Since #728: the bottom on day 5 (was 3.5), the first machine on day
    // 3.5 (was 3), eleven by the bottom (was six).
    expect(bottom).toBeCloseTo(5, 1);
    expect(machine).toMatchObject({ count: 1, price: 120_600_000 });
    expect(machine?.day).toBeCloseTo(3.5, 2);
    expect(machine?.day).toBeLessThan(bottom ?? 0);
    expect(run.mountain.owned.machine).toBe(11);
    expect(effectiveRates(run.mountain).running.machine).toBe(11);
  });
});

describe("pacing: a dad who never fixes trouble (#149)", () => {
  const reached = simulateDad({
    milestones: [depth("1M"), depth("25M"), depth("bottom")],
    buysUpgrades: true,
    fixesTrouble: false,
  });

  it("lands within a day of the usual targets", () => {
    const at1M = reached.get(depth("1M")) ?? Infinity;
    const at25M = reached.get(depth("25M")) ?? Infinity;
    const bottom = reached.get(depth("bottom")) ?? Infinity;
    expect(at1M).toBeCloseTo(1.5, 1);
    expect(at25M).toBeGreaterThanOrEqual(2);
    expect(at25M).toBeLessThanOrEqual(4.5);
    // #357: the usual upgrade dad's bottom moved from day 4 to 3.5, and the
    // window moved with it. #728 moved it to day 5. Measured: day 5.
    expect(bottom).toBeGreaterThanOrEqual(5);
    expect(bottom).toBeLessThanOrEqual(7);
  });
});
