import { defineMeasure, type DecisionSample } from "../measure";
import { mean } from "../stats";
import { TENDING_SOURCE } from "../targets";

function tendingShare(sample: DecisionSample): number {
  return sample.outputShare[TENDING_SOURCE] ?? 0;
}

/**
 * Tending's share of output. The guardrail's scope keeps the samples from
 * the borer onward; this file only reads the share. An empty list is n/a:
 * the dad never reached the source the scope asked for.
 */
export default defineMeasure({
  id: "featureShare",
  label: "Tending share",
  unit: "share",
  why: "Tending should show up in the output, or the post is not worth the walk.",
  sample: tendingShare,
  aggregate: (samples) =>
    samples.length === 0 ? Number.NaN : mean(samples.map(tendingShare)),
});
