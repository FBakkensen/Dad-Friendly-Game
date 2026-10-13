import { describe, expect, it } from "vitest";
import { effectiveRates } from "./rates";
import { simulateDad, simulateDadRun, type DadRun } from "./pacing";
import { RELICS } from "./relics";

const depth = (id: string) =>
  RELICS.find((relic) => relic.id === id)?.depth ?? 0;

// Deterministic dads: two 10-minute sessions a day, 12 hours apart, 3 taps a
// second, always buying the best speed per stone, paid for time away as the
// game pays it. Every kind of dad must land in the same windows.
describe.each([
  ["a plain dad (crew only)", {}],
  ["a dad who also buys lasting upgrades", { buysUpgrades: true }],
  [
    "a dad who buys upgrades and starts every boost he can afford",
    { buysUpgrades: true, buysBoosts: true },
  ],
])("pacing: %s", (_, options) => {
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

  it("reaches the bottom (100M) on day 5", () => {
    expect(reached.get(depth("mantle"))).toBe(5);
  });
});

// Second run (M6): the kid's crew is ×1.5 and should reach the bottom in
// roughly 4 days, a clearly shorter climb than the first.
describe("pacing: a second run with one Legacy (×1.5)", () => {
  const reached = simulateDad({
    milestones: [depth("mantle")],
    legacy: 1,
    buysUpgrades: true,
  });
  it("reaches the bottom on day 4", () => {
    expect(reached.get(depth("mantle"))).toBe(4);
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
  ["a plain dad", {}],
  ["an upgrade-buying dad", { buysUpgrades: true }],
  [
    "a dad who buys upgrades and boosts",
    { buysUpgrades: true, buysBoosts: true },
  ],
])("pacing: no dead zone for %s (#140)", (_, options) => {
  const run = simulateDadRun({
    milestones: [depth("mantle")],
    ...options,
  });
  const bottom = run.reached.get(depth("mantle")) ?? Infinity;

  it("buys something at least every simulated day from the first borer", () => {
    expect(bottom).toBe(5);
    expect(quietStretch(run, bottom)).toBeLessThanOrEqual(1);
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
      price: 10_000_000,
      short: 4,
    });
    expect(borer?.shortCost).toBeGreaterThan(0);
    expect((borer?.shortCost ?? 0) / (borer?.price ?? 1)).toBeLessThan(0.1);
  });

  it("never staffs a Great Machine before the bottom (staff 25; staff 15 reopened the dead zone)", () => {
    expect(run.mountain.machines).toBe(0);
    expect(effectiveRates(run.mountain).running.machine).toBe(0);
  });
});
