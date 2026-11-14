import type { Trouble } from "./hazards";
import { effectiveRates, heartBonus, paidAwayMs } from "./rates";
import { NO_BOOSTS, type Boosts } from "./boosts";
import {
  QUICK_VEIN_AWAY_MS,
  holdForRush,
  payRush,
  resumeRush,
} from "./gold-rush";
import type { Engineer } from "./engineers";
import {
  clampExpeditions,
  completeDue,
  type Expedition,
  type FindId,
  type Homecoming,
} from "./expeditions";
import { NO_UPGRADES, type Upgrades } from "./upgrades";
import { EMPTY_MATERIALS, addMaterials, materialsGained } from "./layers";
import type { TeachId } from "./teach";
import type { Materials } from "./layers";
import {
  COLD_CLOCKS,
  NOTHING_CRAFTED,
  recipesForMined,
  settleBench,
  type Bench,
  type Clocks,
  type Crafted,
  type RecipeId,
} from "./workshop";

/** Mountain numbers live here; tier numbers in src/tiers.ts. See docs/DESIGN.md. */
import {
  MOUNTAIN_STONES,
  depthAfterStones,
  minedOut,
  stonesLeft,
} from "./scale";

export { MOUNTAIN_STONES };
/** Base away cap; the Shield of Protection relic will lift it. */

/**
 * One run's state. Never changed in place: every move returns a new object.
 * `effectiveRates` keeps its clockless answer per mountain object and relies
 * on that (#314).
 */
export type Mountain = {
  /** Stones still in the mountain. 0..MOUNTAIN_STONES. */
  readonly remaining: number;
  /** Stones mined and not yet spent. */
  readonly pocket: number;
  /** Owned per tier (src/tiers.ts). */
  readonly helpers: number;
  readonly carts: number;
  /** The line's hoists and pit trains (#533): 0 until the line is on. */
  readonly hoists: number;
  readonly drills: number;
  readonly borers: number;
  readonly trains: number;
  readonly machines: number;
  /** Crown of Wisdom kid helpers. */
  readonly kids: number;
  /** Permanent upgrade levels (src/upgrades.ts); 0 is none. */
  readonly upgrades: Upgrades;
  /**
   * Quick boosts as end times (src/boosts.ts). 0 means never run; a boost
   * that has run keeps its last end time, so its row stays shown.
   */
  readonly boosts: Boosts;
  /**
   * When this run began (epoch ms), set by "Start over". 0 is the first run.
   * A save from an older run never replaces a newer one.
   */
  readonly startedAt: number;
  /** Mountains passed to your kid (M6). */
  readonly legacy: number;
  /**
   * How much bigger this run is (M13, src/scale.ts). Set when the mine passes
   * to the kid; 1 is unstretched, so a run already under way keeps its numbers.
   */
  readonly stretch: number;
  /** Named engineers (M7), at most five. See src/engineers.ts. */
  readonly engineers: readonly Engineer[];
  /**
   * Parties still out (M7). An engineer on one of these is away: their post
   * is the one they come home to. See src/expeditions.ts.
   */
  readonly expeditions: readonly Expedition[];
  /**
   * Lost tools and keepsakes already brought home.
   * Glimmers are not stored; they are a line, not a thing on the shelf.
   */
  readonly finds: readonly FindId[];
  /** Clay, iron, crystal, and heartstone dug with the stones (M9). */
  readonly materials: Materials;
  /** The craft on the one bench. A required key: undefined is a free bench. */
  readonly bench: Bench | undefined;
  /** Levels already crafted; 0 is not made. */
  readonly crafted: Crafted;
  /** Recipes found. */
  readonly recipes: readonly RecipeId[];
  /**
   * When each craft's live timer stops (epoch ms); 0 is cold. Saved as four
   * fields in the workshop map.
   */
  readonly clocks: Clocks;
  /** When the Gold rush stops paying its held stones (src/gold-rush.ts); 0 is none. */
  readonly rushUntil: number;
  /** Stones of an away haul held for the Gold rush, paid as it runs (src/gold-rush.ts). */
  readonly rushBank: number;
  /** Systems whose "New" note has been opened (M11, src/teach.ts). */
  readonly seen: readonly TeachId[];
  /** Systems used at least once; their dot is gone (M11, src/teach.ts). */
  readonly taught: readonly TeachId[];
};

