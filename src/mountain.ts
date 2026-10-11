import { effectiveRates } from "./rates";
import { parseUpgrades, type Upgrades } from "./upgrades";

export { AWAY_PAY_RATE } from "./rates";

/** Mountain numbers live here; tier numbers in src/tiers.ts. See docs/DESIGN.md. */
export const MOUNTAIN_STONES = 100_000_000;
/** Base away cap; the Shield of Protection relic will lift it. */
export const AWAY_CAP_MS = 8 * 60 * 60 * 1000;

export type Mountain = {
  /** Stones still in the mountain. 0..MOUNTAIN_STONES. */
  readonly remaining: number;
  /** Stones mined and not yet spent. */
  readonly pocket: number;
  /** Owned per tier (src/tiers.ts). */
  readonly helpers: number;
  readonly carts: number;
  readonly drills: number;
  readonly borers: number;
  readonly machines: number;
  /** Permanent upgrade levels (src/upgrades.ts); missing means none. */
  readonly upgrades?: Upgrades;
  /**
   * When this run began (epoch ms), set by "Start over". Missing means the
   * first run. A save from an older run never replaces a newer one.
   */
  readonly startedAt?: number;
};

/** 0 for a first run that was never started over. */
export function runStartedAt(mountain: Mountain): number {
  return mountain.startedAt ?? 0;
}

export function createMountain(): Mountain {
  return {
    remaining: MOUNTAIN_STONES,
    pocket: 0,
    helpers: 0,
    carts: 0,
    drills: 0,
    borers: 0,
    machines: 0,
  };
}

export function minedOut(mountain: Mountain): number {
  return MOUNTAIN_STONES - mountain.remaining;
}

/** One tap mines its yield (see effectiveRates); an empty mountain returns the same object. */
export function mineByHand(mountain: Mountain): Mountain {
  if (mountain.remaining === 0) {
    return mountain;
  }
  const mined = Math.min(mountain.remaining, effectiveRates(mountain).tapYield);
  return {
    ...mountain,
    remaining: mountain.remaining - mined,
    pocket: mountain.pocket + mined,
  };
}

export function stonesPerSecond(mountain: Mountain): number {
  return effectiveRates(mountain).crewPerSecond;
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
  pay = 1,
}: {
  mountain: Mountain;
  from: number;
  to: number;
  /** Share of the crew's speed paid: 1 while playing, AWAY_PAY_RATE away. */
  pay?: number;
}): Accrual {
  const rate = stonesPerSecond(mountain);
  if (to <= from) {
    return { mountain, mined: 0, settledAt: Math.max(from, to) };
  }
  if (rate === 0 || mountain.remaining === 0) {
    return { mountain, mined: 0, settledAt: to };
  }
  const seconds = Math.floor((to - from) / 1000);
  const mined = Math.min(mountain.remaining, Math.floor(seconds * rate * pay));
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

/** The crew's work while the game was closed: AWAY_PAY_RATE of their speed, for at most AWAY_CAP_MS. */
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
    pay: effectiveRates(mountain).awayPay,
  });
  return { ...result, report: { mined: result.mined, awayMs, capped } };
}

/** Builds a mountain from untrusted data; every field must be a sane whole number. */
export function parseMountain(
  value: unknown,
  total: number = MOUNTAIN_STONES,
): Mountain | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const {
    remaining,
    pocket,
    helpers,
    carts = 0,
    drills = 0,
    borers = 0,
    machines = 0,
    upgrades,
    startedAt,
  } = value as Record<string, unknown>;
  if (
    !isCount(remaining) ||
    remaining > total ||
    !isCount(pocket) ||
    !isCount(helpers) ||
    !isCount(carts) ||
    !isCount(drills) ||
    !isCount(borers) ||
    !isCount(machines) ||
    (startedAt !== undefined && !isCount(startedAt)) ||
    (upgrades !== undefined && parseUpgrades(upgrades) === undefined)
  ) {
    return undefined;
  }
  const mountain = {
    remaining,
    pocket,
    helpers,
    carts,
    drills,
    borers,
    machines,
  };
  const parsedUpgrades =
    upgrades === undefined ? undefined : parseUpgrades(upgrades);
  return {
    ...mountain,
    ...(parsedUpgrades === undefined || Object.keys(parsedUpgrades).length === 0
      ? {}
      : { upgrades: parsedUpgrades }),
    ...(startedAt === undefined ? {} : { startedAt }),
  };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
