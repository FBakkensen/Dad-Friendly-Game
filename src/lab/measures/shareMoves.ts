import { defineMeasure } from "../measure";
import { sittingsOf } from "../sittings";
import { mean } from "../stats";

/** #675, report-only (slice 1 spec, "Lab", the anti-goal). NaN until the Granite is open. */
export default defineMeasure({
  id: "shareMoves",
  label: "Taps that set the share between the levels",
  unit: "taps a sitting",
  why: "Setting the share between the levels is a few taps now and then, never a chore every sitting.",
  aggregate: (samples) => {
    const taps = sittingsOf(samples).flatMap((event) =>
      event.shareTaps === undefined ? [] : [event.shareTaps],
    );
    return taps.length === 0 ? Number.NaN : mean(taps);
  },
});
