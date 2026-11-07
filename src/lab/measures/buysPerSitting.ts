import { defineMeasure } from "../measure";
import { medianBuys, sittingsOf } from "../sittings";

/** Balance review (Nov 2026). The typical check-in's shopping. */
export default defineMeasure({
  id: "buysPerSitting",
  label: "Buys per sitting, median",
  unit: "buys",
  why: "Coming back should feel like a small shopping trip, not one button or none.",
  aggregate: (samples) => medianBuys(sittingsOf(samples)),
});
