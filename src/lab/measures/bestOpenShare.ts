import { defineMeasure } from "../measure";
import { bestOpenShare, sittingsOf } from "../sittings";

/** Balance review (Nov 2026). Is the best buy in reach when he sits down? */
export default defineMeasure({
  id: "bestOpenShare",
  label: "Best buy affordable at open",
  unit: "share",
  why: "When the best buy is always out of reach, the cheaper buttons are scenery.",
  aggregate: (samples) => bestOpenShare(sittingsOf(samples)),
});
