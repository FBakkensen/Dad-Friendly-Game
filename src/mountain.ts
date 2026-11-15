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
import { materialsGained } from "./layers";
import { EMPTY_STOCK, addedStock, stockMoved, type Stock } from "./stock";
import type { TeachId } from "./teach";
import { freshMineOn } from "./line-switch";
import {
  NO_PROJECT,
  type BuildingId,
  type Project,
  type StepIndex,
} from "./city";
import { NO_JOBS, workersOnJobs, type Jobs } from "./workforce";
import {
  deliver,
  givenFleet,
  secondsToStep,
  vehicleRecord,
  type VehicleId,
} from "./transport";
import { tierRecord, type TierId } from "./tiers";
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
  stonesToNextBand,
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
  /**
   * What he holds, by good (src/stock.ts): the stones mined and not yet
   * spent, and the clay, iron, crystal and heartstone dug with them (#560).
   */
  readonly stock: Stock;
  /**
   * How many he owns of each row of the tier table (src/tiers.ts), the
   * save's shape (#559). The line's hoists and pit trains stay 0 until the
   * line is on.
   */
  readonly owned: Readonly<Record<TierId, number>>;
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
  /** Vehicles owned, by kind (slice 1, src/transport.ts). A fresh mine is given one horse wagon. */
  readonly fleet: Readonly<Record<VehicleId, number>>;
  /** Buildings with their roof on, in the order they went up (slice 1, src/city.ts). */
  readonly operational: readonly BuildingId[];
  /** The city's project: not ordered, delivering, or on hold (src/city.ts). */
  readonly project: Project;
  /**
   * Workers on each job (slice 1, rule 2, #689). The free workers are the
   * rest of `owned.helper`. Always zero in today's game.
   */
  readonly jobs: Jobs;
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
  stock: EMPTY_STOCK,
  owned: tierRecord(0),
  upgrades: NO_UPGRADES,
  boosts: NO_BOOSTS,
  startedAt: 0,
  legacy: 0,
  stretch: 1,
  engineers: [],
  expeditions: [],
  finds: [],
  bench: undefined,
  crafted: NOTHING_CRAFTED,
  recipes: [],
  clocks: COLD_CLOCKS,
  rushUntil: 0,
  rushBank: 0,
  seen: [],
  taught: [],
  fleet: vehicleRecord(0),
  operational: [],
  project: NO_PROJECT,
  jobs: NO_JOBS,
};

/**
 * A fresh mine starts with every worker on a job (slice 1, rule 2.10, #689):
 * six on each stage, one driver on the horse wagon given and two builders on
 * the building site (#690). The lab set the count (#655): with the line at 18
 * a second, the wagon's 9 leaves him half of what the mine makes.
 */
const FRESH_START_JOBS: Jobs = {
  drilling: 6,
  haulage: 6,
  hoisting: 6,
  driving: 1,
  building: 2,
};

export function createMountain(): Mountain {
  const start = { ...BARE_MOUNTAIN, recipes: recipesForMined(0) };
  return freshMineOn()
    ? {
        ...start,
        owned: {
          ...start.owned,
          helper: workersOnJobs({ jobs: FRESH_START_JOBS }),
        },
        jobs: FRESH_START_JOBS,
        fleet: givenFleet(),
      }
    : start;
}

export { minedOut };

/** One tap mines its yield (see effectiveRates); an empty mountain returns the same object. */
export function mineByHand(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): Mountain {
  // Nothing is mined by a tap in a fresh mine (slice 1, What goes, #653).
  if (mountain.remaining === 0 || freshMineOn()) {
    return mountain;
  }
  const mined = Math.min(
    stonesLeft(mountain),
    effectiveRates(mountain, now, trouble).tapYield,
  );
  return digStones(mountain, mined);
}

/**
 * Stones leave the mountain, and the band they came from drops its material.
 * A fresh mine has no depth (slice 1, rule 1, #653): the stones go to the
 * stock, and the mountain stays full, so its one level never runs out.
 */
