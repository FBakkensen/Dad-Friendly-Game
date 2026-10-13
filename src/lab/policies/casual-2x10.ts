import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * Today's plain dad. Two 10-minute sittings a day, 12 hours apart, 3 taps
 * a second. Buys the best stones a second per stone. Promotes one scout
 * (Nils) as soon as the pocket can pay. Tends the best machine, walks the
 * old shaft each sitting and the deep dark each night, and fixes trouble
 * within 3 seconds. The gap does not jitter.
 */
export default plainPolicy({
  id: "casual-2x10",
  label: "Casual, two 10-minute sittings",
  kind: "casual",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
});
