import { defineMeasure } from "../measure";
import { nightFullShare } from "../nights";

/** #667, report-only (slice 1 spec, "Lab"). NaN until a long night with the stockyard open. */
export default defineMeasure({
  id: "nightFull",
  label: "Nights a full stockyard ends",
  unit: "share",
  why: "The stockyard should hold a night: a mine that stops at midnight wastes the dad's sleep.",
  aggregate: nightFullShare,
});
