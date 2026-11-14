import { handsCarryOf } from "../line-view";
import { defineMeasure } from "../measure";

/** #534, report-only (spec, "Lab"). NaN while the line is off. */
export default defineMeasure({
  id: "handsCarry",
  label: "Hands' share of the narrow stage",
  unit: "share",
  why: "Hands should soften the narrow stage early and matter less as machines take over.",
  aggregate: (samples) => handsCarryOf(samples),
});
