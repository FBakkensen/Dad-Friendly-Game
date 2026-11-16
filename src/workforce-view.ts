import { buildRate } from "./building-site";
import { formatCompact } from "./format";
import { STAGES, type Stage } from "./line";
import type { Mountain } from "./mountain";
import { LEVEL_NAMES, levelStageTitle } from "./mine-level-view";
import { graniteOpen, type MineLevelId } from "./mine-levels";
import { runningKilns } from "./makers";
import type { SiteId } from "./next-view";
import { SITES, SITE_NAMES, openSites } from "./next-view";
import { effectiveRates } from "./rates";
import { MACHINE_IDS, tierById, tierInPlay, type MachineId } from "./tiers";
import { MACHINE_WORDS, TOOL_WORDS, plural } from "./screen-words";
import { VEHICLES, drivenFleet } from "./transport";
import {
  LEVEL_JOBS,
  NO_JOBS,
  STAGE_JOB,
  freeWorkers,
  placeable,
  stageWork,
  stageMachines,
  toolSpeed,
  type JobId,
  type LevelStage,
} from "./workforce";

/**
 * The workforce (#659; spec, "The workforce"): every open job, grouped by
 * site, with what its workers run now and its count between − and +. Pure:
 * it reads the mountain and never writes it. It names no limit.
 */

/** A + with no free worker says so, in the sheet. */
export const NO_FREE_WORKER =
  "No free worker. Hire one, or take one off another job.";

const JOB_NAMES: Readonly<Record<JobId, string>> = {
  drilling: "Drilling",
  haulage: "Haulage",
  hoisting: "Hoisting",
  driving: "Transport",
  building: "Building",
  kilns: "Kilns",
  graniteDrilling: "Drilling",
  graniteHaulage: "Haulage",
  saws: "Saws",
};

/** The jobs of each site, in the sheet's order; a site shows while it is open (#671). */
const SITE_JOBS: Readonly<Record<SiteId, readonly JobId[]>> = {
  mine: STAGES.map((stage) => STAGE_JOB[stage]),
  refinery: ["kilns"],
  // The factory takes no workers in slice 1 (rule 2.12), so it has no group.
  factory: [],
  city: ["driving", "building"],
};

/** The mine's groups' names with the Granite open (ruling 9): the levels' own names, and the shaft. */
const GROUP_NAMES = { ...LEVEL_NAMES, shaft: "Shaft" } as const;

/**
 * With the Granite open, the mine's jobs are three groups, one a level and
 * the shaft's (#680, ruling 9); else the one mine group.
 */
const MINE_GROUPS: readonly {
  readonly key: string;
  readonly name: string;
  readonly jobs: readonly JobId[];
}[] = [
  {
    key: "mine:topsoil",
    name: GROUP_NAMES.topsoil,
    jobs: ["drilling", "haulage"],
  },
  {
    key: "mine:granite",
    name: GROUP_NAMES.granite,
    jobs: ["graniteDrilling", "graniteHaulage"],
  },
  { key: "mine:shaft", name: GROUP_NAMES.shaft, jobs: ["hoisting"] },
];

/** Each level's jobs by job: the level and the stage it works. */
const LEVEL_OF_JOB: Partial<
  Record<JobId, { readonly level: MineLevelId; readonly stage: LevelStage }>
> = Object.fromEntries(
  (["topsoil", "granite"] as const).flatMap((level) =>
    (["face", "haul"] as const).map((stage) => [
      LEVEL_JOBS[level][stage],
      { level, stage },
    ]),
  ),
);

/** One group of jobs: a site's, or with two levels, a level's of the mine. */
type JobSite = {
  /** The group's own key: the site, or the mine's level. */
  readonly key: string;
  readonly site: SiteId;
  readonly name: string;
  readonly jobs: readonly { readonly job: JobId; readonly name: string }[];
};

function siteGroup(
  key: string,
  site: SiteId,
  name: string,
  jobs: readonly JobId[],
): JobSite {
  return {
    key,
    site,
    name,
    jobs: jobs.map((job) => ({ job, name: JOB_NAMES[job] })),
  };
}

/** Every site's jobs by name, open or not: the sheet builds them and shows the open ones (#671). */
export function jobSites(mountain: Mountain): readonly JobSite[] {
  return SITES.filter((site) => SITE_JOBS[site].length > 0).flatMap((site) =>
    site === "mine" && graniteOpen(mountain)
      ? MINE_GROUPS.map((group) =>
          siteGroup(group.key, site, group.name, group.jobs),
        )
      : [siteGroup(site, site, SITE_NAMES[site], SITE_JOBS[site])],
  );
}

/** "2 of 3 carts run", "1 of 1 cart runs", "0 of 1 vehicle runs" (#715). */
function runsOf(
  on: number,
  of: number,
  noun: readonly [string, string],
): string {
  return `${String(on)} of ${String(of)} ${plural(of, noun)} ${of === 1 ? "runs" : "run"}`;
}

/** "2 of 3 carts run, 1 with barrows": each kind of machine he owns, then the tools. */
function stageNote(mountain: Mountain, stage: Stage): string {
  const running = effectiveRates(mountain).running;
  const machines = MACHINE_IDS.map(tierById).filter(
    (tier) =>
      tier.stage === stage && tierInPlay(tier) && mountain.owned[tier.id] > 0,
  );
  return notePart(
    machines.map((tier) => ({
      id: tier.id as MachineId,
      running: running[tier.id],
      owned: mountain.owned[tier.id],
      staff: tier.staff,
    })),
    mountain.jobs[STAGE_JOB[stage]],
    stage,
  );
}

