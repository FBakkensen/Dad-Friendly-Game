import { defineMeasure, type DecisionSample } from "../measure";

/** The day The Research Lab went operational. NaN when not in play or not reached. */
function readResearchLabDay(samples: readonly DecisionSample[]): number {
  for (const sample of samples) {
    if (
      sample.researchLabDay !== undefined &&
      Number.isFinite(sample.researchLabDay)
    ) {
      return sample.researchLabDay;
    }
  }
  return Number.NaN;
}

/**
 * Report-only (Flemming, Option A, PR #793). Alongside docs/pacing-ledger.md,
 * which already has a The Research Lab column. NaN when Part 2 is off or the
 * run did not reach The Research Lab's roof.
 */
export default defineMeasure({
  id: "researchLabDays",
  label: "Days to the Research Lab",
  unit: "days",
  why: "Tracks when The Research Lab's roof goes on in Part 2 alongside the pacing ledger.",
  aggregate: (samples) => readResearchLabDay(samples),
});
