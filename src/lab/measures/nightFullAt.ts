import { defineMeasure } from "../measure";
import { nightFullAt } from "../nights";

/** #667, report-only (slice 1 spec, "Lab"). NaN when no night filled the stockyard. */
export default defineMeasure({
  id: "nightFullAt",
  label: "How far into the night it filled, median",
  unit: "share of the night",
  why: "A night that fills near morning is room well sized; one that fills early is too small a yard.",
  aggregate: nightFullAt,
});
