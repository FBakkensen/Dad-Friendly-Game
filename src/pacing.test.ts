import { describe, expect, it } from "vitest";
import { simulateDad } from "./pacing";
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
    expect(day("lantern")).toBe(1);
  });

  it("finds the Hammer of the Builder (25M) on day 2 or 3", () => {
    expect(day("hammer")).toBeGreaterThanOrEqual(2);
    expect(day("hammer")).toBeLessThanOrEqual(3);
  });

  it("reaches the bottom (100M) on day 5, 6 or 7", () => {
    expect(day("mantle")).toBeGreaterThanOrEqual(5);
    expect(day("mantle")).toBeLessThanOrEqual(7);
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
  it("reaches the bottom on day 3, 4 or 5", () => {
    const day = Math.floor(reached.get(depth("mantle")) ?? Infinity);
    expect(day).toBeGreaterThanOrEqual(3);
    expect(day).toBeLessThanOrEqual(5);
  });
});
