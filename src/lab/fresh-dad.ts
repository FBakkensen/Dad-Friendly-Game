import { buildRate, onSiteTotal } from "../building-site";
import { nextBuilding, resumeOrder } from "../city";
import { tierLocked } from "../crew";
import {
  applyAction,
  helperBill,
  listActions,
  type Action,
} from "../economy/actions";
import { STAGES, type Stage } from "../line";
import { PILE_HOLDS, mineChain } from "../mine-piles";
import type { Mountain } from "../mountain";
import { chainFlows } from "../piles";
import { effectiveRates } from "../rates";
import { TIERS, tierInPlay, type Tier } from "../tiers";
import {
  fleetRate,
  orderLimit,
  orderNumbers,
  secondsToFinish,
  vehiclePrice,
  VEHICLE_IDS,
} from "../transport";
import {
  NO_JOBS,
  STAGE_JOB,
  freeWorkers,
  lineWork,
  type JobId,
} from "../workforce";
import { sticker } from "./decide";
import type { FreshHabits } from "./policy";
import {
  FRESH_DUST,
  PLANS_A_SECOND,
  RAISE_STEPS,
  RESTORE_STEPS,
  STARVED_SHARE,
} from "./targets";

/**
 * How part 1's dad plays a fresh mine (slice 1, Lab, #655). Nothing moves
 * a worker for him (rule 2.4), so he hires and places his own. He orders the
 * next building at once, buys a vehicle when transport is the order's limit
 * and adds a builder when the builders are, raises the line with the buy
 * that pays back soonest, and puts the order on hold while that buy pays
 * back sooner than the building would take. He reads the limits the rules
 * work out, though the page names none. One plan is a short list of moves
 * that go together: a machine, the workers it takes, and their places.
 * Rock waits in piles between the stages (#703), so he moves a worker whose
 * stage stands to the stage whose pile lets him move rock, as the lone
 * worker of the first evening must be moved.
 */

/** Moves that go together, applied in order. Empty: nothing to do now. */
export type Plan = readonly Action[];

/** The fresh mine's line now: what it moves and each stage. */
type LineNow = {
  readonly line: number;
  readonly stages: Readonly<Record<Stage, number>>;
};

function lineNow(mountain: Mountain): LineNow {
  const rates = effectiveRates(mountain);
  return {
    line: rates.exactCrewPerSecond,
    stages: lineWork(mountain, rates.tierSpeed).stages,
  };
}

/** A copy with a pocket that pays for anything, to try a plan on. */
function funded(mountain: Mountain): Mountain {
  return {
    ...mountain,
    stock: { ...mountain.stock, stones: Number.MAX_SAFE_INTEGER },
  };
}

function applied(mountain: Mountain, plan: Plan): Mountain {
  let next = mountain;
  for (const action of plan) {
    next = applyAction(next, action, 0);
  }
  return next;
}

/** What the next worker costs. */
export function hirePrice(mountain: Mountain): number {
  return helperBill(mountain, 1);
}

/** The stage that moves least; the first in rock order on a tie. */
function slowestStage(now: LineNow): Stage {
  let slowest: Stage = "face";
  for (const stage of STAGES) {
    if (now.stages[stage] < now.stages[slowest]) {
      slowest = stage;
    }
  }
  return slowest;
}

/** One buy with its stones: a plan and what it costs. */
type Priced = { readonly plan: Plan; readonly cost: number };

/** Hire one and put him on `job`, or put a free one there. */
function staffed(mountain: Mountain, job: JobId, free: number): Priced {
  return free > 0
    ? { plan: [{ kind: "placeWorker", job, count: 1 }], cost: 0 }
    : {
        plan: [
          { kind: "buyTier", id: "helper" },
          { kind: "placeWorker", job, count: 1 },
        ],
        cost: hirePrice(mountain),
      };
}

