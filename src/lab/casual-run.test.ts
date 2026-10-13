import { describe, expect, it } from "vitest";
import { readFinishDay } from "./measures/finishDay";
import {
  dayNumber,
  diagnosisOf,
  isSampleSecond,
  sampleCasualRun,
  withFinish,
} from "./casual";
import { DAY_MS, HOURS_PER_DAY, SAMPLE_INTERVAL_SEC } from "./targets";

describe("casual run", () => {
  it("samples every play-minute, including the start of a session", () => {
    expect(isSampleSecond(0)).toBe(true);
    expect(isSampleSecond(SAMPLE_INTERVAL_SEC)).toBe(true);
    expect(isSampleSecond(1)).toBe(false);
    expect(dayNumber(0)).toBe(1);
    expect(dayNumber(DAY_MS)).toBe(2);
    const bare = withFinish([], undefined);
    expect(bare).toEqual([]);
    expect(withFinish(bare, 5).map((sample) => sample.finishDay)).toEqual([]);
  });

  it("reproduces the diagnosis, with payback reported beside it", () => {
    const run = sampleCasualRun();
    const report = diagnosisOf(run.samples);
    expect(run.finishDay).toBe(5.5);
    expect(readFinishDay(run.samples)).toBe(5.5);
    expect(report.value.singleShare).toBeCloseTo(0.42, 2);
    expect(report.value.deadHours / HOURS_PER_DAY).toBeCloseTo(2, 1);
    expect(report.value.deadStartDay).toBeCloseTo(3, 1);
    expect(report.payback.singleShare).toBeGreaterThan(0);
    expect(report.payback.singleShare).toBeLessThan(1);
    expect(report.payback.deadHours).toBeGreaterThan(0);
    expect(report.payback.singleShare).not.toBe(report.value.singleShare);
  });
});