export function digStones(mountain: Mountain, mined: number): Mountain {
  if (freshMineOn()) {
    return {
      ...mountain,
      stock: addedStock(mountain.stock, { stones: mined }),
    };
  }
  const before = minedOut(mountain);
  const remaining =
    mined >= stonesLeft(mountain)
      ? 0
      : MOUNTAIN_STONES - depthAfterStones(mountain, mined);
  // One copy of the mountain: digging is the labs' hottest write.
  return {
    ...mountain,
    remaining,
    stock: addedStock(mountain.stock, {
      ...materialsGained(before, MOUNTAIN_STONES - remaining),
      stones: mined,
    }),
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
  const rushed = live ? withRushPay(crew, from, to) : crew;
  const worked = freshMineOn() ? withDelivery(rushed, from, to, pay) : rushed;
  const fitted = settleBench(worked.mountain, to);
  return fitted === worked.mountain ? worked : { ...worked, mountain: fitted };
}

/**
 * Transport's and the builders' work over the same whole seconds as the
 * crew, after the crew has dug (slice 1, rule 7, #654, #690): transport
 * carries from the pocket to the order's site and the builders build it in,
 * at `pay` of their rates (1 live, the night shift output unattended). On
 * hold, the builders still build.
 */
function withDelivery(
  crew: Accrual,
  from: number,
  to: number,
  pay: number,
): Accrual {
  if (crew.mountain.project.kind === "unordered") {
    return crew;
  }
  const seconds = Math.floor((to - from) / 1000);
  // A crew that digs nothing settles the whole window; transport still keeps
  // its part second for the next one.
  return {
    ...crew,
    mountain: deliver(crew.mountain, seconds, pay),
    settledAt: Math.min(crew.settledAt, from + seconds * 1000),
  };
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
  // A stretch that crosses into a new band pays the new band's speed from the
  // second it crosses, as live play does a second at a time (#592).
  let state = mountain;
  let cursor = from;
  let mined = 0;
  for (;;) {
    const rate = stonesPerSecond(
      state,
      live ? from : undefined,
      live ? trouble : undefined,
    );
    if (rate === 0 || state.remaining === 0) {
      return { mountain: state, mined, settledAt: to };
    }
    // Whole stones to dig past the band's start (the depth can be a part
    // stone short of it), and at least one, so every pass moves.
    const toBand = Math.max(1, Math.ceil(stonesToNextBand(state) - 1e-6));
    const seconds = Math.floor((to - cursor) / 1000);
    const crossing = Math.ceil(toBand / (rate * pay));
    if (seconds * rate * pay <= toBand || crossing >= seconds) {
      const last = digFor(state, seconds * rate * pay, seconds, cursor, to);
      return { ...last, mined: mined + last.mined };
    }
    // At least the stones to the band, so float dust never leaves it short.
    const part = digFor(
      state,
      Math.max(crossing * rate * pay, toBand),
      crossing,
      cursor,
      to,
    );
    state = part.mountain;
    mined += part.mined;
    cursor = part.settledAt;
  }
}

/**
 * Whole seconds of digging, `stones` of them paid (seconds × speed × pay, in
 * that order, as it always was), capped at the bottom.
 */
function digFor(
  mountain: Mountain,
  stones: number,
  seconds: number,
  from: number,
  to: number,
): Accrual {
  const left = stonesLeft(mountain);
  const mined = Math.min(left, Math.floor(stones));
  const settledAt = mined === left ? to : from + seconds * 1000;
  if (mined === 0) {
    return { mountain, mined: 0, settledAt };
  }
  return { mountain: digStones(mountain, mined), mined, settledAt };
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
  /** A fresh mine's night, for the shift report (#663). Never in today's game. */
  readonly night?: NightReport;
};

/** A step built in during the night; the roof's is the building going operational. */
export type NightStep = {
  readonly building: BuildingId;
  readonly step: StepIndex;
  /** When, from the start of the night: the whole second it was built in. */
  readonly atMs: number;
};

/**
 * What a fresh mine's night did (slice 1, rule 4, rule 7.12, call 48): how
 * long the mine produced, what stopped it, what transport delivered, the
 * steps built in, and the night shift output at its start and end.
 */
export type NightReport = {
  /** Time the mine dug with the line moving more than 0. */
  readonly producedMs: number;
  /** "clock" when the eight-hour clock stopped a mine that was producing. */
  readonly stop: "clock" | "none";
  /** What transport took from the pocket to the order, good by good. */
  readonly delivered: Stock;
  readonly steps: readonly NightStep[];
  /** The night shift output at the start of the night and at its end. */
  readonly payFrom: number;
  readonly payTo: number;
  /** When the output changed (a roof went on), from the start of the night. */
  readonly litAtMs?: number;
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
  if (freshMineOn()) {
    return accrueNight({ mountain: closed, lastSeen, now });
  }
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

/**
 * How long a fresh mine digs unattended before the stockyard (slice 1, rule
 * 4, #654): the clock stops the mine, and transport goes on.
 */
const NIGHT_CLOCK_MS = 8 * 60 * 60 * 1000;

/**
 * One stretch of a fresh mine's night at one night shift output: up to its
 * end, or to the second the step in hand is built in (#663), so each step
 * has its own second and a roof's power may light the rest of the night
 * (rule 7.11). `producing` is whether the line moved.
 */
function nightStretch(
  mountain: Mountain,
  from: number,
  end: number,
  digging: boolean,
): Accrual & { readonly producing: boolean } {
  const rates = effectiveRates(mountain);
  const pay = rates.awayPay;
  const income = digging ? rates.crewPerSecond * pay : 0;
  const finish = secondsToStep(mountain, pay, income);
  const built = from + Math.max(1, Math.ceil(finish - 1e-9)) * 1000;
  const to = Number.isFinite(finish) && built < end ? built : end;
  if (digging) {
    return { ...accrue({ mountain, from, to, pay }), producing: income > 0 };
  }
  const seconds = Math.floor((to - from) / 1000);
  return {
    mountain: deliver(mountain, seconds, pay),
    mined: 0,
    settledAt: to,
    producing: false,
  };
}

/** The steps built in between two states of the night, all at `atMs`. */
function stepsBuilt(
  before: Mountain,
  after: Mountain,
  atMs: number,
): readonly NightStep[] {
  const project = before.project;
  if (project.kind === "unordered") {
    return [];
  }
  const { building, step } = project.site;
  const reached = after.operational.includes(building)
    ? 3
    : after.project.kind === "unordered"
      ? step
      : after.project.site.step;
  const built: NightStep[] = [];
  for (let index = step; index < reached; index += 1) {
    built.push({ building, step: index as StepIndex, atMs });
  }
  return built;
}

/** The night so far, as the shift report counts it. */
type NightLog = {
  producedMs: number;
  readonly steps: NightStep[];
  litAtMs: number | undefined;
};

/** One stretch's facts into the log: `at` is where the next stretch starts. */
function logStretch(
  log: NightLog,
  before: Mountain,
  part: Accrual & { readonly producing: boolean },
  span: { readonly from: number; readonly at: number; readonly start: number },
): void {
  const atMs = span.at - span.start;
  log.steps.push(...stepsBuilt(before, part.mountain, atMs));
  if (part.producing) {
    log.producedMs += span.at - span.from;
  }
  if (
    log.litAtMs === undefined &&
    effectiveRates(part.mountain).awayPay !== effectiveRates(before).awayPay
  ) {
    log.litAtMs = atMs;
  }
}

/**
 * A fresh mine's night (slice 1, rules 4 and 7.11, #654). The mine digs at
 * the night shift output for the first eight hours; transport carries to
 * what he ordered, from the pocket, for the whole night at the same share.
 * A roof that goes on in the night lights the rest of it. A fresh mine has
 * no relics, expeditions or Gold rush, so none of their splits apply. The
 * report's `night` holds what the shift report says (#663).
 */
function accrueNight({
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
  const clockStops = lastSeen + Math.min(awayMs, NIGHT_CLOCK_MS);
  const log: NightLog = { producedMs: 0, steps: [], litAtMs: undefined };
  let state = mountain;
  let cursor = lastSeen;
  let mined = 0;
  while (now - cursor >= 1000) {
    const digging = cursor < clockStops;
    const part = nightStretch(
      state,
      cursor,
      digging ? clockStops : now,
      digging,
    );
    const at = Math.max(part.settledAt, cursor + 1000);
    logStretch(log, state, part, {
      from: cursor,
      at: Math.min(at, digging ? clockStops : now),
      start: lastSeen,
    });
    state = part.mountain;
    mined += part.mined;
    cursor = at;
  }
  return {
    mountain: state,
    mined,
    settledAt: now,
    homecomings: [],
    report: {
      mined,
      heldForRush: 0,
      awayMs,
      paidMs: clockStops - lastSeen,
      capped: awayMs > NIGHT_CLOCK_MS,
      heart: 1,
      materials: materialsGained(0, 0),
      night: nightReport(log, mountain, state, { mined, awayMs }),
    },
  };
}

/** The night's facts from its log and the mine before and after it. */
function nightReport(
  log: NightLog,
  before: Mountain,
  after: Mountain,
  { mined, awayMs }: { readonly mined: number; readonly awayMs: number },
): NightReport {
  const dug = addedStock(before.stock, { stones: mined });
  return {
    producedMs: log.producedMs,
    stop: awayMs > NIGHT_CLOCK_MS && log.producedMs > 0 ? "clock" : "none",
    delivered: stockMoved(dug, after.stock).spent,
    steps: log.steps,
    payFrom: effectiveRates(before).awayPay,
    payTo: effectiveRates(after).awayPay,
    ...(log.litAtMs === undefined ? {} : { litAtMs: log.litAtMs }),
  };
}
