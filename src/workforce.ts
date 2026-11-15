import { STAGES, type Stage, type StageSpeeds } from "./line";
import type { Mountain } from "./mountain";
import {
  TIERS,
  tierInPlay,
  tierRecord,
  type MachineId,
  type TierId,
} from "./tiers";

/**
 * The workforce (slice 1, rule 2, #689): every worker is in one pool, on a
 * job or free. He hires a worker, who starts free, and moves one at a time
 * onto a job or off it, for free. Nothing moves a worker for him. Off in
 * play: only a fresh mine (`freshMineOn`) lists the moves.
 */

/** Where workers work in part 1: the line's three stages, driving and building (#690). */
export const JOB_IDS = [
  "drilling",
  "haulage",
  "hoisting",
  "driving",
  "building",
] as const;

export type JobId = (typeof JOB_IDS)[number];

export type Jobs = Readonly<Record<JobId, number>>;

export const NO_JOBS: Jobs = {
  drilling: 0,
  haulage: 0,
  hoisting: 0,
  driving: 0,
  building: 0,
};

/** Each stage of the line and its job. */
const STAGE_JOB: Readonly<Record<Stage, JobId>> = {
  face: "drilling",
  haul: "haulage",
  lift: "hoisting",
};

type Crew = Pick<Mountain, "owned" | "jobs">;

/** Workers on a job, of every job. */
export function workersOnJobs(mountain: Pick<Mountain, "jobs">): number {
  return JOB_IDS.reduce((total, job) => total + mountain.jobs[job], 0);
}

/** Workers he owns that are on no job. They do no work and cost nothing. */
export function freeWorkers(mountain: Crew): number {
  return mountain.owned.helper - workersOnJobs(mountain);
}

/**
 * Up to `count` free workers onto `job` (the amount key, #659): the free
 * ones there are, and no more. None free changes nothing.
 */
export function placeWorker<M extends Crew>(
  mountain: M,
  job: JobId,
  count = 1,
): M {
  return moved(mountain, job, Math.min(count, freeWorkers(mountain)));
}

/** Up to `count` workers off `job`, free again; none there changes nothing. */
export function freeWorker<M extends Crew>(
  mountain: M,
  job: JobId,
  count = 1,
): M {
  return moved(mountain, job, -Math.min(count, mountain.jobs[job]));
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

/** What the workforce moves on the line, and what runs. */
export type LineWork = {
  /** Machines that run, and `helper`: the workers with a tool on the three stages. */
  readonly running: Record<TierId, number>;
  readonly stages: StageSpeeds;
  /** What the line moves: its slowest stage (rule 2.5). */
  readonly line: number;
  /** Workers the stages are short of, for machines that would beat a tool. */
  readonly short: number;
};

/**
 * The line in a fresh mine: each stage's workers run its machines or work
 * with a tool, and no worker spreads to the slowest stage. A worker with a
 * tool does his stage's share of the line spec's worker, three times his
 * own speed (Better boots and the worker marks are in it). A worker on a
 * machine does no other work.
 */
export function lineWork(
  mountain: Pick<Mountain, "owned" | "jobs">,
  speed: Readonly<Record<TierId, number>>,
): LineWork {
  const tool = speed.helper * STAGES.length;
  const running = tierRecord(0);
  const stages = { face: 0, haul: 0, lift: 0 };
  let short = 0;
  for (const stage of STAGES) {
    const work = stageWork(
      stageMachines(mountain, speed, stage),
      mountain.jobs[STAGE_JOB[stage]],
      tool,
    );
    Object.assign(running, work.running);
    running.helper += work.tools;
    stages[stage] = work.moves;
    short += work.short;
  }
  return {
    running,
    stages,
    line: Math.min(stages.face, stages.haul, stages.lift),
    short,
  };
}

function stageMachines(
  mountain: Pick<Mountain, "owned">,
  speed: Readonly<Record<TierId, number>>,
  stage: Stage,
): StageMachine[] {
  return TIERS.filter((tier) => tier.stage === stage && tierInPlay(tier)).map(
    (tier) => ({
      id: tier.id as MachineId,
      owned: mountain.owned[tier.id],
      staff: tier.staff,
      speed: speed[tier.id],
    }),
  );
}
