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
    // about 3 minutes to spare (0.498 of a day). The quick vein and the Gold
    // rush that once brought the held stones in went in #728.
    // Since away pay splits at a band crossing (#592), the night before the
    // Deep Heart's next Great Machine is quiet on the payback table too:
    // 11.98 h from day 3.5, inside the half-day limit by about a minute.
    // #728 took the upgrades and boosts that were the second buy at most
    // moments: the climb ends on day 6 (was 4.5), both scores have one live
    // buy at 0.28 of the samples (value 0.443, payback 0.314 before), and the
    // first long wait is the night on day 2 saving for the borer, still
    // 11.98 h and inside the half-day limit.
    expect(run.finishDay).toBe(6);
    expect(readFinishDay(run.samples)).toBe(6);
    expect(report.value.singleShare).toBeCloseTo(0.28, 3);
    expect(report.value.deadHours).toBeCloseTo(11.98, 2);
    expect(report.value.deadHours / HOURS_PER_DAY).toBeLessThanOrEqual(0.5);
    expect(report.value.deadStartDay).toBeCloseTo(2, 1);
    expect(report.payback.singleShare).toBeCloseTo(0.28, 3);
    expect(report.payback.deadHours).toBeCloseTo(11.98, 2);
    expect(report.payback.deadHours / HOURS_PER_DAY).toBeLessThanOrEqual(0.5);
    expect(report.payback.deadStartDay).toBeCloseTo(2, 1);
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
    // #357 tune: the night on day 3 before the next Great Machine was the one
    // long wait, logged once for each score. Since #728 there are seven, each
    // just under 12 h: the waits from day 2 and day 2.5 saving for the borer
    // (in both scores), the one from day 4.5 saving for a Great Machine
    // (both), and the one from day 4 for it in the value-per-stone score.
    expect(result.deadStretches).toHaveLength(7);
    expect(result.deadStretches.map((note) => note.savingFor).sort()).toEqual([
      ...Array<string>(4).fill("buyTier:borer"),
      ...Array<string>(3).fill("buyTier:machine"),
    ]);
  }, 120_000);
});
