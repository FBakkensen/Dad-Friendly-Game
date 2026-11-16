import { SITE_HOLDS, onSiteTotal } from "../building-site";
import { tierLocked } from "../crew";
import { STAGES, type Stage } from "../line";
import type { Mountain } from "../mountain";
import { effectiveRates } from "../rates";
import { deadStockpiles, stockyardOpen } from "../stockyard";
import { TIERS, tierInPlay } from "../tiers";
import {
  fleetSize,
  orderLimit,
  vehicleOpen,
  vehiclePrice,
  VEHICLE_IDS,
} from "../transport";
import {
  JOB_IDS,
  LEVEL_JOBS,
  STAGE_JOB,
  freeWorkers,
  levelWorks,
  stageMachines,
  stageWorks,
  toolSpeed,
  type JobId,
  type Jobs,
  type LevelStage,
  type StageMachine,
  type StageWork,
} from "../workforce";
import { flowMineLive } from "../mine-cages";
import { MINE_LEVEL_IDS, graniteOpen, type MineLevelId } from "../mine-levels";
import { flowMine } from "../mine-piles";
import { partThreeOn } from "../part-switch";
import { sticker } from "./decide";
import { drainsTheMine, siteIdle } from "./fresh-dad";
import { goodsIncome, hirePrice, levelsRates } from "./fresh-kit";
import { AMOUNT_KEY_TEN, CAGE_GAP_SECONDS, FRESH_DUST } from "./targets";

/**
 * What the lab reads off a fresh mine at a sample (slice 1, Lab, #655). The
 * page names none of it (the principle of 15 Nov 2026); the lab reads the
 * limits the rules work out.
 */
export type FreshView = {
  /** What holds the order back, or why nothing is delivered. A good is `good`. */
  readonly limit: "unordered" | "onHold" | "transport" | "builders" | "good";
  /** The building site holds all it can: transport waits for the builders. */
  readonly siteFull: boolean;
  /** He cannot pay for the cheapest buy while the order takes more than half of what the mine makes. */
  readonly starved: boolean;
  /** Share of his workers who are free, or on a job with nothing to do. */
  readonly idleWorkers: number;
  /** Share of his machines that stand because their workers' tools move more. NaN with none. */
  readonly idleMachines: number;
  /** The stockyard is open (part 2, #667): its stockpiles have a room. */
  readonly yardOpen: boolean;
  /** A stockpile is full and no order delivering takes its good (`deadGood`, #667). */
  readonly deadGood: boolean;
  /** With the Granite open (#675): the share of the mine's workers on hoisting. */
  readonly hoistShare?: number;
  /** Part 3 plays (#675): the run ends at the Foundry's roof, the slice's end. */
  readonly partThree: boolean;
};

/** The view now. */
export function freshView(mountain: Mountain): FreshView {
  const rates = effectiveRates(mountain);
  const line = rates.exactCrewPerSecond;
  const project = mountain.project;
  const limit = orderLimit(mountain, goodsIncome(mountain));
  return {
    limit:
      limit.kind === "delivering"
        ? limit.limit === "transport" || limit.limit === "builders"
          ? limit.limit
          : "good"
        : limit.kind,
    siteFull:
      project.kind !== "unordered" && onSiteTotal(project.site) >= SITE_HOLDS,
    starved:
      project.kind === "delivering" &&
      drainsTheMine(mountain) &&
      mountain.stock.stones < cheapestBuy(mountain),
    idleWorkers: idleWorkerShare(mountain, rates.tierSpeed, line),
    idleMachines: idleMachineShare(mountain, rates.tierSpeed),
    yardOpen: stockyardOpen(mountain),
    deadGood: deadGood(mountain),
    partThree: partThreeOn(),
    ...(graniteOpen(mountain) ? { hoistShare: hoistShare(mountain) } : {}),
  };
}

/** The mine's workers: drilling and haulage on both levels, and hoisting. */
const MINE_JOBS: readonly JobId[] = [
  ...MINE_LEVEL_IDS.flatMap((level) => [
    LEVEL_JOBS[level].face,
    LEVEL_JOBS[level].haul,
  ]),
  STAGE_JOB.lift,
];

/** Share of the mine's workers on hoisting (`hoistWorkers`, rule 2.14). NaN with nobody in the mine. */
function hoistShare(mountain: Mountain): number {
  const mine = MINE_JOBS.reduce((sum, job) => sum + mountain.jobs[job], 0);
  return mine === 0 ? Number.NaN : mountain.jobs[STAGE_JOB.lift] / mine;
}

