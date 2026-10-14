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
    // #177: 240M of stone and a 67M Great Machine. The plain dad finishes
    // on day 5.5. The longest payback wait stays under half a day and
    // starts just after the borer.
    expect(run.finishDay).toBe(5.5);
    expect(readFinishDay(run.samples)).toBe(5.5);
    expect(report.value.singleShare).toBeCloseTo(0.056, 3);
    expect(report.value.deadHours / HOURS_PER_DAY).toBeCloseTo(0.99, 2);
    expect(report.value.deadStartDay).toBeCloseTo(2.5, 1);
    expect(report.payback.singleShare).toBeCloseTo(0.056, 3);
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
    // #178: tending and a valued find make the next buy affordable inside
    // the sitting, so the payback wait drops under an hour and is not
    // listed. Value-per-stone still waits after the borer. A craft only
    // takes the bench when it sits near that buy, so it does not erase
    // the wait.
    expect(payback.value).toBeLessThan(1);
    expect(value.value / HOURS_PER_DAY).toBeCloseTo(0.99, 2);
    const valueNotes = result.deadStretches.filter(
      (stretch) => stretch.score === "value",
    );
    const paybackNotes = result.deadStretches.filter(
      (stretch) => stretch.score === "payback",
    );
    const valueNote = valueNotes.reduce((best, stretch) =>
      stretch.hours > best.hours ? stretch : best,
    );
    expect(paybackNotes).toEqual([]);
    expect(valueNote.startDay).toBeCloseTo(2.5, 1);
    expect(result.deadStretches.map((stretch) => stretch.score)).toEqual(
      expect.arrayContaining(["value"]),
    );
  }, 120_000);
});
