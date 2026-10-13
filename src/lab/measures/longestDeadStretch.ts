import { defineMeasure } from "../measure";
import { longestDeadHours } from "../stretch";
import { DEAD_STRETCH } from "../targets";

/** Longest wait on the best move, in hours. Payback is the official clock. */
export default defineMeasure({
  id: "longestDeadStretch",
  label: "Longest dead stretch",
  unit: DEAD_STRETCH.unit,
  why: "A long wait on the next buy is the gap the lab is here to catch.",
  aggregate: (samples) => longestDeadHours(samples, "payback"),
});
