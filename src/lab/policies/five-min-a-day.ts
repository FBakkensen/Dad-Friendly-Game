import { plainPolicy } from "../plain";
import { FIVE_MINUTES } from "../targets";

/**
 * One 5-minute sitting a day. Same buys, scout, tending, tunnels, and fast
 * fix as the plain dad, in a much shorter open.
 */
export default plainPolicy({
  id: "five-min-a-day",
  label: "Five minutes a day",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: FIVE_MINUTES,
});
