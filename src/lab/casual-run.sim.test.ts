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
    // The pacing dad does not craft. The M12 retune (#252) ends his climb on
    // day 6. On day 2.5 he waits one sitting for the borer at 7M: one quiet
    // half day, at the lab's strict limit for a casual dad.
    expect(run.finishDay).toBe(6);
    expect(readFinishDay(run.samples)).toBe(6);
    // #327: kids at 250K and 25/s are worth buying, so the single buy's
    // share of value drops.
    expect(report.value.singleShare).toBeCloseTo(0.22, 3);
    expect(report.value.deadHours).toBeCloseTo(12, 2);
    expect(report.value.deadHours / HOURS_PER_DAY).toBeLessThanOrEqual(0.5);
    expect(report.value.deadStartDay).toBeCloseTo(2.5, 1);
    expect(report.payback.singleShare).toBeCloseTo(0.33, 3);
    expect(report.payback.deadHours).toBeCloseTo(12, 2);
    expect(report.payback.deadStartDay).toBeCloseTo(2.5, 1);
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
    // Report-only (#252 follow-up): the value-per-stone dad saves a full day
    // for the borer, and two stretches are logged (#278). Pinned so a change shows.
    expect(value.value).toBeLessThanOrEqual(HOURS_PER_DAY);
    // One since #327: the kid fills what was the second quiet stretch.
    expect(result.deadStretches).toHaveLength(1);
  }, 120_000);
});
