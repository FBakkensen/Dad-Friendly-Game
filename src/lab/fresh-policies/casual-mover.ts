import { freshPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * The casual dad who moves his workers whenever a job has nothing to do
 * (#655, risk 11): drivers and builders go to the mine between orders and
 * come back when the order delivers. The rest is the casual dad's, so the
 * gap between the two is what the chore pays.
 */
export default freshPolicy({
  id: "casual-mover",
  label: "Casual, moves idle workers",
  kind: "casual",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  moves: "idle",
});
