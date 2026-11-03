import { defineMeasure, type DecisionSample } from "../measure";
import { revealGaps, type RevealGap } from "../reveal";

/** Every appear-to-first-use wait in these samples, in sample order. */
export function gapsOf(
  samples: readonly DecisionSample[],
): readonly RevealGap[] {
  return revealGaps(samples.flatMap((sample) => sample.reveals ?? []));
}

/**
 * Longest live wait from a thing showing up to its first use. The
 * reveal-to-use target in targets.ts grades it for the casual dads (#248).
 */
export default defineMeasure({
  id: "revealToUse",
  label: "Reveal to use, longest",
  unit: "live hours",
  why: "Nothing should appear long before the dad can use it.",
  aggregate: (samples) =>
    Math.max(0, ...gapsOf(samples).map((gap) => gap.hours)),
});
