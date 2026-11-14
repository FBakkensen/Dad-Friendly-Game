import { narrowShareOf } from "../line-view";
import { defineMeasure } from "../measure";
import { sittingsOf } from "../sittings";

/** #534, report-only (spec, "Lab"). NaN while the line is off. */
export default defineMeasure({
  id: "narrowShare",
  label: "Most sittings on one narrow stage",
  unit: "share",
  why: "Every stage should take its turn as the narrow one over a run.",
  aggregate: (samples) => narrowShareOf(sittingsOf(samples)),
});
