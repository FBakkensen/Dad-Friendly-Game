import { defineMeasure } from "../measure";
import { sittingsOf } from "../sittings";
import { mean } from "../stats";

/** #655, report-only (slice 1 spec, "Lab", risks 11 and 16). NaN outside a fresh mine. */
export default defineMeasure({
  id: "workerMoves",
  label: "Taps that hire and move workers",
  unit: "taps a sitting",
  why: "Nothing moves a worker for him, so the taps that hire and place them must stay few.",
  aggregate: (samples) => {
    const taps = sittingsOf(samples).flatMap((event) =>
      event.workerTaps === undefined ? [] : [event.workerTaps],
    );
    return taps.length === 0 ? Number.NaN : mean(taps);
  },
});
