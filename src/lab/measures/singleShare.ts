import {
  defineMeasure,
  type DecisionSample,
  type ScoreMethod,
} from "../measure";
import { mean } from "../stats";
import { SINGLE_MAX_LIVE } from "../targets";

function liveOf(sample: DecisionSample, method: ScoreMethod): number {
  return method === "value"
    ? sample.stretch.value.liveCount
    : sample.stretch.payback.liveCount;
}

function asShare(live: number): number {
  return live <= SINGLE_MAX_LIVE ? 1 : 0;
}

/** Share of samples with at most one live option. Official score is payback. */
export function singleShareOf(
  samples: readonly DecisionSample[],
  method: ScoreMethod = "payback",
): number {
  return mean(samples.map((sample) => asShare(liveOf(sample, method))));
}

export default defineMeasure({
  id: "singleShare",
  label: "Single option",
  unit: "share",
  why: "A moment with one live spend on the dad's own table has nothing to choose.",
  sample: (sample) => asShare(liveOf(sample, "payback")),
  aggregate: (samples) => singleShareOf(samples, "payback"),
});
