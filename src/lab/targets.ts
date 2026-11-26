/**
 * Every tunable lab number lives here. A measure file reads these names.
 * A guardrail is one entry in `TARGETS`: change the value, nothing else.
 */

/** A live option pays back within this multiple of the best payback. */
export const LIVE_RATIO = 1.5;

export const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

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

/** dominantShare leaves this many hours out. */
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

/** revealToUseP90 reads this percentile. */
export const P90 = 90;
/** The pacing ledger (#554): days to two places, and an 8-digit hex hash of the end. */
export const LEDGER_DAY_DIGITS = 2;
export const LEDGER_HASH_DIGITS = 8;
export const LEDGER_HASH_RADIX = 16;

/** revealSlowest lists waits at least this long, in live hours. Report only. */
export const REVEAL_LIST_HOURS = 1;
/** revealSlowest shows at most this many ids. */
export const REVEAL_LIST_SIZE = 8;

/** Two sides of a sorted list, for the median. */
export const MIDPOINT_DIVISOR = 2;

/** Output-share key for the tending bonus. */
export const TENDING_SOURCE = "tending";

/** Output-share key for the tunnel borer. */
export const BORER_SOURCE = "borer";

/** Output-share key for stones that come from crafted gear and timers. */
export const CRAFTED_SOURCE = "crafted";

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
  | {
      readonly kind: "fromSource";
      readonly source: string;
      /**
       * When set, only these player kinds are graded. The source still
       * drops samples from before that output. Omitted means every kind.
       */
      readonly kinds?: readonly PolicyKind[];
    };

type TargetBase = {
  readonly id: string;
  readonly measure: string;
  readonly scope: TargetScope;
  readonly why: string;
  /** A miss is still in the report. It does not fail `LAB_STRICT`. */
  readonly reportOnly?: boolean;
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
 *
 * The old rows judged today's mountain and went with it (#737). The fresh
 * mine's first row is the five-day floor (#556) for the whole slice:
 * Flemming, 16 Nov 2026, 14:22, "A" to adding it (#675).
 */
export const TARGETS: readonly Target[] = [
  {
    id: "slice-five-days",
    measure: "sliceDays",
    scope: { kind: "all" },
    op: "gte",
    value: 5,
    why: "The whole slice, to the Foundry's roof, takes five days or more for every player type, with no ceiling.",
  },
];

/**
 * A fresh mine's dad (slice 1, #655). A gain or a difference this small is
 * float dust, not a move of the line.
 */
export const FRESH_DUST = 1e-9;

/** Most buys one raise of the line may chain: three stages tied, and room for a tool step. */
export const RAISE_STEPS = 6;

/**
 * Part 3's dad (#675). A free move or a fix must bring the building this
 * share of its time sooner: float noise is not a move.
 */
export const SOONER_SHARE = 1e-9;

/** Calls a weighing (of buys, or of free moves that found none) is kept while the mine stays the same: about half a minute of play. */
export const WEIGH_AGAIN_CALLS = 30;

/** How many times more the other level's good must be short before the whole-workforce dad moves everyone: he does not go back and forth. */
export const WHOLE_MOVE_MARGIN = 2;

/** The even dad's split of the Topsoil's drilling and haulage: one part in this many to the Granite. */
export const EVEN_SPLIT = 2;

/** Goods a second, for a good of a level nobody works: as if it came at once while he weighs the rest. */
export const AT_ONCE = 1e12;

/** Seconds of the mine played live against the rates at a sitting's open (`cageGap`). */
export const CAGE_GAP_SECONDS = 600;

/** Most workers the mover puts back from the mine when an order delivers. */
export const RESTORE_STEPS = 64;

/** Most plans one live second may apply: a guard, never reached in play. */
export const PLANS_A_SECOND = 400;

/**
 * The order takes more than this share of what the mine makes: the pocket
 * hardly grows (the slice 1 spec's `starved`), and a hold is weighed.
 */
export const STARVED_SHARE = 0.5;

/** A gap this long or longer is a night, for `nightFull` (#667); shorter gaps are breaks in a day. */
export const NIGHT_MIN_MS = 6 * HOUR_MS;

/** A stockpile this full or fuller is nearly full: part 2's dad expands the stockyard (#667). */
export const YARD_NEARLY_FULL = 0.9;

/** Workers one tap moves with the amount key on ×10 (call 49). */
export const AMOUNT_KEY_TEN = 10;

/** How many days `runPolicy` plays when the caller does not name a cap (45 for Slice 2's 4-building arc, #772). */
export const DEFAULT_MAX_DAYS = 45;

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

/** Four 2-minute check-ins, the design's short sitting. */
export const CHECKIN_SESSIONS = 4;
export const CHECKIN_MINUTES = 2;

/** One 5-minute sitting, or one 3-hour sitting. */
export const FIVE_MINUTES = 5;
export const MARATHON_MINUTES = 3 * MINUTES_PER_HOUR;

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
