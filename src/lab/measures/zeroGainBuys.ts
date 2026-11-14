import { zeroGainBuysOf } from "../line-view";
import { defineMeasure } from "../measure";
import { sittingsOf } from "../sittings";

/** #534, report-only (spec, "Lab"). NaN while the line is off. */
export default defineMeasure({
  id: "zeroGainBuys",
  label: "Machines that added nothing",
  unit: "buys",
  why: "A machine bought for a stage that is not narrow moves nothing; the dad should rarely do that.",
  aggregate: (samples) => zeroGainBuysOf(sittingsOf(samples)),
});
