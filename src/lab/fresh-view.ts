import { SITE_HOLDS, onSiteTotal } from "../building-site";
import { tierLocked } from "../crew";
import { freshMineOn } from "../line-switch";
import { STAGES } from "../line";
import type { Mountain } from "../mountain";
import { effectiveRates } from "../rates";
import { stretch } from "../scale";
import { TIERS, tierCost, tierInPlay } from "../tiers";
import {
  orderLimit,
  vehiclePrice,
  VEHICLE_IDS,
} from "../transport";
import {
  JOB_IDS,
  freeWorkers,
  stageMachines,
  stageWorks,
  toolSpeed,
  type Jobs,
} from "../workforce";
import { drainsTheMine, fleetSize, hirePrice, siteIdle } from "./fresh-dad";
import { AMOUNT_KEY_TEN, FRESH_DUST } from "./targets";

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
};

/** The view now, or undefined outside a fresh mine. */
export function freshView(mountain: Mountain): FreshView | undefined {
  if (!freshMineOn()) {
    return undefined;
  }
  const rates = effectiveRates(mountain);
  const line = rates.exactCrewPerSecond;
  const project = mountain.project;
  const limit = orderLimit(mountain, line);
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
      drainsTheMine(mountain, line) &&
      mountain.stock.stones < cheapestBuy(mountain),
    idleWorkers: idleWorkerShare(mountain, rates.tierSpeed, line),
    idleMachines: idleMachineShare(mountain, rates.tierSpeed),
  };
}

/** The cheapest thing he can buy: a worker, a machine of the line, or a vehicle. */
export function cheapestBuy(mountain: Mountain): number {
  let cheapest = hirePrice(mountain);
  for (const tier of TIERS) {
    if (tier.staff > 0 && tierInPlay(tier) && !tierLocked(mountain, tier)) {
      cheapest = Math.min(
        cheapest,
        tierCost(tier, mountain.owned[tier.id], stretch(mountain)),
      );
    }
  }
  for (const id of VEHICLE_IDS) {
    cheapest = Math.min(
      cheapest,
      vehiclePrice(mountain, id)[0]?.amount ?? Infinity,
    );
  }
  return cheapest;
}

type Speeds = Parameters<typeof stageWorks>[1];

/**
 * Free workers, drivers with no vehicle or no order delivering, builders
 * with an idle site, and a stage's workers with tools that it could lose and
 * still move what the line moves.
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
  const tool = toolSpeed(speed);
  const works = stageWorks(mountain, speed);
  let surplus = 0;
  for (const stage of STAGES) {
    const work = works[stage];
    const spare =
      tool > 0 ? Math.floor((work.moves - line) / tool + FRESH_DUST) : 0;
    surplus += Math.max(0, Math.min(work.tools, spare));
  }
  return (freeWorkers(mountain) + driving + building + surplus) / workers;
}

/** Machines left off because a tool moves more than the workers they take (risk 15). */
function idleMachineShare(mountain: Mountain, speed: Speeds): number {
  const tool = toolSpeed(speed);
  const works = stageWorks(mountain, speed);
  let owned = 0;
  let idle = 0;
  for (const stage of STAGES) {
    for (const machine of stageMachines(mountain, speed, stage)) {
      owned += machine.owned;
      if (machine.speed <= machine.staff * tool) {
        idle += machine.owned - (works[stage].running[machine.id] ?? 0);
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
 * Taps that hire and move workers between two moments (`workerMoves`): the
 * hires, and for each job the workers placed or freed, each with the amount
 * key on ×10 and ×1. Max is not counted, so this is the most it takes.
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
