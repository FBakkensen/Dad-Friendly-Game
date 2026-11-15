import { buildRate } from "./building-site";
import { formatCompact } from "./format";
import { STAGES, type Stage } from "./line";
import type { Mountain } from "./mountain";
import type { SiteId } from "./next-view";
import { SITE_NAMES } from "./next-view";
import { effectiveRates } from "./rates";
import { MACHINE_IDS, tierById, tierInPlay, type MachineId } from "./tiers";
import { MACHINE_WORDS, TOOL_WORDS, plural } from "./screen-words";
import { VEHICLES, drivenFleet } from "./transport";
import {
  NO_JOBS,
  STAGE_JOB,
  freeWorkers,
  placeable,
  type JobId,
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
  // Part 2 (#666): not in the sheet until the refinery's sliver (#671).
  kilns: "Kilns",
};

/** The jobs of each site open in part 1, in the sheet's order. */
const SITE_JOBS: Readonly<Record<SiteId, readonly JobId[]>> = {
  mine: STAGES.map((stage) => STAGE_JOB[stage]),
  city: ["driving", "building"],
};

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
  const staffed = machines.reduce(
    (sum, tier) => sum + running[tier.id] * tier.staff,
    0,
  );
  const tools = mountain.jobs[STAGE_JOB[stage]] - staffed;
  const parts = machines.map((tier) =>
    runsOf(
      running[tier.id],
      mountain.owned[tier.id],
      MACHINE_WORDS[tier.id as MachineId],
    ),
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

function jobNote(mountain: Mountain, job: JobId): string {
  const stage = STAGES.find((at) => STAGE_JOB[at] === job);
  if (stage !== undefined) {
    return stageNote(mountain, stage);
  }
  return job === "driving" ? drivingNote(mountain) : buildingNote();
}

/** One job's row. */
export type JobRow = {
  readonly job: JobId;
  readonly name: string;
  readonly note: string;
  readonly count: number;
  /** A free worker to put on it, and room for him (#715). */
  readonly canPlace: boolean;
  /** A worker on it to take off. */
  readonly canFree: boolean;
};

/** A site's jobs. */
type JobGroup = {
  readonly site: SiteId;
  readonly name: string;
  readonly rows: readonly JobRow[];
};

/** One job's row: its name, what its workers do, its count, and its − and +. */
export function jobRow(mountain: Mountain, job: JobId): JobRow {
  return {
    job,
    name: JOB_NAMES[job],
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
  const groups = (Object.keys(SITE_JOBS) as SiteId[]).map((site): JobGroup => ({
    site,
    name: SITE_NAMES[site],
    rows: SITE_JOBS[site].map((job) => jobRow(mountain, job)),
  }));
  return { owned: mountain.owned.helper, free, groups };
}
