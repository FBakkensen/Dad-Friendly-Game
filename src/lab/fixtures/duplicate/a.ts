import { freshPolicy } from "../../plain";

/** First copy of a duplicated id. The loader must reject the folder. */
export default freshPolicy({
  id: "same-dad",
  label: "First copy",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: 1,
  moves: "once",
});
