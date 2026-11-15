import { freshPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * The casual dad who never puts the order on hold (#655), to show what on
 * hold is worth: transport takes what the mine makes, and he buys only from
 * what is left over.
 */
export default freshPolicy({
  id: "casual-no-hold",
  label: "Casual, never on hold",
  kind: "casual",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  moves: "once",
  hold: "never",
});
