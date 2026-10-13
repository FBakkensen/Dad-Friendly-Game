import { defineMeasure } from "../measure";
import { readFinishDay } from "./finishDay";

/**
 * How much later a dad finishes than the optimizer.
 * The optimizer is 1. A later finish is higher.
 */
export function regret(
  policyFinishDay: number,
  optimizerFinishDay: number,
): number {
  if (!(optimizerFinishDay > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  return policyFinishDay / optimizerFinishDay;
}

export default defineMeasure({
  id: "regret",
  label: "Regret",
  unit: "ratio",
  why: "How much later a dad finishes than the one who plays the payback.",
  aggregate: (samples, context) => {
    const policy = readFinishDay(samples);
    const optimizer = context?.optimizerFinishDay;
    if (optimizer === undefined) {
      return Number.NaN;
    }
    return regret(policy, optimizer);
  },
});
