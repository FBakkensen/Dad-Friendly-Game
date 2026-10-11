import { describe, expect, it } from "vitest";
import { simulateDad } from "./pacing";
import { RELICS } from "./relics";

const depth = (id: string) =>
  RELICS.find((relic) => relic.id === id)?.depth ?? 0;

describe("pacing: a dad playing two 10-minute sessions a day", () => {
  // Deterministic: taps 3 a second, always buys the best speed per stone,
  // and is paid at most 8 hours for each 12-hour gap.
  const reached = simulateDad({
    milestones: [depth("lantern"), depth("hammer"), depth("mantle")],
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

describe("pacing: the same dad, also buying Strong arms when it pays best", () => {
  const reached = simulateDad({
    milestones: [depth("lantern"), depth("hammer"), depth("mantle")],
    buysUpgrades: true,
  });
  const day = (id: string) => Math.floor(reached.get(depth(id)) ?? Infinity);

  it("still hits the same windows: Lantern day 1, Hammer 2-3, bottom 5-7", () => {
    expect(day("lantern")).toBe(1);
    expect(day("hammer")).toBeGreaterThanOrEqual(2);
    expect(day("hammer")).toBeLessThanOrEqual(3);
    expect(day("mantle")).toBeGreaterThanOrEqual(5);
    expect(day("mantle")).toBeLessThanOrEqual(7);
  });
});

describe("pacing: the upgrade-buying dad who also starts every boost he can afford", () => {
  const reached = simulateDad({
    milestones: [depth("lantern"), depth("hammer"), depth("mantle")],
    buysUpgrades: true,
    buysBoosts: true,
  });
  const day = (id: string) => Math.floor(reached.get(depth(id)) ?? Infinity);

  it("still hits the same windows: Lantern day 1, Hammer 2-3, bottom 5-7", () => {
    expect(day("lantern")).toBe(1);
    expect(day("hammer")).toBeGreaterThanOrEqual(2);
    expect(day("hammer")).toBeLessThanOrEqual(3);
    expect(day("mantle")).toBeGreaterThanOrEqual(5);
    expect(day("mantle")).toBeLessThanOrEqual(7);
  });
});
