import { describe, expect, it } from "vitest";
import { withFactors } from "../economy/factors";
import { createMountain, digStones, MOUNTAIN_STONES } from "../mountain";
import { stonesLeft } from "../scale";
import casual from "./policies/casual-2x10";
import {
  MACHINE_IDS,
  eachRunLonger,
  linearModelDays,
  noRunPastCap,
  rootModelDays,
  runGenerations,
} from "./generations";
import { RUN_CAP_DAYS } from "./targets";

describe("generations lab (M13, #253)", () => {
  it("stretches a run: k times the stones to dig and k times the prices", () => {
    const fresh = createMountain();
    expect(stonesLeft(fresh)).toBe(MOUNTAIN_STONES);
    withFactors({ "generation.k": 2 }, () => {
      expect(stonesLeft(fresh)).toBe(2 * MOUNTAIN_STONES);
      const dug = digStones(fresh, 1_000);
      expect(dug.pocket).toBe(1_000);
      expect(fresh.remaining - dug.remaining).toBe(500);
      expect(digStones(fresh, 2 * MOUNTAIN_STONES).remaining).toBe(0);
    });
  });

  it("plays kid runs back to back, each shorter today", () => {
    const runs = runGenerations({ policy: casual, seed: 1, ks: [1, 1] });
    expect(runs.map((run) => run.run)).toEqual([1, 2]);
    expect(runs[0]?.finishDay).toBe(6);
    expect(runs[1]?.finishDay).toBeCloseTo(4.5, 2);
    expect(runs[0]?.unbought).toEqual([]);
    expect(MACHINE_IDS).toContain("borer");
  }, 60_000);

  it("stops when a run never reaches the bottom", () => {
    const runs = runGenerations({
      policy: casual,
      seed: 1,
      ks: [1, 1],
      maxDays: 1,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.finishDay).toBeUndefined();
    expect(runs[0]?.unbought.length).toBeGreaterThan(0);
  });

  it("checks each run is longer than the last", () => {
    expect(eachRunLonger([5.5, 6, 6.5])).toBe(true);
    expect(eachRunLonger([5.5, 4.5])).toBe(false);
    expect(eachRunLonger([5.5, undefined])).toBe(false);
    expect(eachRunLonger([undefined])).toBe(false);
  });

  it("checks no run passes the cap", () => {
    expect(RUN_CAP_DAYS).toBe(7.5);
    expect(noRunPastCap([5.5, 7.5])).toBe(true);
    expect(noRunPastCap([5.5, 8])).toBe(false);
    expect(noRunPastCap([undefined])).toBe(false);
  });

  it("models a run stretched by k over the bonus", () => {
    expect(linearModelDays(5.5, 3, 1.5)).toBe(11);
    expect(rootModelDays(5.5, 4, 1)).toBe(11);
  });
});