/** A machine and the workers it takes, hired onto its stage (the spec's Lab). */
function machineBuy(mountain: Mountain, tier: Tier, stage: Stage): Priced {
  const buy: Action = { kind: "buyTier", id: tier.id };
  const plan: Action[] = [buy];
  for (let hire = 0; hire < tier.staff; hire += 1) {
    plan.push(
      { kind: "buyTier", id: "helper" },
      { kind: "placeWorker", job: STAGE_JOB[stage], count: 1 },
    );
  }
  return {
    plan,
    cost: sticker(mountain, buy) + helperBill(mountain, tier.staff),
  };
}

/** What a stage can buy: a worker for it, or one of its machines with its workers. */
function stageBuys(mountain: Mountain, stage: Stage): readonly Priced[] {
  const buys: Priced[] = [staffed(mountain, STAGE_JOB[stage], 0)];
  for (const tier of TIERS) {
    if (
      tier.stage === stage &&
      tierInPlay(tier) &&
      !tierLocked(mountain, tier)
    ) {
      buys.push(machineBuy(mountain, tier, stage));
    }
  }
  return buys;
}

/** A plan that raises the line, its stones, and what the line gains. */
type Raise = Priced & { readonly gain: number };

/**
 * The cheapest way to raise the line: the slowest stage's best buy (what it
 * adds to that stage per stone), then the next slowest, until the line
 * moves. Stages tied at the slowest each need one before the line rises.
 */
export function lineRaise(mountain: Mountain): Raise | undefined {
  const start = lineNow(mountain);
  let state = funded(mountain);
  let now = start;
  const plan: Action[] = [];
  let cost = 0;
  for (let step = 0; step < RAISE_STEPS; step += 1) {
    if (now.line > start.line + FRESH_DUST) {
      break;
    }
    const stage = slowestStage(now);
    let best:
      { buy: Priced; after: Mountain; now: LineNow; worth: number } | undefined;
    for (const buy of stageBuys(state, stage)) {
      const after = applied(state, buy.plan);
      const next = lineNow(after);
      const worth = (next.stages[stage] - now.stages[stage]) / buy.cost;
      if (worth > 0 && (best === undefined || worth > best.worth)) {
        best = { buy, after, now: next, worth };
      }
    }
    if (best === undefined) {
      return undefined;
    }
    plan.push(...best.buy.plan);
    cost += best.buy.cost;
    state = best.after;
    now = best.now;
  }
  const gain = now.line - start.line;
  return gain > FRESH_DUST ? { plan, cost, gain } : undefined;
}

/** Each upgrade on the table that raises the line, with its price and gain. */
export function upgradeRaises(mountain: Mountain): readonly Raise[] {
  const start = lineNow(mountain).line;
  const raises: Raise[] = [];
  for (const action of listActions(mountain, 0)) {
    if (action.kind !== "buyUpgrade") {
      continue;
    }
    const cost = sticker(mountain, action);
    if (!Number.isFinite(cost)) {
      continue;
    }
    const gain = lineNow(applied(funded(mountain), [action])).line - start;
    if (gain > FRESH_DUST) {
      raises.push({ plan: [action], cost, gain });
    }
  }
  return raises;
}

/** The raise that pays back soonest, from the line's buys and, if he weighs them, the upgrades. */
export function bestRaise(
  mountain: Mountain,
  habits: FreshHabits,
): Raise | undefined {
  const raises = [
    ...(habits.upgrades ? upgradeRaises(mountain) : []),
    ...[lineRaise(mountain)].filter((raise) => raise !== undefined),
  ];
  let best: Raise | undefined;
  for (const raise of raises) {
    if (best === undefined || raise.cost / raise.gain < best.cost / best.gain) {
      best = raise;
    }
  }
  return best;
}

/** Goods a second one builder builds in. */
const ONE_BUILDER = buildRate({ jobs: { ...NO_JOBS, building: 1 } });

