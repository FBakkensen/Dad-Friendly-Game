import { defineMeasure } from "../measure";
import { readFinishDay } from "./finishDay";

/**
 * #675, guarded by `slice-five-days` (five days or more, Flemming's A,
 * 16 Nov 2026; slice 1 spec, "Lab"; #556). The finish day of a run that plays part 3, so ends at the
 * Foundry's roof. NaN before part 3, and Infinity when the run did not
 * reach the roof.
 */
export default defineMeasure({
  id: "sliceDays",
  label: "Days to the slice's end",
  unit: "days",
  why: "The whole slice, to the Foundry's roof, should take five days or more for every player type.",
  aggregate: (samples) =>
    samples.some((sample) => sample.fresh?.partThree === true)
      ? readFinishDay(samples)
      : Number.NaN,
});