/** "3 of 3 drills run": a level's workers on its own machines (#680). */
function levelNote(
  mountain: Mountain,
  level: MineLevelId,
  stage: LevelStage,
): string {
  const speed = effectiveRates(mountain).tierSpeed;
  const workers = mountain.jobs[LEVEL_JOBS[level][stage]];
  const machines = stageMachines(mountain, speed, stage, level);
  const work = stageWork(machines, workers, toolSpeed(speed));
  return notePart(
    machines
      .filter((machine) => machine.owned > 0)
      .map((machine) => ({
        id: machine.id,
        running: work.running[machine.id] ?? 0,
        owned: machine.owned,
        staff: machine.staff,
      })),
    workers,
    stage,
  );
}

/** The machines that run of those he owns, then the workers on tools. */
function notePart(
  machines: readonly {
    readonly id: MachineId;
    readonly running: number;
    readonly owned: number;
    readonly staff: number;
  }[],
  workers: number,
  stage: Stage,
): string {
  const staffed = machines.reduce(
    (sum, machine) => sum + machine.running * machine.staff,
    0,
  );
  const tools = workers - staffed;
  const parts = machines.map((machine) =>
    runsOf(machine.running, machine.owned, MACHINE_WORDS[machine.id]),
  );
  if (tools > 0 || parts.length === 0) {
    parts.push(`${String(tools)} ${plural(tools, TOOL_WORDS[stage])}`);
  }
  return parts.join(", ");
}

/** "1 of 1 vehicle runs", "2 of 3 vehicles run". */
function drivingNote(mountain: Mountain): string {
  const driven = drivenFleet(mountain);
  const on = VEHICLES.reduce((sum, vehicle) => sum + driven[vehicle.id], 0);
  const of = VEHICLES.reduce(
    (sum, vehicle) => sum + mountain.fleet[vehicle.id],
    0,
  );
  return runsOf(on, of, ["vehicle", "vehicles"]);
}

/** Goods a second one builder builds in. */
export function oneBuilderBuilds(): number {
  return buildRate({ jobs: { ...NO_JOBS, building: 1 } });
}

/** "each builds 8/s". */
function buildingNote(): string {
  return `each builds ${formatCompact(oneBuilderBuilds())}/s`;
}

/** "1 of 2 kilns run": the kilns with a worker, of the kilns he owns (#671). */
/** Before the first kiln, here and on the kilns' plate (#671). */
export const NO_KILNS = "No kilns yet";

function kilnsNote(mountain: Mountain): string {
  if (mountain.makers.kiln === 0) {
    return NO_KILNS;
  }
  return runsOf(runningKilns(mountain), mountain.makers.kiln, [
    "kiln",
    "kilns",
  ]);
}

function jobNote(mountain: Mountain, job: JobId): string {
  const place = LEVEL_OF_JOB[job];
  if (place !== undefined && graniteOpen(mountain)) {
    return levelNote(mountain, place.level, place.stage);
  }
  const stage = STAGES.find((at) => STAGE_JOB[at] === job);
  if (stage !== undefined) {
    return stageNote(mountain, stage);
  }
  if (job === "kilns") {
    return kilnsNote(mountain);
  }
  return job === "driving" ? drivingNote(mountain) : buildingNote();
}

/** One job's row. */
export type JobRow = {
  readonly job: JobId;
  readonly name: string;
  /** The job where it is said in words, on its keys: with two levels a level's job names its level ("Granite drilling"). */
  readonly title: string;
  readonly note: string;
  readonly count: number;
  /** A free worker to put on it, and room for him (#715). */
  readonly canPlace: boolean;
  /** A worker on it to take off. */
  readonly canFree: boolean;
};

/** A site's jobs. */
type JobGroup = {
  readonly key: string;
  readonly site: SiteId;
  readonly name: string;
  readonly rows: readonly JobRow[];
};

/** One job's row: its name, what its workers do, its count, and its − and +. */
export function jobRow(mountain: Mountain, job: JobId): JobRow {
  const place = LEVEL_OF_JOB[job];
  return {
    job,
    name: JOB_NAMES[job],
    title:
      place !== undefined && graniteOpen(mountain)
        ? levelStageTitle(place.level, place.stage)
        : JOB_NAMES[job],
    note: jobNote(mountain, job),
    count: mountain.jobs[job],
    canPlace: placeable(mountain, job) > 0,
    canFree: mountain.jobs[job] > 0,
  };
}

export type WorkforceView = {
  readonly owned: number;
  readonly free: number;
  readonly groups: readonly JobGroup[];
};

export function workforceView(mountain: Mountain): WorkforceView {
  const free = freeWorkers(mountain);
  const open = new Set(openSites(mountain));
  const groups = jobSites(mountain)
    .filter((group) => open.has(group.site))
    .map((group): JobGroup => ({
      key: group.key,
      site: group.site,
      name: group.name,
      rows: group.jobs.map(({ job }) => jobRow(mountain, job)),
    }));
  return { owned: mountain.owned.helper, free, groups };
}