/** Vehicles he owns, of every kind. */
export function fleetSize(mountain: Mountain): number {
  return VEHICLE_IDS.reduce((total, id) => total + mountain.fleet[id], 0);
}

/** Builders that keep pace with what reaches the site: transport, or the line when it is less. */
function buildersWanted(mountain: Mountain, line: number): number {
  return Math.max(
    1,
    Math.ceil(Math.min(fleetRate(mountain), line) / ONE_BUILDER),
  );
}

/** Nothing reaches the site and nothing is on it: the builders have nothing to do. */
export function siteIdle(mountain: Mountain): boolean {
  const project = mountain.project;
  return (
    project.kind !== "delivering" &&
    (project.kind === "unordered" || onSiteTotal(project.site) === 0)
  );
}

/** Share of a pile's room that its rock fills; a pile with no room is never chosen. */
function pileShare(held: number, holds: number): number {
  return holds > 0 ? held / holds : 0;
}

/**
 * The stage whose pile lets a worker move rock (#703): the stage after the
 * fuller pile, hoisting on a tie, else drilling while both piles are empty.
 * A full shaft pile sends him to hoisting and full drilled rock, with room
 * at the shaft, to haulage.
 */
export function pileStage(mountain: Mountain): Stage {
  const { face, shaft } = mountain.piles;
  const shaftShare = pileShare(shaft, PILE_HOLDS.shaft);
  if (shaft > 0 && shaftShare >= pileShare(face, PILE_HOLDS.face)) {
    return "lift";
  }
  return face > 0 ? "haul" : "face";
}

/** He sets drivers and builders once an order is in: the dad who sets them once, or anyone while it delivers. */
function keepsJobs(mountain: Mountain, habits: FreshHabits): boolean {
  const project = mountain.project.kind;
  return (
    project !== "unordered" &&
    (habits.moves === "once" || project === "delivering")
  );
}

/** A free worker's place: an idle vehicle, the builders, else where rock waits. */
function placeFree(mountain: Mountain, habits: FreshHabits): Plan {
  const keeps = keepsJobs(mountain, habits);
  if (keeps && mountain.jobs.driving < fleetSize(mountain)) {
    return [{ kind: "placeWorker", job: "driving", count: 1 }];
  }
  if (keeps && mountain.jobs.building < 1) {
    return [{ kind: "placeWorker", job: "building", count: 1 }];
  }
  if (
    habits.moves === "idle" &&
    mountain.project.kind === "delivering" &&
    mountain.jobs.building < buildersWanted(mountain, lineNow(mountain).line)
  ) {
    return [{ kind: "placeWorker", job: "building", count: 1 }];
  }
  return [
    { kind: "placeWorker", job: STAGE_JOB[pileStage(mountain)], count: 1 },
  ];
}

/**
 * A driver for the wagon and one builder once an order is in and the line
 * moves (a worker on every stage), hired when no worker is free. Before the
 * line moves, the wagon would carry off every stone the lone worker brings
 * up, and he could never hire the next. A dad who never holds also waits
 * while the driver would let the order take more than half of what the
 * mine makes.
 */
function orderCrew(
  mountain: Mountain,
  habits: FreshHabits,
): Priced | undefined {
  if (!keepsJobs(mountain, habits) || lineNow(mountain).line <= FRESH_DUST) {
    return undefined;
  }
  const job: JobId | undefined =
    mountain.jobs.driving < Math.min(1, fleetSize(mountain))
      ? "driving"
      : mountain.jobs.building < 1
        ? "building"
        : undefined;
  if (job === undefined) {
    return undefined;
  }
  const crew = staffed(mountain, job, freeWorkers(mountain));
  const after = applied(funded(mountain), crew.plan);
  return habits.hold === "never" && drainsTheMine(after, lineNow(after).line)
    ? undefined
    : crew;
}

/**
 * One worker from a stage that stands, with workers on it and no rock to
 * move or no room to put it (#703), to the stage whose pile lets him move
 * rock. Each move is one worker, so the stage he leaves keeps the rest
 * while it moves rock again.
 */
