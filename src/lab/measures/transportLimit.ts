import { ordered, freshShare } from "../fresh-view";
import { defineMeasure } from "../measure";

/** #655, report-only (slice 1 spec, "Lab", risk 3). NaN outside a fresh mine. */
export default defineMeasure({
  id: "transportLimit",
  label: "Order held back by transport",
  unit: "share",
  why: "Transport should be a decision, not a tax: sometimes he takes a slower build for a faster mine.",
  aggregate: (samples) =>
    freshShare(samples, ordered, (view) => view.limit === "transport"),
});
