import { ordered, freshShare } from "../fresh-view";
import { defineMeasure } from "../measure";

/** #655, report-only (slice 1 spec, "Lab", risk 12). NaN outside a fresh mine. */
export default defineMeasure({
  id: "siteFull",
  label: "Building site full",
  unit: "share",
  why: "If the site is never full the builders are a second transport, one more row to tap.",
  aggregate: (samples) =>
    freshShare(samples, ordered, (view) => view.siteFull),
});
