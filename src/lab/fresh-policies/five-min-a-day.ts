import { freshPolicy } from "../plain";
import { FIVE_MINUTES } from "../targets";

/** Five minutes a day in a fresh mine (#655). */
export default freshPolicy({
  id: "five-min-a-day",
  label: "Five minutes a day",
  kind: "extreme",
  sessionsPerDay: 1,
  minutesPerSession: FIVE_MINUTES,
  moves: "once",
});
