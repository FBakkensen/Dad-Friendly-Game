import { plainPolicy } from "../../plain";

/** Second copy of `same-dad`. Loading this folder throws. */
export default plainPolicy({
  id: "same-dad",
  label: "Second copy",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: 1,
  tapsPerSecond: 0,
  promote: "never",
  explore: "never",
  tend: "never",
});
