import { freshPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

/**
 * Part 1's plain dad (#655): two 10-minute sittings a day. He sets his
 * workers when he hires, buys or orders, and leaves them. He puts the order
 * on hold while a buy pays back sooner than the building would take.
 */
export default freshPolicy({
  id: "casual-2x10",
  label: "Casual, two 10-minute sittings",
  kind: "casual",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  moves: "once",
});
