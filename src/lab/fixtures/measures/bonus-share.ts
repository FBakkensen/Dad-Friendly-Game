import { defineMeasure } from "../../measure";

/** A measure that exists only so discovery can be tested. */
export default defineMeasure({
  id: "bonusShare",
  label: "Bonus",
  unit: "count",
  why: "A fixture so one new file shows up in the results.",
  aggregate: (samples) => samples.length,
});
