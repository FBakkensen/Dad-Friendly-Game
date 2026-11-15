import { freshPolicy } from "../plain";
import {
  CHECKER_GAP_JITTER,
  CHECKIN_MINUTES,
  CHECKIN_SESSIONS,
} from "../targets";

/** The two-minute check-in in a fresh mine (#655): four a day, the gap slides by a tenth. */
export default freshPolicy({
  id: "checkin-4x2",
  label: "Check-in, four 2-minute sittings",
  kind: "casual",
  sessionsPerDay: CHECKIN_SESSIONS,
  minutesPerSession: CHECKIN_MINUTES,
  gapJitter: CHECKER_GAP_JITTER,
  moves: "once",
});
