import { describe, expect, it } from "vitest";
import { placeOrder } from "../city";
import { withFactors } from "../economy/factors";
import { FRESH_OFF } from "../line-switch";
import { createMountain, type Mountain } from "../mountain";
import { PART_TWO_OFF } from "../part-switch";
import { EMPTY_STOCK, type Stock } from "../stock";
import { MAX_STOCKYARD_LEVEL, stockpileRoom } from "../stockyard";
import { NO_JOBS, type Jobs } from "../workforce";
import { freshPlan, goodsIncome } from "./fresh-dad";
import type { FreshHabits } from "./policy";

/** How part 2's dad plays: kilns for brick, and room in the stockyard (#667). */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);
const partOne = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const ONCE: FreshHabits = { moves: "once", hold: "on-value", upgrades: false };

const STAGES = { drilling: 6, haulage: 6, hoisting: 6 };

/** A fresh mine with the Light Tower up, these jobs, kilns, stock and half-full piles. */
function lit(
  jobs: Partial<Jobs>,
  {
    kilns = 0,
    stock = {},
    stockyard = 0,
    operational = ["lightTower"],
  }: {
    kilns?: number;
    stock?: Partial<Stock>;
    stockyard?: number;
    operational?: Mountain["operational"];
  } = {},
): Mountain {
  const start = createMountain();
  const placed = { ...NO_JOBS, ...jobs };
  const onJobs = Object.values(placed).reduce((sum, n) => sum + n, 0);
  return {
    ...start,
    owned: { ...start.owned, helper: onJobs },
    jobs: placed,
    stock: { ...EMPTY_STOCK, ...stock },
    makers: { kiln: kilns },
    piles: { face: 150, shaft: 150, kiln: 0 },
    operational,
    stockyard,
  };
}

describe("what the mine brings of each good (#667)", () => {
  it("gives the running kilns their rock first, and the rest is stone", () => {
    partTwo(() => {
      // Six workers with tools on each stage move 18 a second.
      expect(goodsIncome(lit(STAGES))).toEqual({ stones: 18, brick: 0 });
      expect(goodsIncome(lit({ ...STAGES, kilns: 1 }, { kilns: 1 }))).toEqual({
        stones: 6,
        brick: 12,
      });
      // Two kilns could take 24: they take what the line moves.
      expect(goodsIncome(lit({ ...STAGES, kilns: 2 }, { kilns: 2 }))).toEqual({
        stones: 0,
        brick: 18,
      });
      // A kiln with nobody on it makes nothing.
      expect(goodsIncome(lit(STAGES, { kilns: 1 })).brick).toBe(0);
    });
  });
});

describe("a kiln for the brick the Warehouse waits for (#667)", () => {
  it("buys a kiln and hires a worker for it while the building requires brick", () => {
    partTwo(() => {
      const ordered = placeOrder(
        lit(
          { ...STAGES, driving: 1, building: 2 },
          { stock: { stones: 1_000_000 } },
        ),
      );
      expect(freshPlan(ordered, ONCE, 1)).toEqual([
        { kind: "buyMaker", id: "kiln" },
        { kind: "buyTier", id: "helper" },
        { kind: "placeWorker", job: "kilns", count: 1 },
      ]);
    });
  });

  it("buys none in part 1, where nothing requires brick", () => {
    partOne(() => {
      const ordered = placeOrder(
        lit(
          { ...STAGES, driving: 1, building: 2 },
          { stock: { stones: 1_000_000 } },
        ),
      );
      expect(
        freshPlan(ordered, ONCE, 1).some(
          (action) => action.kind === "buyMaker",
        ),
      ).toBe(false);
    });
  });
});

/** Both buildings up: nothing left to order, so the yard is all that is left to weigh. */
const BUILT: Mountain["operational"] = ["lightTower", "warehouse"];

describe("room in the stockyard (#667)", () => {
  it("expands it when a stockpile is nearly full and the brick covers it", () => {
    partTwo(() => {
      const start = lit(STAGES, { operational: BUILT });
      const room = stockpileRoom(start, "stones");
      const full = lit(STAGES, {
        operational: BUILT,
        stock: { stones: room, brick: 200_000 },
      });
      expect(freshPlan(full, ONCE, 1)).toEqual([{ kind: "expandStockyard" }]);
    });
  });

  it("waits with no brick, and at the last level", () => {
    partTwo(() => {
      const room = stockpileRoom(lit(STAGES, { operational: BUILT }), "stones");
      const broke = lit(STAGES, {
        operational: BUILT,
        stock: { stones: room },
      });
      expect(freshPlan(broke, ONCE, 1)).not.toContainEqual({
        kind: "expandStockyard",
      });
      const top = lit(STAGES, {
        operational: BUILT,
        stockyard: MAX_STOCKYARD_LEVEL,
        stock: { brick: Number.MAX_SAFE_INTEGER },
      });
      const topFull = {
        ...top,
        stock: { ...top.stock, stones: stockpileRoom(top, "stones") },
      };
      expect(freshPlan(topFull, ONCE, 1)).not.toContainEqual({
        kind: "expandStockyard",
      });
    });
  });

  it("does not raise the line into a full stone stockpile", () => {
    partTwo(() => {
      const room = stockpileRoom(lit(STAGES, { operational: BUILT }), "stones");
      const full = lit(STAGES, { operational: BUILT, stock: { stones: room } });
      expect(freshPlan(full, ONCE, 1)).toEqual([]);
    });
  });

  it("moves no worker while hoisting stands at a full stockyard", () => {
    partTwo(() => {
      const room = stockpileRoom(lit(STAGES, { operational: BUILT }), "stones");
      const full = {
        ...lit(STAGES, { operational: BUILT, stock: { stones: room } }),
        piles: { face: 300, shaft: 300, kiln: 0 },
      };
      expect(freshPlan(full, ONCE, 1)).toEqual([]);
    });
  });
});
