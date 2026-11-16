import {
  DAY_MS,
  FIX_FAST_MS,
  FIX_SLOW_MS,
  MS_PER_SECOND,
  SAMPLE_INTERVAL_SEC,
  jitteredGap,
} from "./targets";

/** How quickly this dad puts trouble right by hand. */
export type TroubleFix = "never" | "slow" | "fast";

/**
 * One simulated dad's sittings and pocket. How he plays the fresh mine is
 * `FreshHabits`. Shared lab numbers live in `targets.ts`.
 */
export type PolicyParams = {
  readonly sessionsPerDay: number;
  readonly minutesPerSession: number;
  /** Fraction of the gap that the seed may slide either way. Zero is fixed. */
  readonly gapJitter: number;
  /**
   * Pay only when the pocket holds this many times the sticker price.
   * One is "buy it when it can be paid".
   */
  readonly hoardK: number;
  readonly trouble: TroubleFix;
};

/** When the sittings are. Built from the params so a file cannot drift. */
export type Schedule = {
  readonly sessionsPerDay: number;
  readonly sessionMs: number;
  /** Gap after `session` (0-based), for this run's seed. */
  readonly gapMs: (session: number, seed: number) => number;
};

export type PolicyKind = "casual" | "extreme" | "optimizer";

/**
 * When a fresh mine's dad moves workers (slice 1, Lab, #655): `once` sets
 * them when he hires, buys or orders and leaves them; `idle` also moves them
 * whenever a job has nothing to do. The gap between the two is what the
 * chore would pay (risk 11).
 */
export type WorkerMoves = "once" | "idle";

/** How a dad plays a fresh mine (slice 1, #655). */
export type FreshHabits = {
  readonly moves: WorkerMoves;
  /** `on-value` puts the order on hold while a buy pays back sooner; `never` never does. */
  readonly hold: "on-value" | "never";
  /** Weighs the upgrades beside the line's buys. */
  readonly upgrades: boolean;
};

export type Policy = {
  readonly id: string;
  readonly label: string;
  readonly kind: PolicyKind;
  readonly params: PolicyParams;
  readonly schedule: Schedule;
  readonly fresh: FreshHabits;
};

const KINDS: readonly PolicyKind[] = ["casual", "extreme", "optimizer"];
const MOVES: readonly WorkerMoves[] = ["once", "idle"];
const HOLDS: readonly FreshHabits["hold"][] = ["on-value", "never"];
const FIXES: readonly TroubleFix[] = ["never", "slow", "fast"];

/** The gap with no jitter: the day split across the sittings, minus play. */
function baseGapMs(params: PolicyParams): number {
  return (
    DAY_MS / params.sessionsPerDay -
    params.minutesPerSession * SAMPLE_INTERVAL_SEC * MS_PER_SECOND
  );
}

/** Stones-per-second context for `valueOf`, on the unjittered day. */
export function valueContext(params: PolicyParams): {
  readonly liveSeconds: number;
  readonly awaySeconds: number;
} {
  const liveSeconds = params.minutesPerSession * SAMPLE_INTERVAL_SEC;
  return {
    liveSeconds,
    awaySeconds: baseGapMs(params) / MS_PER_SECOND,
  };
}

/** Milliseconds this dad waits before fixing by hand, or none. */
export function fixDelayMs(trouble: TroubleFix): number | undefined {
  switch (trouble) {
    case "never":
      return undefined;
    case "slow":
      return FIX_SLOW_MS;
    case "fast":
      return FIX_FAST_MS;
  }
}

/**
 * Schedule for these params. Jitter slides each gap by the fraction, from
 * the seed, and the same seed always slides it the same way.
 */
export function scheduleFrom(params: PolicyParams): Schedule {
  return {
    sessionsPerDay: params.sessionsPerDay,
    sessionMs: params.minutesPerSession * SAMPLE_INTERVAL_SEC * MS_PER_SECOND,
    gapMs: (session, seed) =>
      jitteredGap(baseGapMs(params), params.gapJitter, seed, session),
  };
}

/** Reads a policy module. The loader passes the module namespace. */
export function parsePolicyExport(loaded: unknown, filename: string): Policy {
  if (!isRecord(loaded) || !("default" in loaded)) {
    throw new Error(`${filename} has no default export`);
  }
  if (!isPolicy(loaded.default)) {
    throw new Error(`${filename} default export is not a policy`);
  }
  return loaded.default;
}

/** Marks a policy object. The loader checks the shape again at runtime. */
export function definePolicy(spec: Policy): Policy {
  if (!isPolicy(spec)) {
    throw new Error(`Invalid policy "${readableId(spec)}"`);
  }
  return spec;
}

/** Runtime shape check for a default export the loader just imported. */
export function isPolicy(value: unknown): value is Policy {
  if (!isRecord(value)) {
    return false;
  }
  if (!isId(value["id"]) || !isLabel(value["label"])) {
    return false;
  }
  if (!isOneOf(value["kind"], KINDS)) {
    return false;
  }
  if (!isParams(value["params"]) || !isSchedule(value["schedule"])) {
    return false;
  }
  return isFresh(value["fresh"]);
}

function isFresh(value: unknown): value is FreshHabits {
  return (
    isRecord(value) &&
    isOneOf(value["moves"], MOVES) &&
    isOneOf(value["hold"], HOLDS) &&
    typeof value["upgrades"] === "boolean"
  );
}

function isParams(value: unknown): value is PolicyParams {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isPositive(value["sessionsPerDay"]) &&
    isPositive(value["minutesPerSession"]) &&
    isNonNegative(value["gapJitter"]) &&
    isNonNegative(value["hoardK"]) &&
    isOneOf(value["trouble"], FIXES)
  );
}

function isSchedule(value: unknown): value is Schedule {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isPositive(value["sessionsPerDay"]) &&
    isPositive(value["sessionMs"]) &&
    typeof value["gapMs"] === "function"
  );
}

function isId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let hyphen = true;
  for (const char of value) {
    if (char === "-") {
      if (hyphen) {
        return false;
      }
      hyphen = true;
      continue;
    }
    hyphen = false;
    if (!alphabet.includes(char)) {
      return false;
    }
  }
  return !hyphen;
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.some((item) => item === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readableId(spec: Policy): string {
  return typeof spec.id === "string" ? spec.id : "?";
}
