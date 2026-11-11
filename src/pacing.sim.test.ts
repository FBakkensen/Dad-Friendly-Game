// Long economy sims: the sim project (npm run gate -- full), not the fast tier.
import { describe, expect, it } from "vitest";
import { ENGINEER_NAMES, promoteCost } from "./engineers";
import { createMountain } from "./mountain";
import { effectiveRates } from "./rates";
import { simulateDad, simulateDadRun, type DadRun } from "./pacing";
import { RELICS } from "./relics";
import { BAND_SCALE } from "./scale";

const depth = (id: string) =>
  RELICS.find((relic) => relic.id === id)?.depth ?? 0;

// Deterministic dads: two 10-minute sessions a day, 12 hours apart, 3 taps a
// second, always buying the best speed per stone, paid for time away as the
// game pays it. #198 hardened the rock; D3 (#246) lets each layer favour
// one machine. The M12 retune (#252) opens the Great Machine at 120M; the
// new curve (#356) opens the borer at the Granite start. On the #357 retune
// for the milestone marks the plain dad reaches the bottom on day 4.5 and the
// upgrade dads on day 3.5, and every dad finds the Hammer on day 2. These
// are regression pins, not limits: the run length is not graded. This sim
// does not craft.
describe.each([
  ["a plain dad (crew only)", {}, 4.5, 2],
  ["a dad who also buys lasting upgrades", { buysUpgrades: true }, 3.5, 2],
  [
    "a dad who buys upgrades and starts every boost he can afford",
    { buysUpgrades: true, buysBoosts: true },
    3.5,
    2,
  ],
])("pacing: %s", (_, options, bottomDay, hammerDay) => {
  const reached = simulateDad({
    milestones: [depth("lantern"), depth("hammer"), depth("mantle")],
    ...options,
  });
  const day = (id: string) => Math.floor(reached.get(depth(id)) ?? Infinity);

  it("finds the Lantern of Guidance (1M) on day 1", () => {
    // The sim checks the depth once a tick, so the day can read a hair over.
    expect(reached.get(depth("lantern"))).toBeCloseTo(1.5, 1);
    expect(day("lantern")).toBe(1);
  });

  it("finds the Hammer of the Builder (25M) on the pinned day, after the Lantern", () => {
    const hammer = reached.get(depth("hammer")) ?? Infinity;
    // The sim checks the depth once a tick, so the day can read a hair over.
    expect(hammer).toBeCloseTo(hammerDay, 1);
    expect(hammer).toBeGreaterThan(reached.get(depth("lantern")) ?? Infinity);
  });

  it("reaches the bottom on the pinned day", () => {
    const bottom = reached.get(depth("mantle")) ?? Infinity;
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

// Second run (M6): the kid's crew is ×1.5. On the #357 retune the bottom
// is day 3, still a shorter climb than the first (day 3.5).
describe("pacing: a second run with one Legacy (×1.5)", () => {
  const run = simulateDadRun({
    milestones: [depth("mantle")],
    legacy: 1,
    buysUpgrades: true,
  });
  it("reaches the bottom on day 3", () => {
    expect(run.reached.get(depth("mantle"))).toBe(3);
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
  // Great Machine comes on day 3 (day 2.5 with boosts), and no dad goes
  // more than half a day without a buy after the first borer.
  ["a plain dad", {}, 4.5, 0.5, 12, 0, 1, 3],
  ["an upgrade-buying dad", { buysUpgrades: true }, 3.5, 0.5, 6, 0, 2, 3],
  [
    "a dad who buys upgrades and boosts",
    { buysUpgrades: true, buysBoosts: true },
    3.5,
    0.5,
    9,
    0,
    2,
    2.5,
  ],
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
      milestones: [depth("mantle")],
      ...options,
    });
    const bottom = run.reached.get(depth("mantle")) ?? Infinity;

    it("saves for the Great Machine, then runs it before the bottom", () => {
      expect(bottom).toBeCloseTo(bottomDay, 1);
      expect(quietStretch(run, bottom)).toBeLessThanOrEqual(quietCap);
      const machine = run.buys.find((buy) => buy.id === "machine");
      expect(machine).toMatchObject({ count: 1, price: 120_600_000 });
      expect(machine?.day).toBeCloseTo(machineDay, 2);
      expect(machine?.day).toBeLessThan(bottom);
      expect(run.mountain.machines).toBe(machines);
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
    milestones: [depth("mantle")],
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
    // On the #357 retune Nils joins on day 2 of a 3.5-day run, so he walks
    // the tunnels twice and brings two finds home, but has no time to rank up.
    expect(scouts.reduce((trips, engineer) => trips + engineer.trips, 0)).toBe(
      2,
    );
    expect(scouts.every((engineer) => engineer.rank === 0)).toBe(true);
    expect(run.mountain.finds).toHaveLength(2);
  });
});

describe("pacing: the borer's worker bill and the Great Machine (#140)", () => {
  const run = simulateDadRun({
    milestones: [depth("mantle")],
    buysUpgrades: true,
  });

  it("brings spare hands to the first borer, and the machine needs a few hired", () => {
    // On the #357 retune the cheap ×1.06 workers leave 100 spare hands when
    // the borer opens, so its eight come from them and none are hired.
    const borer = run.buys.find((buy) => buy.id === "borer");
    expect(borer).toMatchObject({
      count: 1,
      price: 4_940_000,
      spare: 100,
      short: 0,
      shortCost: 0,
    });
    const machine = run.buys.find((buy) => buy.id === "machine");
    expect(machine?.short).toBe(5);
    // Was < 0.15 (#356): on the #357 curve the first machine comes five hands
    // short, 20,687,367 on 120.6M (0.1715).
    expect((machine?.shortCost ?? 0) / (machine?.price ?? 1)).toBeCloseTo(
      0.1715,
      4,
    );
  });

  it("runs a Great Machine after the Deep Heart opens, and the bottom is day 3.5", () => {
    const bottom = run.reached.get(depth("mantle"));
    const machine = run.buys.find((buy) => buy.id === "machine");
    expect(bottom).toBeCloseTo(3.5, 1);
    expect(machine).toMatchObject({ count: 1, price: 120_600_000 });
    expect(machine?.day).toBeCloseTo(3, 2);
    expect(machine?.day).toBeLessThan(bottom ?? 0);
    // The #357 curve buys six by the bottom.
    expect(run.mountain.machines).toBe(6);
    expect(effectiveRates(run.mountain).running.machine).toBe(6);
  });
});

describe("pacing: a dad who never fixes trouble (#149)", () => {
  const reached = simulateDad({
    milestones: [depth("lantern"), depth("hammer"), depth("mantle")],
    buysUpgrades: true,
    fixesTrouble: false,
  });

  it("lands within a day of the usual targets", () => {
    const lantern = reached.get(depth("lantern")) ?? Infinity;
    const hammer = reached.get(depth("hammer")) ?? Infinity;
    const bottom = reached.get(depth("mantle")) ?? Infinity;
    expect(lantern).toBeCloseTo(1.5, 1);
    expect(hammer).toBeGreaterThanOrEqual(2);
    expect(hammer).toBeLessThanOrEqual(4.5);
    // #357: the usual upgrade dad's bottom moved from day 4 to 3.5, and the
    // window moved with it. Measured: day 3.5.
    expect(bottom).toBeGreaterThanOrEqual(3.5);
    expect(bottom).toBeLessThanOrEqual(5.5);
  });
});
