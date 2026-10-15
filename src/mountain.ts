import type { Trouble } from "./hazards";
import { effectiveRates, heartBonus, paidAwayMs } from "./rates";
import { parseBoosts, type Boosts } from "./boosts";
import { parseEngineers, type Engineer } from "./engineers";
import {
  clampExpeditions,
  completeDue,
  parseExpeditions,
  parseFinds,
  type Expedition,
  type FindId,
  type Homecoming,
} from "./expeditions";
import { parseUpgrades, type Upgrades } from "./upgrades";
import { addMaterials, materialsGained } from "./layers";
import type { Materials } from "./layers";
import {
  parseBench,
  parseCrafted,
  parseMaterials,
  parseRecipes,
  recipesForMined,
  settleBench,
  type Bench,
  type Crafted,
  type KeptWorkshop,
  type RecipeId,
} from "./workshop";

/** Mountain numbers live here; tier numbers in src/tiers.ts. See docs/DESIGN.md. */
import { MOUNTAIN_STONES, minedOut } from "./scale";

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
   * How far the one-time staffing grants have run (see staffExisting).
   * `true` and `1` are the first grant (#89). `2` is the M7 top-up (#140).
   * New mountains start at 2. Old clients still write `true`.
   */
  readonly staffed?: StaffedMark;
  /** Mountains passed to your kid (M6); missing means none. */
  readonly legacy?: number;
  /**
   * Named engineers (M7). Missing until the first borer; at most five.
   * See src/engineers.ts.
   */
  readonly engineers?: readonly Engineer[];
  /**
   * Parties still out (M7). Missing when nobody is in a tunnel.
   * See src/expeditions.ts.
   */
  readonly expeditions?: readonly Expedition[];
  /**
   * Lost tools and keepsakes already brought home. Missing until the first.
   * Glimmers are not stored; they are a line, not a thing on the shelf.
   */
  readonly finds?: readonly FindId[];
  /**
   * Clay, iron, crystal, and heartstone dug with the stones (M9). Missing
   * on a mountain built in a test; a real save always has it.
   */
  readonly materials?: Materials;
  /** The craft on the one bench. Missing means the bench is free. */
  readonly bench?: Bench;
  /** Levels already crafted. Missing means nothing is made. */
  readonly crafted?: Crafted;
  /** Recipes found. Missing on a hand-built mountain; a save always has it. */
  readonly recipes?: readonly RecipeId[];
  /**
   * When a blasting charge stops doubling the crew (epoch ms). Missing means
   * none is hot. Written in the workshop map, beside the mountain.
   */
  readonly chargeUntil?: number;
  /** When a crystal flare stops drawing veins. Live play only. */
  readonly flareUntil?: number;
  /** When a heartstone ember stops lifting the Great Machine. Live play only. */
  readonly emberUntil?: number;
  /** When axle grease stops speeding carts. Live play only. */
  readonly axleUntil?: number;
  /**
   * Recipe ids, a bench, and crafted levels this build does not know.
   * Written back inside the workshop map. Not a mountain document key.
   */
  readonly kept?: KeptWorkshop;
};

/** A sanity cap for saves; no dad gets near it. Mirrored in firestore.rules. */
const MAX_LEGACY = 1000;

/** `true` and `1`: the #89 grant. `2`: the M7 top-up. Mirrored in firestore.rules. */
export type StaffedMark = true | 1 | 2;

/** Saves at this mark have had every staffing top-up. New mountains start here. */
export const STAFF_GRANT = 2 satisfies StaffedMark;

function isStaffedMark(value: unknown): value is StaffedMark {
  return value === true || value === 1 || value === 2;
}

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
    staffed: STAFF_GRANT,
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
    mountain.remaining,
    effectiveRates(mountain, now, trouble).tapYield,
  );
  return digStones(mountain, mined);
}

