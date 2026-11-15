import { freshMean } from "../fresh-view";
import { defineMeasure } from "../measure";

/** #655, report-only (slice 1 spec, "Lab", risk 11). NaN outside a fresh mine. */
export default defineMeasure({
  id: "idleWorkers",
  label: "Workers with nothing to do",
  unit: "share",
  why: "Free workers and jobs with nothing to do are what a dad would move: the chore's size.",
  aggregate: (samples) => freshMean(samples, (view) => view.idleWorkers),
});
