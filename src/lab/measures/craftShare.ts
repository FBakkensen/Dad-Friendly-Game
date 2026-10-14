import { defineMeasure, type DecisionSample } from "../measure";
import { mean } from "../stats";
import { CRAFTED_SOURCE } from "../targets";

function craftedShare(sample: DecisionSample): number {
  return sample.outputShare[CRAFTED_SOURCE] ?? 0;
}

/**
 * Crafted gear's share of output. The guardrail's scope keeps the samples
 * from the Granite on. This file only reads the share. An empty list is
 * n/a: the dad never reached the band the scope asked for.
 */
export default defineMeasure({
  id: "craftShare",
  label: "Crafted share",
  unit: "share",
  why: "Crafted gear should show up in the output, or the bench is not worth the stones.",
  sample: craftedShare,
  aggregate: (samples) =>
    samples.length === 0 ? Number.NaN : mean(samples.map(craftedShare)),
});
