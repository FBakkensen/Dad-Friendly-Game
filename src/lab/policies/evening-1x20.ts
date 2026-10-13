import { plainPolicy } from "../plain";
import { EVENING_MINUTES } from "../targets";

/**
 * One 20-minute evening sitting. Same buys, scout, tending, tunnels, and
 * fast fix as the plain dad. The day is one long gap and the play.
 */
export default plainPolicy({
  id: "evening-1x20",
  label: "Evening, one 20-minute sitting",
  kind: "casual",
  sessionsPerDay: 1,
  minutesPerSession: EVENING_MINUTES,
});
