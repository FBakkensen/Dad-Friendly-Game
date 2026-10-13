import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * Never puts trouble right by hand. An engineer may still clear a machine
 * they tend. Otherwise the plain dad.
 */
export default plainPolicy({
  id: "never-fix-trouble",
  label: "Never fixes trouble",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  trouble: "never",
});
