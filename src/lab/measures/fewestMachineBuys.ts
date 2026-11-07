import { fewestMachineBuys } from "../bands";
import { defineMeasure } from "../measure";

/** #357. One run's fewest; the lab takes the mean over seeds. */
export default defineMeasure({
  id: "fewestMachineBuys",
  label: "Fewest buys of one machine",
  unit: "machines",
  why: "Every machine tier should stay worth buying all run, not just its first few.",
  aggregate: (samples) => fewestMachineBuys(samples),
});
