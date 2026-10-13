import { defineMeasure } from "../measure";
import { longestDeadHours } from "../stretch";
import { DEAD_STRETCH } from "../targets";

/** The same unpaid gap, scored by stones of income per stone of cost. */
export default defineMeasure({
  id: "longestValueStretch",
  label: "Value-per-stone stretch",
  unit: DEAD_STRETCH.unit,
  why: "Payback is the official clock. This is the same wait scored by stones per stone.",
  aggregate: (samples) => longestDeadHours(samples, "value"),
});
