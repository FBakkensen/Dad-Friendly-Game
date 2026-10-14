import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";
import type { SpendWeights } from "../policy";

const WORKERS: SpendWeights = {
  worker: 1,
  machine: 0,
  upgrade: 0,
  boost: 0,
  promote: 0,
};

/**
 * Buys workers and kids only. No machines, upgrades, boosts, promotions,
 * or crafts, so the first engineer never arrives.
 */
export default plainPolicy({
  id: "workers-only",
  label: "Workers only",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  spend: WORKERS,
  promote: "never",
  promoteCap: 0,
  explore: "never",
  tend: "never",
  workers: "any",
  boosts: "never",
  craft: "never",
});
