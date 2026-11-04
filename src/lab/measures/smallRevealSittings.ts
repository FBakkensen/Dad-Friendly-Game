import { smallRevealSittings } from "../bands";
import { defineMeasure } from "../measure";

/** M12-4 (#252). One run's worst; the lab takes the mean over seeds. */
export default defineMeasure({
  id: "smallRevealSittings",
  label: "Small things, reveal to first use",
  unit: "sittings",
  why: "An upgrade, boost or new system should be tried within a sitting or two.",
  aggregate: (samples) => smallRevealSittings(samples),
});
