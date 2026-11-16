import { freshPolicy } from "../../plain";

/** Second copy of `same-dad`. Loading this folder throws. */
export default freshPolicy({
  id: "same-dad",
  label: "Second copy",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: 1,
  moves: "once",
});
