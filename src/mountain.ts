import type { Trouble } from "./hazards";
import { effectiveRates, paidAwayMs } from "./rates";
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
import { makerRecord, type MakerId } from "./makers";
import { UNSUNK, type Granite } from "./mine-levels";
import {
  flowMine,
  mineMakes,
  mineSettled,
  takeIncome,
  type MinePiles,
} from "./mine-piles";
import {
  STOCKPILE_GOODS,
  deadStockpiles,
  stockpileFull,
  stockyardOpen,
} from "./stockyard";
import type { GoodId } from "./stock";
import {
  deliver,
  drawChange,
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
   * When this run began (epoch ms), set by "Start over". 0 is the first run.
   * A save from an older run never replaces a newer one.
   */
  readonly startedAt: number;
  /** Named engineers (M7), at most five. See src/engineers.ts. */
  readonly engineers: readonly Engineer[];
  /**
   * Parties still out (M7). An engineer on one of these is away: their post
   * is the one they come home to. See src/expeditions.ts.
   */
  readonly expeditions: readonly Expedition[];
  /**
   * Lost tools and keepsakes already brought home.
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
  /**
   * Drilled rock and rock at the shaft (slice 1, rule 2, #703), in
   * whole stones. Always empty in today's game.
   */
  readonly piles: MinePiles;
  /** Makers owned, by kind (slice 1, part 2, src/makers.ts). Always none in today's game. */
  readonly makers: Readonly<Record<MakerId, number>>;
  /** The stockyard's level (slice 1, part 2, src/stockyard.ts); 0 is the first. */
  readonly stockyard: number;
  /**
   * Rock dug in all (slice 1, call 13, #664): every stone drilling has
   * dug this run. It only grows, and it breaks a tie between two copies
   * of a fresh mine, whose mountain never shrinks. Always 0 in today's game.
   */
  readonly rockDug: number;
  /** The shaft to the Granite (slice 1, part 3, src/mine-levels.ts). Always unsunk in today's game. */
  readonly granite: Granite;
};

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
  startedAt: 0,
  engineers: [],
  expeditions: [],
  finds: [],
  bench: undefined,
  crafted: NOTHING_CRAFTED,
  recipes: [],
  clocks: COLD_CLOCKS,
  seen: [],
  taught: [],
  fleet: vehicleRecord(0),
  operational: [],
  project: NO_PROJECT,
  jobs: NO_JOBS,
  piles: { face: 0, shaft: 0, kiln: 0 },
  makers: makerRecord(0),
  stockyard: 0,
  rockDug: 0,
  granite: UNSUNK,
};

/**
 * A fresh mine starts with one worker, on drilling (slice 1, rule 2.10,
 * #703): drilled rock waits until he is moved to haulage, and at the
 * shaft until he is moved to hoisting. The horse wagon is given, with nobody
 * driving it, and nobody builds until he hires.
 */
