import { optimizerDecide } from "../decide";
import { plainParams } from "../plain";
import { definePolicy, scheduleFrom, type SpendWeights } from "../policy";
import { CASUAL_MINUTES, CASUAL_SESSIONS } from "../targets";

const SMART_SPEND: SpendWeights = {
  worker: 1,
  machine: 1,
  upgrade: 1,
  boost: 1,
  promote: 1,
};

/**
 * Greedy lowest payback, with one step of "save for X" across the next
 * session (`LOOKAHEAD_SESSIONS` in `targets.ts`). Same sittings and fast
 * fix as the plain dad. Promotions and tunnels are taken when `valueOf`
 * says they pay, not the moment the pocket can cover them. Upgrades and
 * boosts compete the same way. #178.
 */
const params = plainParams({
  id: "optimizer",
  label: "Optimizer, lowest payback",
  kind: "optimizer",
  sessionsPerDay: CASUAL_SESSIONS,
  minutesPerSession: CASUAL_MINUTES,
  spend: SMART_SPEND,
  promote: "on-value",
  explore: "on-value",
});

export default definePolicy({
  id: "optimizer",
  label: "Optimizer, lowest payback",
  kind: "optimizer",
  params,
  schedule: scheduleFrom(params),
  decide: optimizerDecide,
});