/** A sanity cap for saves; no dad gets near it. */
export const MAX_LEGACY = 1000;

/** 0 for a first run that was never started over. */
export function runStartedAt(mountain: Mountain): number {
  return mountain.startedAt;
}

/** A mountain with nothing dug and nothing owned. */
export const BARE_MOUNTAIN: Mountain = {
  remaining: MOUNTAIN_STONES,
  pocket: 0,
  helpers: 0,
  carts: 0,
  hoists: 0,
  drills: 0,
  borers: 0,
  trains: 0,
  machines: 0,
  kids: 0,
  upgrades: NO_UPGRADES,
  boosts: NO_BOOSTS,
  startedAt: 0,
  legacy: 0,
  stretch: 1,
  engineers: [],
  expeditions: [],
  finds: [],
  materials: EMPTY_MATERIALS,
  bench: undefined,
  crafted: NOTHING_CRAFTED,
  recipes: [],
  clocks: COLD_CLOCKS,
  rushUntil: 0,
  rushBank: 0,
  seen: [],
  taught: [],
};

export function createMountain(): Mountain {
  return {
    ...BARE_MOUNTAIN,
    materials: materialsGained(0, 0),
    recipes: recipesForMined(0),
  };
}

export { minedOut };

/** One tap mines its yield (see effectiveRates); an empty mountain returns the same object. */
export function mineByHand(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): Mountain {
  if (mountain.remaining === 0) {
    return mountain;
  }
  const mined = Math.min(
    stonesLeft(mountain),
    effectiveRates(mountain, now, trouble).tapYield,
  );
  return digStones(mountain, mined);
}

/** Stones leave the mountain, and the band they came from drops its material. */
export function digStones(mountain: Mountain, mined: number): Mountain {
  const before = minedOut(mountain);
  const remaining =
    mined >= stonesLeft(mountain)
      ? 0
      : MOUNTAIN_STONES - depthAfterStones(mountain, mined);
  return {
    ...mountain,
    remaining,
    pocket: mountain.pocket + mined,
    materials: addMaterials(
      mountain.materials,
      materialsGained(before, MOUNTAIN_STONES - remaining),
    ),
  };
}

/** The crew's speed; pass `now` while playing to count running boosts. */
export function stonesPerSecond(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): number {
  return effectiveRates(mountain, now, trouble).crewPerSecond;
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
  trouble,
}: {
  mountain: Mountain;
  from: number;
  to: number;
  /** Share of the crew's speed paid: 1 while playing, AWAY_PAY_RATE away. */
  pay?: number;
  /** Live play counts boosts running at `from`; away time never does. */
  live?: boolean;
  /** Session trouble. Ignored unless `live`: away pay never slows for it. */
  trouble?: Trouble;
}): Accrual {
  if (to <= from) {
    return { mountain, mined: 0, settledAt: Math.max(from, to) };
  }
  // A craft that finished before this window is on the crew for the whole of it.
  // One that finishes during the window is fitted at the end, once.
  const ready = settleBench(mountain, from);
  const crew = accrueCrew({
    mountain: ready,
    from,
    to,
    pay,
    live,
    ...(trouble === undefined ? {} : { trouble }),
  });
  const worked = live ? withRushPay(crew, from, to) : crew;
  const fitted = settleBench(worked.mountain, to);
  return fitted === worked.mountain ? worked : { ...worked, mountain: fitted };
}

/** The Gold rush's held stones paid over the same whole seconds as the crew. */
function withRushPay(crew: Accrual, from: number, to: number): Accrual {
  const rush = payRush(crew.mountain, from, Math.floor((to - from) / 1000));
  return rush.paid === 0 && rush.mountain === crew.mountain
    ? crew
    : { ...crew, mountain: rush.mountain, mined: crew.mined + rush.paid };
}