/**
 * A stockpile holds its room while nothing takes its good: no order
 * delivers, or the step in hand requires none of it (#667). What he could
 * buy with it is his call; the lab asks only whether the yard sits full.
 */
function deadGood(mountain: Mountain): boolean {
  return deadStockpiles(mountain).length > 0;
}

/** The cheapest thing he can buy: a worker, a machine of the line, or a vehicle. */
export function cheapestBuy(mountain: Mountain): number {
  let cheapest = hirePrice(mountain);
  for (const tier of TIERS) {
    if (tier.staff > 0 && tierInPlay(tier) && !tierLocked(mountain, tier)) {
      cheapest = Math.min(
        cheapest,
        sticker(mountain, { kind: "buyTier", id: tier.id }),
      );
    }
  }
  for (const id of VEHICLE_IDS.filter((open) => vehicleOpen(mountain, open))) {
    cheapest = Math.min(
      cheapest,
      vehiclePrice(mountain, id)[0]?.amount ?? Infinity,
    );
  }
  return cheapest;
}

type Speeds = Parameters<typeof stageWorks>[1];

/**
 * One stage's work as the idle shares weigh it: its workers and machines,
 * what it moves, and the line it feeds.
 */
type WorkRow = {
  readonly stage: Stage;
  readonly work: StageWork;
  readonly machines: readonly StageMachine[];
  readonly moves: number;
  readonly line: number;
};

/**
 * The mine's stages for the idle shares: the Topsoil's and the shaft's
 * against the line; with the Granite open (#675), each level's drilling and
 * haulage against that level's own line, and hoisting's cages, what they
 * lift from both levels, against both levels' lines together.
 */
function workRows(
  mountain: Mountain,
  speed: Speeds,
  line: number,
): readonly WorkRow[] {
  const works = stageWorks(mountain, speed);
  if (!graniteOpen(mountain)) {
    return STAGES.map((stage) => ({
      stage,
      work: works[stage],
      machines: stageMachines(mountain, speed, stage),
      moves: works[stage].moves,
      line,
    }));
  }
  const rates = levelsRates(mountain);
  const levelLine = (level: MineLevelId): number =>
    Math.min(...STAGES.map((stage) => rates[level][stage]));
  const rows: WorkRow[] = MINE_LEVEL_IDS.flatMap((level) => {
    const own = levelWorks(mountain, speed, level);
    return (["face", "haul"] as const).map((stage: LevelStage) => ({
      stage,
      work: own[stage],
      machines: stageMachines(mountain, speed, stage, level),
      moves: own[stage].moves,
      line: levelLine(level),
    }));
  });
  rows.push({
    stage: "lift",
    work: works.lift,
    machines: stageMachines(mountain, speed, "lift"),
    moves: MINE_LEVEL_IDS.reduce((sum, level) => sum + rates[level].lift, 0),
    line: MINE_LEVEL_IDS.reduce((sum, level) => sum + levelLine(level), 0),
  });
  return rows;
}

/**
 * Free workers, drivers with no vehicle or no order delivering, builders
 * with an idle site, and a stage's workers with tools that it could lose and
 * still move what its line moves.
 */
function idleWorkerShare(
  mountain: Mountain,
  speed: Speeds,
  line: number,
): number {
  const workers = mountain.owned.helper;
  if (workers === 0) {
    return 0;
  }
  const driving =
    mountain.project.kind === "delivering"
      ? Math.max(0, mountain.jobs.driving - fleetSize(mountain))
      : mountain.jobs.driving;
  const building = siteIdle(mountain) ? mountain.jobs.building : 0;
  let surplus = 0;
  for (const row of workRows(mountain, speed, line)) {
    const tool = toolSpeed(speed, row.stage);
    const spare =
      tool > 0 ? Math.floor((row.moves - row.line) / tool + FRESH_DUST) : 0;
    surplus += Math.max(0, Math.min(row.work.tools, spare));
  }
  return (freeWorkers(mountain) + driving + building + surplus) / workers;
}

/** Machines left off because a tool moves more than the workers they take (risk 15), on every level. */
function idleMachineShare(mountain: Mountain, speed: Speeds): number {
  let owned = 0;
  let idle = 0;
  for (const row of workRows(mountain, speed, 0)) {
    const tool = toolSpeed(speed, row.stage);
    for (const machine of row.machines) {
      owned += machine.owned;
      if (machine.speed <= machine.staff * tool) {
        idle += machine.owned - (row.work.running[machine.id] ?? 0);
      }
    }
  }
  return owned === 0 ? Number.NaN : idle / owned;
}

