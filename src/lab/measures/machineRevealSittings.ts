import { machineRevealSittings } from "../bands";
import { defineMeasure } from "../measure";

/** M12-4 (#252). One run's worst; the lab takes the mean over seeds. */
export default defineMeasure({
  id: "machineRevealSittings",
  label: "Machine reveal to first buy",
  unit: "sittings",
  why: "A new machine should be bought within a couple of sittings of showing up.",
  aggregate: (samples) => machineRevealSittings(samples),
});
