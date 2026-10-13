import { defineMeasure } from "../../measure";

export default defineMeasure({
  id: "same",
  label: "Same again",
  unit: "count",
  why: "The second file with that id should fail the load.",
  aggregate: () => 0,
});
