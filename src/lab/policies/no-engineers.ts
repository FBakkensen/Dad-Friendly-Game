import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * Never promotes, never sends anyone down a tunnel, and never moves a post.
 * Buys crew and machines like the plain dad. Ada, if a borer arrives, stays
 * where the hire put her.
 */
export default plainPolicy({
  id: "no-engineers",
  label: "No engineers",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  promote: "never",
  promoteCap: 0,
  explore: "never",
  tend: "never",
});
