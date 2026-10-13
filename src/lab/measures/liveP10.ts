import { defineMeasure, type DecisionSample } from "../measure";
import { percentile } from "../stats";
import { LIVE_P10 } from "../targets";

function liveCount(sample: DecisionSample): number {
  return sample.liveCount;
}

/** Tenth percentile of the live-option count. Thin moments show up here. */
export default defineMeasure({
  id: "liveP10",
  label: "Live options, tenth percentile",
  unit: "options",
  why: "A bad stretch should not be able to hide inside the average.",
  sample: liveCount,
  aggregate: (samples) => percentile(samples.map(liveCount), LIVE_P10),
});
