import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * The plain dad who never opens the workshop. Same sittings, buys, scout,
 * tending, and fast fix. The bench stays empty for the whole run.
 */
export default plainPolicy({
  id: "skip-crafting",
  label: "Skips the workshop",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  craft: "never",
});
