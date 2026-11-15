import { freshShare } from "../fresh-view";
import { defineMeasure } from "../measure";

/** #655, report-only (slice 1 spec, "Lab", risk 4). NaN outside a fresh mine. */
export default defineMeasure({
  id: "starved",
  label: "Starved by the order",
  unit: "share",
  why: "The order must not eat what he was saving: he should still afford the cheapest buy.",
  aggregate: (samples) =>
    freshShare(
      samples,
      () => true,
      (view) => view.starved,
    ),
});
