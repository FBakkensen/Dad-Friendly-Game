import { plainPolicy } from "../../plain";

/** First copy of a duplicated id. The loader must reject the folder. */
export default plainPolicy({
  id: "same-dad",
  label: "First copy",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: 1,
  tapsPerSecond: 0,
  promote: "never",
  explore: "never",
  tend: "never",
});