export const FRESH_START_JOBS: Jobs = {
  drilling: 1,
  haulage: 0,
  hoisting: 0,
  driving: 0,
  building: 0,
  kilns: 0,
  graniteDrilling: 0,
  graniteHaulage: 0,
  saws: 0,
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

/**
 * How far a run has come, for which copy is ahead (call 13, #664): rock
 * dug from today's mountain, and rock drilling dug in a fresh mine.
 */
export function rockDugInAll(mountain: Mountain): number {
  return minedOut(mountain) + mountain.rockDug;
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

/** The crew's speed; pass `now` while playing to count running crew timers. */
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
  /** Live play counts crew timers running at `from`; away time never does. */
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
  if (freshMineOn() && stockyardOpen(ready)) {
    const worked = accrueStretches(ready, from, to, pay);
    return { ...worked, mountain: settleBench(worked.mountain, to) };
  }
  const crew = freshMineOn()
    ? accrueMine(ready, from, to, pay)
    : accrueCrew({
        mountain: ready,
        from,
        to,
        pay,
        live,
        ...(trouble === undefined ? {} : { trouble }),
      });
  const worked = freshMineOn() ? withDelivery(crew, from, to, pay) : crew;
  const fitted = settleBench(worked.mountain, to);
  return fitted === worked.mountain ? worked : { ...worked, mountain: fitted };
}

/**
 * A fresh mine's work with the stockyard open (part 2, #666): the mine,
 * transport and the builders in stretches, as a night runs, so a full
 * stockpile takes no more than transport empties from it.
 */
function accrueStretches(
  mountain: Mountain,
  from: number,
  to: number,
  pay: number,
): Accrual {
  let state = mountain;
  let cursor = from;
  let mined = 0;
  while (to - cursor >= 1000) {
    const part = workStretch(state, { from: cursor, end: to }, pay, true);
    state = part.mountain;
    mined += part.mined;
    cursor = Math.max(part.settledAt, cursor + 1000);
  }
  return { mountain: state, mined, settledAt: cursor };
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

/**
 * A fresh mine's work over whole seconds (slice 1, rule 2, #703): each stage
 * at its own speed times `pay`, with rock waiting in the face and shaft
 * piles, and what hoisting lifts in the stock. A mine where no stage can
 * move spends the whole window, as a crew with nothing to do always has.
 */
function accrueMine(
  mountain: Mountain,
  from: number,
  to: number,
  pay: number,
): Accrual {
  if (!mineMakes(mountain, pay)) {
    return { mountain, mined: 0, settledAt: to };
  }
  const seconds = Math.floor((to - from) / 1000);
  return {
    ...flowMine(mountain, seconds, pay, true),
    settledAt: from + seconds * 1000,
  };
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
  /** Time that actually paid. */
  readonly paidMs: number;
  readonly capped: boolean;
  /** Ore the crew brought up while you were away. */
  readonly materials: Materials;
  /** A fresh mine's night, for the shift report (#663). Never in today's game. */
  readonly night?: NightReport;
};

/** A step built in during the night; the roof's is the building going operational. */
type NightStep = {
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
  /** Time stone came up to the pocket (#703: past the clock while the piles drain). */
  readonly producedMs: number;
  /**
   * "clock" when the eight-hour clock stopped a mine that was producing;
   * "stockyard" when a full stockyard stopped it (part 2, #666).
   */
  readonly stop: "clock" | "stockyard" | "none";
  /** When each stockpile was first full, from the start of the night (part 2, #666). */
  readonly fullAtMs?: Readonly<Partial<Record<GoodId, number>>>;
  /**
   * How long of the night a stockpile sat full while nothing took its good:
   * no order delivering, or the step in hand requiring none of it
   * (`deadStockpiles`, the lab's `deadGood`, #667). Each stretch of the
   * night counts on its start's terms.
   */
  readonly deadMs: number;
  /** What reached the stockpiles, good by good: the shift report's "Produced" (#671). */
  readonly produced: Stock;
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
  if (freshMineOn()) {
    return accrueNight({ mountain, lastSeen, now });
  }
  const awayMs = Math.max(0, now - lastSeen);
  const rates = effectiveRates(mountain);
  const paidMs = paidAwayMs(awayMs);
  const capped = awayMs > paidMs;
  // Rounded so float dust never pays one stone short.
  const pay = Math.round(rates.awayPay * 1e9) / 1e9;
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
    report: {
      mined: walked.mined,
      awayMs,
      paidMs,
      capped,
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
 * How long a fresh mine drills unattended before the stockyard (slice 1, rule
 * 4, #654): the clock stops drilling; haulage and hoisting go on while the
 * piles hold rock (#703), and transport goes on.
 */
const NIGHT_CLOCK_MS = 8 * 60 * 60 * 1000;

/**
 * One stretch of a fresh mine's night at one night shift output (#663,
 * #703): up to its end, to the second the step in hand is built in, so each
 * step has its own second and a roof's power may light the rest of the night
 * (rule 7.11), or to the second a pile fills or empties, so what comes up to
 * the pocket is the same each second of it. Drilling stops at the clock;
 * haulage and hoisting go on while the piles hold rock. `producing` is
 * whether stone came up.
 */
function nightStretch(
  mountain: Mountain,
  from: number,
  end: number,
  drilling: boolean,
): Stretch {
  return workStretch(
    mountain,
    { from, end },
    effectiveRates(mountain).awayPay,
    drilling,
  );
}

/**
 * One stretch of a fresh mine's work at `pay` of its rates, live or
 * unattended: up to `end`, the second the step in hand is built in, the
 * second a pile fills or empties, and, with the stockyard open, the second
 * what transport takes from a stockpile changes (#666), so a full stockpile
 * is topped up by no more than transport took. A pile that fills or empties
 * within the first second is taken as filled or empty, so a stockpile a few
 * goods short of its room does not cut the stretch to a second.
 */
function workStretch(
  mountain: Mountain,
  { from, end }: { readonly from: number; readonly end: number },
  pay: number,
  drilling: boolean,
): Stretch {
  // A stretch is a second at least: what changes within it is made for it.
  const settled = mineSettled(mountain, pay, drilling);
  const { income } = settled;
  const to = Math.min(
    end,
    secondMark(from, secondsToStep(mountain, pay, income)),
    secondMark(from, settled.change),
    stockyardOpen(mountain)
      ? secondMark(
          from,
          drawChange(mountain, pay, {
            take: takeIncome(mountain, pay, drilling),
            income,
          }),
        )
      : Infinity,
  );
  const seconds = Math.floor((to - from) / 1000);
  const mine = flowMine(mountain, seconds, pay, drilling);
  return {
    mountain: deliver(mine.mountain, seconds, pay),
    mined: mine.mined,
    gained: mine.gained,
    settledAt: from + seconds * 1000,
    producing: mine.mined > 0,
  };
}

/** One stretch of the night: what came up, and what reached the stockpiles. */
type Stretch = Accrual & {
  readonly producing: boolean;
  readonly gained: Partial<Stock>;
};

/** The end of the whole second in which `seconds` from `from` falls, at least one on; Infinity stays. */
function secondMark(from: number, seconds: number): number {
  return Number.isFinite(seconds)
    ? from + Math.max(1, Math.ceil(seconds - 1e-9)) * 1000
    : Infinity;
}

/** A building's steps, in order. */
const NIGHT_STEPS: readonly StepIndex[] = [0, 1, 2];

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
  // A project gives way to none only when its roof goes on.
  const reached =
    after.project.kind === "unordered"
      ? NIGHT_STEPS.length
      : after.project.site.step;
  return NIGHT_STEPS.filter((index) => index >= step && index < reached).map(
    (index) => ({ building, step: index, atMs }),
  );
}

/** The night so far, as the shift report counts it. */
type NightLog = {
  producedMs: number;
  /** Where the last stretch that brought stone up ended, from the night's start. */
  producedTo: number;
  readonly steps: NightStep[];
  litAtMs: number | undefined;
  /** What reached the stockpiles, good by good. */
  gained: Stock;
  /** When each stockpile was first full (#666). */
  readonly fullAtMs: Partial<Record<GoodId, number>>;
  /** How long a stockpile sat dead (#667). */
  deadMs: number;
};

/** One stretch's facts into the log: `at` is where the next stretch starts. */
function logStretch(
  log: NightLog,
  before: Mountain,
  part: Stretch,
  span: { readonly from: number; readonly at: number; readonly start: number },
): void {
  const atMs = span.at - span.start;
  log.steps.push(...stepsBuilt(before, part.mountain, atMs));
  log.gained = addedStock(log.gained, part.gained);
  for (const good of STOCKPILE_GOODS) {
    if (
      log.fullAtMs[good] === undefined &&
      stockpileFull(part.mountain, good)
    ) {
      log.fullAtMs[good] = atMs;
    }
  }
  // A stretch runs on its start's terms until the event that ends it.
  if (deadStockpiles(before).length > 0) {
    log.deadMs += span.at - span.from;
  }
  if (part.producing) {
    log.producedMs += span.at - span.from;
    log.producedTo = atMs;
  }
  if (
    log.litAtMs === undefined &&
    effectiveRates(part.mountain).awayPay !== effectiveRates(before).awayPay
  ) {
    log.litAtMs = atMs;
  }
}

/**
 * A fresh mine's night (slice 1, rules 4 and 7.11, #654). The mine works at
 * the night shift output; drilling stops after the first eight hours, and
 * haulage and hoisting bring up what waits in the piles (#703). Transport carries to
 * what he ordered, from the pocket, for the whole night at the same share.
 * A roof that goes on in the night lights the rest of it. A fresh mine has
 * no expeditions, so none of their splits apply. The
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
  const log: NightLog = {
    producedMs: 0,
    producedTo: 0,
    steps: [],
    litAtMs: undefined,
    gained: EMPTY_STOCK,
    fullAtMs: Object.fromEntries(
      STOCKPILE_GOODS.filter((good) => stockpileFull(mountain, good)).map(
        (good) => [good, 0],
      ),
    ),
    deadMs: 0,
  };
  let state = mountain;
  let cursor = lastSeen;
  let mined = 0;
  while (now - cursor >= 1000) {
    // The clock goes once the stockyard is open (part 2, rule 4): the mine
    // runs until the stockyard is full.
    const drilling = cursor < clockStops || stockyardOpen(state);
    const end = cursor < clockStops ? clockStops : now;
    const part = nightStretch(state, cursor, end, drilling);
    const at = Math.max(part.settledAt, cursor + 1000);
    logStretch(log, state, part, {
      from: cursor,
      at: Math.min(at, end),
      start: lastSeen,
    });
    state = part.mountain;
    mined += part.mined;
    cursor = at;
  }
  const clockless = stockyardOpen(state);
  return {
    mountain: state,
    mined,
    settledAt: now,
    homecomings: [],
    report: {
      mined,
      awayMs,
      paidMs: clockless ? awayMs : clockStops - lastSeen,
      capped: !clockless && awayMs > NIGHT_CLOCK_MS,
      materials: materialsGained(0, 0),
      night: nightReport(log, mountain, state, awayMs),
    },
  };
}

/**
 * What stopped the mine: the eight-hour clock only if stone still came up
 * when it struck (a pile that ran out first stopped the mine, #703); a full
 * stockyard if the mine stood at the end with its stone stockpile full (#666).
 */
function nightStop(
  log: NightLog,
  after: Mountain,
  awayMs: number,
): NightReport["stop"] {
  if (stockyardOpen(after)) {
    return log.producedTo < awayMs && stockpileFull(after, "stones")
      ? "stockyard"
      : "none";
  }
  return awayMs > NIGHT_CLOCK_MS && log.producedTo >= NIGHT_CLOCK_MS
    ? "clock"
    : "none";
}

/** The night's facts from its log and the mine before and after it. */
function nightReport(
  log: NightLog,
  before: Mountain,
  after: Mountain,
  awayMs: number,
): NightReport {
  const dug = addedStock(before.stock, log.gained);
  const full = Object.keys(log.fullAtMs).length > 0;
  return {
    producedMs: log.producedMs,
    stop: nightStop(log, after, awayMs),
    deadMs: log.deadMs,
    ...(full ? { fullAtMs: { ...log.fullAtMs } } : {}),
    produced: log.gained,
    delivered: stockMoved(dug, after.stock).spent,
    steps: log.steps,
    payFrom: effectiveRates(before).awayPay,
    payTo: effectiveRates(after).awayPay,
    ...(log.litAtMs === undefined ? {} : { litAtMs: log.litAtMs }),
  };
}
