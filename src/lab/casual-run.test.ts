import { describe, expect, it } from "vitest";
import { readFinishDay } from "./measures/finishDay";
import longestDeadStretch from "./measures/longestDeadStretch";
import longestValueStretch from "./measures/longestValueStretch";
import casual from "./policies/casual-2x10";
import { runTournament } from "./tournament";
import {
  dayNumber,
  diagnosisOf,
  isSampleSecond,
  sampleCasualRun,
  withFinish,
} from "./casual";
import { DAY_MS, HOURS_PER_DAY, SAMPLE_INTERVAL_SEC, TARGETS } from "./targets";

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
    // #177: the 595/s borer finishes the plain dad on day 5, and the
    // payback wait drops from about a day to under half a day.
    expect(run.finishDay).toBe(5);
    expect(readFinishDay(run.samples)).toBe(5);
    expect(report.value.singleShare).toBeCloseTo(0.45, 2);
    expect(report.value.deadHours / HOURS_PER_DAY).toBeCloseTo(2, 1);
    expect(report.value.deadStartDay).toBeCloseTo(2.5, 1);
    expect(report.payback.singleShare).toBeCloseTo(0.075, 3);
    expect(report.payback.deadHours / HOURS_PER_DAY).toBeCloseTo(0.5, 1);
    expect(report.payback.deadStartDay).toBeCloseTo(2.5, 1);
  });

  it("keeps the payback wait under half a day after the first borer", () => {
    const result = runTournament({
      policies: [casual],
      measures: [longestDeadStretch, longestValueStretch],
      targets: TARGETS,
      seeds: [1],
      days: 6,
    });
    const row = result.rows[0];
    const payback = row?.cells.find(
      (cell) => cell.measureId === "longestDeadStretch",
    );
    const value = row?.cells.find(
      (cell) => cell.measureId === "longestValueStretch",
    );
    expect(typeof payback?.value).toBe("number");
    expect(typeof value?.value).toBe("number");
    if (
      typeof payback?.value !== "number" ||
      typeof value?.value !== "number"
    ) {
      return;
    }
    expect(payback.value / HOURS_PER_DAY).toBeCloseTo(0.5, 1);
    expect(value.value / HOURS_PER_DAY).toBeCloseTo(2, 1);
    const valueNotes = result.deadStretches.filter(
      (stretch) => stretch.score === "value",
    );
    const paybackNotes = result.deadStretches.filter(
      (stretch) => stretch.score === "payback",
    );
    const valueNote = valueNotes.reduce((best, stretch) =>
      stretch.hours > best.hours ? stretch : best,
    );
    const paybackNote = paybackNotes.reduce((best, stretch) =>
      stretch.hours > best.hours ? stretch : best,
    );
    expect(valueNote.startDay).toBeCloseTo(2.5, 1);
    expect(paybackNote.startDay).toBeCloseTo(2.5, 1);
    expect(paybackNote.hours / HOURS_PER_DAY).toBeLessThanOrEqual(0.5);
    expect(result.deadStretches.map((stretch) => stretch.score)).toEqual(
      expect.arrayContaining(["payback", "value"]),
    );
  });
});
