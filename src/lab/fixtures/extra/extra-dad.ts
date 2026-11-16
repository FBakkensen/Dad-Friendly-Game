import { freshPolicy } from "../../plain";

/**
 * A dad who exists only in this folder. The loader test runs him. Adding
 * another file here should show up with no other edit.
 */
export default freshPolicy({
  id: "extra-dad",
  label: "Fixture dad",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: 1,
  trouble: "never",
  moves: "once",
});
