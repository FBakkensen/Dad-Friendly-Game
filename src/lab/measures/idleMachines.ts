import { freshMean } from "../fresh-view";
import { defineMeasure } from "../measure";

/** #655, report-only (slice 1 spec, "Lab", risk 15). NaN outside a fresh mine or with no machine. */
export default defineMeasure({
  id: "idleMachines",
  label: "Machines tools beat",
  unit: "share",
  why: "A machine should be worth the workers it takes, so tools never leave it standing.",
  aggregate: (samples) => freshMean(samples, (view) => view.idleMachines),
});
