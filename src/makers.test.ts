import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import {
  buyMaker,
  kilnRate,
  makerPrice,
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
