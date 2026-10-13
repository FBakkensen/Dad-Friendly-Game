import { parameterisedDecide } from "./decide";
import { TAPS_PER_SECOND } from "./targets";
import {
  definePolicy,
  scheduleFrom,
  type BoostRule,
  type Habit,
  type Policy,
  type PolicyKind,
  type PolicyParams,
  type SpendWeights,
  type TendChoice,
  type TroubleFix,
  type TunnelPlan,
  type WorkerRule,
} from "./policy";

/** The plain dad's spends: crew and machines, nothing lasting, no boosts. */
const PLAIN_SPEND: SpendWeights = {
  worker: 1,
  machine: 1,
  upgrade: 0,
  boost: 0,
  promote: 0,
};

export type PlainSpec = {
  readonly id: string;
  readonly label: string;
  readonly kind: PolicyKind;
  readonly sessionsPerDay: number;
  readonly minutesPerSession: number;
  readonly gapJitter?: number;
  readonly tapsPerSecond?: number;
  readonly spend?: SpendWeights;
  readonly hoardK?: number;
  readonly promote?: Habit;
  readonly promoteCap?: number;
  readonly explore?: Habit;
  readonly tunnel?: TunnelPlan;
  readonly tend?: TendChoice;
  readonly trouble?: TroubleFix;
  readonly workers?: WorkerRule;
  readonly boosts?: BoostRule;
  readonly decide?: Policy["decide"];
};

/** Params for a dad who plays like today's plain dad, plus the overrides. */
export function plainParams(spec: PlainSpec): PolicyParams {
  return {
    sessionsPerDay: spec.sessionsPerDay,
    minutesPerSession: spec.minutesPerSession,
    gapJitter: spec.gapJitter ?? 0,
    tapsPerSecond: spec.tapsPerSecond ?? TAPS_PER_SECOND,
    spend: spec.spend ?? PLAIN_SPEND,
    hoardK: spec.hoardK ?? 1,
    promote: spec.promote ?? "asap",
    promoteCap: spec.promoteCap ?? 1,
    explore: spec.explore ?? "asap",
    tunnel: spec.tunnel ?? "shift",
    tend: spec.tend ?? "best",
    trouble: spec.trouble ?? "fast",
    workers: spec.workers ?? "any",
    boosts: spec.boosts ?? "value",
  };
}

/**
 * A player type that starts from the plain dad. Each file passes the
 * habit that makes it different. The loader reads the default export.
 */
export function plainPolicy(spec: PlainSpec): Policy {
  const params = plainParams(spec);
  return definePolicy({
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    params,
    schedule: scheduleFrom(params),
    decide: spec.decide ?? parameterisedDecide,
  });
}
