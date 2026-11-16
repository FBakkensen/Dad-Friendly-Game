import { effectiveRates } from "./rates";
import type { Engineer } from "./engineers";
import { type Expedition, type FindId, type Homecoming } from "./expeditions";
import { NO_UPGRADES, type Upgrades } from "./upgrades";
import { EMPTY_MATERIALS } from "./layers";
import { EMPTY_STOCK, addedStock, stockMoved, type Stock } from "./stock";
import type { TeachId } from "./teach";
import {
  NO_PROJECT,
  type BuildingId,
  type Project,
  type StepIndex,
} from "./city";
import { NO_JOBS, workersOnJobs, type Jobs } from "./workforce";
import { makerRecord, type MakerId } from "./makers";
import { UNSUNK, type Granite } from "./mine-levels";
import { NO_CAGES, type Cages } from "./cages";
import { flowMineLive, landedMine } from "./mine-cages";
import { wholeSeconds } from "./piles";
import { IDLE_STATION, withMaterials, type Station } from "./factory";
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
import { partThreeOn } from "./part-switch";
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
  STARTING_RECIPE_IDS,
  settleBench,
  type Bench,
  type Clocks,
  type Crafted,
  type RecipeId,
} from "./workshop";

/**
 * One run's state. Never changed in place: every move returns a new object.
 * `effectiveRates` keeps its clockless answer per mountain object and relies
 * on that (#314).
 */
export type Mountain = {
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
   * Rock dug (slice 1, call 13, #664): every stone drilling has dug this
   * run. It only grows, and it breaks a tie between two copies of a fresh
   * mine, whose mountain never shrinks (#740: the mountain has no depth).
   */
  readonly rockDug: number;
  /**
   * The part of `rockDug` drilled on the Granite (slice 1, part 3, rule
   * 5.13, #674): its iron comes from it, and the Topsoil's clay from the
   * rest. 0 until the shaft is sunk.
   */
  readonly graniteDug: number;
  /** The shaft to the Granite (slice 1, part 3, src/mine-levels.ts). Always unsunk in today's game. */
  readonly granite: Granite;
  /**
   * The shaft's cages (slice 1, part 3, src/cages.ts, #724): the hoists
   * assigned to each level and the cages' trips. None in today's game.
   */
  readonly cages: Cages;
  /** The factory's station and its work order (slice 1, part 3, src/factory.ts). Always idle in today's game. */
  readonly station: Station;
};

/** 0 for a first run that was never started over. */
export function runStartedAt(mountain: Mountain): number {
  return mountain.startedAt;
}

/** A mountain with nothing dug and nothing owned. */
export const BARE_MOUNTAIN: Mountain = {
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
  graniteDug: 0,
  granite: UNSUNK,
  cages: NO_CAGES,
  station: IDLE_STATION,
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
  const start = { ...BARE_MOUNTAIN, recipes: [...STARTING_RECIPE_IDS] };
  return {
    ...start,
    owned: {
      ...start.owned,
      helper: workersOnJobs({ jobs: FRESH_START_JOBS }),
    },
    jobs: FRESH_START_JOBS,
    fleet: givenFleet(),
  };
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
  /** Share of the crew's speed paid: 1 while playing, the night shift output away. */
  pay?: number;
  /** Live play: once part 3 is on, the cages play trip by trip (#724). Away time never does. */
  live?: boolean;
}): Accrual {
  if (to <= from) {
    return { mountain, mined: 0, settledAt: Math.max(from, to) };
  }
  // A craft that finished before this window is on the crew for the whole of it.
  // One that finishes during the window is fitted at the end, once.
  const ready = settleBench(mountain, from);
  if (stockyardOpen(ready)) {
    const worked = accrueStretches(ready, from, to, pay, live);
    return { ...worked, mountain: settleBench(worked.mountain, to) };
  }
  const worked = withDelivery(
    accrueMine(ready, from, to, pay, live),
    from,
    to,
    pay,
  );
  const fitted = settleBench(worked.mountain, to);
  return fitted === worked.mountain ? worked : { ...worked, mountain: fitted };
}

/**
 * A fresh mine's work with the stockyard open (part 2, #666): the mine,
 * transport and the builders in stretches, as a night runs, so a full
 * stockpile takes no more than transport empties from it. Live, the cages
 * play trip by trip once part 3 is on (#724).
 */
function accrueStretches(
  mountain: Mountain,
  from: number,
  to: number,
  pay: number,
  live: boolean,
): Accrual {
  let state = mountain;
  let cursor = from;
  let mined = 0;
  while (to - cursor >= 1000) {
    const part = workStretch(state, { from: cursor, end: to }, pay, true, live);
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
 * Live with part 3 on, the cages play trip by trip (#724), and a cage can
 * travel while no pile moves.
 */
function accrueMine(
  mountain: Mountain,
  from: number,
  to: number,
  pay: number,
  live: boolean,
): Accrual {
  const cages = live && partThreeOn();
  if (!cages && !mineMakes(mountain, pay)) {
    return { mountain, mined: 0, settledAt: to };
  }
  const seconds = Math.floor((to - from) / 1000);
  const flow = cages ? flowMineLive : flowMine;
  return {
    ...flow(mountain, seconds, pay, true),
    settledAt: from + seconds * 1000,
  };
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
  /** The night, for the shift report (#663). */
  readonly night: NightReport;
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
    false,
  );
}

/**
 * One stretch of a fresh mine's work at `pay` of its rates, live or
 * unattended: up to `end`, the second the step in hand is built in, the
 * second a pile fills or empties, and, with the stockyard open, the second
 * what transport takes from a stockpile changes (#666), so a full stockpile
 * is topped up by no more than transport took. A pile that fills or empties
 * within the first second is taken as filled or empty, so a stockpile a few
 * goods short of its room does not cut the stretch to a second. Live, the
 * cages play trip by trip once part 3 is on (#724).
 */
function workStretch(
  mountain: Mountain,
  { from, end }: { readonly from: number; readonly end: number },
  pay: number,
  drilling: boolean,
  live: boolean,
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
  const mine = (live ? flowMineLive : flowMine)(
    mountain,
    seconds,
    pay,
    drilling,
  );
  // Clay and iron come with the rock drilled (rule 5.13, #674).
  const dug = withMaterials(mountain, mine.mountain);
  return {
    mountain: deliver(dug, seconds, pay),
    mined: mine.mined,
    gained:
      dug === mine.mountain
        ? mine.gained
        : addedStock(
            stockMoved(mine.mountain.stock, dug.stock).gained,
            mine.gained,
          ),
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
  return from + wholeSeconds(seconds) * 1000;
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
 * no expeditions, so none of their splits apply. The cages land first
 * (#724, ruling 13): what they unload counts as produced, and the rest of the
 * night counts them as rates. The report's `night` holds what the shift
 * report says (#663). This is the crew's work while the game was closed.
 */
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
  const clockStops = lastSeen + Math.min(awayMs, NIGHT_CLOCK_MS);
  const landed = landedMine(mountain);
  const log: NightLog = {
    producedMs: 0,
    producedTo: 0,
    steps: [],
    litAtMs: undefined,
    gained:
      landed.mountain === mountain
        ? EMPTY_STOCK
        : addedStock(EMPTY_STOCK, landed.gained),
    fullAtMs: Object.fromEntries(
      STOCKPILE_GOODS.filter((good) =>
        stockpileFull(landed.mountain, good),
      ).map((good) => [good, 0]),
    ),
    deadMs: 0,
  };
  let state = landed.mountain;
  let cursor = lastSeen;
  let mined = landed.mined;
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
      materials: EMPTY_MATERIALS,
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
