import { defineMeasure, MOVE_KINDS, type DecisionSample } from "../measure";

/** Kinds that were on the table and never the best payback move. */
export function neverBest(
  samples: readonly DecisionSample[],
): readonly string[] {
  const seen = new Set<string>();
  const won = new Set<string>();
  for (const sample of samples) {
    for (const kind of sample.optionKinds) {
      seen.add(kind);
    }
    if (sample.bestKind !== "") {
      won.add(sample.bestKind);
    }
  }
  return MOVE_KINDS.filter((kind) => seen.has(kind) && !won.has(kind));
}

export default defineMeasure({
  id: "typeEverBest",
  label: "Never the best",
  unit: "kinds",
  why: "A kind that is never the right buy is a rule the dad never gets to use.",
  aggregate: (samples) => neverBest(samples),
});
