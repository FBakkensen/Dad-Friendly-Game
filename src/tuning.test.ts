import { describe, expect, it } from "vitest";
import { BAND_SCALE, BAND_STARTS } from "./scale";
import {
  HELPER_COST_GROWTH,
  MACHINE_COST_GROWTH,
  TIERS,
  tierById,
  tierCost,
} from "./tiers";

/**
 * The deliberate pins on the tuned prices (#381). A price-only retune breaks
 * these and nothing else: every other test computes its prices from
 * `tierCost`, `upgradeCost`, `promoteCost` or `oneOffStretch`. Update this
 * file and docs/DESIGN.md "Numbers now" together. Pacing and lab regression
 * pins (`*.sim.test.ts`, `src/lab/`) pin outcomes, not prices, and live there.
 */
describe("tuned numbers (#357)", () => {
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
});
