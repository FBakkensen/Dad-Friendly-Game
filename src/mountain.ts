import { effectiveRates, heartBonus } from "./rates";
import { parseBoosts, type Boosts } from "./boosts";
import { parseUpgrades, type Upgrades } from "./upgrades";

/** Mountain numbers live here; tier numbers in src/tiers.ts. See docs/DESIGN.md. */
import { MOUNTAIN_STONES } from "./scale";

export { MOUNTAIN_STONES };
/** Base away cap; the Shield of Protection relic will lift it. */

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
  /** Crown of Wisdom kid helpers; saved only once there are some. */
  readonly kids: number;
  /** Permanent upgrade levels (src/upgrades.ts); missing means none. */
  readonly upgrades?: Upgrades;
  /** Running quick boosts as end times (src/boosts.ts); missing means none. */
  readonly boosts?: Boosts;
  /**
   * When this run began (epoch ms), set by "Start over". Missing means the
   * first run. A save from an older run never replaces a newer one.
   */
  readonly startedAt?: number;
  /**
   * Set once machines need helpers (#89): older saves get free helpers on
   * load, one time (see staffExisting in crew.ts). New mountains start set.
   */
  readonly staffed?: true;
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
    kids: 0,
    staffed: true,
  };
}

export { minedOut } from "./scale";

/** One tap mines its yield (see effectiveRates); an empty mountain returns the same object. */
export function mineByHand(mountain: Mountain, now?: number): Mountain {
  if (mountain.remaining === 0) {
    return mountain;
  }
  const mined = Math.min(
    mountain.remaining,
    effectiveRates(mountain, now).tapYield,
  );
  return {
    ...mountain,
    remaining: mountain.remaining - mined,
    pocket: mountain.pocket + mined,
  };
}

/** The crew's speed; pass `now` while playing to count running boosts. */
export function stonesPerSecond(mountain: Mountain, now?: number): number {
  return effectiveRates(mountain, now).crewPerSecond;
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
  live = false,
}: {
  mountain: Mountain;
  from: number;
  to: number;
  /** Share of the crew's speed paid: 1 while playing, AWAY_PAY_RATE away. */
  pay?: number;
  /** Live play counts boosts running at `from`; away time never does. */
  live?: boolean;
}): Accrual {
  const rate = stonesPerSecond(mountain, live ? from : undefined);
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
  /** Heart of Patience multiplier on away pay (1 without the Heart). */
  readonly heart: number;
};

/** The crew's work while the game was closed: away pay of their speed, up to the away cap (see effectiveRates). */
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
  const rates = effectiveRates(mountain);
  const capped = awayMs > rates.awayCapMs;
  const paidMs = capped ? rates.awayCapMs : awayMs;
  const heart = heartBonus(mountain, paidMs);
  const result = accrue({
    mountain,
    from: now - paidMs,
    to: now,
    // Rounded so 0.3 × 1.5 pays 0.45, not 0.44999… (one stone short).
    pay: Math.round(rates.awayPay * heart * 1e9) / 1e9,
  });
  return { ...result, report: { mined: result.mined, awayMs, capped, heart } };
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
    kids = 0,
    upgrades,
    boosts,
    startedAt,
    staffed,
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
    !isCount(kids) ||
    (startedAt !== undefined && !isCount(startedAt)) ||
    (staffed !== undefined && staffed !== true) ||
    (upgrades !== undefined && parseUpgrades(upgrades) === undefined) ||
    (boosts !== undefined && parseBoosts(boosts) === undefined)
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
    kids,
  };
  const parsedBoosts = boosts === undefined ? undefined : parseBoosts(boosts);
  const parsedUpgrades =
    upgrades === undefined ? undefined : parseUpgrades(upgrades);
  return {
    ...mountain,
    ...(parsedUpgrades === undefined || Object.keys(parsedUpgrades).length === 0
      ? {}
      : { upgrades: parsedUpgrades }),
    ...(parsedBoosts === undefined || Object.keys(parsedBoosts).length === 0
      ? {}
      : { boosts: parsedBoosts }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(staffed === true ? { staffed } : {}),
  };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