/** Taps for `count` moves of one kind with the amount key on ×10 then ×1. */
function keyTaps(count: number): number {
  return Math.floor(count / AMOUNT_KEY_TEN) + (count % AMOUNT_KEY_TEN);
}

/**
 * Taps that set the share between the levels, between two moments
 * (`shareMoves`, #675): workers placed on or freed from the Granite's
 * drilling and haulage, and hoists assigned to or taken off a level, each
 * with the amount key on ×10 and ×1. Undefined while the Granite is shut.
 */
export function shareTaps(
  before: Mountain,
  after: Mountain,
): number | undefined {
  if (!graniteOpen(after)) {
    return undefined;
  }
  let taps = 0;
  for (const stage of ["face", "haul"] as const) {
    const job = LEVEL_JOBS.granite[stage];
    taps += keyTaps(Math.abs(after.jobs[job] - before.jobs[job]));
  }
  for (const level of MINE_LEVEL_IDS) {
    taps += keyTaps(
      Math.abs(after.cages.assigned[level] - before.cages.assigned[level]),
    );
  }
  return taps;
}

/** The rock waiting below the cages: drilled rock and rock at the shaft, on both levels. */
function belowCages(mountain: Mountain): number {
  const { face, shaft } = mountain.piles;
  const deep =
    mountain.granite.kind === "sunk"
      ? mountain.granite.piles.face + mountain.granite.piles.shaft
      : 0;
  return face + shaft + deep;
}

/** The rock lifted from `start` to `after`: drilled, less what still waits below the cages. */
function lifted(start: Mountain, after: Mountain): number {
  return (
    after.rockDug - start.rockDug - (belowCages(after) - belowCages(start))
  );
}

/**
 * The cages played trip by trip against the rates a night counts (`cageGap`,
 * #675 ruling 10, as #724 ruling 17 measures it): ten minutes of the mine from this moment, both ways,
 * and the gap in rock lifted as a share of the rates' rock. Undefined
 * before part 3, where hoisting is not cages, and NaN when the rates lift
 * nothing.
 */
export function cageGap(mountain: Mountain): number | undefined {
  if (!partThreeOn()) {
    return undefined;
  }
  const live = lifted(
    mountain,
    flowMineLive(mountain, CAGE_GAP_SECONDS, 1, true).mountain,
  );
  const rates = lifted(
    mountain,
    flowMine(mountain, CAGE_GAP_SECONDS, 1, true).mountain,
  );
  return rates > 0 ? Math.abs(live - rates) / rates : Number.NaN;
}

/**
 * Taps that hire and move workers between two moments (`workerMoves`): the
 * hires, and for each job the workers placed or freed, each with the amount
 * key on ×10 and ×1. It reads the net change, so moves that undo each other
 * between the two moments are not counted, and neither is Max.
 */
export function workerTaps(
  before: { readonly helper: number; readonly jobs: Jobs },
  after: { readonly helper: number; readonly jobs: Jobs },
): number {
  let taps = keyTaps(Math.max(0, after.helper - before.helper));
  for (const job of JOB_IDS) {
    taps += keyTaps(Math.abs(after.jobs[job] - before.jobs[job]));
  }
  return taps;
}

type Viewed = { readonly fresh?: FreshView };

const ORDERED: ReadonlySet<FreshView["limit"]> = new Set([
  "onHold",
  "transport",
  "builders",
  "good",
]);

/** Share of the samples `among` keeps where `holds` is true. NaN with none kept. */
export function freshShare(
  samples: readonly Viewed[],
  among: (view: FreshView) => boolean,
  holds: (view: FreshView) => boolean,
): number {
  let kept = 0;
  let hits = 0;
  for (const sample of samples) {
    const view = sample.fresh;
    if (view === undefined || !among(view)) {
      continue;
    }
    kept += 1;
    hits += holds(view) ? 1 : 0;
  }
  return kept === 0 ? Number.NaN : hits / kept;
}

/** A project is ordered at this sample, delivering or on hold: the project's time. */
export function ordered(view: FreshView): boolean {
  return ORDERED.has(view.limit);
}

/** The mean of a per-sample share, leaving out samples where it is NaN. NaN with none. */
export function freshMean(
  samples: readonly Viewed[],
  read: (view: FreshView) => number,
): number {
  let count = 0;
  let total = 0;
  for (const sample of samples) {
    const value = sample.fresh === undefined ? Number.NaN : read(sample.fresh);
    if (!Number.isNaN(value)) {
      count += 1;
      total += value;
    }
  }
  return count === 0 ? Number.NaN : total / count;
}
