import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * The plain dad, except the bench comes first. Whenever anything is
 * affordable, it is crafted before the next hire. Same sittings, scout,
 * tending, and fast fix.
 */
export default plainPolicy({
  id: "crafting-heavy",
  label: "Crafting heavy",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  craft: "always",
});
