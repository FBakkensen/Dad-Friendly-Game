import { describe, expect, it } from "vitest";
import {
  applyMove,
  listActions,
  valueOf,
  type Action,
} from "./economy/actions";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { makerPrice } from "./makers";
import { PART_TWO_OFF } from "./part-switch";
import { sticker } from "./lab/decide";
import { EMPTY_STOCK, type Stock } from "./stock";
import { MAX_STOCKYARD_LEVEL, expandPrice } from "./stockyard";

/**
 * Part 2's buys as moves (slice 1, rules 3 and 4, #667): the lab's catalogue
 * and the store list and apply "Buy a kiln" and "Expand the stockyard" only
 * while they are open.
 */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);
const partOne = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

function mine(
  stock: Partial<Stock>,
  operational: Mountain["operational"] = ["lightTower"],
  stockyard = 0,
): Mountain {
  return {
    ...createMountain(),
    stock: { ...EMPTY_STOCK, ...stock },
    operational,
    stockyard,
  };
}

const KILN: Action = { kind: "buyMaker", id: "kiln" };
const EXPAND: Action = { kind: "expandStockyard" };

function yardMoves(mountain: Mountain): readonly Action[] {
  return listActions(mountain, 0).filter(
    (action) => action.kind === "buyMaker" || action.kind === "expandStockyard",
  );
}

describe("part 2's buys as moves (#667)", () => {
  it("lists a kiln and the next stockyard level once the Light Tower is up", () => {
    partTwo(() => {
      expect(yardMoves(mine({}))).toEqual([KILN, EXPAND]);
    });
  });

  it("lists neither before the Light Tower, nor in part 1", () => {
    partTwo(() => {
      expect(yardMoves(mine({}, []))).toEqual([]);
    });
    partOne(() => {
      expect(yardMoves(mine({}))).toEqual([]);
    });
  });

  it("stops listing the stockyard at its last level", () => {
    partTwo(() => {
      expect(yardMoves(mine({}, ["lightTower"], MAX_STOCKYARD_LEVEL))).toEqual([
        KILN,
      ]);
    });
  });

  it("buys a kiln for its stone and logs it", () => {
    partTwo(() => {
      const start = mine({ stones: 1_000_000 });
      const price = makerPrice(start, "kiln")[0]?.amount ?? 0;
      const result = applyMove(start, KILN, 0);
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      expect(result.mountain.makers.kiln).toBe(1);
      expect(result.spent.stones).toBe(price);
      expect(result.events).toEqual([
        { kind: "makerBought", id: "kiln", count: 1 },
      ]);
    });
  });

  it("expands the stockyard for its brick and logs it", () => {
    partTwo(() => {
      const start = mine({ brick: 400_000 });
      const price = expandPrice(start)[0]?.amount ?? 0;
      const result = applyMove(start, EXPAND, 0);
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      expect(result.mountain.stockyard).toBe(1);
      expect(result.spent.brick).toBe(price);
      expect(result.events).toEqual([{ kind: "stockyardExpanded", level: 1 }]);
    });
  });

  it("refuses either when the stock is short", () => {
    partTwo(() => {
      const broke = mine({});
      expect(applyMove(broke, KILN, 0).kind).toBe("refused");
      expect(applyMove(broke, EXPAND, 0).kind).toBe("refused");
    });
  });

  it("adds no stone income: the lab's own planner weighs them (#667)", () => {
    partTwo(() => {
      const start = mine({});
      const context = { liveSeconds: 600, awaySeconds: 0 };
      const price = makerPrice(start, "kiln")[0]?.amount ?? 0;
      expect(valueOf(start, KILN, 3600, context)).toEqual({
        gainPerSec: 0,
        cost: price,
        paybackSec: Infinity,
      });
      expect(valueOf(start, EXPAND, 3600, context)).toEqual({
        gainPerSec: 0,
        cost: 0,
        paybackSec: Infinity,
      });
      // The stone price the lab records: the kiln's, and none for brick.
      expect(sticker(start, KILN)).toBe(price);
      expect(sticker(start, EXPAND)).toBe(0);
    });
  });
});
