import { plainPolicy } from "../../plain";

/**
 * A dad who exists only in this folder. The loader test runs him. Adding
 * another file here should show up with no other edit.
 */
export default plainPolicy({
  id: "extra-dad",
  label: "Fixture dad",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: 1,
  tapsPerSecond: 0,
  promote: "never",
  promoteCap: 0,
  explore: "never",
  tend: "never",
  trouble: "never",
  workers: "never",
  boosts: "never",
});
