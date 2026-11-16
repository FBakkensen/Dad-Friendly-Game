import { describe, expect, it } from "vitest";
import { placeOrder } from "../city";
import { withFactors } from "../economy/factors";
import { createMountain, type Mountain } from "../mountain";
import { PART_TWO_OFF } from "../part-switch";
import { EMPTY_STOCK, type Stock } from "../stock";
import { MAX_STOCKYARD_LEVEL, stockpileRoom } from "../stockyard";
import { NO_JOBS, type Jobs } from "../workforce";
import { freshPlan, goodsIncome } from "./fresh-dad";
import type { FreshHabits } from "./policy";

/** How part 2's dad plays: kilns for brick, and room in the stockyard (#667). */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0 }, body);
const partOne = <T>(body: () => T): T => withFactors({}, body);

const ONCE: FreshHabits = { moves: "once", hold: "on-value", upgrades: false };

const STAGES = { drilling: 6, haulage: 6, hoisting: 6 };
const FAST = { drilling: 12, haulage: 12, hoisting: 12 };

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
    makers: { kiln: kilns, saw: 0 },
    piles: { face: 150, shaft: 150, kiln: 0 },
    operational,
    stockyard,
  };
}

describe("what the mine brings of each good (#667)", () => {
  it("gives the running kilns their recipe's rock first, and the rest is stone", () => {
    partTwo(() => {
      // Six workers with tools on each stage move 18 a second.
      expect(goodsIncome(lit(STAGES))).toEqual({ stones: 18, brick: 0 });
      // One kiln could make 12 brick a second, but takes two rock for each
      // (#723): the 18 lifted make 9 brick, and no stone is left.
      expect(goodsIncome(lit({ ...STAGES, kilns: 1 }, { kilns: 1 }))).toEqual({
        stones: 0,
        brick: 9,
      });
      // With a faster line, the kiln makes its 12 from 24 rock, and the
      // rest is stone.
      const fast = goodsIncome(lit(FAST)).stones ?? 0;
      expect(fast).toBeGreaterThan(24);
      expect(goodsIncome(lit({ ...FAST, kilns: 1 }, { kilns: 1 }))).toEqual({
        stones: fast - 24,
        brick: 12,
      });
      // Two kilns could take 48: they make what the line's rock allows.
      expect(goodsIncome(lit({ ...STAGES, kilns: 2 }, { kilns: 2 }))).toEqual({
        stones: 0,
        brick: 9,
      });
      // A kiln with nobody on it makes nothing.
      expect(goodsIncome(lit(STAGES, { kilns: 1 })).brick).toBe(0);
    });
  });
});

describe("a kiln for the brick the Warehouse waits for (#667)", () => {
  it("buys a kiln and hires a worker for it while the building requires brick", () => {
    partTwo(() => {
      // A line fast enough to feed a kiln its two rock a brick (#723): on the
      // slower line a kiln would leave no stone, and raising the line pays
      // sooner.
      const ordered = placeOrder(
        lit(
          { ...FAST, driving: 1, building: 2 },
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
