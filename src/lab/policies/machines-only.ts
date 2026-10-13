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
 * Buys machines, plus the workers those machines still need. No upgrades,
 * boosts, or promotions. Tending stays, so a free engineer can run one.
 */
export default plainPolicy({
  id: "machines-only",
  label: "Machines only",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  spend: MACHINES,
  workers: "staff-only",
  promote: "never",
  promoteCap: 0,
  explore: "never",
  boosts: "never",
});
