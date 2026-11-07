import { defineMeasure } from "../measure";
import { longestBestWait, sittingsOf } from "../sittings";

/** Balance review (Nov 2026). The screenshot case: saving across sittings. */
export default defineMeasure({
  id: "bestWaitSittings",
  label: "Best buy out of reach, longest",
  unit: "sittings",
  why: "The best buy should come within a sitting or two, not after a night of waiting.",
  aggregate: (samples) => longestBestWait(sittingsOf(samples)),
});
