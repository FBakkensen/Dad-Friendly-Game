import { plainPolicy } from "../../plain";

/** Second copy of `same-dad`. Loading this folder throws. */
export default plainPolicy({
  id: "same-dad",
  label: "Second copy",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: 1,
  promote: "never",
  explore: "never",
  tend: "never",
});