function pileMove(mountain: Mountain): Plan {
  const chain = mineChain(mountain, 1, true);
  const flows = chainFlows(chain);
  const rates = chain.rates;
  const to = pileStage(mountain);
  for (const [index, from] of STAGES.entries()) {
    const stands =
      (rates[index] ?? 0) > FRESH_DUST && (flows[index] ?? 0) <= FRESH_DUST;
    if (stands && from !== to && mountain.jobs[STAGE_JOB[from]] > 0) {
      return [
        { kind: "freeWorker", job: STAGE_JOB[from], count: 1 },
        { kind: "placeWorker", job: STAGE_JOB[to], count: 1 },
      ];
    }
  }
  return [];
}

/** The stage a worker can leave for another job at the least cost to the line. */
function stageToFree(mountain: Mountain): Stage | undefined {
  let best: { stage: Stage; line: number } | undefined;
  for (const stage of STAGES) {
    const job = STAGE_JOB[stage];
    if (mountain.jobs[job] < 1) {
      continue;
    }
    const line = lineNow(
      applied(mountain, [{ kind: "freeWorker", job, count: 1 }]),
    ).line;
    if (best === undefined || line > best.line + FRESH_DUST) {
      best = { stage, line };
    }
  }
  return best?.stage;
}

/** The line still moves rock with one worker fewer on this stage: he never takes the mine's last. */
function spares(mountain: Mountain, stage: Stage): boolean {
  const job = STAGE_JOB[stage];
  return (
    lineNow(applied(mountain, [{ kind: "freeWorker", job, count: 1 }])).line >
    FRESH_DUST
  );
}

/** Stages at the line's level: fewer is closer to the next raise. */
function atLine(now: LineNow): number {
  return STAGES.filter((stage) => now.stages[stage] <= now.line + FRESH_DUST)
    .length;
}

/**
 * A worker whose stage stands to where rock waits, for every dad (#703).
 * The mover also moves one from a stage with more than the line needs to
 * the slowest, when the line is better for it.
 */
function rebalance(mountain: Mountain, habits: FreshHabits): Plan {
  const piled = pileMove(mountain);
  if (piled.length > 0 || habits.moves !== "idle") {
    return piled;
  }
  const now = lineNow(mountain);
  const to = slowestStage(now);
  for (const from of STAGES) {
    if (from === to || mountain.jobs[STAGE_JOB[from]] < 1) {
      continue;
    }
    const plan: Plan = [
      { kind: "freeWorker", job: STAGE_JOB[from], count: 1 },
      { kind: "placeWorker", job: STAGE_JOB[to], count: 1 },
    ];
    const after = lineNow(applied(mountain, plan));
    if (
      after.line > now.line + FRESH_DUST ||
      (after.line > now.line - FRESH_DUST && atLine(after) < atLine(now))
    ) {
      return plan;
    }
  }
  return [];
}

/**
 * The mover's moves (`idle`): drivers and builders with nothing to do go to
 * the mine, they come back when the order delivers, and a stage's workers
 * the line does not need go to the slowest stage.
 */
function moverPlan(mountain: Mountain, habits: FreshHabits): Plan {
  const delivering = mountain.project.kind === "delivering";
  if (!delivering && mountain.jobs.driving > 0) {
    return [{ kind: "freeWorker", job: "driving", count: 1 }];
  }
  if (siteIdle(mountain) && mountain.jobs.building > 0) {
    return [{ kind: "freeWorker", job: "building", count: 1 }];
  }
  const restore = delivering ? restoreStep(mountain) : [];
  return restore.length > 0 ? restore : rebalance(mountain, habits);
}

