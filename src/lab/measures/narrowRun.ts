import { narrowRunOf } from "../line-view";
import { defineMeasure } from "../measure";
import { sittingsOf } from "../sittings";

/** #534, report-only (spec, "Lab"). NaN while the line is off. */
export default defineMeasure({
  id: "narrowRun",
  label: "Longest run on one narrow stage",
  unit: "sittings",
  why: "The narrow stage should move: a stage that stays narrow sitting after sitting is one long chore.",
  aggregate: (samples) => narrowRunOf(sittingsOf(samples)),
});
