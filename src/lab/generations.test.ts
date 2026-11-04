import { describe, expect, it } from "vitest";
import casual from "./policies/casual-2x10";
import {
  MACHINE_IDS,
  eachRunLonger,
  linearModelDays,
  noRunPastCap,
  onceADayRunsOk,
  runLengthOk,
  rootModelDays,
  runGenerations,
} from "./generations";
import { RUN_CAP_DAYS } from "./targets";

describe("generations lab (M13, #253)", () => {
  it("plays kid runs back to back on the game's stretch", () => {
    const runs = runGenerations({ policy: casual, seed: 1, runs: 2 });
    expect(runs.map((run) => run.run)).toEqual([1, 2]);
    expect(runs.map((run) => run.k)).toEqual([1, 1.75]);
    expect(runs[0]?.finishDay).toBe(6);
    expect(runs[1]?.finishDay).toBeGreaterThan(6);
    expect(runs[0]?.unbought).toEqual([]);
    expect(MACHINE_IDS).toContain("borer");
  }, 60_000);

  it("stops when a run never reaches the bottom", () => {
    const runs = runGenerations({
      policy: casual,
      seed: 1,
      runs: 2,
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

  it("judges once-a-day players by their own run 1", () => {
    expect(onceADayRunsOk([7, 8, 8, 9])).toBe(true);
    expect(onceADayRunsOk([7, 6])).toBe(false);
    expect(onceADayRunsOk([7, 9.5])).toBe(false);
    expect(onceADayRunsOk([7, undefined])).toBe(false);
    expect(onceADayRunsOk([undefined])).toBe(false);
    expect(runLengthOk([7, 8, 9], 1)).toBe(true);
    expect(runLengthOk([6, 6.5, 7.5], 2)).toBe(true);
    expect(runLengthOk([6, 6.5, 8], 2)).toBe(false);
    expect(runLengthOk([6, 6], 2)).toBe(false);
  });

  it("models a run stretched by k over the bonus", () => {
    expect(linearModelDays(5.5, 3, 1.5)).toBe(11);
    expect(rootModelDays(5.5, 4, 1)).toBe(11);
  });
});
