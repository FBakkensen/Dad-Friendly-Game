import { freshShare } from "../fresh-view";
import { defineMeasure } from "../measure";

/** #667, report-only (slice 1 spec, "Lab"). NaN until the stockyard opens. */
export default defineMeasure({
  id: "deadGood",
  label: "Full stockpile, nothing takes it",
  unit: "share",
  why: "A full stockpile with nothing to spend it on is time the mine works for nothing.",
  aggregate: (samples) =>
    freshShare(
      samples,
      (view) => view.yardOpen,
      (view) => view.deadGood,
    ),
});
