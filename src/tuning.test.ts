import { describe, expect, it } from "vitest";
import { BOOSTS } from "./boosts";
import { PROMOTE_BASE_COST } from "./engineers";
import { BAND_SCALE, BAND_STARTS } from "./scale";
import {
  HELPER_COST_GROWTH,
  MACHINE_COST_GROWTH,
  TIERS,
  tierById,
  tierCost,
} from "./tiers";
import { UPGRADES } from "./upgrades";

/**
 * The deliberate pins on the tuned prices (#381). A price-only retune breaks
 * these and nothing else: every other test computes its prices from
 * `tierCost`, `upgradeCost`, `promoteCost`, `boostCost` or `oneOffStretch`,
 * or from the tuned values themselves. The tier, growth and band pins match
 * docs/DESIGN.md "Numbers now"; change both together. Pacing and lab
 * regression pins (`*.sim.test.ts`, `src/lab/`) pin outcomes, not prices, and
 * live there.
 */
describe("tuned prices", () => {
  it("prices the first of each tier", () => {
    expect(TIERS.map(({ id, firstCost }) => [id, firstCost])).toEqual([
      ["helper", 20],
      ["cart", 600],
      ["drill", 73_080],
      ["borer", 4_940_000],
      ["machine", 120_600_000],
      // #327: cheap enough that a kid pays back in hours.
      ["kid", 250_000],
    ]);
  });

  it("climbs machines x1.15 a unit, and workers and kids x1.06", () => {
    expect(MACHINE_COST_GROWTH).toBe(1.15);
    expect(HELPER_COST_GROWTH).toBe(1.06);
    // One anchor on the rounded curve: ceil(600 x 1.15^12).
    expect(tierCost(tierById("cart"), 12)).toBe(3_211);
    expect(tierCost(tierById("helper"), 50)).toBe(369);
  });

  it("scales one-off prices and depth by band", () => {
    expect(BAND_STARTS).toEqual([0, 10_000_000, 45_000_000, 120_000_000]);
    expect(BAND_SCALE).toEqual([1, 2.625, 6.3, 32.4]);
  });

  it("prices each upgrade and its growth", () => {
    expect(
      UPGRADES.map(({ id, firstCost, costGrowth }) => [
        id,
        firstCost,
        costGrowth,
      ]),
    ).toEqual([
      ["tap", 46_000, 8],
      ["boots", 1_625_000, 1],
      ["steady", 10_000_000, 1],
      ["cartSyn", 2_000_000, 1],
      ["drillSyn", 3_000_000, 1],
      ["borerSyn", 15_000_000, 1],
      ["machineSyn", 30_000_000, 1],
    ]);
  });

  it("prices a promotion from 1M, doubling per engineer", () => {
    expect(PROMOTE_BASE_COST).toBe(1_000_000);
  });

  it("prices each boost in taps or crew seconds, with a floor", () => {
    expect(
      BOOSTS.map(({ id, priceIn, priceUnits, minCost }) => [
        id,
        priceIn,
        priceUnits,
        minCost,
      ]),
    ).toEqual([
      ["sharper", "taps", 120, 100],
      ["overtime", "crewSeconds", 180, 500],
    ]);
  });
});
