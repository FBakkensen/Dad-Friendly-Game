/**
 * Every tunable lab number lives here. A measure file reads these names.
 * A guardrail is one entry in `TARGETS`: change the value, nothing else.
 */

/** A live option pays back within this multiple of the best payback. */
export const LIVE_RATIO = 1.5;

export const MS_PER_SECOND = 1000;
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

/** One sitting. A shorter save is the end of a session, not a dead stretch. */
const SESSION_MINUTES = 10;

/**
 * Dead stretch, on the spends this dad weighs. A sample is dead when those
 * live options all need at least `minWaitSec` of saving (one session): none
 * of them can be paid for, and the best one's wait is at least that long.
 * Free posts and refused buys are not on the table. A few minutes of saving
 * at the end of a sitting does not turn the overnight gap into a dead
 * stretch. The length is wall-clock hours from the first dead sample to the
 * next sample that is not dead, or to the last sample if the run ends waiting.
 */
export const DEAD_STRETCH = {
  unit: "hours",
  minWaitSec: SESSION_MINUTES * SECONDS_PER_MINUTE,
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

/**
 * Finish day passed to extreme win as `casualFinishDay`. The plain dad.
 */
export const CASUAL_REFERENCE_ID = "casual-2x10";

/** Finish day passed to regret as `optimizerFinishDay`. */
export const OPTIMIZER_REFERENCE_ID = "optimizer";

export type TargetScope =
  | { readonly kind: "all" }
  | { readonly kind: "policies"; readonly ids: readonly string[] }
  | { readonly kind: "policyKinds"; readonly kinds: readonly PolicyKind[] }
  | {
      readonly kind: "afterHour";
      readonly hour: number;
      /**
       * When set, only these player kinds are graded. The hour still drops
       * the opening samples. Omitted means every kind.
       */
      readonly kinds?: readonly PolicyKind[];
    }
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
    scope: { kind: "policyKinds", kinds: ["casual", "optimizer"] },
    op: "lte",
    value: 0.25,
    why: "Most moments should offer more than one live option.",
  },
  {
    id: "live-median-after-open",
    measure: "liveMedian",
    scope: {
      kind: "afterHour",
      hour: OPENING_HOURS,
      kinds: ["casual", "optimizer"],
    },
    op: "gte",
    value: 2,
    why: "After the first hour the typical moment should be a real choice.",
  },
  {
    id: "dominant-share",
    measure: "dominantShare",
    scope: { kind: "policyKinds", kinds: ["casual", "optimizer"] },
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
    scope: { kind: "policies", ids: [CASUAL_REFERENCE_ID] },
    op: "between",
    value: [5, 7],
    why: "A casual dad finishes inside a quiet week, and not before day five.",
  },
  {
    id: "thin-habit-finish",
    measure: "finishDay",
    scope: { kind: "policies", ids: ["five-min-a-day"] },
    op: "lte",
    value: 14,
    why: "Five minutes a day still finishes inside two weeks.",
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

/**
 * Sittings the optimizer may save across. One is the next session: that
 * sitting plus the gap before it, because away pay shows up first.
 */
export const LOOKAHEAD_SESSIONS = 1;

/** The plain dad taps this fast while the sitting is open. */
export const TAPS_PER_SECOND = 3;

/** How many days `runPolicy` plays when the caller does not name a cap. */
export const DEFAULT_MAX_DAYS = 30;

/**
 * Seeds a CI run plays, numbered 1 through this count.
 * Three keeps the report job short. CI sets LAB_STRICT=1, so a miss fails
 * the job after the report is posted.
 */
export const CI_SEEDS = 3;

/**
 * Seeds `npm run lab` plays on a machine, numbered 1 through this count.
 * `--seeds` sets the count. `--ci` uses `CI_SEEDS` instead.
 */
export const LOCAL_SEEDS = 20;

/** Dead stretches longer than this many hours are listed in the report. */
export const REPORT_DEAD_HOURS = 2;

/**
 * Digits after the decimal in the strategy-lab report.
 * Three keeps a miss like 0.078 from rounding onto a bound of 0.08.
 */
export const REPORT_FRACTION_DIGITS = 3;

/** Scores closer than this are the same buy. Matches the pacing tie. */
export const VALUE_TIE = 1e-9;

/** The plain dad puts trouble right within three seconds. */
export const FIX_FAST_MS = 3 * MS_PER_SECOND;

/** A slow dad waits as long as an apprentice tending the machine. */
export const FIX_SLOW_MS = 30 * MS_PER_SECOND;

/** Two 10-minute sittings. Most registered dads share this day. */
export const CASUAL_SESSIONS = 2;
export const CASUAL_MINUTES = SESSION_MINUTES;

/** One 20-minute evening. */
export const EVENING_MINUTES = 20;

/** Six 3-minute check-ins. The gap slides by a tenth. */
export const CHECKER_SESSIONS = 6;
export const CHECKER_MINUTES = 3;
export const CHECKER_GAP_JITTER = 0.1;

/** One 5-minute sitting, or one 3-hour sitting. */
export const FIVE_MINUTES = 5;
export const MARATHON_MINUTES = 3 * MINUTES_PER_HOUR;

/** A hoarder pays only when the pocket holds this many times the sticker. */
export const HOARD_MULTIPLE = 8;

/** Both sides of a jitter roll, so the gap can land early or late. */
const JITTER_POLES = 2;

/**
 * Slides `base` by `jitter` (a fraction) from the seed. Zero jitter returns
 * `base`. The same seed and session always slide the same way.
 */
export function jitteredGap(
  base: number,
  jitter: number,
  seed: number,
  session: number,
): number {
  if (!(jitter > 0)) {
    return base;
  }
  const swing = jitterUnit(seed, session) * JITTER_POLES - 1;
  return Math.max(0, Math.round(base * (1 + swing * jitter)));
}

/** One deterministic 0..1 step. Same mixer the trouble rolls use. */
function jitterUnit(seed: number, session: number): number {
  const mixed =
    (Math.imul(seed, 0x9e3779b1) ^ Math.imul(session + 1, 0x85ebca6b)) >>> 0;
  let x = Math.imul(mixed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

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
