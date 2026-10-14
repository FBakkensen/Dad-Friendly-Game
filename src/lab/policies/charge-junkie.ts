import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * Spends every clay on a blasting charge as soon as the bench is free and
 * the pocket can pay. Other buys wait. Otherwise the plain dad.
 */
export default plainPolicy({
  id: "charge-junkie",
  label: "Charge junkie",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  craft: "charges",
});
