import { plainPolicy } from "../plain";
import {
  CHECKER_GAP_JITTER,
  CHECKIN_MINUTES,
  CHECKIN_SESSIONS,
} from "../targets";

/**
 * The design's two-minute check-in (docs/design-intent.md): four a day,
 * buys the best stones a second per stone, otherwise the plain dad. The
 * gap slides by a tenth, like the checker's.
 */
export default plainPolicy({
  id: "checkin-4x2",
  label: "Check-in, four 2-minute sittings",
  kind: "casual",
  sessionsPerDay: CHECKIN_SESSIONS,
  minutesPerSession: CHECKIN_MINUTES,
  gapJitter: CHECKER_GAP_JITTER,
});
