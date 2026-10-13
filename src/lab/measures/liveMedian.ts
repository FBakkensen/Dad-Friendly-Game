import { defineMeasure, type DecisionSample } from "../measure";
import { median } from "../stats";

function liveCount(sample: DecisionSample): number {
  return sample.liveCount;
}

/** Median live-option count. The guardrail drops the first hour itself. */
export default defineMeasure({
  id: "liveMedian",
  label: "Live options, median",
  unit: "options",
  why: "The typical moment should put more than one option on the table.",
  sample: liveCount,
  aggregate: (samples) => median(samples.map(liveCount)),
});
