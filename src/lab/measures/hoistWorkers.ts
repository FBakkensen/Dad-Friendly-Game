import { freshMean } from "../fresh-view";
import { defineMeasure } from "../measure";

/** #675, report-only (slice 1 spec, "Lab", risk 1; rule 2.14). NaN until the Granite is open. */
export default defineMeasure({
  id: "hoistWorkers",
  label: "Mine workers on hoisting",
  unit: "share",
  why: "Hoisting should take the fewest of the mine's workers on both levels, so the stages stay apart.",
  aggregate: (samples) =>
    freshMean(samples, (view) => view.hoistShare ?? Number.NaN),
});
