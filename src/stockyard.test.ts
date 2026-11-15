import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { PART_TWO_OFF } from "./part-switch";
import { priceAmount } from "./stock";
import {
  expandPrice,
  expandStockyard,
  MAX_STOCKYARD_LEVEL,
  priceFits,
  stockpileFull,
  stockpileRoom,
  stockyardOpen,
} from "./stockyard";

/** The stockyard (slice 1, rule 4, #666). */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

function yard(level: number, operational: Mountain["operational"]): Mountain {
  return { ...createMountain(), stockyard: level, operational };
}

describe("the stockyard (#666)", () => {
  it("opens with the Light Tower in part 2; before it the pocket has no limit", () => {
    partTwo(() => {
      expect(stockyardOpen(yard(0, []))).toBe(false);
      expect(stockpileRoom(yard(0, []), "stones")).toBe(Infinity);
      expect(stockyardOpen(yard(0, ["lightTower"]))).toBe(true);
    });
    withFactors({ [FRESH_OFF]: 0 }, () => {
      expect(stockyardOpen(yard(0, ["lightTower"]))).toBe(false);
      expect(stockpileRoom(yard(0, ["lightTower"]), "stones")).toBe(Infinity);
    });
  });

  it("holds 3M stone and 500K brick at level 0, three times as much a level, twice with the Warehouse", () => {
    partTwo(() => {
      const first = yard(0, ["lightTower"]);
      expect(stockpileRoom(first, "stones")).toBe(3_000_000);
      expect(stockpileRoom(first, "brick")).toBe(500_000);
      expect(stockpileRoom(yard(2, ["lightTower"]), "brick")).toBe(4_500_000);
      const stored = yard(1, ["lightTower", "warehouse"]);
      expect(stockpileRoom(stored, "stones")).toBe(18_000_000);
      expect(stockpileRoom(stored, "brick")).toBe(3_000_000);
      // A good with no stockpile in part 2 has no limit.
      expect(stockpileRoom(first, "clay")).toBe(Infinity);
    });
  });

  it("expands for brick: 150K, ×3 a level, at once", () => {
    partTwo(() => {
      const start = yard(0, ["lightTower"]);
      const rich = { ...start, stock: { ...start.stock, brick: 200_000 } };
      expect(expandPrice(rich)).toEqual([{ good: "brick", amount: 150_000 }]);
      const expanded = expandStockyard(rich);
      expect(expanded.stockyard).toBe(1);
      expect(expanded.stock.brick).toBe(50_000);
      expect(expandPrice(expanded)).toEqual([
        { good: "brick", amount: 450_000 },
      ]);
      expect(expandStockyard(expanded)).toBe(expanded);
      const dark = { ...rich, operational: [] };
      expect(expandStockyard(dark)).toBe(dark);
    });
  });

  it("stops at its last level, where every room and price is still a whole number", () => {
    partTwo(() => {
      const top = yard(MAX_STOCKYARD_LEVEL, ["lightTower", "warehouse"]);
      const rich = {
        ...top,
        stock: { ...top.stock, brick: Number.MAX_SAFE_INTEGER },
      };
      expect(expandStockyard(rich)).toBe(rich);
      for (const good of ["stones", "brick"] as const) {
        expect(Number.isSafeInteger(stockpileRoom(top, good))).toBe(true);
      }
      expect(Number.isSafeInteger(priceAmount(expandPrice(top), "brick"))).toBe(
        true,
      );
    });
  });

  it("the next level never costs more than the brick stockpile holds", () => {
    partTwo(() => {
      fc.assert(
        fc.property(fc.nat(12), fc.boolean(), (level, warehouse) => {
          const mountain = yard(
            level,
            warehouse ? ["lightTower", "warehouse"] : ["lightTower"],
          );
          expect(
            priceAmount(expandPrice(mountain), "brick"),
          ).toBeLessThanOrEqual(stockpileRoom(mountain, "brick"));
        }),
      );
    });
  });

  it("says when a price does not fit its stockpile, and when one is full", () => {
    partTwo(() => {
      const first = yard(0, ["lightTower"]);
      expect(priceFits(first, [{ good: "brick", amount: 500_000 }])).toBe(true);
      expect(priceFits(first, [{ good: "brick", amount: 500_001 }])).toBe(
        false,
      );
      const full = { ...first, stock: { ...first.stock, stones: 3_000_000 } };
      expect(stockpileFull(full, "stones")).toBe(true);
      expect(stockpileFull(full, "brick")).toBe(false);
    });
  });
});
