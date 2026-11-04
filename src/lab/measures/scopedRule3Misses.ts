import { scopedRule3Misses } from "../bands";
import { defineMeasure } from "../measure";

/** M12-4 (#252). One run's worst; the lab takes the mean over seeds. */
export default defineMeasure({
  id: "scopedRule3Misses",
  label: "Rule 3 misses (scoped)",
  unit: "bands",
  why: "No machine should sit unbought where it opens or where the rock suits it, once the pocket reaches it.",
  aggregate: (samples) => scopedRule3Misses(samples),
});
