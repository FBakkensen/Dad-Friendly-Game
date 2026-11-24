import { activeFactors } from "../economy/factors";
import { buildRate, onSiteTotal } from "../building-site";
import {
  buildingById,
  nextBuilding,
  resumeOrder,
  stillRequired,
} from "../city";
import { graniteOpen, shaftPrice } from "../mine-levels";
import { tierLocked } from "../crew";
import {
  applyAction,
  helperBill,
  listActions,
  type Action,
} from "../economy/actions";
import { STAGES, narrowStage, type Stage } from "../line";
import {
  makerJob,
  makerPrice,
  makersOpen,
  makerTakes,
  type MakerId,
} from "../makers";
import {
  PILE_HOLDS,
  mineChain,
  pitheadRoom,
  undergroundPitheadChains,
} from "../mine-piles";
import type { Mountain } from "../mountain";
import { slice2Part1On } from "../part-switch";
import { chainFlows } from "../piles";
import { effectiveRates } from "../rates";
import type { GoodId, Price } from "../stock";
import {
  MAX_STOCKYARD_LEVEL,
  activeStockpileGoods,
  expandPrice,
  stockpileRoom,
  stockyardOpen,
} from "../stockyard";
import { TIERS, machineStaff, tierInPlay, type Tier } from "../tiers";
import {
  fleetRate,
  fleetSize,
  orderLimit,
  orderNumbers,
  vehiclePrice,
  VEHICLE_IDS,
  vehicleOpen,
  type VehicleId,
} from "../transport";
import {
  NO_JOBS,
  STAGE_JOB,
  freeWorkers,
  lineWork,
  type JobId,
} from "../workforce";
import { sticker } from "./decide";
import {
  applied,
  buildingSeconds,
  coversPrice,
  earnSeconds,
  funded,
  goodsAhead,
  goodsIncome,
  orderRates,
  pays,
  planPrice,
  raiseChain,
  staffed,
  weighed,
  worth,
  type LineReading,
  type Plan,
  type Priced,
  type Raise,
  type Weighed,
} from "./fresh-kit";
import {
  goodRaise,
  levelMoves,
  levelPlace,
  levelRaises,
  makerWithLevel,
  makersWanted,
  waitsForShaft,
} from "./fresh-levels";
import type { FreshHabits } from "./policy";
import {
  FRESH_DUST,
  PLANS_A_SECOND,
  RAISE_STEPS,
  RESTORE_STEPS,
  SOONER_SHARE,
  STARVED_SHARE,
  WEIGH_AGAIN_CALLS,
  YARD_NEARLY_FULL,
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

/** The fresh mine's line now: what it moves and each stage. */
function lineNow(mountain: Mountain): LineReading {
  const rates = effectiveRates(mountain);
  return {
    line: rates.exactCrewPerSecond,
    stages: lineWork(mountain, rates.tierSpeed).stages,
  };
}

/** A machine and the workers it takes, hired onto its stage (the spec's Lab). */
function machineBuy(mountain: Mountain, tier: Tier, stage: Stage): Priced {
  const buy: Action = { kind: "buyTier", id: tier.id };
  const plan: Action[] = [buy];
  for (let hire = 0; hire < machineStaff(tier); hire += 1) {
    plan.push(
      { kind: "buyTier", id: "helper" },
      { kind: "placeWorker", job: STAGE_JOB[stage], count: 1 },
    );
  }
  return {
    plan,
    cost: sticker(mountain, buy) + helperBill(mountain, machineStaff(tier)),
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

/**
 * The cheapest way to raise the line (`raiseChain`): the slowest stage's
 * best buy per stone, then the next slowest, until the line moves.
 */
export function lineRaise(mountain: Mountain): Raise | undefined {
  return raiseChain(mountain, lineNow, stageBuys);
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

/** Steady rock/s the Topsoil + fleet move into the stockyard and kilns (Slice 2 Part 1). */
function slice2Throughput(mountain: Mountain): number {
  const inc = goodsIncome(mountain);
  return (inc.stones ?? 0) + (inc.brick ?? 0) * makerTakes("kiln");
}

/** Candidate stone-priced vehicle raises for Slice 2 Part 1 when transport limits steady rock output. */
function slice2TransportRaises(
  mountain: Mountain,
  line: Raise | undefined,
): readonly Raise[] {
  const base = slice2Throughput(mountain);
  const raises: Raise[] = [];
  const fleet = fleetRate(mountain);
  const mineLine = lineNow(mountain).line;
  for (const id of VEHICLE_IDS.filter(
    (open) =>
      vehicleOpen(mountain, open) &&
      vehiclePrice(mountain, open).every((entry) => entry.good === "stones"),
  )) {
    const buy = vehicleBuy(mountain, id);
    if (!Number.isFinite(buy.cost) || buy.cost <= 0) {
      continue;
    }
    const gain = slice2Throughput(applied(funded(mountain), buy.plan)) - base;
    if (gain > FRESH_DUST) {
      raises.push({ plan: buy.plan, cost: buy.cost, gain });
    }
    if (line !== undefined && fleet <= mineLine + FRESH_DUST) {
      const bothBuy = vehicleBuy(applied(funded(mountain), line.plan), id);
      const bothPlan = [...line.plan, ...bothBuy.plan];
      const bothCost = stonesOf(planPrice(mountain, bothPlan));
      const bothGain =
        slice2Throughput(applied(funded(mountain), bothPlan)) - base;
      if (Number.isFinite(bothCost) && bothCost > 0 && bothGain > FRESH_DUST) {
        raises.push({ plan: bothPlan, cost: bothCost, gain: bothGain });
      }
    }
  }
  return raises;
}

/** The raise that pays back soonest, from the line's buys and, if he weighs them, the upgrades. */
export function bestRaise(
  mountain: Mountain,
  habits: FreshHabits,
): Raise | undefined {
  const line = lineRaise(mountain);
  const baseRaises: readonly Raise[] = [
    ...(habits.upgrades ? upgradeRaises(mountain) : []),
    ...(line !== undefined ? [line] : []),
  ];
  const baseThroughput = slice2Part1On() ? slice2Throughput(mountain) : 0;
  const raises = slice2Part1On()
    ? [
        ...(fleetRate(mountain) <= FRESH_DUST
          ? baseRaises
          : baseRaises.flatMap((raise) => {
              const gain =
                slice2Throughput(applied(funded(mountain), raise.plan)) -
                baseThroughput;
              return gain > FRESH_DUST ? [{ ...raise, gain }] : [];
            })),
        ...slice2TransportRaises(mountain, line),
      ]
    : baseRaises;
  let best: Raise | undefined;
  for (const raise of raises) {
    if (best === undefined || raise.cost / raise.gain < best.cost / best.gain) {
      best = raise;
    }
  }
  return best;
}

/** Goods a second one builder builds in (reads active factors dynamically). */
function oneBuilder(): number {
  return buildRate({ jobs: { ...NO_JOBS, building: 1 } });
}

/** Builders that keep pace with what reaches the site: transport, or the line when it is less. */
function buildersWanted(mountain: Mountain, line: number): number {
  const carry = slice2Part1On()
    ? (orderRates(mountain).cityCarry ?? 0)
    : Math.min(fleetRate(mountain), line);
  return Math.max(1, Math.ceil(carry / oneBuilder()));
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
function pileStage(mountain: Mountain): Stage {
  const { face, shaft } = mountain.piles;
  const shaftShare = pileShare(shaft, PILE_HOLDS.shaft);
  if (shaft > 0 && shaftShare >= pileShare(face, PILE_HOLDS.face)) {
    return "lift";
  }
  return face > 0 ? "haul" : "face";
}

/** Job whose waiting pile lets a worker move rock (adds pithead -> driving in Slice 2 Part 1). */
function pileJob(mountain: Mountain): JobId {
  if (!slice2Part1On()) {
    return STAGE_JOB[pileStage(mountain)];
  }
  const pit = mountain.pithead.topsoil;
  const pitShare = pileShare(pit, pitheadRoom(mountain));
  const shaftShare = pileShare(mountain.piles.shaft, PILE_HOLDS.shaft);
  const faceShare = pileShare(mountain.piles.face, PILE_HOLDS.face);
  if (
    pit > 0 &&
    mountain.jobs.driving < fleetSize(mountain) &&
    (mountain.jobs.driving === 0 ||
      (pitShare >= shaftShare && pitShare >= faceShare))
  ) {
    return "driving";
  }
  return STAGE_JOB[pileStage(mountain)];
}

/** He sets drivers and builders once an order is in: the dad who sets them once, or anyone while it delivers. */
function keepsJobs(mountain: Mountain, habits: FreshHabits): boolean {
  const project = mountain.project.kind;
  return (
    project !== "unordered" &&
    (habits.moves === "once" || project === "delivering")
  );
}

/** Whether a free worker should take an idle vehicle under Slice 2 physical transport. */
function wantsDriverFree(mountain: Mountain): boolean {
  if (mountain.jobs.driving >= fleetSize(mountain)) {
    return false;
  }
  const mineStaffed =
    mountain.jobs.drilling > 0 &&
    mountain.jobs.haulage > 0 &&
    mountain.jobs.hoisting > 0;
  return (
    mineStaffed || (mountain.jobs.driving === 0 && mountain.pithead.topsoil > 0)
  );
}

/** A free worker's place: an idle vehicle, the builders, else where rock waits. */
function placeFree(mountain: Mountain, habits: FreshHabits): Plan {
  const keeps = keepsJobs(mountain, habits);
  if (
    slice2Part1On()
      ? wantsDriverFree(mountain)
      : keeps && mountain.jobs.driving < fleetSize(mountain)
  ) {
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
  const level = graniteOpen(mountain) ? levelPlace(mountain, habits) : [];
  return level.length > 0
    ? level
    : [{ kind: "placeWorker", job: pileJob(mountain), count: 1 }];
}

/**
 * A driver for the wagon and one builder once an order is in and the line
 * moves (a worker on every stage), hired when no worker is free. Before the
 * line moves, the wagon would carry off every stone the lone worker brings
 * up, and he could never hire the next. A dad who never holds also waits
 * while the driver would let the order take more than half of what the
 * mine makes. Under Slice 2 Part 1, a driver is always required once the mine
 * lifts rock so pithead rock reaches the stockyard.
 */
function orderCrew(
  mountain: Mountain,
  habits: FreshHabits,
): Priced | undefined {
  if (lineNow(mountain).line <= FRESH_DUST) {
    return undefined;
  }
  if (
    slice2Part1On() &&
    mountain.jobs.driving < Math.min(1, fleetSize(mountain))
  ) {
    return staffed(mountain, "driving", freeWorkers(mountain));
  }
  if (!keepsJobs(mountain, habits)) {
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
  return habits.hold === "never" && drainsTheMine(after) ? undefined : crew;
}

/** Slice 2 Part 1 single-level pile move including pithead.topsoil -> driving. */
function slice2PileMove(mountain: Mountain): Plan {
  const stockFull =
    stockyardOpen(mountain) &&
    mountain.stock.stones >= stockpileRoom(mountain, "stones");
  const chain = undergroundPitheadChains(mountain, 1, true, {
    topsoil: stockFull && mountain.makers.kiln === 0 ? 0 : fleetRate(mountain),
    granite: 0,
    crystal: 0,
  }).topsoil;
  if (chain === undefined) {
    return [];
  }
  const flows = chainFlows(chain);
  const rates = chain.rates;
  const last = STAGES.length - 1;
  if (
    (rates[last] ?? 0) > FRESH_DUST &&
    (flows[last] ?? 0) <= FRESH_DUST &&
    mountain.piles.shaft > 0 &&
    mountain.jobs.driving > 0 &&
    stockFull
  ) {
    return [];
  }
  const to = pileJob(mountain);
  for (const [index, from] of STAGES.entries()) {
    const stands =
      (rates[index] ?? 0) > FRESH_DUST && (flows[index] ?? 0) <= FRESH_DUST;
    const fromJob = STAGE_JOB[from];
    if (stands && fromJob !== to && mountain.jobs[fromJob] > 0) {
      return [
        { kind: "freeWorker", job: fromJob, count: 1 },
        { kind: "placeWorker", job: to, count: 1 },
      ];
    }
  }
  const missingMineStage =
    mountain.jobs.drilling === 0 ||
    mountain.jobs.haulage === 0 ||
    mountain.jobs.hoisting === 0;
  if (
    missingMineStage &&
    mountain.jobs.driving > 0 &&
    mountain.pithead.topsoil === 0 &&
    to !== "driving"
  ) {
    return [
      { kind: "freeWorker", job: "driving", count: 1 },
      { kind: "placeWorker", job: to, count: 1 },
    ];
  }
  return [];
}

/**
 * One worker from a stage that stands, with workers on it and no rock to
 * move or no room to put it (#703), to the stage whose pile lets him move
 * rock. Each move is one worker, so the stage he leaves keeps the rest
 * while it moves rock again.
 */
function pileMove(mountain: Mountain): Plan {
  if (graniteOpen(mountain)) {
    // With two levels the cages serve both, and the level habits place the
    // workers (`levelMoves`, #675): the Topsoil's chain alone would read
    // the cages for both as no hoisting at all.
    return [];
  }
  if (slice2Part1On()) {
    return slice2PileMove(mountain);
  }
  const chain = mineChain(mountain, 1, true);
  const flows = chainFlows(chain);
  const rates = chain.rates;
  const last = STAGES.length - 1;
  if (
    (rates[last] ?? 0) > FRESH_DUST &&
    (flows[last] ?? 0) <= FRESH_DUST &&
    mountain.piles.shaft > 0
  ) {
    // Hoisting stands with rock to lift: the stockyard is full, and no
    // move of his makes room for it (#667).
    return [];
  }
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
function atLine(now: LineReading): number {
  return STAGES.filter((stage) => now.stages[stage] <= now.line + FRESH_DUST)
    .length;
}

/**
 * A worker whose stage stands to where rock waits, for every dad (#703).
 * The mover also moves one from a stage with more than the line needs to
 * the slowest, when the line is better for it.
 */
function rebalance(mountain: Mountain, habits: FreshHabits): Plan {
  if (slice2Part1On() && graniteOpen(mountain)) {
    return [];
  }
  const piled = pileMove(mountain);
  if (piled.length > 0 || habits.moves !== "idle") {
    return piled;
  }
  const now = lineNow(mountain);
  const to = narrowStage(now.stages);
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
  if (
    !delivering &&
    mountain.jobs.driving > (slice2Part1On() ? fleetSize(mountain) : 0)
  ) {
    return [{ kind: "freeWorker", job: "driving", count: 1 }];
  }
  const slice2Granite = slice2Part1On() && graniteOpen(mountain);
  if (
    siteIdle(mountain) &&
    mountain.jobs.building > 0 &&
    (!slice2Granite || mountain.project.kind === "unordered")
  ) {
    return [{ kind: "freeWorker", job: "building", count: 1 }];
  }
  const restore =
    (delivering || slice2Part1On()) && !slice2Granite
      ? restoreStep(mountain, delivering)
      : [];
  return restore.length > 0 ? restore : rebalance(mountain, habits);
}

/** A worker from the mine onto an idle vehicle, or onto the builders when they are short. */
function restoreStep(mountain: Mountain, delivering = true): Plan {
  const short =
    mountain.jobs.driving < fleetSize(mountain)
      ? "driving"
      : delivering &&
          mountain.jobs.building <
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

/** A vehicle and its driver, when transport holds the order back: a horse wagon unless `id` says. */
function vehicleBuy(
  mountain: Mountain,
  id: VehicleId = VEHICLE_IDS[0] ?? "horseWagon",
): Priced {
  const driver = staffed(mountain, "driving", freeWorkers(mountain));
  const plan: Action[] = [{ kind: "buyVehicle", id }, ...driver.plan];
  let cost = (vehiclePrice(mountain, id)[0]?.amount ?? Infinity) + driver.cost;
  if (slice2Part1On()) {
    // Under Slice 2 physical transport, vehicles serve pithead/maker runs as
    // well as City orders; builders are weighed on their own merit (#767).
    return { plan, cost };
  }
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

/**
 * Delivering, the order would take more than half of what the mine makes
 * (the spec's `starved`), so the pocket hardly grows. Otherwise it grows anyway.
 */
export function drainsTheMine(mountain: Mountain): boolean {
  const resumed = resumeOrder(mountain);
  const rates = orderRates(resumed);
  const numbers = orderNumbers(resumed, rates.income, rates.cityCarry);
  if (numbers.kind !== "delivering") {
    return false;
  }
  const made = slice2Part1On()
    ? (rates.income.stones ?? 0) +
      (rates.income.brick ?? 0) +
      (rates.income.cutStone ?? 0)
    : lineNow(mountain).line;
  return numbers.brings > made * STARVED_SHARE;
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
  const sooner =
    raise !== undefined &&
    drainsTheMine(delivering) &&
    raise.cost / raise.gain < buildingSeconds(delivering);
  if (mountain.project.kind === "delivering" && sooner) {
    return [{ kind: "holdOrder" }];
  }
  if (mountain.project.kind === "onHold" && !sooner) {
    return [{ kind: "resumeOrder" }];
  }
  return [];
}

/**
 * The buy for the order that brings the building soonest for its stones,
 * among those that pay for themselves: the answer to the order's limit (a
 * vehicle with its driver and the builders to keep pace, or a builder), and
 * a kiln while the building still requires brick (#667). A kiln is weighed
 * on the whole building, not the step in hand: brick the roof waits for is
 * made from the first day. A dad who never holds keeps the order from
 * taking more than half of what the mine makes, or he could never buy
 * again.
 */
function orderFix(mountain: Mountain, habits: FreshHabits): Priced | undefined {
  if (mountain.project.kind !== "delivering") {
    return undefined;
  }
  const rates = orderRates(mountain);
  const limit = orderLimit(mountain, rates.income, rates.cityCarry);
  if (limit.kind !== "delivering") {
    return undefined;
  }
  const candidates = [
    limitFix(mountain, limit.limit),
    ...(slice2Part1On() && limit.limit !== "transport"
      ? [limitFix(mountain, "transport")]
      : []),
    brickFix(mountain),
  ];
  let best: { priced: Priced; worth: number } | undefined;
  for (const priced of candidates) {
    if (
      priced === undefined ||
      (habits.hold === "never" &&
        drainsTheMine(applied(funded(mountain), priced.plan)))
    ) {
      continue;
    }
    const worth = savedSeconds(mountain, priced) / priced.cost;
    if (worth > 0 && (best === undefined || worth > best.worth)) {
      best = { priced, worth };
    }
  }
  return best?.priced;
}

/** A vehicle when transport holds the order back, a builder when the builders do, if it adds to what reaches the building. */
function limitFix(
  mountain: Mountain,
  limit: "transport" | "builders" | GoodId,
): Priced | undefined {
  const priced =
    limit === "transport"
      ? vehicleBuy(mountain)
      : limit === "builders"
        ? staffed(mountain, "building", freeWorkers(mountain))
        : undefined;
  if (priced === undefined) {
    return undefined;
  }
  const rich = funded(mountain);
  return brings(applied(rich, priced.plan)) - brings(rich) > FRESH_DUST
    ? priced
    : undefined;
}

/** A kiln, while the kilns are open and a step still to build requires brick. */
function brickFix(mountain: Mountain): Priced | undefined {
  const project = mountain.project;
  if (project.kind === "unordered" || !makersOpen(mountain)) {
    return undefined;
  }
  const steps = buildingById(project.site.building).steps.slice(
    project.site.step,
  );
  const brick = steps.some((price) =>
    price.some((line) => line.good === "brick" && line.amount > 0),
  );
  return brick ? makerBuy(mountain) : undefined;
}

/** A maker and a worker on it, hired when none is free (rule 2.7, #667): a kiln unless `id` says. */
function makerBuy(mountain: Mountain, id: MakerId = "kiln"): Priced {
  const worker = staffed(mountain, makerJob(id), freeWorkers(mountain));
  return {
    plan: [{ kind: "buyMaker", id }, ...worker.plan],
    cost: stonesOf(makerPrice(mountain, id)) + worker.cost,
  };
}

/** A price's stone, or Infinity when it asks for none: the dad pays stone for these. */
function stonesOf(price: Price): number {
  return price.find((line) => line.good === "stones")?.amount ?? Infinity;
}

/** What reaches the building a second now, with the pocket as it is. */
function brings(mountain: Mountain): number {
  const rates = orderRates(mountain);
  const numbers = orderNumbers(mountain, rates.income, rates.cityCarry);
  return numbers.kind === "unordered"
    ? 0
    : Math.min(numbers.brings, numbers.builds);
}

/** A stockpile holds most of its room (`YARD_NEARLY_FULL`). */
function nearlyFull(mountain: Mountain): boolean {
  return activeStockpileGoods().some(
    (good) =>
      mountain.stock[good] >= stockpileRoom(mountain, good) * YARD_NEARLY_FULL,
  );
}

/** The stone stockpile holds most of its room. */
function stoneFilling(mountain: Mountain): boolean {
  return (
    mountain.stock.stones >=
    stockpileRoom(mountain, "stones") * YARD_NEARLY_FULL
  );
}

/**
 * A buy's stone, with his hoard, fits below the line where he stops raising
 * (`YARD_NEARLY_FULL` of the stone room): one above it he could never save
 * for, so he makes room first (rule 4: "Needs a bigger stockyard").
 */
function fits(mountain: Mountain, priced: Priced, hoardK: number): boolean {
  return (
    priced.cost * Math.max(1, hoardK) <=
    stockpileRoom(mountain, "stones") * YARD_NEARLY_FULL
  );
}

/**
 * One more stockyard level, when a stockpile is nearly full or `need` (a
 * buy he wants) does not fit, and the brick covers it with his hoard
 * (#667). None while the stockyard is closed or at its last level.
 */
function yardPlan(mountain: Mountain, need: boolean, hoardK: number): Plan {
  if (
    !stockyardOpen(mountain) ||
    mountain.stockyard >= MAX_STOCKYARD_LEVEL ||
    !(need || nearlyFull(mountain))
  ) {
    return [];
  }
  const price = expandPrice(mountain)[0]?.amount ?? Infinity;
  return mountain.stock.brick >= price * Math.max(1, hoardK)
    ? [{ kind: "expandStockyard" }]
    : [];
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
  const settled = settlePlan(mountain, habits, hoardK);
  return settled.length > 0 ? settled : spendPlan(mountain, habits, hoardK);
}

/** The free moves first: order, place the free workers, move the idle ones, and room in the stockyard. */
function settlePlan(
  mountain: Mountain,
  habits: FreshHabits,
  hoardK: number,
): Plan {
  if (
    mountain.project.kind === "unordered" &&
    nextBuilding(mountain) !== undefined &&
    !waitsForShaft(mountain)
  ) {
    return [{ kind: "placeOrder" }];
  }
  if (freeWorkers(mountain) > 0) {
    return placeFree(mountain, habits);
  }
  const levels = levelMoves(mountain, habits);
  if (levels.length > 0) {
    return levels;
  }
  const moved =
    habits.moves === "idle"
      ? moverPlan(mountain, habits)
      : rebalance(mountain, habits);
  return moved.length > 0 ? moved : yardPlan(mountain, false, hoardK);
}

/** Then the stone: the order's crew, its fix, the line's raise, or the hold. */
function spendPlan(
  mountain: Mountain,
  habits: FreshHabits,
  hoardK: number,
): Plan {
  if (waitsForShaft(mountain)) {
    return shaftPlan(mountain, habits, hoardK);
  }
  const crew = orderCrew(mountain, habits);
  if (crew !== undefined && covers(mountain, crew, hoardK)) {
    return crew.plan;
  }
  if (graniteOpen(mountain) && mountain.project.kind !== "unordered") {
    return levelsSpend(mountain, habits, hoardK);
  }
  const fix = orderFix(mountain, habits);
  if (fix !== undefined) {
    if (covers(mountain, fix, hoardK)) {
      return fix.plan;
    }
    // He saves for it while the pocket grows. While the order takes what
    // the mine makes, nothing grows: the line and the hold come first.
    if (!drainsTheMine(mountain)) {
      return [];
    }
  }
  return raisePlan(mountain, habits, hoardK);
}

/** The raise that pays back soonest when the pocket covers it, else room for it, else the hold. */
function raisePlan(
  mountain: Mountain,
  habits: FreshHabits,
  hoardK: number,
): Plan {
  // With the stone stockpile nearly full, a faster line only stands
  // sooner: he raises it again once there is room.
  const best = stoneFilling(mountain) ? undefined : bestRaise(mountain, habits);
  if (best !== undefined && !fits(mountain, best, hoardK)) {
    // Too big for the stone stockpile: he makes room for it, and does not
    // hold the order for a buy he cannot make.
    return yardPlan(mountain, true, hoardK);
  }
  if (best !== undefined && covers(mountain, best, hoardK)) {
    return best.plan;
  }
  return holdPlan(mountain, habits, best);
}

/** Each good of a price, with his hoard, fits below the line where he stops raising (`fits`, good by good). */
function fitsPrice(mountain: Mountain, price: Price, hoardK: number): boolean {
  return price.every(
    (line) =>
      line.amount * Math.max(1, hoardK) <=
      stockpileRoom(mountain, line.good) * YARD_NEARLY_FULL,
  );
}

/** Seconds until the pocket holds the price with his hoard, at what the mine makes now. */
function saveSeconds(mountain: Mountain, price: Price, hoardK: number): number {
  const income = goodsIncome(mountain);
  let seconds = 0;
  for (const line of price) {
    const short = line.amount * Math.max(1, hoardK) - mountain.stock[line.good];
    const rate = income[line.good] ?? 0;
    if (short > 0) {
      seconds = Math.max(seconds, rate > FRESH_DUST ? short / rate : Infinity);
    }
  }
  return seconds;
}

/**
 * While the next building waits for the shaft (ruling 3, #675): room for
 * its price first, then the shaft once the pocket holds it. Meanwhile he
 * raises the line only with a buy that pays back before he would have the
 * shaft's price.
 */
function shaftPlan(
  mountain: Mountain,
  habits: FreshHabits,
  hoardK: number,
): Plan {
  const price = shaftPrice();
  if (!fitsPrice(mountain, price, hoardK)) {
    return yardPlan(mountain, true, hoardK);
  }
  if (coversPrice(mountain, price, hoardK)) {
    return [{ kind: "sinkShaft" }];
  }
  const raise = stoneFilling(mountain)
    ? undefined
    : bestRaise(mountain, habits);
  return raise !== undefined &&
    covers(mountain, raise, hoardK) &&
    raise.cost / raise.gain < saveSeconds(mountain, price, hoardK)
    ? raise.plan
    : [];
}

/**
 * The fix for what holds the order back, step by step until the building is
 * up sooner (ruling 7, #675): the best vehicle for its price when transport
 * is the limit, a builder when the builders are, and when a good is, its
 * maker or its level's raise. Like the line's raise, a chain: more kilns
 * help only once transport carries their brick, and the other way round.
 */
function orderRaise(mountain: Mountain, habits: FreshHabits): Plan | undefined {
  const real = (state: Mountain): Mountain => ({
    ...state,
    stock: mountain.stock,
  });
  const start = buildingSeconds(mountain);
  let state = funded(mountain);
  const plan: Action[] = [];
  for (let step = 0; step < RAISE_STEPS; step += 1) {
    const now = real(state);
    if (buildingSeconds(now) < start * (1 - SOONER_SHARE)) {
      return plan;
    }
    const fix = limitStep(now, habits);
    if (fix === undefined || fix.length === 0) {
      return undefined;
    }
    plan.push(...fix);
    state = applied(state, fix);
  }
  return buildingSeconds(real(state)) < start * (1 - SOONER_SHARE)
    ? plan
    : undefined;
}

/**
 * One step of `orderRaise`: of the fixes for each thing that can hold the
 * building back (transport, the builders, each good still ahead), the one
 * that brings it soonest, with the pocket as it is. When none does alone,
 * two that do together: transport and a good, say, both at the same rate.
 * When no two do, all of them.
 */
function limitStep(mountain: Mountain, habits: FreshHabits): Plan | undefined {
  const fixes: Plan[] = [
    bestVehicle(mountain),
    staffed(mountain, "building", freeWorkers(mountain)).plan,
    ...[...goodsAhead(mountain)].map((good) => goodFix(mountain, habits, good)),
  ].filter((plan): plan is Plan => plan !== undefined && plan.length > 0);
  const pairs = fixes.flatMap((first, index) =>
    fixes.slice(index + 1).map((second) => [...first, ...second]),
  );
  return (
    soonestFix(mountain, fixes) ??
    soonestFix(mountain, pairs) ??
    soonestFix(mountain, [fixes.flat()])
  );
}

/** Of these plans, the one that brings the building soonest with the pocket as it is, if any does. */
function soonestFix(
  mountain: Mountain,
  plans: readonly Plan[],
): Plan | undefined {
  const before = buildingSeconds(mountain);
  let best: { plan: Plan; seconds: number } | undefined;
  for (const plan of plans) {
    const after = { ...applied(funded(mountain), plan), stock: mountain.stock };
    const seconds = buildingSeconds(after);
    if (
      seconds < before * (1 - SOONER_SHARE) &&
      (best === undefined || seconds < best.seconds)
    ) {
      best = { plan, seconds };
    }
  }
  return best?.plan;
}

/** A good's fix: its maker, with its level when nobody works there, or its level's raise. */
function goodFix(
  mountain: Mountain,
  habits: FreshHabits,
  good: GoodId,
): Plan | undefined {
  return goodRaise(mountain, habits, good, (id) =>
    makerWithLevel(mountain, habits, id, makerBuy(mountain, id).plan),
  );
}

/** The open vehicle, with its driver, that adds most to what transport carries for the income its price takes. */
function bestVehicle(mountain: Mountain): Plan | undefined {
  let best: { plan: Plan; worth: number } | undefined;
  const carry = fleetRate(mountain);
  for (const id of VEHICLE_IDS.filter((open) => vehicleOpen(mountain, open))) {
    const plan = vehicleBuy(mountain, id).plan;
    const gain = fleetRate(applied(funded(mountain), plan)) - carry;
    const value = gain / earnSeconds(mountain, planPrice(mountain, plan));
    if (value > 0 && (best === undefined || value > best.worth)) {
      best = { plan, worth: value };
    }
  }
  return best?.plan;
}

/** Every plan the dad weighs with the Granite open: the levels' raises, vehicles, a builder, makers and, if he weighs them, upgrades. */
function levelsPlans(mountain: Mountain, habits: FreshHabits): readonly Plan[] {
  const vehicles = VEHICLE_IDS.filter((id) => vehicleOpen(mountain, id)).map(
    (id) => vehicleBuy(mountain, id).plan,
  );
  const upgrades = habits.upgrades
    ? upgradeRaises(mountain).map((raise) => raise.plan)
    : [];
  const order = orderRaise(mountain, habits);
  return [
    ...(order === undefined ? [] : [order]),
    ...levelRaises(mountain, habits),
    ...vehicles,
    staffed(mountain, "building", freeWorkers(mountain)).plan,
    ...makersWanted(mountain).map((id) =>
      makerWithLevel(mountain, habits, id, makerBuy(mountain, id).plan),
    ),
    ...upgrades,
  ];
}

/** The order's step in hand still requires a good the price asks for: saving it needs the order on hold. */
function orderTakes(mountain: Mountain, price: Price): boolean {
  const project = mountain.project;
  if (project.kind === "unordered") {
    return false;
  }
  const left = stillRequired(project.site);
  return price.some((line) => left[line.good] > 0);
}

/**
 * The dad's spend with the Granite open (rulings 5 to 7, #675): of the
 * plans that bring the building sooner by more than the mine takes to make
 * their price, the one that brings it soonest for that time. He buys it
 * when the pocket holds it, makes room for it when it would not fit, and
 * holds the order while he saves a good the order takes. With nothing worth
 * saving for, he resumes.
 */
function levelsSpend(
  mountain: Mountain,
  habits: FreshHabits,
  hoardK: number,
): Plan {
  const best = bestLevelsPlan(mountain, habits, hoardK);
  const held = mountain.project.kind === "onHold";
  if (best === undefined) {
    return held ? [{ kind: "resumeOrder" }] : [];
  }
  if (coversPrice(mountain, best.price, hoardK)) {
    return best.plan;
  }
  if (!fitsPrice(mountain, best.price, hoardK)) {
    return yardPlan(mountain, true, hoardK);
  }
  const takes = orderTakes(mountain, best.price);
  if (takes && habits.hold === "on-value" && !held) {
    return [{ kind: "holdOrder" }];
  }
  return held && !takes ? [{ kind: "resumeOrder" }] : [];
}

/** The plan that pays best now (`levelsSpend`), weighed afresh. */
function weighBest(
  mountain: Mountain,
  habits: FreshHabits,
): Weighed | undefined {
  let best: Weighed | undefined;
  for (const plan of levelsPlans(mountain, habits)) {
    const weigh = weighed(mountain, plan);
    if (pays(weigh) && (best === undefined || worth(weigh) > worth(best))) {
      best = weigh;
    }
  }
  return best;
}

/**
 * What the dad weighed last, and on which mine: he does not weigh every plan
 * again each second while he only waits (#675). The mine's key is all but
 * its pocket, under the factor map it was weighed with. One entry: the lab
 * plays one run at a time.
 */
let lastWeighed:
  | {
      readonly key: string;
      readonly factors: ReturnType<typeof activeFactors>;
      readonly best: Weighed | undefined;
      calls: number;
    }
  | undefined;

/** Everything the dad's plans read but the pocket. */
function mineKey(
  mountain: Mountain,
  habits: FreshHabits,
  hoardK: number,
): string {
  const project = mountain.project;
  return JSON.stringify([
    habits,
    hoardK,
    mountain.owned,
    mountain.jobs,
    mountain.makers,
    mountain.fleet,
    mountain.cages.assigned,
    mountain.mineLevels.granite?.machines ?? 0,
    mountain.upgrades,
    mountain.stockyard,
    mountain.operational,
    project.kind,
    project.kind === "unordered" ? 0 : project.site.step,
  ]);
}

/**
 * The best plan, weighed again when the mine changed, when the pocket now
 * covers the last best (so he buys what is best then), or after
 * `WEIGH_AGAIN_CALLS` calls on the same mine.
 */
function bestLevelsPlan(
  mountain: Mountain,
  habits: FreshHabits,
  hoardK: number,
): Weighed | undefined {
  const key = mineKey(mountain, habits, hoardK);
  const kept = lastWeighed;
  if (
    kept !== undefined &&
    kept.key === key &&
    kept.factors === activeFactors() &&
    kept.calls < WEIGH_AGAIN_CALLS &&
    (kept.best === undefined || !coversPrice(mountain, kept.best.price, hoardK))
  ) {
    kept.calls += 1;
    return kept.best;
  }
  const best = weighBest(mountain, habits);
  lastWeighed = { key, factors: activeFactors(), best, calls: 0 };
  return best;
}

/**
 * Seconds sooner the building is up if he buys it out of the pocket, or 0
 * when that is less than the mine takes to make its price: with what it
 * costs added to the pocket, buying it must beat keeping the stones for the
 * order.
 */
function savedSeconds(mountain: Mountain, priced: Priced): number {
  const rich = {
    ...mountain,
    stock: {
      ...mountain.stock,
      stones: mountain.stock.stones + priced.cost,
    },
  };
  const stone = goodsIncome(rich).stones ?? 0;
  const after = applied(rich, priced.plan);
  const saved = buildingSeconds(rich) - buildingSeconds(after);
  return saved > FRESH_DUST && saved * stone >= priced.cost ? saved : 0;
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
