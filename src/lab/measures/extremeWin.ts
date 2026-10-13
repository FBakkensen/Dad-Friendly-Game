import { defineMeasure } from "../measure";
import { readFinishDay } from "./finishDay";

/**
 * How much sooner an extreme finishes than a casual dad.
 * 0 is a tie. Higher is a bigger win for the extreme.
 */
export function extremeWin(
  extremeFinishDay: number,
  casualFinishDay: number,
): number {
  if (!(casualFinishDay > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  return (casualFinishDay - extremeFinishDay) / casualFinishDay;
}

export default defineMeasure({
  id: "extremeWin",
  label: "Extreme win",
  unit: "share",
  why: "How much sooner an extreme finishes than a casual dad.",
  aggregate: (samples, context) => {
    const extreme = readFinishDay(samples);
    const casual = context?.casualFinishDay;
    if (casual === undefined) {
      return Number.NaN;
    }
    return extremeWin(extreme, casual);
  },
});
