import { MAX_ENGINEERS } from "../../engineers";
import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * Promotes every engineer as soon as the price can be paid, until the crew
 * is full (Ada plus four). Otherwise the plain dad: same sittings, buys,
 * tending, tunnels, and fast fix.
 */
export default plainPolicy({
  id: "all-in-engineers",
  label: "All in on engineers",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  promote: "asap",
  promoteCap: MAX_ENGINEERS - 1,
});