function accrueCrew({
  mountain,
  from,
  to,
  pay = 1,
  live = false,
  trouble,
}: {
  mountain: Mountain;
  from: number;
  to: number;
  pay?: number;
  live?: boolean;
  trouble?: Trouble;
}): Accrual {
  const rate = stonesPerSecond(
    mountain,
    live ? from : undefined,
    live ? trouble : undefined,
  );
  if (rate === 0 || mountain.remaining === 0) {
    return { mountain, mined: 0, settledAt: to };
  }
  const seconds = Math.floor((to - from) / 1000);
  const left = stonesLeft(mountain);
  const mined = Math.min(left, Math.floor(seconds * rate * pay));
  const settledAt = mined === left ? to : from + seconds * 1000;
  if (mined === 0) {
    return { mountain, mined: 0, settledAt };
  }
  return {
    mountain: digStones(mountain, mined),
    mined,
    settledAt,
  };
}

export type AwayReport = {
  readonly mined: number;
  /** Real time away, before the cap. */
  readonly awayMs: number;
  /** Stones of `mined` held back for the Gold rush (#468); 0 when none. */
  readonly heldForRush: number;
  /** Time that actually paid. */
  readonly paidMs: number;
  readonly capped: boolean;
  /** Heart of Patience multiplier on away pay (1 without the Heart). */
  readonly heart: number;
  /** Ore the crew brought up while you were away. */
  readonly materials: Materials;
};

/** The crew's work while the game was closed: away pay of their speed, up to the away cap (see effectiveRates). */
export function accrueAway({
  mountain: closed,
  lastSeen,
  now,
}: {
  mountain: Mountain;
  lastSeen: number;
  now: number;
}): Accrual & {
  readonly report: AwayReport;
  readonly homecomings: readonly Homecoming[];
} {
  const awayMs = Math.max(0, now - lastSeen);
  // Close is pause for a Gold rush, over a short break (src/gold-rush.ts).
  const mountain = resumeRush(closed, lastSeen, now);
  const long = awayMs >= QUICK_VEIN_AWAY_MS;
  const rates = effectiveRates(mountain);
  const paidMs = paidAwayMs(mountain, awayMs);
  const capped = awayMs > paidMs;
  const heart = heartBonus(mountain, paidMs);
  // Rounded so 0.3 × 1.5 pays 0.45, not 0.44999… (one stone short).
  const pay = Math.round(rates.awayPay * heart * 1e9) / 1e9;
  // Pay the most recent stretch, and split it where an expedition comes
  // home, so the machine they left speeds up again from that moment.
  const walked = accrueAcrossExpeditions({
    mountain,
    from: now - paidMs,
    to: now,
    pay,
  });
  // After an hour away, part of the haul waits for the Gold rush (#468).
  const held = long
    ? holdForRush(walked.mountain, walked.mined, rates.exactCrewPerSecond)
    : walked.mountain;
  return {
    ...walked,
    mountain: held,
    report: {
      mined: walked.mined,
      heldForRush: long ? held.rushBank : 0,
      awayMs,
      paidMs,
      capped,
      heart,
      materials: materialsGained(minedOut(mountain), minedOut(walked.mountain)),
    },
  };
}

/**
 * Someone already home before this window (they returned during the unpaid
 * part of a long absence, or exactly as it opened) tends the whole stretch.
 * A return inside the window splits it. A return exactly at the end is paid
 * as time away, then they are home for whatever comes next.
 */
function accrueAcrossExpeditions({
  mountain,
  from,
  to,
  pay,
}: {
  mountain: Mountain;
  from: number;
  to: number;
  pay: number;
}): Accrual & { readonly homecomings: readonly Homecoming[] } {
  const opened = completeDue(clampExpeditions(mountain, to), from);
  let state = opened.mountain;
  const homecomings = [...opened.homecomings];
  const marks = [
    ...new Set(
      state.expeditions
        .map((trip) => trip.returnsAt)
        .filter((returnsAt) => returnsAt > from && returnsAt < to),
    ),
  ].sort((left, right) => left - right);
  let mined = 0;
  let cursor = from;
  for (const mark of marks) {
    const part = accrue({ mountain: state, from: cursor, to: mark, pay });
    mined += part.mined;
    const brought = completeDue(part.mountain, mark);
    state = brought.mountain;
    homecomings.push(...brought.homecomings);
    cursor = mark;
  }
  const tail = accrue({ mountain: state, from: cursor, to, pay });
  const closed = completeDue(tail.mountain, to);
  homecomings.push(...closed.homecomings);
  return {
    mountain: closed.mountain,
    mined: mined + tail.mined,
    settledAt: tail.settledAt,
    homecomings,
  };
}
