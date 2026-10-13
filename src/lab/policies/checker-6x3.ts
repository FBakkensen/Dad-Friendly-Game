import { plainPolicy } from "../plain";
import {
  CHECKER_GAP_JITTER,
  CHECKER_MINUTES,
  CHECKER_SESSIONS,
} from "../targets";

/**
 * Six 3-minute check-ins a day. Same buys as the plain dad. Each gap
 * jitters by a tenth, from the seed, so two seeds are not the same day.
 */
export default plainPolicy({
  id: "checker-6x3",
  label: "Checker, six 3-minute sittings",
  kind: "casual",
  sessionsPerDay: CHECKER_SESSIONS,
  minutesPerSession: CHECKER_MINUTES,
  gapJitter: CHECKER_GAP_JITTER,
});
