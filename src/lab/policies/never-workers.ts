import { plainPolicy, type PlainSpec } from "../plain";
import type { SpendWeights } from "../policy";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

const WITH_UPGRADES: SpendWeights = {
  worker: 1,
  machine: 1,
  upgrade: 1,
  boost: 0,
  promote: 0,
};

/**
 * Never buys a worker for its own digging. A worker is hired only when a
 * machine already owned is short of staff. Machines and upgrades still compete.
 */
const spec: PlainSpec = {
  id: "never-workers",
  label: "Never hires spare workers",
  kind: "extreme",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  workers: "staff-only",
  spend: WITH_UPGRADES,
};

export default plainPolicy(spec);
