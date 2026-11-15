import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import {
  buyMaker,
  kilnRate,
  kilnTake,
  makerPrice,
  makerTakes,
  makersOpen,
  runningKilns,
} from "./makers";
import { createMountain, type Mountain } from "./mountain";
import { PART_TWO_OFF } from "./part-switch";
import { jobOpen } from "./workforce";

/** The kilns (slice 1, rule 3, #666). */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);
const partOne = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

function lit(stones: number): Mountain {
  const start = createMountain();
  return {
    ...start,
    operational: ["lightTower"],
    stock: { ...start.stock, stones },
  };
}

describe("the kilns (#666)", () => {
  it("open with the Light Tower, in part 2 only", () => {
    partTwo(() => {
      expect(makersOpen(createMountain())).toBe(false);
      expect(makersOpen(lit(0))).toBe(true);
      expect(jobOpen(lit(0), "kilns")).toBe(true);
      expect(jobOpen(createMountain(), "kilns")).toBe(false);
      expect(jobOpen(createMountain(), "drilling")).toBe(true);
    });
    partOne(() => {
      expect(makersOpen(lit(0))).toBe(false);
      expect(jobOpen(lit(0), "kilns")).toBe(false);
    });
    expect(makersOpen(lit(0))).toBe(false);
  });

  it("cost 15,000 stone, ×1.219 a kiln", () => {
    const start = lit(0);
    expect(makerPrice(start, "kiln")).toEqual([
      { good: "stones", amount: 15_000 },
    ]);
    expect(makerPrice({ makers: { kiln: 2 } }, "kiln")).toEqual([
      { good: "stones", amount: Math.ceil(15_000 * 1.219 ** 2) },
    ]);
  });

  it("are bought at once from the stock, and not before they open", () => {
    partTwo(() => {
      const bought = buyMaker(lit(20_000), "kiln");
      expect(bought.makers.kiln).toBe(1);
      expect(bought.stock.stones).toBe(5_000);
      const short = lit(14_999);
      expect(buyMaker(short, "kiln")).toBe(short);
      const dark = { ...lit(20_000), operational: [] };
      expect(buyMaker(dark, "kiln")).toBe(dark);
    });
    partOne(() => {
      const closed = lit(20_000);
      expect(buyMaker(closed, "kiln")).toBe(closed);
    });
  });

  it("run with one worker each; one with nobody on it is idle", () => {
    const start = createMountain();
    const three = { ...start, makers: { kiln: 3 } };
    expect(runningKilns({ ...three, jobs: { ...start.jobs, kilns: 0 } })).toBe(
      0,
    );
    expect(runningKilns({ ...three, jobs: { ...start.jobs, kilns: 2 } })).toBe(
      2,
    );
    expect(runningKilns({ ...three, jobs: { ...start.jobs, kilns: 5 } })).toBe(
      3,
    );
    expect(kilnRate({ ...three, jobs: { ...start.jobs, kilns: 2 } })).toBe(24);
  });
});

describe("the kilns' recipe (#723)", () => {
  const two = (): Mountain => {
    const start = createMountain();
    return {
      ...start,
      makers: { kiln: 3 },
      jobs: { ...start.jobs, kilns: 2 },
    };
  };

  it("takes two rock for one brick", () => {
    expect(makerTakes("kiln")).toBe(2);
    // Two running kilns make 24 brick a second of 48 rock.
    expect(kilnRate(two())).toBe(24);
    expect(kilnTake(two())).toBe(48);
  });

  it("is a lever the lab can sweep, in whole rock and never under one", () => {
    withFactors({ "recipe.kiln": 1.5 }, () => {
      expect(makerTakes("kiln")).toBe(3);
      expect(kilnTake(two())).toBe(72);
    });
    withFactors({ "recipe.kiln": 0.5 }, () => {
      expect(makerTakes("kiln")).toBe(1);
    });
    withFactors({ "recipe.kiln": 0.1 }, () => {
      expect(makerTakes("kiln")).toBe(1);
    });
    withFactors({ "recipe.kiln": 1.6 }, () => {
      expect(makerTakes("kiln")).toBe(3);
    });
  });
});

describe("the kilns' job in the moves (#666)", () => {
  it("offers a worker to the kilns only once they are open", async () => {
    const { listActions } = await import("./economy/actions");
    const moves = (mountain: Mountain): readonly string[] =>
      listActions(mountain, 0)
        .filter((action) => action.kind === "placeWorker")
        .map((action) => ("job" in action ? action.job : ""));
    const start = createMountain();
    const spare = (operational: Mountain["operational"]): Mountain => ({
      ...start,
      owned: { ...start.owned, helper: start.owned.helper + 1 },
      operational,
    });
    partTwo(() => {
      expect(moves(spare([]))).not.toContain("kilns");
      expect(moves(spare(["lightTower"]))).toContain("kilns");
    });
    partOne(() => {
      expect(moves(spare(["lightTower"]))).not.toContain("kilns");
    });
  });
});

describe("the kilns' job and price under the lab (#666)", () => {
  it("refuses a worker onto the kilns before they open", async () => {
    const { applyAction } = await import("./economy/actions");
    const start = createMountain();
    const spare = (operational: Mountain["operational"]): Mountain => ({
      ...start,
      owned: { ...start.owned, helper: start.owned.helper + 1 },
      operational,
    });
    const place = { kind: "placeWorker", job: "kilns", count: 1 } as const;
    partTwo(() => {
      const dark = spare([]);
      expect(applyAction(dark, place, 0)).toBe(dark);
      expect(applyAction(spare(["lightTower"]), place, 0).jobs.kilns).toBe(1);
    });
  });

  it("moves with a sweep of the machines' growth and the kiln's price", () => {
    const owned = { makers: { kiln: 1 } };
    withFactors({ "growth.machine": 2, "price.kiln": 0.5 }, () => {
      expect(makerPrice(owned, "kiln")).toEqual([
        { good: "stones", amount: Math.ceil(7_500 * 1.219 * 2) },
      ]);
    });
  });
});
