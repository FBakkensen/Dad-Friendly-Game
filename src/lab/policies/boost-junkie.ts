import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * Starts every boost the moment it is affordable and idle, then buys like
 * the plain dad. Sharper picks and Overtime both go on before the second's
 * dig.
 */
export default plainPolicy({
  id: "boost-junkie",
  label: "Boost junkie",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  boosts: "always",
});
