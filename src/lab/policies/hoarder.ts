import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS, HOARD_MULTIPLE } from "../targets";

/**
 * The plain dad, except the pocket must hold 8 times the sticker before
 * anything is paid. A price of 20 waits for 160.
 */
export default plainPolicy({
  id: "hoarder",
  label: "Hoarder, eight times the price",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  hoardK: HOARD_MULTIPLE,
});
