import { defineMeasure, type DecisionSample } from "../measure";

/** The day the mountain emptied. Infinity when the run did not finish. */
export function readFinishDay(samples: readonly DecisionSample[]): number {
  for (const sample of samples) {
    if (sample.finishDay !== undefined && Number.isFinite(sample.finishDay)) {
      return sample.finishDay;
    }
  }
  return Number.POSITIVE_INFINITY;
}

export default defineMeasure({
  id: "finishDay",
  label: "Finish day",
  unit: "days",
  why: "Finish days come second, and they still have to land in the week.",
  aggregate: (samples) => readFinishDay(samples),
});
