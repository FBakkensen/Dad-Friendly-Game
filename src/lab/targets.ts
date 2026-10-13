/**
 * Every tunable lab number lives here. A measure file reads these names.
 * A guardrail is one entry in `TARGETS`: change the value, nothing else.
 */

/** A live option pays back within this multiple of the best payback. */
export const LIVE_RATIO = 1.5;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;

export const HOUR_MS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
export const DAY_MS = HOURS_PER_DAY * HOUR_MS;

/** Horizon passed to `valueOf`. Six hours. Permanent moves ignore it. */
const HORIZON_HOURS = 6;
export const HORIZON_SEC =
  HORIZON_HOURS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/**
 * Samples fall on this grid of live-play seconds. Second 0 is the session
 * start, so the grid already includes it.
 */
export const SAMPLE_INTERVAL_SEC = SECONDS_PER_MINUTE;

/** dominantShare leaves this many hours out. The live-median guardrail does too. */
export const OPENING_HOURS = 1;

/** singleShare counts a sample with at most this many live options. */
export const SINGLE_MAX_LIVE = 1;

/**
 * Dead stretch. A sample is dead when the table has a live option and none
 * of them can be paid for yet: the dad is only waiting. A second option
 * inside the ratio does not end the wait while it is unpaid too. The length
 * is wall-clock hours from the first dead sample to the next sample where
 * a live option can be paid for (or the last sample, if the run ends waiting).
 */
export const DEAD_STRETCH = {
  unit: "hours",
} as const;

/** liveP10 reads this percentile. */
export const LIVE_P10 = 10;
export const PERCENT = 100;

/** Two sides of a sorted list, for the median. */
export const MIDPOINT_DIVISOR = 2;

/** Output-share key for the tending bonus. featureShare reads it. */
export const TENDING_SOURCE = "tending";

/** Output-share key for the tunnel borer. The tending guardrail starts here. */
export const BORER_SOURCE = "borer";

type PolicyKind = "casual" | "extreme" | "optimizer";

export type TargetScope =
  | { readonly kind: "all" }
  | { readonly kind: "policies"; readonly ids: readonly string[] }
  | { readonly kind: "policyKinds"; readonly kinds: readonly PolicyKind[] }
  | { readonly kind: "afterHour"; readonly hour: number }
  | { readonly kind: "fromSource"; readonly source: string };

type TargetBase = {
  readonly id: string;
  readonly measure: string;
  readonly scope: TargetScope;
  readonly why: string;
};

export type Target =
  | (TargetBase & { readonly op: "lte"; readonly value: number })
  | (TargetBase & { readonly op: "gte"; readonly value: number })
  | (TargetBase & {
      readonly op: "between";
      readonly value: readonly [number, number];
    });

/**
 * Guardrails. `measure` is a registered measure id. `scope` says which runs
 * or samples the bound covers. Edit a value here to move a guardrail.
 */
export const TARGETS: readonly Target[] = [
  {
    id: "dead-stretch",
    measure: "longestDeadStretch",
    scope: { kind: "policyKinds", kinds: ["casual", "optimizer"] },
    op: "lte",
    value: 0.5 * HOURS_PER_DAY,
    why: "A dad waiting on the next buy for half a day has nothing to decide.",
  },
  {
    id: "single-share",
    measure: "singleShare",
    scope: { kind: "all" },
    op: "lte",
    value: 0.25,
    why: "Most moments should offer more than one live option.",
  },
  {
    id: "live-median-after-open",
    measure: "liveMedian",
    scope: { kind: "afterHour", hour: OPENING_HOURS },
    op: "gte",
    value: 2,
    why: "After the first hour the typical moment should be a real choice.",
  },
  {
    id: "dominant-share",
    measure: "dominantShare",
    scope: { kind: "all" },
    op: "lte",
    value: 0.4,
    why: "One move should not be the right buy for most of the run.",
  },
  {
    id: "tending-from-borer",
    measure: "featureShare",
    scope: { kind: "fromSource", source: BORER_SOURCE },
    op: "gte",
    value: 0.08,
    why: "An apprentice on the borer should be a real share of the output.",
  },
  {
    id: "casual-finish",
    measure: "finishDay",
    scope: { kind: "policies", ids: ["casual-2x10"] },
    op: "between",
    value: [5, 7],
    why: "A casual dad finishes inside a quiet week, and not before day five.",
  },
  {
    id: "thin-habit-finish",
    measure: "finishDay",
    scope: { kind: "policies", ids: ["tap-only", "five-min-a-day"] },
    op: "lte",
    value: 14,
    why: "A dad who barely sits down still finishes inside two weeks.",
  },
  {
    id: "extreme-win",
    measure: "extremeWin",
    scope: { kind: "policyKinds", kinds: ["extreme"] },
    op: "lte",
    value: 0.15,
    why: "An extreme should not finish much sooner than a casual dad.",
  },
  {
    id: "optimizer-regret",
    measure: "regret",
    scope: { kind: "policyKinds", kinds: ["casual"] },
    op: "lte",
    value: 1.25,
    why: "The smart dad may finish sooner, and not by more than a quarter.",
  },
];

/** True when `actual` sits on the safe side of the guardrail. */
export function meetsTarget(target: Target, actual: number): boolean {
  if (target.op === "lte") {
    return actual <= target.value;
  }
  if (target.op === "gte") {
    return actual >= target.value;
  }
  const [low, high] = target.value;
  return actual >= low && actual <= high;
}
