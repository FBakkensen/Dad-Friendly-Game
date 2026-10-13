import { plainPolicy } from "../plain";
import { MARATHON_MINUTES } from "../targets";

/**
 * One 3-hour sitting a day. Same habits as the plain dad, stretched across
 * a single long open instead of two short ones.
 */
export default plainPolicy({
  id: "marathon",
  label: "Marathon, one 3-hour sitting",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: MARATHON_MINUTES,
});