/** Stones leave the mountain, and the band they came from drops its material. */
export function digStones(mountain: Mountain, mined: number): Mountain {
  const before = minedOut(mountain);
  return {
    ...mountain,
    remaining: mountain.remaining - mined,
    pocket: mountain.pocket + mined,
    materials: addMaterials(
      mountain.materials,
      materialsGained(before, before + mined),
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
  const worked = accrueCrew({
    mountain: ready,
    from,
    to,
    pay,
    live,
    ...(trouble === undefined ? {} : { trouble }),
  });
  const fitted = settleBench(worked.mountain, to);
  return fitted === worked.mountain ? worked : { ...worked, mountain: fitted };
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
  const mined = Math.min(mountain.remaining, Math.floor(seconds * rate * pay));
  const settledAt = mined === mountain.remaining ? to : from + seconds * 1000;
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
  /** Time that actually paid. */
  readonly paidMs: number;
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
}): Accrual & {
  readonly report: AwayReport;
  readonly homecomings: readonly Homecoming[];
} {
  const awayMs = Math.max(0, now - lastSeen);
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
  return {
    ...walked,
    report: { mined: walked.mined, awayMs, paidMs, capped, heart },
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
      (state.expeditions ?? [])
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
    legacy,
    engineers,
    expeditions,
    finds,
    materials,
    bench,
    crafted,
    recipes,
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
    (staffed !== undefined && !isStaffedMark(staffed)) ||
    (legacy !== undefined && (!isCount(legacy) || legacy > MAX_LEGACY)) ||
    (upgrades !== undefined && parseUpgrades(upgrades) === undefined) ||
    (boosts !== undefined && parseBoosts(boosts) === undefined) ||
    (engineers !== undefined && parseEngineers(engineers) === undefined) ||
    (expeditions !== undefined &&
      parseExpeditions(expeditions, parseEngineers(engineers)) === undefined) ||
    (finds !== undefined && parseFinds(finds) === undefined) ||
    (materials !== undefined && parseMaterials(materials) === undefined) ||
    (recipes !== undefined && parseRecipes(recipes) === undefined) ||
    (bench !== undefined &&
      bench !== null &&
      parseBench(bench) === undefined) ||
    (crafted !== undefined && parseCrafted(crafted) === undefined)
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
  const parsedEngineers =
    engineers === undefined ? undefined : parseEngineers(engineers);
  const parsedExpeditions =
    expeditions === undefined
      ? undefined
      : parseExpeditions(expeditions, parsedEngineers);
  const parsedFinds = finds === undefined ? undefined : parseFinds(finds);
  const parsedMaterials =
    materials === undefined ? undefined : parseMaterials(materials);
  const parsedRecipes =
    recipes === undefined ? undefined : parseRecipes(recipes);
  const parsedBench =
    bench === undefined || bench === null ? undefined : parseBench(bench);
  const parsedCrafted =
    crafted === undefined ? undefined : parseCrafted(crafted);
  return {
    ...mountain,
    ...(parsedUpgrades === undefined || Object.keys(parsedUpgrades).length === 0
      ? {}
      : { upgrades: parsedUpgrades }),
    ...(parsedBoosts === undefined || Object.keys(parsedBoosts).length === 0
      ? {}
      : { boosts: parsedBoosts }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(isStaffedMark(staffed) ? { staffed } : {}),
    ...(typeof legacy === "number" && legacy > 0 ? { legacy } : {}),
    ...(parsedEngineers === undefined || parsedEngineers.length === 0
      ? {}
      : { engineers: parsedEngineers }),
    ...(parsedExpeditions === undefined || parsedExpeditions.length === 0
      ? {}
      : { expeditions: parsedExpeditions }),
    ...(parsedFinds === undefined || parsedFinds.length === 0
      ? {}
      : { finds: parsedFinds }),
    ...(parsedMaterials === undefined ? {} : { materials: parsedMaterials }),
    ...(parsedRecipes === undefined ? {} : { recipes: parsedRecipes }),
    ...(parsedBench === undefined ? {} : { bench: parsedBench }),
    ...(parsedCrafted === undefined || Object.keys(parsedCrafted).length === 0
      ? {}
      : { crafted: parsedCrafted }),
  };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
