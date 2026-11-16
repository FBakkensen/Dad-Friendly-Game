import {
  definePolicy,
  scheduleFrom,
  type FreshHabits,
  type Policy,
  type PolicyKind,
  type PolicyParams,
  type TroubleFix,
  type WorkerMoves,
} from "./policy";

export type FreshSpec = {
  readonly id: string;
  readonly label: string;
  readonly kind: PolicyKind;
  readonly sessionsPerDay: number;
  readonly minutesPerSession: number;
  readonly gapJitter?: number;
  readonly hoardK?: number;
  readonly trouble?: TroubleFix;
  readonly moves: WorkerMoves;
  readonly hold?: FreshHabits["hold"];
  readonly upgrades?: boolean;
};

/** Params for the plain dad's sittings, plus the overrides. */
function plainParams(spec: FreshSpec): PolicyParams {
  return {
    sessionsPerDay: spec.sessionsPerDay,
    minutesPerSession: spec.minutesPerSession,
    gapJitter: spec.gapJitter ?? 0,
    hoardK: spec.hoardK ?? 1,
    trouble: spec.trouble ?? "fast",
  };
}

/**
 * A fresh mine's player type (slice 1, Lab, #655): the plain dad's
 * sittings, and how he plays the mine. His moves are `src/lab/fresh-dad.ts`.
 * The loader reads each file's default export.
 */
export function freshPolicy(spec: FreshSpec): Policy {
  const params = plainParams(spec);
  return definePolicy({
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    params,
    schedule: scheduleFrom(params),
    fresh: {
      moves: spec.moves,
      hold: spec.hold ?? "on-value",
      upgrades: spec.upgrades ?? false,
    },
  });
}
