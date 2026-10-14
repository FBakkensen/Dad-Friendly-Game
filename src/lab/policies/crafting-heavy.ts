import { plainPolicy } from "../plain";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";
import type { SpendWeights } from "../policy";

const MACHINES: SpendWeights = {
  worker: 1,
  machine: 1,
  upgrade: 0,
  boost: 0,
  promote: 0,
};

/**
 * Fills the bench whenever anything is affordable, and buys machines only
 * when the bench is already busy or nothing can be started. Workers are
 * hired only to staff a machine already owned.
 */
export default plainPolicy({
  id: "crafting-heavy",
  label: "Crafting heavy",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  spend: MACHINES,
  workers: "staff-only",
  promote: "never",
  promoteCap: 0,
  explore: "never",
  boosts: "never",
  craft: "always",
});
