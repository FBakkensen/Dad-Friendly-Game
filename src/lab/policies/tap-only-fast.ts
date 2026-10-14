import { plainPolicy } from "../plain";
import {
  CASUAL_MINUTES,
  CASUAL_SESSIONS,
  FAST_TAPS_PER_SECOND,
} from "../targets";
import type { SpendWeights } from "../policy";

const NOTHING: SpendWeights = {
  worker: 0,
  machine: 0,
  upgrade: 0,
  boost: 0,
  promote: 0,
};

/**
 * Tap only, mashing. Ten taps a second, still no buys. Bare hands pay the
 * curve for the first three taps in a second, so this dad must not finish
 * the week ahead of a casual one. extreme-win is what catches a regression.
 */
export default plainPolicy({
  id: "tap-only-fast",
  label: "Tap only, ten a second",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  tapsPerSecond: FAST_TAPS_PER_SECOND,
  spend: NOTHING,
  promote: "never",
  promoteCap: 0,
  explore: "never",
  tend: "never",
  workers: "never",
  boosts: "never",
});
