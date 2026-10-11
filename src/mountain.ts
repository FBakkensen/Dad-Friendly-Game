/** All game numbers live here. See docs/DESIGN.md "Numbers and tuning". */
export const MOUNTAIN_STONES = 1_000_000;
const HELPER_BASE_COST = 10;
const HELPER_COST_GROWTH = 1.15;
const HELPER_STONES_PER_SECOND = 1;
/** Base away cap; the Shield of Protection relic will lift it. */
export const AWAY_CAP_MS = 8 * 60 * 60 * 1000;

export type Mountain = {
  /** Stones still in the mountain. 0..MOUNTAIN_STONES. */
  readonly remaining: number;
  /** Stones mined and not yet spent. */
  readonly pocket: number;
  /** Helper miners hired; each mines HELPER_STONES_PER_SECOND. */
  readonly helpers: number;
};

export function createMountain(): Mountain {
  return { remaining: MOUNTAIN_STONES, pocket: 0, helpers: 0 };
}

export function minedOut(mountain: Mountain): number {
  return MOUNTAIN_STONES - mountain.remaining;
}

/** One tap, one stone. An empty mountain returns the same object. */
export function mineByHand(mountain: Mountain): Mountain {
  if (mountain.remaining === 0) {
    return mountain;
  }
  return {
    ...mountain,
    remaining: mountain.remaining - 1,
    pocket: mountain.pocket + 1,
  };
}

/** Cookie Clicker curve: each helper costs 15% more than the last. */
export function helperCost(owned: number): number {
  return Math.ceil(HELPER_BASE_COST * HELPER_COST_GROWTH ** owned);
}

/** Pays for one helper from the pocket; unaffordable returns the same mountain. */
export function hireHelper(mountain: Mountain): Mountain {
  const cost = helperCost(mountain.helpers);
  if (mountain.pocket < cost) {
    return mountain;
  }
  return {
    ...mountain,
    pocket: mountain.pocket - cost,
    helpers: mountain.helpers + 1,
  };
}

export function stonesPerSecond(mountain: Mountain): number {
  return mountain.helpers * HELPER_STONES_PER_SECOND;
}

export type Accrual = {
  readonly mountain: Mountain;
  readonly mined: number;
  /** The moment the work is accounted up to. Leftover part-seconds stay unspent. */
  readonly settledAt: number;
};

/**
 * Helpers' work between two moments, in whole seconds. Live ticks and away
 * time both use this, so they cannot drift apart. Time with nothing to do
 * (no helpers, empty mountain) is spent, not banked.
 */
export function accrue({
  mountain,
  from,
  to,
}: {
  mountain: Mountain;
  from: number;
  to: number;
}): Accrual {
  const rate = stonesPerSecond(mountain);
  if (to <= from) {
    return { mountain, mined: 0, settledAt: Math.max(from, to) };
  }
  if (rate === 0 || mountain.remaining === 0) {
    return { mountain, mined: 0, settledAt: to };
  }
  const seconds = Math.floor((to - from) / 1000);
  const mined = Math.min(mountain.remaining, seconds * rate);
  const settledAt = mined === mountain.remaining ? to : from + seconds * 1000;
  if (mined === 0) {
    return { mountain, mined: 0, settledAt };
  }
  return {
    mountain: {
      ...mountain,
      remaining: mountain.remaining - mined,
      pocket: mountain.pocket + mined,
    },
    mined,
    settledAt,
  };
}

export type AwayReport = {
  readonly mined: number;
  /** Real time away, before the cap. */
  readonly awayMs: number;
  readonly capped: boolean;
};

/** Helpers' work while the game was closed, paid for at most AWAY_CAP_MS. */
export function accrueAway({
  mountain,
  lastSeen,
  now,
}: {
  mountain: Mountain;
  lastSeen: number;
  now: number;
}): Accrual & { readonly report: AwayReport } {
  const awayMs = Math.max(0, now - lastSeen);
  const capped = awayMs > AWAY_CAP_MS;
  const result = accrue({
    mountain,
    from: capped ? now - AWAY_CAP_MS : lastSeen,
    to: now,
  });
  return { ...result, report: { mined: result.mined, awayMs, capped } };
}

/** Builds a mountain from untrusted data; every field must be a sane whole number. */
export function parseMountain(value: unknown): Mountain | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { remaining, pocket, helpers } = value as Record<string, unknown>;
  if (
    !isCount(remaining) ||
    remaining > MOUNTAIN_STONES ||
    !isCount(pocket) ||
    !isCount(helpers)
  ) {
    return undefined;
  }
  return { remaining, pocket, helpers };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
