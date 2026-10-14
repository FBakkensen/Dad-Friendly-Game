import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";
import type { SpendWeights } from "../policy";

const NOTHING: SpendWeights = {
  worker: 0,
  machine: 0,
  upgrade: 0,
  boost: 0,
  promote: 0,
};

/**
 * Taps, and that is the whole game. Never buys, promotes, explores,
 * crafts, or moves a post. Trouble is still put right on the fast delay:
 * no engineer is coming, so the hand-fix is what clears it.
 */
export default plainPolicy({
  id: "tap-only",
  label: "Tap only",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  spend: NOTHING,
  promote: "never",
  promoteCap: 0,
  explore: "never",
  tend: "never",
  workers: "never",
  boosts: "never",
  craft: "never",
});
