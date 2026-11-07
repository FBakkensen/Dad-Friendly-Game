import { defineMeasure } from "../measure";
import { sittingsOf, zeroBuyShare } from "../sittings";

/** Balance review (Nov 2026). Share of sittings where the dad bought nothing. */
export default defineMeasure({
  id: "zeroBuySittings",
  label: "Sittings with no buy",
  unit: "share",
  why: "A check-in that buys nothing is a check-in with nothing to do.",
  aggregate: (samples) => zeroBuyShare(sittingsOf(samples)),
});
