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

describe("casual run", { timeout: 120_000 }, () => {
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
    // The pacing dad does not craft. Hardened borers put that climb on
    // day 6. Payback has no dead stretch. Value-per-stone waits about
    // two days, starting on day 3. The lab dad who greases finishes sooner.
    expect(run.finishDay).toBe(6);
    expect(readFinishDay(run.samples)).toBe(6);
    expect(report.value.singleShare).toBeCloseTo(0.48, 3);
    expect(report.value.deadHours / HOURS_PER_DAY).toBeCloseTo(1.999, 3);
    expect(report.value.deadStartDay).toBeCloseTo(3, 1);
    expect(report.payback.singleShare).toBeCloseTo(0.1, 3);
    expect(report.payback.deadHours).toBe(0);
    expect(report.payback.deadStartDay).toBeUndefined();
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
    // Payback no longer spends a night saving. Value-per-stone still
    // waits on the Great Machine, starting on day 3.
    expect(payback.value).toBeLessThanOrEqual(0.5);
    expect(value.value / HOURS_PER_DAY).toBeCloseTo(1.506, 3);
    const valueNotes = result.deadStretches.filter(
      (stretch) => stretch.score === "value",
    );
    const paybackNotes = result.deadStretches.filter(
      (stretch) => stretch.score === "payback",
    );
    const valueNote = valueNotes.reduce((best, stretch) =>
      stretch.hours > best.hours ? stretch : best,
    );
    expect(paybackNotes).toHaveLength(0);
    expect(valueNote).toMatchObject({
      savingFor: "buyTier:machine",
      score: "value",
    });
    expect(valueNote.hours).toBeCloseTo(36.149, 2);
    expect(valueNote.startDay).toBeCloseTo(3, 1);
  }, 120_000);
});
