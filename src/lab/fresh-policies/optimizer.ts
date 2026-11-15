import { freshPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * Part 1's best play (#655): the casual dad's sittings, workers moved
 * whenever a job has nothing to do, and the upgrades weighed beside the
 * line's buys.
 */
export default freshPolicy({
  id: "optimizer",
  label: "Optimizer, moves idle workers and buys upgrades",
  kind: "optimizer",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  moves: "idle",
  upgrades: true,
});
