import { freshPolicy } from "../plain";
import { EVENING_MINUTES } from "../targets";

/** The evening dad in a fresh mine (#655): one 20-minute sitting a day. */
export default freshPolicy({
  id: "evening-1x20",
  label: "Evening, one 20-minute sitting",
  kind: "casual",
  sessionsPerDay: 1,
  minutesPerSession: EVENING_MINUTES,
  moves: "once",
});
