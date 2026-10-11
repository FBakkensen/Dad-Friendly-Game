import { describe, expect, it } from "vitest";
import { mineByHand, stonesPerSecond } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import {
  buyUpgrade,
  parseUpgrades,
  upgradeById,
  upgradeCost,
  upgradeLevel,
} from "./upgrades";

const crew = { ...minedMountain(0), carts: 50 }; // 500 stones a second

describe("Strong arms (tap power)", () => {
  const arms = upgradeById("tap");

  it("costs 5,000, then 5× each level, up to level 10", () => {
    expect([0, 1, 2, 3].map((level) => upgradeCost(arms, level))).toEqual([
      5_000, 25_000, 125_000, 625_000,
    ]);
    expect(upgradeCost(arms, 10)).toBeUndefined();
  });

  it("buys one level at a time from the pocket", () => {
    const poor = { ...crew, pocket: 4_999 };
    expect(buyUpgrade(poor, "tap")).toBe(poor);
    const one = buyUpgrade({ ...crew, pocket: 30_000 }, "tap");
    expect(upgradeLevel(one, "tap")).toBe(1);
    expect(one.pocket).toBe(25_000);
    const two = buyUpgrade(one, "tap");
    expect(upgradeLevel(two, "tap")).toBe(2);
    expect(two.pocket).toBe(0);
    const maxed = { ...crew, pocket: 1e15, upgrades: { tap: 10 } };
    expect(buyUpgrade(maxed, "tap")).toBe(maxed);
  });

  it("adds 1% of crew speed per level to every tap, rounded down", () => {
    expect(effectiveRates(crew).tapYield).toBe(1);
    expect(effectiveRates({ ...crew, upgrades: { tap: 1 } }).tapYield).toBe(6);
    expect(effectiveRates({ ...crew, upgrades: { tap: 3 } }).tapYield).toBe(16);
    const tapped = mineByHand({ ...crew, upgrades: { tap: 3 } });
    expect(tapped.pocket).toBe(16);
    expect(tapped.remaining).toBe(crew.remaining - 16);
    // A tap never digs past the bottom.
    expect(
      mineByHand({ ...crew, remaining: 5, upgrades: { tap: 3 } }).remaining,
    ).toBe(0);
  });

  it("doesn't change the crew's own speed or away pay", () => {
    const strong = { ...crew, upgrades: { tap: 5 } };
    expect(stonesPerSecond(strong)).toBe(500);
    expect(effectiveRates(strong).awayPay).toBe(effectiveRates(crew).awayPay);
  });

  it("reads saved levels and rejects anything odd", () => {
    expect(parseUpgrades({})).toEqual({});
    expect(parseUpgrades({ tap: 3 })).toEqual({ tap: 3 });
    for (const bad of [
      null,
      [],
      { tap: -1 },
      { tap: 1.5 },
      { tap: 11 },
      { tap: "2" },
      { wings: 1 },
    ]) {
      expect(parseUpgrades(bad)).toBeUndefined();
    }
  });
});
