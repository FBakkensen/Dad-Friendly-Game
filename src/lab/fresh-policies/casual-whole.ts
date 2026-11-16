import { freshPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * The casual dad who works one level at a time (#675, the spec's Lab): the
 * whole workforce of drilling and haulage is on one level, and moves to the
 * other once the level he works has its good for the step in hand. The
 * other level's machines stand meanwhile: the old cage's cost, in view.
 */
export default freshPolicy({
  id: "casual-whole",
  label: "Casual, works one level at a time",
  kind: "casual",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  moves: "once",
  levels: "whole",
});
