import { STAGES, type Stage, type StageSpeeds } from "./line";
import type { Mountain } from "./mountain";
import { makerOpen } from "./makers";
import {
  DEEPER_LEVEL_IDS,
  crystalOpen,
  graniteOpen,
  isLevelMachine,
  levelMachines,
  openDeeperLevel,
  openLevels,
  type LevelMachines,
  type MineLevelId,
} from "./mine-levels";
import { fleetSize } from "./transport";
import { factor } from "./economy/factors";
import { partThreeOn } from "./part-switch";
import {
  TIERS,
  machineStaff,
  tierInPlay,
  tierRecord,
  type MachineId,
  type TierId,
} from "./tiers";

/**
 * The workforce (slice 1, rule 2, #689): every worker is in one pool, on a
 * job or free. He hires a worker, who starts free, and moves one at a time
 * onto a job or off it, for free. Nothing moves a worker for him.
 */

/**
 * Where workers work: in part 1 the line's three stages, driving and
 * building (#690); in part 2 the kilns, one worker to a kiln (#666);
 * in slice 2 part 2 Crystal Caves drilling and haulage (#770).
 */
export const JOB_IDS = [
  "drilling",
  "haulage",
  "hoisting",
  "driving",
  "building",
  "kilns",
  "graniteDrilling",
  "graniteHaulage",
  "saws",
  "crystalDrilling",
  "crystalHaulage",
] as const;

export type JobId = (typeof JOB_IDS)[number];

export type Jobs = Readonly<Record<JobId, number>>;

export const NO_JOBS: Jobs = {
  drilling: 0,
  haulage: 0,
  hoisting: 0,
  driving: 0,
  building: 0,
  kilns: 0,
  graniteDrilling: 0,
  graniteHaulage: 0,
  saws: 0,
  crystalDrilling: 0,
  crystalHaulage: 0,
};

/** Each stage of the line and its job. */
export const STAGE_JOB: Readonly<Record<Stage, JobId>> = {
  face: "drilling",
  haul: "haulage",
  lift: "hoisting",
};

/** A stage a level has of its own: the one hoist serves all open levels. */
export type LevelStage = Exclude<Stage, "lift">;

/** Each level's jobs: `drilling` and `haulage` stay the Topsoil's, shipped ids. */
export const LEVEL_JOBS: Readonly<
  Record<MineLevelId, Readonly<Record<LevelStage, JobId>>>
> = {
  topsoil: { face: "drilling", haul: "haulage" },
  granite: { face: "graniteDrilling", haul: "graniteHaulage" },
  crystal: { face: "crystalDrilling", haul: "crystalHaulage" },
};

type Crew = Pick<Mountain, "owned" | "jobs">;

/**
 * Whether a job is open (rule 2.3): each deeper level's two with its shaft
 * sunk, the kilns' with the kilns (part 2, the Light Tower operational),
 * every other from the first evening.
 */
export function jobOpen(
  mountain: Pick<Mountain, "operational" | "mineLevels">,
  job: JobId,
): boolean {
  if (job === "graniteDrilling" || job === "graniteHaulage") {
    return graniteOpen(mountain);
  }
  if (job === "crystalDrilling" || job === "crystalHaulage") {
    return crystalOpen(mountain);
  }
  if (job === "saws") {
    return makerOpen(mountain, "saw");
  }
  return job !== "kilns" || makerOpen(mountain, "kiln");
}

/**
 * Workers on haulage across every open level: what Loading crews counts
 * (rule 5.2, Slice 2 spec rule 4.3).
 */
export function haulageWorkers(
  mountain: Pick<Mountain, "jobs" | "mineLevels">,
): number {
  let total = 0;
  for (const level of openLevels(mountain)) {
    total += mountain.jobs[LEVEL_JOBS[level].haul];
  }
  return total;
}

/** Workers on a job, of every job. */
export function workersOnJobs(mountain: Pick<Mountain, "jobs">): number {
  return JOB_IDS.reduce((total, job) => total + mountain.jobs[job], 0);
}

/** Workers he owns that are on no job. They do no work and cost nothing. */
export function freeWorkers(mountain: Crew): number {
  return mountain.owned.helper - workersOnJobs(mountain);
}

type Placing = Pick<Mountain, "owned" | "jobs" | "fleet">;

/**
 * Room on a job for more workers: a vehicle takes one driver (rule 2.7), so
 * transport stops at the vehicles he owns (#715). Every other job takes all.
 * A save with more drivers than vehicles is read as it is: no room, and
 * nobody taken off.
 */
export function jobRoom(mountain: Placing, job: JobId): number {
  if (job !== "driving") {
    return Infinity;
  }
  return Math.max(0, fleetSize(mountain) - mountain.jobs.driving);
}

/** Workers a + could put on `job` now: the free ones, up to its room. */
export function placeable(mountain: Placing, job: JobId): number {
  return Math.min(freeWorkers(mountain), jobRoom(mountain, job));
}

/**
 * Up to `count` free workers onto `job` (the amount key, #659): the free
 * ones there are, up to the job's room, and no more. None free changes nothing.
 */
