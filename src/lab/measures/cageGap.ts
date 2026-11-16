import { defineMeasure } from "../measure";
import { sittingsOf } from "../sittings";

/**
 * #675, report-only (rule 5.14, ruling 17): the largest gap over a run's
 * sittings. NaN before part 3.
 */
export default defineMeasure({
  id: "cageGap",
  label: "Cages played against a night's rates",
  unit: "share",
  why: "The cages played trip by trip and the rates a night counts should lift the same rock.",
  aggregate: (samples) => {
    const gaps = sittingsOf(samples).flatMap((event) =>
      event.cageGap === undefined || Number.isNaN(event.cageGap)
        ? []
        : [event.cageGap],
    );
    return gaps.length === 0 ? Number.NaN : Math.max(...gaps);
  },
});
