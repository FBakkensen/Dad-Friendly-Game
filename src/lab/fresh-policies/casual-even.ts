import { freshPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * The casual dad who splits the levels evenly (#675, the spec's Lab): when
 * the Granite opens he moves half of the Topsoil's drilling and haulage
 * there, once, and leaves every hoist for both levels. The rest is the
 * casual dad's, so the gap between the two is what placing by need pays.
 */
export default freshPolicy({
  id: "casual-even",
  label: "Casual, splits the levels evenly",
  kind: "casual",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  moves: "once",
  levels: "even",
});
