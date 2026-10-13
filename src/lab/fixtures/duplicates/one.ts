import { defineMeasure } from "../../measure";

export default defineMeasure({
  id: "same",
  label: "Same",
  unit: "count",
  why: "A duplicate id should fail the load.",
  aggregate: () => 0,
});
