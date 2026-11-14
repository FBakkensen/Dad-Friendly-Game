// Long economy sims: the sim project (npm run gate -- full), not the fast tier.
import { describe, expect, it } from "vitest";
import { readFinishDay } from "./measures/finishDay";
import longestDeadStretch from "./measures/longestDeadStretch";
import longestValueStretch from "./measures/longestValueStretch";
import casual from "./policies/casual-2x10";
import { runTournament } from "./tournament";
import { diagnosisOf, sampleCasualRun } from "./casual";
import { HOURS_PER_DAY, TARGETS } from "./targets";

describe("casual run", { timeout: 120_000 }, () => {
  it("reproduces the diagnosis, with payback reported beside it", () => {
    const run = sampleCasualRun();
    const report = diagnosisOf(run.samples);
    // The pacing dad does not craft. On the #357 retune his climb still ends
    // on day 4.5. His payback table is never quiet for long: one minute on
    // day 1.5. The value-per-stone score waits out the night before the
    // Deep Heart's next Great Machine (11.95 h from day 3.5). That is the
    // report-only value-per-stone score. It passes the half-day limit with
    // about 3 minutes to spare (0.498 of a day). The payback score waited
    // about a minute until the Gold rush (#468); now he taps the quick vein
    // and the held stones come in with no dead minute.
    // Since away pay splits at a band crossing (#592), the night before the
    // Deep Heart's next Great Machine is quiet on the payback table too.
    // On the line (#536) the climb ends on day 6, and the longest quiet
    // night is 11.98 h from day 5 on both tables, inside the half-day limit
    // by about a minute.
    expect(run.finishDay).toBe(6);
    expect(readFinishDay(run.samples)).toBe(6);
    expect(report.value.singleShare).toBeCloseTo(0.32, 3);
    expect(report.value.deadHours).toBeCloseTo(11.98, 2);
    expect(report.value.deadHours / HOURS_PER_DAY).toBeLessThanOrEqual(0.5);
    expect(report.value.deadStartDay).toBeCloseTo(5, 1);
    expect(report.payback.singleShare).toBeCloseTo(0.16, 3);
    expect(report.payback.deadHours).toBeCloseTo(11.98, 2);
    expect(report.payback.deadHours / HOURS_PER_DAY).toBeLessThanOrEqual(0.5);
    expect(report.payback.deadStartDay).toBeCloseTo(5, 1);
  });

  it("keeps the payback wait to half a day at most after the first borer", () => {
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
    // The lab's strict limit (#252): half a day of waiting at most.
    expect(payback.value).toBeLessThanOrEqual(0.5 * HOURS_PER_DAY);
    // Report-only (#252 follow-up): the value-per-stone dad saves at most a
    // day. Pinned so a change shows.
    expect(value.value).toBeLessThanOrEqual(HOURS_PER_DAY);
    // On the line (#536) two nights are the long waits, each logged once
    // for each score: for a train from day 2.5 (11.97 h) and for a hoist from
    // day 3.5 (11.85 h).
    expect(result.deadStretches).toHaveLength(4);
    expect(
      result.deadStretches.map((note) => [note.savingFor, note.score]),
    ).toEqual([
      ["buyTier:train", "payback"],
      ["buyTier:hoist", "payback"],
      ["buyTier:train", "value"],
      ["buyTier:hoist", "value"],
    ]);
  }, 120_000);
});
