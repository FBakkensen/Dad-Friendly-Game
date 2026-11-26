import { defineMeasure, type DecisionSample } from "../measure";

/** The day The Foundry went operational. Infinity when the run did not reach its roof. */
function readFoundryDay(samples: readonly DecisionSample[]): number {
  for (const sample of samples) {
    if (sample.foundryDay !== undefined && Number.isFinite(sample.foundryDay)) {
      return sample.foundryDay;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * #675, guarded by `slice-five-days` (five days or more, Flemming's A,
 * 16 Nov 2026; slice 1 spec, "Lab"; #556; Flemming, Option A, PR #793).
 * The day The Foundry's roof went on in a run that plays part 3, even when
 * Part 2 continues to The Research Lab. NaN before part 3, and Infinity when
 * the run did not reach The Foundry's roof.
 */
export default defineMeasure({
  id: "sliceDays",
  label: "Days to the slice's end",
  unit: "days",
  why: "The whole slice, to the Foundry's roof, should take five days or more for every player type.",
  aggregate: (samples) =>
    samples.some((sample) => sample.fresh?.partThree === true)
      ? readFoundryDay(samples)
      : Number.NaN,
});