/** A worker from the mine onto an idle vehicle, or onto the builders when they are short. */
function restoreStep(mountain: Mountain): Plan {
  const short =
    mountain.jobs.driving < fleetSize(mountain)
      ? "driving"
      : mountain.jobs.building <
          buildersWanted(mountain, lineNow(mountain).line)
        ? "building"
        : undefined;
  const from = short === undefined ? undefined : stageToFree(mountain);
  return short === undefined || from === undefined || !spares(mountain, from)
    ? []
    : [
        { kind: "freeWorker", job: STAGE_JOB[from], count: 1 },
        { kind: "placeWorker", job: short, count: 1 },
      ];
}

/**
 * The mine as it would stand with the order delivering: resumed, and for the
 * mover, the drivers and builders back from the mine. The hold is weighed on
 * it, so moving the idle workers on hold does not undo the hold.
 */
function asDelivering(mountain: Mountain, habits: FreshHabits): Mountain {
  let state = resumeOrder(mountain);
  if (habits.moves === "once") {
    return state;
  }
  for (let step = 0; step < RESTORE_STEPS; step += 1) {
    const plan = restoreStep(state);
    if (plan.length === 0) {
      break;
    }
    state = applied(state, plan);
  }
  return state;
}

/** A vehicle and its driver, when transport holds the order back. */
function vehicleBuy(mountain: Mountain): Priced {
  const id = VEHICLE_IDS[0] ?? "horseWagon";
  const driver = staffed(mountain, "driving", freeWorkers(mountain));
  const plan: Action[] = [{ kind: "buyVehicle", id }, ...driver.plan];
  let cost = (vehiclePrice(mountain, id)[0]?.amount ?? Infinity) + driver.cost;
  // The builders keep pace with the new wagon, or it only fills the site.
  let state = applied(funded(mountain), plan);
  for (
    let step = 0;
    step < RESTORE_STEPS && buildRate(state) < fleetRate(state);
    step += 1
  ) {
    const builder = staffed(state, "building", 0);
    plan.push(...builder.plan);
    cost += builder.cost;
    state = applied(state, builder.plan);
  }
  return { plan, cost };
}

/** Seconds until the building is up if the order delivered from now, at the line's speed. */
function buildingSeconds(mountain: Mountain, line: number): number {
  return secondsToFinish(resumeOrder(mountain), 1, line);
}

/**
 * Delivering, the order would take more than half of what the mine makes
 * (the spec's `starved`), so the pocket hardly grows. Otherwise it grows anyway.
 */
export function drainsTheMine(mountain: Mountain, line: number): boolean {
  const numbers = orderNumbers(resumeOrder(mountain), line);
  return numbers.kind === "delivering" && numbers.brings > line * STARVED_SHARE;
}

/** Hold while the best raise pays back sooner than the building takes; resume when it does not. */
function holdPlan(
  mountain: Mountain,
  habits: FreshHabits,
  raise: Raise | undefined,
): Plan {
  if (habits.hold === "never") {
    return [];
  }
  const delivering = asDelivering(mountain, habits);
  const line = lineNow(delivering).line;
  const sooner =
    raise !== undefined &&
    drainsTheMine(delivering, line) &&
    raise.cost / raise.gain < buildingSeconds(delivering, line);
  if (mountain.project.kind === "delivering" && sooner) {
    return [{ kind: "holdOrder" }];
  }
  if (mountain.project.kind === "onHold" && !sooner) {
    return [{ kind: "resumeOrder" }];
  }
  return [];
}

/**
 * A vehicle (with its driver and the builders to keep pace) when transport
 * holds the order back, a builder when the builders do, with what it adds
 * to what reaches the building a second. A dad who never holds keeps the
 * order from taking more than half of what the mine makes, or he could
 * never buy again.
 */