export function placeWorker<M extends Placing>(
  mountain: M,
  job: JobId,
  count = 1,
): M {
  return moved(
    mountain,
    job,
    Math.min(movable(count), placeable(mountain, job)),
  );
}

/** Up to `count` workers off `job`, free again; none there changes nothing. */
export function freeWorker<M extends Crew>(
  mountain: M,
  job: JobId,
  count = 1,
): M {
  return moved(mountain, job, -Math.min(movable(count), mountain.jobs[job]));
}

/** A count a move can carry: whole and not below 0. NaN moves none, and Infinity all there are. */
export function movable(count: number): number {
  return count > 0 ? Math.floor(count) : 0;
}

function moved<M extends Crew>(mountain: M, job: JobId, by: number): M {
  return by === 0
    ? mountain
    : {
        ...mountain,
        jobs: { ...mountain.jobs, [job]: mountain.jobs[job] + by },
      };
}

/** One kind of machine on a stage: how many he owns, the workers each takes, what each moves. */
export type StageMachine = {
  readonly id: MachineId;
  readonly owned: number;
  readonly staff: number;
  readonly speed: number;
};

/**
 * What a stage's workers do: the machines they run, the workers left on
 * tools, what it all moves, and the workers it is short: what the machines
 * that would beat a tool and stand idle would take.
 */
export type StageWork = {
  readonly running: Partial<Record<MachineId, number>>;
  readonly tools: number;
  readonly moves: number;
  readonly short: number;
};

/**
 * A stage's workers run the machines that together move the most, and stay
 * on their tools where that moves more (rule 2.5). A machine is idle until
 * the stage has the workers it takes. Exact: every count of every machine
 * but the last is tried, and the last runs all it can when it beats tools.
 * So one more machine or one more worker never lowers what a stage moves.
 */
export function stageWork(
  machines: readonly StageMachine[],
  workers: number,
  tool: number,
): StageWork {
  const best = bestRun(machines, 0, workers, tool);
  const running: Partial<Record<MachineId, number>> = {};
  let short = 0;
  for (const [index, machine] of machines.entries()) {
    const count = best.counts[index] ?? 0;
    running[machine.id] = count;
    // A machine left off because a tool moves more is not short of anyone.
    if (machine.speed > machine.staff * tool) {
      short += (machine.owned - count) * machine.staff;
    }
  }
  return { running, tools: best.tools, moves: best.moves, short };
}

type Run = {
  readonly counts: readonly number[];
  readonly tools: number;
  readonly moves: number;
};

function bestRun(
  machines: readonly StageMachine[],
  from: number,
  workers: number,
  tool: number,
): Run {
  const machine = machines[from];
  if (machine === undefined) {
    return { counts: [], tools: workers, moves: workers * tool };
  }
  const most = Math.min(machine.owned, Math.floor(workers / machine.staff));
  if (from === machines.length - 1) {
    const count = machine.speed > machine.staff * tool ? most : 0;
    const tools = workers - count * machine.staff;
    return {
      counts: [count],
      tools,
      moves: count * machine.speed + tools * tool,
    };
  }
  let best: Run | undefined;
  for (let count = 0; count <= most; count += 1) {
    const rest = bestRun(
      machines,
      from + 1,
      workers - count * machine.staff,
      tool,
    );
    const moves = count * machine.speed + rest.moves;
    if (best === undefined || moves > best.moves) {
      best = { counts: [count, ...rest.counts], tools: rest.tools, moves };
    }
  }
  return best as Run;
}

/** What a level's own stages move: drilling and haulage. */
type LevelStages = Readonly<Record<LevelStage, number>>;

/** What the workforce moves on the line, and what runs. */
export type LineWork = {
  /** Machines that run on both levels, and `helper`: the workers with a tool on every stage. */
  readonly running: Record<TierId, number>;
  /** The Topsoil's drilling and haulage, and the shaft's hoisting. */
  readonly stages: StageSpeeds;
  /** Each level's drilling and haulage: the Granite's are 0 while it is not open. */
  readonly levels: Readonly<Record<MineLevelId, LevelStages>>;
  /** Hoisting's work: the hoists and engines that run, and the winch's workers (#724). */
  readonly hoisting: StageWork;
  /**
   * What the line moves (rule 2.5): its slowest stage; with the Granite open,
   * hoisting or both levels' slowest stages together, whichever is less.
   */
  readonly line: number;
  /** Workers the stages are short of, for machines that would beat a tool. */
  readonly short: number;
};

const SHUT_LEVEL: LevelStages = { face: 0, haul: 0 };

type Tally = { readonly running: Record<TierId, number>; short: number };

/** Adds a stage's work into the tally: its machines, its tools, its shortfall. */
function addWork(tally: Tally, work: StageWork): void {
  for (const [id, count] of Object.entries(work.running) as [
    MachineId,
    number,
  ][]) {
    tally.running[id] += count;
  }
  tally.running.helper += work.tools;
  tally.short += work.short;
}

/**
 * The line's rate: the slowest stage with one level (today's); with deeper
 * levels open, hoisting or every open level's slowest stage added, whichever
 * is less (ruling 18, #770).
 */
