import { defineMeasure } from "../measure";
import { percentile } from "../stats";
import { P90 } from "../targets";
import { gapsOf } from "./revealToUse";

/** Report only, like the longest wait. */
export default defineMeasure({
  id: "revealToUseP90",
  label: "Reveal to use, p90",
  unit: "live hours",
  why: "Most new things should be used soon after they show up.",
  aggregate: (samples) =>
    percentile(
      gapsOf(samples).map((gap) => gap.hours),
      P90,
    ),
});
