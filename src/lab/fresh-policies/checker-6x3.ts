import { freshPolicy } from "../plain";
import {
  CHECKER_GAP_JITTER,
  CHECKER_MINUTES,
  CHECKER_SESSIONS,
} from "../targets";

/** The checker in a fresh mine (#655): six 3-minute sittings, the gap slides by a tenth. */
export default freshPolicy({
  id: "checker-6x3",
  label: "Checker, six 3-minute sittings",
  kind: "casual",
  sessionsPerDay: CHECKER_SESSIONS,
  minutesPerSession: CHECKER_MINUTES,
  gapJitter: CHECKER_GAP_JITTER,
  moves: "once",
});