function lineOf(stages: StageSpeeds, deeper: readonly LevelStages[]): number {
  if (deeper.length === 0) {
    return Math.min(stages.face, stages.haul, stages.lift);
  }
  let feed = Math.min(stages.face, stages.haul);
  for (const level of deeper) {
    feed += Math.min(level.face, level.haul);
  }
  return Math.min(stages.lift, feed);
}

/**
 * The line in a fresh mine: each stage's workers run its machines or work
 * with a tool, and no worker spreads to the slowest stage. A worker with a
 * tool does his stage's share of the line spec's worker, three times his
 * own speed (Work boots and the worker marks are in it). A worker on a
 * machine does no other work. Open deeper levels work beside the Topsoil,
 * at the same tier speeds (rule 5.2, #770).
 */
export function lineWork(
  mountain: Pick<Mountain, "owned" | "jobs" | "mineLevels">,
  speed: Readonly<Record<TierId, number>>,
): LineWork {
  const works = stageWorks(mountain, speed);
  const tally: Tally = { running: tierRecord(0), short: 0 };
  for (const stage of STAGES) {
    addWork(tally, works[stage]);
  }
  const stages = {
    face: works.face.moves,
    haul: works.haul.moves,
    lift: works.lift.moves,
  };
  const levels: Record<MineLevelId, LevelStages> = {
    topsoil: { face: stages.face, haul: stages.haul },
    granite: SHUT_LEVEL,
    crystal: SHUT_LEVEL,
  };
  const openDeeper: LevelStages[] = [];
  for (const id of DEEPER_LEVEL_IDS) {
    if (openDeeperLevel(mountain, id) !== undefined) {
      const own = levelWorks(mountain, speed, id);
      addWork(tally, own.face);
      addWork(tally, own.haul);
      const rates = { face: own.face.moves, haul: own.haul.moves };
      levels[id] = rates;
      openDeeper.push(rates);
    }
  }
  return {
    running: tally.running,
    stages,
    levels,
    hoisting: works.lift,
    line: lineOf(stages, openDeeper),
    short: tally.short,
  };
}

/**
 * What a worker with a tool moves on a stage, from the tier speeds: the
 * same on every stage until part 3, where the stages are set apart (rule
 * 2.14, #675) and haulage's and hoisting's tools move more than drilling's.
 */
export function toolSpeed(
  speed: Readonly<Record<TierId, number>>,
  stage: Stage,
): number {
  return speed.helper * STAGES.length * toolShare(stage);
}

/** Part 3's tools against today's, stage by stage (rule 2.14, #675). */
const PART_THREE_TOOL: Readonly<Record<Stage, number>> = {
  face: 1,
  haul: 2,
  lift: 3,
};

/** A stage's tool against today's: 1 until part 3. A sweep scales it with `tool.<stage>`. */
function toolShare(stage: Stage): number {
  return partThreeOn() ? PART_THREE_TOOL[stage] * factor(`tool.${stage}`) : 1;
}

/**
 * Each stage's work in a fresh mine (rule 2.5): the Topsoil's drilling and
 * haulage and the shaft's hoisting: what runs, the tools, what it moves.
 */
export function stageWorks(
  mountain: Pick<Mountain, "owned" | "jobs" | "mineLevels">,
  speed: Readonly<Record<TierId, number>>,
): Readonly<Record<Stage, StageWork>> {
  return {
    ...levelWorks(mountain, speed, "topsoil"),
    lift: stageWork(
      stageMachines(mountain, speed, "lift"),
      mountain.jobs[STAGE_JOB.lift],
      toolSpeed(speed, "lift"),
    ),
  };
}

/** A level's drilling and haulage: that level's workers on its own machines. */
export function levelWorks(
  mountain: Pick<Mountain, "owned" | "jobs" | "mineLevels">,
  speed: Readonly<Record<TierId, number>>,
  level: MineLevelId,
): Readonly<Record<LevelStage, StageWork>> {
  const work = (stage: LevelStage): StageWork =>
    stageWork(
      stageMachines(mountain, speed, stage, level),
      mountain.jobs[LEVEL_JOBS[level][stage]],
      toolSpeed(speed, stage),
    );
  return { face: work("face"), haul: work("haul") };
}

/**
 * A stage's machines in play: how many there are, the workers each takes,
 * what each moves. Drilling's and haulage's are the level's own; hoisting's
 * are every one he owns, for the one shaft.
 */
export function stageMachines(
  mountain: Pick<Mountain, "owned" | "mineLevels">,
  speed: Readonly<Record<TierId, number>>,
  stage: Stage,
  level: MineLevelId = "topsoil",
): StageMachine[] {
  const own: LevelMachines | undefined =
    stage === "lift" ? undefined : levelMachines(mountain, level);
  return TIERS.filter((tier) => tier.stage === stage && tierInPlay(tier)).map(
    (tier) => ({
      id: tier.id as MachineId,
      owned:
        own !== undefined && isLevelMachine(tier.id)
          ? own[tier.id]
          : mountain.owned[tier.id],
      staff: machineStaff(tier),
      speed: speed[tier.id],
    }),
  );
}
