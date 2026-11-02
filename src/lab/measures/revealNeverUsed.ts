import { defineMeasure } from "../measure";
import { neverUsed } from "../reveal";

/** Report only: shown on screen in some run and never used in any. */
export default defineMeasure({
  id: "revealNeverUsed",
  label: "Shows up, never used",
  unit: "ids",
  why: "A thing on screen the dad never touches is clutter or a missing lesson.",
  aggregate: (samples) =>
    neverUsed(samples.flatMap((sample) => sample.reveals ?? [])),
});
