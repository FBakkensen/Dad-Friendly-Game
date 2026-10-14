import { defineMeasure, type DecisionSample } from "../measure";

/**
 * Share of open-workshop time the bench is empty. Time between samples
 * counts, including the gap after a sitting. No open sample is n/a.
 * Report only: it is not a guardrail.
 */
export function benchIdleShare(samples: readonly DecisionSample[]): number {
  const ordered = [...samples].sort((left, right) => left.atMs - right.atMs);
  let open = 0;
  let empty = 0;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const sample = ordered[index];
    const next = ordered[index + 1];
    if (
      sample === undefined ||
      next === undefined ||
      sample.workshopOpen !== true
    ) {
      continue;
    }
    const span = next.atMs - sample.atMs;
    if (!(span > 0)) {
      continue;
    }
    open += span;
    if (sample.benchFree !== false) {
      empty += span;
    }
  }
  if (!(open > 0)) {
    return Number.NaN;
  }
  return empty / open;
}

export default defineMeasure({
  id: "benchIdle",
  label: "Bench idle",
  unit: "share",
  why: "How much of the open workshop the bench sits empty, once a dad can craft.",
  aggregate: (samples) => benchIdleShare(samples),
});