function orderFix(mountain: Mountain, habits: FreshHabits): Raise | undefined {
  if (mountain.project.kind !== "delivering") {
    return undefined;
  }
  const limit = orderLimit(mountain, lineNow(mountain).line);
  if (limit.kind !== "delivering") {
    return undefined;
  }
  const priced =
    limit.limit === "transport"
      ? vehicleBuy(mountain)
      : limit.limit === "builders"
        ? staffed(mountain, "building", freeWorkers(mountain))
        : undefined;
  if (priced === undefined) {
    return undefined;
  }
  const rich = funded(mountain);
  const after = applied(rich, priced.plan);
  const gain = brings(after) - brings(rich);
  if (gain <= FRESH_DUST) {
    return undefined;
  }
  if (habits.hold === "never" && drainsTheMine(after, lineNow(after).line)) {
    return undefined;
  }
  return { ...priced, gain };
}

/** What reaches the building a second now, with the pocket as it is. */
function brings(mountain: Mountain): number {
  const numbers = orderNumbers(mountain, lineNow(mountain).line);
  return numbers.kind === "unordered"
    ? 0
    : Math.min(numbers.brings, numbers.builds);
}

function covers(mountain: Mountain, priced: Priced, hoardK: number): boolean {
  return mountain.stock.stones >= priced.cost * Math.max(1, hoardK);
}

/**
 * This dad's next plan, or none. Order, then place the free workers, then
 * move a worker whose stage stands (and, the mover, the idle ones), then
 * hire the order's driver and builder, then buy what the order's limit or
 * the line wants, then hold or resume.
 */
export function freshPlan(
  mountain: Mountain,
  habits: FreshHabits,
  hoardK: number,
): Plan {
  if (
    mountain.project.kind === "unordered" &&
    nextBuilding(mountain) !== undefined
  ) {
    return [{ kind: "placeOrder" }];
  }
  if (freeWorkers(mountain) > 0) {
    return placeFree(mountain, habits);
  }
  const moved =
    habits.moves === "idle"
      ? moverPlan(mountain, habits)
      : rebalance(mountain, habits);
  if (moved.length > 0) {
    return moved;
  }
  const crew = orderCrew(mountain, habits);
  if (crew !== undefined && covers(mountain, crew, hoardK)) {
    return crew.plan;
  }
  const fix = orderFix(mountain, habits);
  if (fix !== undefined && paysForItself(mountain, fix)) {
    if (covers(mountain, fix, hoardK)) {
      return fix.plan;
    }
    // He saves for it while the pocket grows. While the order takes what
    // the mine makes, nothing grows: the line and the hold come first.
    if (!drainsTheMine(mountain, lineNow(mountain).line)) {
      return [];
    }
  }
  const raise = bestRaise(mountain, habits);
  if (raise !== undefined && covers(mountain, raise, hoardK)) {
    return raise.plan;
  }
  return holdPlan(mountain, habits, raise);
}

/**
 * Bought out of the pocket, it brings the building sooner by more time than
 * the mine takes to make its price: with what it costs added to the pocket,
 * buying it beats keeping the stones for the order.
 */
function paysForItself(mountain: Mountain, priced: Priced): boolean {
  const rich = {
    ...mountain,
    stock: {
      ...mountain.stock,
      stones: mountain.stock.stones + priced.cost,
    },
  };
  const line = lineNow(rich).line;
  const after = applied(rich, priced.plan);
  const saved =
    buildingSeconds(rich, line) - buildingSeconds(after, lineNow(after).line);
  return saved > FRESH_DUST && saved * line >= priced.cost;
}

/** Plans one after another while each changes something; `onMove` hears each move before it applies. */
export function playFresh(
  start: Mountain,
  now: number,
  habits: FreshHabits,
  hoardK: number,
  onMove?: (before: Mountain, action: Action) => void,
): Mountain {
  let mountain = start;
  for (let count = 0; count < PLANS_A_SECOND; count += 1) {
    const plan = freshPlan(mountain, habits, hoardK);
    let next = mountain;
    for (const action of plan) {
      onMove?.(next, action);
      next = applyAction(next, action, now);
    }
    if (next === mountain) {
      break;
    }
    mountain = next;
  }
  return mountain;
}
