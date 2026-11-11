import { defineMeasure } from "../measure";
import { medianTaps, sittingsOf } from "../sittings";

/** Buy ×10 / Max (#358). What the typical check-in's shopping costs in taps. */
export default defineMeasure({
  id: "tapsPerSitting",
  label: "Taps per sitting on Max, median",
  unit: "taps",
  why: "Spending a normal return should take a handful of taps, not a chore.",
  aggregate: (samples) => medianTaps(sittingsOf(samples)),
});
