import { defineMeasure } from "../measure";
import { deadGoodShare } from "../nights";

/** #667, report-only (slice 1 spec, "Lab"), weighed by time, nights included. NaN until the stockyard opens. */
export default defineMeasure({
  id: "deadGood",
  label: "Full stockpile, nothing takes it",
  unit: "share",
  why: "A full stockpile with nothing to spend it on is time the mine works for nothing.",
  aggregate: deadGoodShare,
});
