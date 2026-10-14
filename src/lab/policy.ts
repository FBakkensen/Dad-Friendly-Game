import type { Action } from "../economy/actions";
import type { Mountain } from "../mountain";
import type { TunnelId } from "../expeditions";
import {
  DAY_MS,
  FIX_FAST_MS,
  FIX_SLOW_MS,
  MS_PER_SECOND,
  SAMPLE_INTERVAL_SEC,
  jitteredGap,
} from "./targets";

/** How a dad treats a habit that is not a purchase. */
export type Habit = "never" | "asap" | "on-value";

/** Which tunnel an exploring dad walks. `shift` is the plain dad's pair. */
export type TunnelPlan = TunnelId | "shift";

/** Where a spare engineer stands when this dad tends. */
export type TendChoice = "best" | "never";

/** How quickly this dad puts trouble right by hand. */
export type TroubleFix = "never" | "slow" | "fast";

/**
 * Workers bought for their own digging, only to staff a machine already
 * owned, or not at all.
 */
export type WorkerRule = "any" | "staff-only" | "never";

/** Boosts compete on value, start whenever they are affordable, or never. */
export type BoostRule = "value" | "always" | "never";

/**
 * How this dad uses the bench. `idle` crafts when the next buy can wait.
 * `value` lets a craft win on payback. `always` fills a free bench.
 * `charges` spends clay on blasting charges. `never` skips the workshop.
 */
export type CraftRule = "idle" | "value" | "always" | "charges" | "never";

/** Multipliers on stones-per-second per stone. Zero leaves that spend out. */
export type SpendWeights = {
  readonly worker: number;
  readonly machine: number;
  readonly upgrade: number;
  readonly boost: number;
  readonly promote: number;
};

/**
 * One simulated dad. Sessions and weights are the knobs; habits say what
 * they refuse. Shared lab numbers live in `targets.ts`.
 */
export type PolicyParams = {
  readonly sessionsPerDay: number;
  readonly minutesPerSession: number;
  /** Fraction of the gap that the seed may slide either way. Zero is fixed. */
  readonly gapJitter: number;
  readonly tapsPerSecond: number;
  readonly spend: SpendWeights;
  /**
   * Pay only when the pocket holds this many times the sticker price.
   * One is "buy it when it can be paid".
   */
  readonly hoardK: number;
  readonly promote: Habit;
  /** Promotions after Ada when `promote` is `asap`. One hires Nils. */
  readonly promoteCap: number;
  readonly explore: Habit;
  readonly tunnel: TunnelPlan;
  readonly tend: TendChoice;
  readonly trouble: TroubleFix;
  readonly workers: WorkerRule;
  readonly boosts: BoostRule;
  readonly craft: CraftRule;
};

/** When the sittings are. Built from the params so a file cannot drift. */
export type Schedule = {
  readonly sessionsPerDay: number;
  readonly sessionMs: number;
  /** Gap after `session` (0-based), for this run's seed. */
  readonly gapMs: (session: number, seed: number) => number;
};

/** What `decide` sees. The world stays outside so a policy cannot step it. */
export type DecideInput = {
  readonly mountain: Mountain;
  readonly now: number;
  readonly params: PolicyParams;
};

export type PolicyKind = "casual" | "extreme" | "optimizer";

export type Policy = {
  readonly id: string;
  readonly label: string;
  readonly kind: PolicyKind;
  readonly params: PolicyParams;
  readonly schedule: Schedule;
  readonly decide: (input: DecideInput) => Action | undefined;
};

const KINDS: readonly PolicyKind[] = ["casual", "extreme", "optimizer"];
const HABITS: readonly Habit[] = ["never", "asap", "on-value"];
const TUNNELS: readonly TunnelPlan[] = [
  "old-shaft",
  "deep-dark",
  "side-seam",
  "shift",
];
const TENDS: readonly TendChoice[] = ["best", "never"];
const FIXES: readonly TroubleFix[] = ["never", "slow", "fast"];
const WORKERS: readonly WorkerRule[] = ["any", "staff-only", "never"];
const BOOSTS: readonly BoostRule[] = ["value", "always", "never"];
const CRAFTS: readonly CraftRule[] = [
  "idle",
  "value",
  "always",
  "charges",
  "never",
];

/** The gap with no jitter: the day split across the sittings, minus play. */
function baseGapMs(params: PolicyParams): number {
  return (
    DAY_MS / params.sessionsPerDay -
    params.minutesPerSession * SAMPLE_INTERVAL_SEC * MS_PER_SECOND
  );
}

/** Stones-per-second context for `valueOf`, on the unjittered day. */
export function valueContext(params: PolicyParams): {
  readonly tapsPerSecond: number;
  readonly liveSeconds: number;
  readonly awaySeconds: number;
} {
  const liveSeconds = params.minutesPerSession * SAMPLE_INTERVAL_SEC;
  return {
    tapsPerSecond: params.tapsPerSecond,
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

/** Tunnel at the start of a sitting. */
export function dayTunnel(plan: TunnelPlan): TunnelId {
  return plan === "shift" ? "old-shaft" : plan;
}

/** Tunnel on the gap that ends a day. */
export function nightTunnel(plan: TunnelPlan): TunnelId {
  return plan === "shift" ? "deep-dark" : plan;
}

/** True when the gap after `session` is the one that ends the day. */
export function isNightGap(session: number, sessionsPerDay: number): boolean {
  return (session + 1) % sessionsPerDay === 0;
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
  return typeof value["decide"] === "function";
}

function isParams(value: unknown): value is PolicyParams {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isPositive(value["sessionsPerDay"]) &&
    isPositive(value["minutesPerSession"]) &&
    isNonNegative(value["gapJitter"]) &&
    isNonNegative(value["tapsPerSecond"]) &&
    isWeights(value["spend"]) &&
    isNonNegative(value["hoardK"]) &&
    isOneOf(value["promote"], HABITS) &&
    isNonNegative(value["promoteCap"]) &&
    isOneOf(value["explore"], HABITS) &&
    isOneOf(value["tunnel"], TUNNELS) &&
    isOneOf(value["tend"], TENDS) &&
    isOneOf(value["trouble"], FIXES) &&
    isOneOf(value["workers"], WORKERS) &&
    isOneOf(value["boosts"], BOOSTS) &&
    isOneOf(value["craft"], CRAFTS)
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

function isWeights(value: unknown): value is SpendWeights {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonNegative(value["worker"]) &&
    isNonNegative(value["machine"]) &&
    isNonNegative(value["upgrade"]) &&
    isNonNegative(value["boost"]) &&
    isNonNegative(value["promote"])
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
