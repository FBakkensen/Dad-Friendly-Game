import { describe, expect, it } from "vitest";
import { ENGINEER_NAMES, promoteCost } from "./engineers";
import { createMountain } from "./mountain";
import { effectiveRates } from "./rates";
import { simulateDad, simulateDadRun, type DadRun } from "./pacing";
import { RELICS } from "./relics";

const depth = (id: string) =>
  RELICS.find((relic) => relic.id === id)?.depth ?? 0;

// Deterministic dads: two 10-minute sessions a day, 12 hours apart, 3 taps a
// second, always buying the best speed per stone, paid for time away as the
// game pays it. #177 keeps the 595/s borer, then puts 140M more stone under
// the old bottom and prices the Great Machine at 67M. #198 hardens borers,
// so the plain dad and the upgrade dad reach the bottom on day 6. The dad
// who also buys every boost still lands on day 5.5. This sim does not craft.
describe.each([
  ["a plain dad (crew only)", {}, 6],
  ["a dad who also buys lasting upgrades", { buysUpgrades: true }, 6],
  [
    "a dad who buys upgrades and starts every boost he can afford",
    { buysUpgrades: true, buysBoosts: true },
    5.5,
  ],
])("pacing: %s", (_, options, bottomDay) => {
  const reached = simulateDad({
    milestones: [depth("lantern"), depth("hammer"), depth("mantle")],
    ...options,
  });
  const day = (id: string) => Math.floor(reached.get(depth(id)) ?? Infinity);

  it("finds the Lantern of Guidance (1M) on day 1", () => {
    expect(reached.get(depth("lantern"))).toBe(1.5);
    expect(day("lantern")).toBe(1);
  });

  it("finds the Hammer of the Builder (25M) on day 3 to 3.5", () => {
    const hammer = reached.get(depth("hammer")) ?? Infinity;
    expect(hammer).toBeGreaterThanOrEqual(3);
    expect(hammer).toBeLessThanOrEqual(3.5);
  });

  it("reaches the bottom on the pinned day", () => {
    const bottom = reached.get(depth("mantle")) ?? Infinity;
    expect(bottom).toBe(bottomDay);
  });
});

/** What a player pays for Nils, with Ada already in the crew. */
const NILS_PRICE = promoteCost({
  ...createMountain(),
  engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
});

/**
 * The sim dad spends that price and one worker for Nils.
 * `sameSitting` is the pinned gap: true when Nils is hired in the borer's
 * sitting, false when he waits for the next one (half a day later).
 */
function expectPaidForNils(run: DadRun, sameSitting: boolean): void {
  expect(NILS_PRICE).toBe(2_000_000);
  expect(run.promotions).toHaveLength(1);
  const paid = run.promotions[0];
  expect(paid).toMatchObject({ name: "Nils", price: NILS_PRICE });
  expect(paid?.helpersAfter).toBe((paid?.helpersBefore ?? 0) - 1);
  expect(paid?.pocketAfter).toBe((paid?.pocketBefore ?? 0) - NILS_PRICE);
  const borer = run.buys.find((buy) => buy.id === "borer");
  expect(paid?.day).toBeGreaterThanOrEqual(borer?.day ?? Infinity);
  const gap = (paid?.day ?? 0) - (borer?.day ?? 0);
  if (sameSitting) {
    expect(gap).toBeCloseTo(0, 4);
  } else {
    expect(gap).toBeCloseTo(0.5, 2);
  }
}

