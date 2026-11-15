import { freshPolicy } from "../plain";
import { MARATHON_MINUTES } from "../targets";

/** One 3-hour sitting a day in a fresh mine (#655). */
export default freshPolicy({
  id: "marathon",
  label: "Marathon, one 3-hour sitting",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: MARATHON_MINUTES,
  moves: "once",
});