// Second run (M6): the kid's crew is ×1.5. With hardened borers the bottom
// is day 4.5, still a shorter climb than the first.
describe("pacing: a second run with one Legacy (×1.5)", () => {
  const run = simulateDadRun({
    milestones: [depth("mantle")],
    legacy: 1,
    buysUpgrades: true,
  });
  it("reaches the bottom on day 4.5", () => {
    expect(run.reached.get(depth("mantle"))).toBe(4.5);
  });

  it("pays the real promotion for Nils", () => {
    expectPaidForNils(run, true);
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
  ["a plain dad", {}, 6, 2, 1, false],
  ["an upgrade-buying dad", { buysUpgrades: true }, 6, 2, 1, true],
  [
    "a dad who buys upgrades and boosts",
    { buysUpgrades: true, buysBoosts: true },
    5.5,
    1.51,
    // One Great Machine. The rock makes a second one wait past the bottom.
    1,
    false,
  ],
])(
  "pacing: no dead zone for %s (#140)",
  (_, options, bottomDay, quietCap, machines, nilsSameSitting) => {
    const run = simulateDadRun({
      milestones: [depth("mantle")],
      ...options,
    });
    const bottom = run.reached.get(depth("mantle")) ?? Infinity;

    it("saves for the Great Machine, then runs it before the bottom", () => {
      expect(bottom).toBe(bottomDay);
      expect(quietStretch(run, bottom)).toBeLessThanOrEqual(quietCap);
      const machine = run.buys.find((buy) => buy.id === "machine");
      expect(machine).toMatchObject({ count: 1, price: 67_000_000 });
      expect(machine?.day).toBeGreaterThan(3.5);
      expect(machine?.day).toBeLessThan(bottom);
      expect(run.mountain.machines).toBe(machines);
      expect(effectiveRates(run.mountain).running.machine).toBe(machines);
      expect(run.mountain.engineers?.[0]).toEqual({
        name: ENGINEER_NAMES[0],
        rank: 0,
        trips: 0,
        post: "machine",
      });
    });

    it("pays the real promotion for Nils", () => {
      expectPaidForNils(run, nilsSameSitting);
    });
  },
);

describe("pacing: lost tools (#148)", () => {
  const run = simulateDadRun({
    milestones: [depth("mantle")],
    buysUpgrades: true,
  });

  it("keeps Ada tending and sends the others on the old shaft and the deep dark", () => {
    expect(run.mountain.engineers?.[0]).toEqual({
      name: "Ada",
      rank: 0,
      trips: 0,
      post: "machine",
    });
    const scouts = (run.mountain.engineers ?? []).slice(1);
    expect(scouts.length).toBeGreaterThan(0);
    expect(scouts.some((engineer) => engineer.rank >= 1)).toBe(true);
    expect(
      scouts.reduce((trips, engineer) => trips + engineer.trips, 0),
    ).toBeGreaterThanOrEqual(4);
    expect(run.mountain.finds?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("pacing: the borer's worker bill and the Great Machine (#140)", () => {
  const run = simulateDadRun({
    milestones: [depth("mantle")],
    buysUpgrades: true,
  });

  it("the first borer still needs workers hired to run", () => {
    const borer = run.buys.find((buy) => buy.id === "borer");
    expect(borer).toMatchObject({
      count: 1,
      price: 9_000_000,
      short: 5,
    });
    expect(borer?.shortCost).toBeGreaterThan(0);
    expect((borer?.shortCost ?? 0) / (borer?.price ?? 1)).toBeLessThan(0.1);
  });

  it("runs one Great Machine after the Hammer, and the bottom stays day 6", () => {
    const bottom = run.reached.get(depth("mantle"));
    const machine = run.buys.find((buy) => buy.id === "machine");
    expect(bottom).toBe(6);
    expect(machine).toMatchObject({ count: 1, price: 67_000_000 });
    expect(machine?.day).toBeGreaterThanOrEqual(4.5);
    expect(machine?.day).toBeLessThan(bottom ?? 0);
    expect(run.mountain.machines).toBe(1);
    expect(effectiveRates(run.mountain).running.machine).toBe(1);
  });
});

describe("pacing: a sampler may watch the table (#173)", () => {
  it("reads each decision without moving the days", () => {
    const milestones = [depth("lantern")];
    const plain = simulateDad({ milestones, maxDays: 1 });
    let seen = 0;
    const watched = simulateDadRun({
      milestones,
      maxDays: 1,
      onDecision(_world, second) {
        if (second === 0) {
          seen += 1;
        }
      },
    });
    expect(seen).toBeGreaterThan(0);
    expect(watched.reached).toEqual(plain);
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
    expect(lantern).toBe(1.5);
    expect(hammer).toBeGreaterThanOrEqual(2);
    expect(hammer).toBeLessThanOrEqual(4.5);
    expect(bottom).toBeGreaterThanOrEqual(4);
    expect(bottom).toBeLessThanOrEqual(6);
  });
});
