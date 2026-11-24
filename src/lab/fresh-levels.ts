import { activeFactors } from "../economy/factors";
import { stillRequired } from "../city";
import { tierLocked } from "../crew";
import type { Action } from "../economy/actions";
import { STAGES, narrowStage, type Stage } from "../line";
import {
  LEVEL_MACHINE_IDS,
  crystalOpen,
  graniteOpen,
  openDeeperLevel,
  openGranite,
  openLevels,
  type LevelMachineId,
  type MineLevelId,
} from "../mine-levels";
import type { LevelRates } from "../mine-piles";
import type { Mountain } from "../mountain";
import { slice2Part1On } from "../part-switch";
import {
  makerInputs,
  makerOpen,
  makerOutputAmount,
  makerPrice,
  makerRate,
  makerTakes,
  type MakerId,
} from "../makers";
import { priceAmount, type GoodId } from "../stock";
import { TIERS, machineStaff, tierInPlay, type Tier } from "../tiers";
import { unassignedHoists } from "../cages";
import {
  JOB_IDS,
  LEVEL_JOBS,
  STAGE_JOB,
  freeWorkers,
  jobOpen,
  type JobId,
} from "../workforce";
import {
  applied,
  buildingSeconds,
  earnSeconds,
  raiseChain,
  goodsAhead,
  levelsRates,
  planPrice,
  type Plan,
} from "./fresh-kit";
import type { FreshHabits } from "./policy";
import {
  EVEN_SPLIT,
  FRESH_DUST,
  RAISE_STEPS,
  SOONER_SHARE,
  WEIGH_AGAIN_CALLS,
  WHOLE_MOVE_MARGIN,
} from "./targets";

/**
 * How a fresh dad plays the levels of part 3 and Slice 2 Part 2 (slice 1,
 * Lab, rules 5.1 to 5.8, #675, #772): the shaft he saves for, the raises he
 * weighs on each level, the hoists he assigns, and where he puts the workers
 * of drilling and haulage, by his level habit (`FreshHabits.levels`). Nothing
 * here buys: `fresh-dad` weighs these plans with the rest and spends.
 */

/**
 * The next building requires a good no open level makes: cut stone before
 * the shaft (ruling 3). He does not order it yet, and saves for the shaft.
 */
export function waitsForShaft(mountain: Mountain): boolean {
  return (
    mountain.project.kind === "unordered" &&
    !graniteOpen(mountain) &&
    goodsAhead(mountain).has("cutStone")
  );
}

/** The makers a building still to build needs, directly or as Factory inputs. */
export function makersWanted(mountain: Mountain): readonly MakerId[] {
  const goods = goodsAhead(mountain);
  const needParts = goods.has("parts");
  const needGlass = goods.has("glass") || needParts;
  return [
    ...(goods.has("brick") || needParts ? (["kiln"] as const) : []),
    ...((goods.has("cutStone") || needParts) && graniteOpen(mountain)
      ? (["saw"] as const)
      : []),
    ...(needGlass && makerOpen(mountain, "glassworks")
      ? (["glassworks"] as const)
      : []),
    ...(needParts && makerOpen(mountain, "partsPress")
      ? (["partsPress"] as const)
      : []),
    ...(needParts && makerOpen(mountain, "precisionAssembly")
      ? (["precisionAssembly"] as const)
      : []),
  ];
}

/** The level stages' jobs: drilling and haulage on a level. */
const LEVEL_STAGES = ["face", "haul"] as const;

type LevelStage = (typeof LEVEL_STAGES)[number];

/** Workers on a level's drilling and haulage. */
function levelWorkers(mountain: Mountain, level: MineLevelId): number {
  return (
    mountain.jobs[LEVEL_JOBS[level].face] +
    mountain.jobs[LEVEL_JOBS[level].haul]
  );
}

/** The level the whole-workforce dad works: the open level holding the most level workers, else Topsoil. */
function workedLevel(mountain: Mountain): MineLevelId {
  let best: MineLevelId = "topsoil";
  let bestCount = levelWorkers(mountain, "topsoil");
  for (const level of openLevels(mountain)) {
    const count = levelWorkers(mountain, level);
    if (count > bestCount) {
      best = level;
      bestCount = count;
    }
  }
  return best;
}

/** The levels he builds on: every open one, or the one the whole-workforce dad works. */
function buildLevels(
  mountain: Mountain,
  habits: FreshHabits,
): readonly MineLevelId[] {
  return habits.levels === "whole" && graniteOpen(mountain)
    ? [workedLevel(mountain)]
    : openLevels(mountain);
}

/** Whether this dad builds machines and workers on `level` right now. */
export function buildsOnLevel(
  mountain: Mountain,
  habits: FreshHabits,
  level: MineLevelId,
): boolean {
  return buildLevels(mountain, habits).includes(level);
}

/** The job of a stage on a level: hoisting is the shaft's, for all levels. */
function jobAt(level: MineLevelId, stage: Stage): JobId {
  return stage === "lift" ? STAGE_JOB.lift : LEVEL_JOBS[level][stage];
}

function isLevelMachine(id: Tier["id"]): id is LevelMachineId {
  return (LEVEL_MACHINE_IDS as readonly string[]).includes(id);
}

/** The machine bought for a level: on the Topsoil as before, on deeper levels with its own move. */
function machineMove(tier: Tier, level: MineLevelId): Action {
  if (level !== "topsoil" && isLevelMachine(tier.id)) {
    return level === "granite"
      ? { kind: "buyGraniteMachine", id: tier.id, count: 1 }
      : { kind: "buyGraniteMachine", id: tier.id, count: 1, level };
  }
  return { kind: "buyTier", id: tier.id };
}

/** One hire, onto `job`. */
function hireOnto(job: JobId): Plan {
  return [
    { kind: "buyTier", id: "helper" },
    { kind: "placeWorker", job, count: 1 },
  ];
}

/** What a stage of a level can buy: a worker with a tool, or a machine with the workers it takes (and, for the dad who assigns, a hoist on that level). */
function stageBuys(
  mountain: Mountain,
  level: MineLevelId,
  stage: Stage,
  habits: FreshHabits,
): readonly Plan[] {
  const job = jobAt(level, stage);
  const buys: Plan[] = [hireOnto(job)];
  for (const tier of TIERS) {
    if (
      tier.stage !== stage ||
      !tierInPlay(tier) ||
      tierLocked(mountain, tier)
    ) {
      continue;
    }
    const plan: Action[] = [machineMove(tier, level)];
    const staff = machineStaff(tier);
    if (slice2Part1On() && staff > 1 && mountain.jobs[job] >= staff) {
      buys.push(plan);
    }
    const hired: Action[] = [...plan];
    for (let hire = 0; hire < staff; hire += 1) {
      hired.push(...hireOnto(job));
    }
    buys.push(hired);
    if (stage === "lift" && assigns(mountain, habits)) {
      buys.push([...hired, { kind: "assignHoist", level, count: 1 }]);
    }
  }
  return buys;
}

/** The dad who assigns hoists: by need, with two or more levels open. */
function assigns(mountain: Mountain, habits: FreshHabits): boolean {
  return habits.levels === "need" && graniteOpen(mountain);
}

/** A level's line: its slowest stage. */
function lineOf(rates: LevelRates): number {
  return Math.min(rates.face, rates.haul, rates.lift);
}

/**
 * The cheapest way to raise a level's line (ruling 7, `raiseChain`): its
 * slowest stage's best buy for the income it costs, then the next slowest,
 * until the level moves more. None when no buy raises it.
 */
export function levelRaise(
  mountain: Mountain,
  level: MineLevelId,
  habits: FreshHabits,
): Plan | undefined {
  return raiseChain(
    mountain,
    (state) => {
      const rates = levelsRates(state)[level];
      return { line: lineOf(rates), stages: rates };
    },
    (state, stage) =>
      stageBuys(state, level, stage, habits).map((plan) => ({
        plan,
        cost: earnSeconds(mountain, planPrice(state, plan)),
      })),
  )?.plan;
}

/** The mine level whose rock feeds a refinery maker, if any. */
const MAKER_LEVEL: Readonly<Partial<Record<MakerId, MineLevelId>>> = {
  kiln: "topsoil",
  saw: "granite",
  glassworks: "crystal",
};

/**
 * A maker's plan, with a raise for the level its rock comes from while that
 * level moves nothing and he builds there (ruling 7): a saw on a Granite
 * nobody works makes no cut stone, and a glassworks on an idle Crystal Caves
 * makes no glass, so the two are weighed together.
 */
export function makerWithLevel(
  mountain: Mountain,
  habits: FreshHabits,
  id: MakerId,
  plan: Plan,
): Plan {
  const level = MAKER_LEVEL[id];
  if (
    level === undefined ||
    lineOf(levelsRates(mountain)[level]) > FRESH_DUST ||
    !buildLevels(mountain, habits).includes(level)
  ) {
    return plan;
  }
  const raise = levelRaise(mountain, level, habits);
  return raise === undefined ? plan : [...plan, ...raise];
}

/** The level whose rock makes a good, and the maker that makes it. */
const MAKING: Readonly<
  Partial<Record<GoodId, { level: MineLevelId; maker: MakerId }>>
> = {
  brick: { level: "topsoil", maker: "kiln" },
  cutStone: { level: "granite", maker: "saw" },
  glass: { level: "crystal", maker: "glassworks" },
};

/**
 * The maker of a good the order waits for, while the makers take less rock
 * than its level lifts, else that level's raise (ruling 7): stone is the
 * Topsoil's raise; parts picks Precision Assembly once Glassworks runs (or
 * its glass supply when short), else Parts Press.
 */
export function goodRaise(
  mountain: Mountain,
  habits: FreshHabits,
  good: GoodId,
  makerPlan: (id: MakerId) => Plan,
): Plan | undefined {
  if (good === "parts") {
    return partsRaise(mountain, habits, makerPlan);
  }
  const making = MAKING[good];
  const level = making?.level ?? "topsoil";
  const raise = buildLevels(mountain, habits).includes(level)
    ? levelRaise(mountain, level, habits)
    : undefined;
  if (making === undefined) {
    return raise;
  }
  const rock = lineOf(levelsRates(mountain)[level]);
  const takes = makerRate(mountain, making.maker) * makerTakes(making.maker);
  // A level that lifts nothing gets its raise with the maker (`makerWithLevel`).
  if (takes < rock - FRESH_DUST || rock <= FRESH_DUST) {
    return makerPlan(making.maker);
  }
  if (raise === undefined || takes > rock + FRESH_DUST) {
    return raise;
  }
  return [...makerPlan(making.maker), ...raise];
}

/** Parts fix: Precision Assembly once glass flows (or more glass when Precision Assembly starves), else Parts Press. */
function partsRaise(
  mountain: Mountain,
  habits: FreshHabits,
  makerPlan: (id: MakerId) => Plan,
): Plan | undefined {
  if (
    makerOpen(mountain, "precisionAssembly") &&
    mountain.makers.glassworks > 0
  ) {
    const glassPerPart =
      (makerInputs("precisionAssembly").find((spec) => spec.id === "glass")
        ?.amount ?? 0) / makerOutputAmount("precisionAssembly");
    const precNeedsGlass =
      makerRate(mountain, "precisionAssembly") * glassPerPart;
    const glassMade = Math.min(
      makerRate(mountain, "glassworks"),
      lineOf(levelsRates(mountain).crystal) / makerTakes("glassworks"),
    );
    if (
      mountain.makers.precisionAssembly > 0 &&
      precNeedsGlass >= glassMade - FRESH_DUST
    ) {
      return goodRaise(mountain, habits, "glass", makerPlan);
    }
    return makerPlan("precisionAssembly");
  }
  return makerOpen(mountain, "partsPress")
    ? makerPlan("partsPress")
    : undefined;
}

/** A raise for each level he builds on (ruling 7). */
export function levelRaises(
  mountain: Mountain,
  habits: FreshHabits,
): readonly Plan[] {
  return buildLevels(mountain, habits).flatMap((level) => {
    const raise = levelRaise(mountain, level, habits);
    return raise === undefined ? [] : [raise];
  });
}

/** The building is up this much sooner after a free plan: strictly, so no two moves undo each other. */
function sooner(mountain: Mountain, plan: Plan): number {
  const before = buildingSeconds(mountain);
  const after = buildingSeconds(applied(mountain, plan));
  if (before === Infinity) {
    return after === Infinity ? 0 : Infinity;
  }
  return before - after > before * SOONER_SHARE ? before - after : 0;
}

/** One worker moved from one job to another. */
function shift(from: JobId, to: JobId): Plan {
  return [
    { kind: "freeWorker", job: from, count: 1 },
    { kind: "placeWorker", job: to, count: 1 },
  ];
}

/**
 * The level stages with a worker to spare: one off still leaves the stage
 * moving at least its level's line (ruling 8).
 */
function spareStages(
  mountain: Mountain,
): readonly { level: MineLevelId; stage: LevelStage }[] {
  const rates = levelsRates(mountain);
  return openLevels(mountain).flatMap((level) =>
    LEVEL_STAGES.filter((stage) => {
      const job = LEVEL_JOBS[level][stage];
      if (mountain.jobs[job] === 0) {
        return false;
      }
      const after = levelsRates(
        applied(mountain, [{ kind: "freeWorker", job, count: 1 }]),
      )[level];
      return after[stage] >= lineOf(rates[level]) - FRESH_DUST;
    }).map((stage) => ({ level, stage })),
  );
}

/**
 * Workers moved one at a time from the level stages with one to spare to
 * the other level's slowest stage, until its line moves more (ruling 8): a
 * level's two stages often have to grow together.
 */
function levelShift(mountain: Mountain, to: MineLevelId): Plan | undefined {
  let state = mountain;
  const start = lineOf(levelsRates(mountain)[to]);
  const plan: Action[] = [];
  for (let step = 0; step < RAISE_STEPS; step += 1) {
    const source = spareStages(state).find((spare) => spare.level !== to);
    const stage = narrowStage(levelsRates(state)[to]);
    if (source === undefined || stage === "lift") {
      return undefined;
    }
    const move = shift(
      LEVEL_JOBS[source.level][source.stage],
      LEVEL_JOBS[to][stage],
    );
    plan.push(...move);
    state = applied(state, move);
    if (lineOf(levelsRates(state)[to]) > start + FRESH_DUST) {
      return plan;
    }
  }
  return undefined;
}

/** The open jobs a spare worker may go to: every job he could be placed on. */
function openJobs(mountain: Mountain): readonly JobId[] {
  return JOB_IDS.filter((job) => jobOpen(mountain, job));
}

/**
 * The need dad's free moves (ruling 8): a hoist onto a level or off it, a
 * worker a level stage can spare to any other job, or spare workers to the
 * other level until its line moves more, whichever brings the building
 * soonest, when one does.
 */
function needMoves(mountain: Mountain): Plan {
  let best: { plan: Plan; saved: number } | undefined;
  for (const plan of [...hoistMoves(mountain), ...spareMoves(mountain)]) {
    const saved = sooner(mountain, plan);
    if (saved > 0 && (best === undefined || saved > best.saved)) {
      best = { plan, saved };
    }
  }
  return best?.plan ?? [];
}

/** A hoist onto a level or off it, and spare workers to each level until its line moves more. */
function hoistMoves(mountain: Mountain): readonly Plan[] {
  const plans: Plan[] = [];
  const free = unassignedHoists(mountain) > 0;
  for (const level of openLevels(mountain)) {
    if (free) {
      plans.push([{ kind: "assignHoist", level, count: 1 }]);
    }
    if (mountain.cages.assigned[level] > 0) {
      plans.push([{ kind: "unassignHoist", level, count: 1 }]);
    }
    const chain = levelShift(mountain, level);
    if (chain !== undefined) {
      plans.push(chain);
    }
  }
  return plans;
}

/** One worker a level stage can spare, to any other open job. */
function spareMoves(mountain: Mountain): readonly Plan[] {
  const jobs = openJobs(mountain);
  return spareStages(mountain).flatMap((spare) => {
    const from = LEVEL_JOBS[spare.level][spare.stage];
    return jobs.filter((to) => to !== from).map((to) => shift(from, to));
  });
}

/**
 * The need dad's last weighing that found no move, and on which mine: he
 * does not look again each second while nothing changes (#675), under the
 * factor map it looked with. The pocket is left out of the key on purpose:
 * it fills every second, so a move the pocket makes sooner waits at most
 * `WEIGH_AGAIN_CALLS` calls (ruling 13).
 */
let stillMine:
  | {
      readonly key: string;
      readonly factors: ReturnType<typeof activeFactors>;
      calls: number;
    }
  | undefined;

/** The need dad's moves, looked for again only when the mine changed or after `WEIGH_AGAIN_CALLS` calls. */
function needMovesKept(mountain: Mountain): Plan {
  const key = JSON.stringify([
    mountain.owned,
    mountain.jobs,
    mountain.makers,
    mountain.fleet,
    mountain.cages.assigned,
    mountain.mineLevels.granite?.machines ?? 0,
    mountain.mineLevels.crystal?.machines ?? 0,
    mountain.upgrades,
    mountain.research.done,
    mountain.operational,
    mountain.project.kind,
    mountain.project.kind === "unordered" ? 0 : mountain.project.site.step,
  ]);
  if (
    stillMine?.key === key &&
    stillMine.factors === activeFactors() &&
    stillMine.calls < WEIGH_AGAIN_CALLS
  ) {
    stillMine.calls += 1;
    return [];
  }
  const plan = needMoves(mountain);
  stillMine =
    plan.length === 0 ? { key, factors: activeFactors(), calls: 0 } : undefined;
  return plan;
}

/** Every worker of a level's drilling and haulage moved to `to`. */
function wholeMove(
  mountain: Mountain,
  from: MineLevelId,
  to: MineLevelId,
): Plan {
  return LEVEL_STAGES.flatMap((stage): Action[] => {
    const count = mountain.jobs[LEVEL_JOBS[from][stage]];
    return count > 0
      ? [
          { kind: "freeWorker", job: LEVEL_JOBS[from][stage], count },
          { kind: "placeWorker", job: LEVEL_JOBS[to][stage], count },
        ]
      : [];
  });
}

/** The good a level's maker makes. */
const LEVEL_GOOD: Readonly<Partial<Record<MineLevelId, GoodId>>> = {
  topsoil: "brick",
  granite: "cutStone",
  crystal: "glass",
};

function partsInputPerPart(
  mountain: Mountain,
  input: "brick" | "cutStone" | "glass",
): number {
  const line: MakerId =
    mountain.makers.precisionAssembly > 0 ? "precisionAssembly" : "partsPress";
  if (mountain.makers[line] === 0) {
    return 0;
  }
  const amount =
    makerInputs(line).find((spec) => spec.id === input)?.amount ?? 0;
  return amount / makerOutputAmount(line);
}

/** What the step in hand still requires of a level's good beyond what the stockyard holds, including indirect Factory demand for Parts. */
function levelShortfall(mountain: Mountain, level: MineLevelId): number {
  const project = mountain.project;
  if (project.kind === "unordered") {
    return 0;
  }
  const good = LEVEL_GOOD[level];
  if (good === undefined) {
    return 0;
  }
  const need = stillRequired(project.site);
  const direct = Math.max(0, need[good] - mountain.stock[good]);
  const partsLeft = Math.max(0, need.parts - mountain.stock.parts);
  if (partsLeft <= 0) {
    return direct;
  }
  if (level === "crystal") {
    if (!crystalOpen(mountain)) {
      return direct;
    }
    if (mountain.makers.precisionAssembly > 0) {
      const glassNeed = partsLeft * partsInputPerPart(mountain, "glass");
      return direct + Math.max(0, glassNeed - mountain.stock.glass);
    }
    if (mountain.makers.glassworks > 0) {
      const precGlass = priceAmount(
        makerPrice(mountain, "precisionAssembly"),
        "glass",
      );
      return direct + Math.max(0, precGlass - mountain.stock.glass);
    }
    return direct;
  }
  const factoryInput = good === "brick" ? "brick" : "cutStone";
  const indirectNeed = partsLeft * partsInputPerPart(mountain, factoryInput);
  return Math.max(0, need[good] + indirectNeed - mountain.stock[good]);
}

/**
 * The whole-workforce dad's move (ruling 8): every worker on drilling and
 * haulage to another open level, once the step in hand is short of its good
 * by `WHOLE_MOVE_MARGIN` times what it is short of his, and he could buy its
 * maker there; or at once when he cannot buy his level's.
 */
function wholeMoves(mountain: Mountain): Plan {
  const from = workedLevel(mountain);
  if (levelWorkers(mountain, from) === 0) {
    return [];
  }
  const open = openLevels(mountain);
  for (const other of open) {
    if (other !== from && levelWorkers(mountain, other) > 0) {
      // A hire placed on another level by need joins the level he works.
      return wholeMove(mountain, other, from);
    }
  }
  const strandedTarget = strandedMakerSource(mountain, from);
  if (strandedTarget !== undefined) {
    return wholeMove(mountain, from, strandedTarget);
  }
  const fromShort = levelShortfall(mountain, from);
  let best: { to: MineLevelId; short: number; move: Plan } | undefined;
  for (const to of open) {
    if (to === from) {
      continue;
    }
    const short = levelShortfall(mountain, to);
    if (short <= 0 || short <= WHOLE_MOVE_MARGIN * fromShort) {
      continue;
    }
    const move = wholeMove(mountain, from, to);
    if (
      strandedMakerSource(applied(mountain, move), to) === undefined &&
      (best === undefined || short > best.short)
    ) {
      best = { to, short, move };
    }
  }
  return best?.move ?? [];
}

/**
 * The level producing a missing good for `level`'s maker when nobody works it
 * (e.g. a saw's brick with nobody on Topsoil, or a glassworks's brick/cutStone),
 * else undefined.
 */
function strandedMakerSource(
  mountain: Mountain,
  level: MineLevelId,
): MineLevelId | undefined {
  const good = LEVEL_GOOD[level];
  const maker = good === undefined ? undefined : MAKING[good]?.maker;
  if (maker === undefined) {
    return undefined;
  }
  for (const line of planPrice(mountain, [{ kind: "buyMaker", id: maker }])) {
    const making = MAKING[line.good];
    if (
      mountain.stock[line.good] < line.amount &&
      making !== undefined &&
      making.level !== level &&
      levelWorkers(mountain, making.level) === 0
    ) {
      return making.level;
    }
  }
  return undefined;
}

/** The even dad splits once when each deeper level opens: half from Topsoil to Granite, then an equal share from earlier open levels to Crystal. */
function evenMoves(mountain: Mountain): Plan {
  const granite = openGranite(mountain);
  if (
    granite !== undefined &&
    levelWorkers(mountain, "granite") === 0 &&
    !LEVEL_MACHINE_IDS.some((id) => granite.machines[id] > 0)
  ) {
    return LEVEL_STAGES.flatMap((stage): Action[] => {
      const count = Math.floor(
        mountain.jobs[LEVEL_JOBS.topsoil[stage]] / EVEN_SPLIT,
      );
      return count > 0
        ? [
            { kind: "freeWorker", job: LEVEL_JOBS.topsoil[stage], count },
            { kind: "placeWorker", job: LEVEL_JOBS.granite[stage], count },
          ]
        : [];
    });
  }
  const crystal = openDeeperLevel(mountain, "crystal");
  if (
    crystal === undefined ||
    levelWorkers(mountain, "crystal") > 0 ||
    LEVEL_MACHINE_IDS.some((id) => crystal.machines[id] > 0)
  ) {
    return [];
  }
  const open = openLevels(mountain);
  const share = open.length;
  return open
    .filter((source) => source !== "crystal")
    .flatMap((source) =>
      LEVEL_STAGES.flatMap((stage): Action[] => {
        const count = Math.floor(
          mountain.jobs[LEVEL_JOBS[source][stage]] / share,
        );
        return count > 0
          ? [
              { kind: "freeWorker", job: LEVEL_JOBS[source][stage], count },
              { kind: "placeWorker", job: LEVEL_JOBS.crystal[stage], count },
            ]
          : [];
      }),
    );
}

/** The free moves of his level habit, once the Granite is open; none before. */
export function levelMoves(mountain: Mountain, habits: FreshHabits): Plan {
  if (!graniteOpen(mountain) || mountain.project.kind === "unordered") {
    return [];
  }
  switch (habits.levels) {
    case "need":
      return needMovesKept(mountain);
    case "even":
      return evenMoves(mountain);
    case "whole":
      return wholeMoves(mountain);
  }
}

/**
 * Where a free worker goes in the mine with the Granite open: the job on a
 * level he builds on, or hoisting, that brings the building soonest; the
 * Topsoil's drilling when none does.
 */
export function levelPlace(mountain: Mountain, habits: FreshHabits): Plan {
  let best: { plan: Plan; saved: number } | undefined;
  for (const level of buildLevels(mountain, habits)) {
    for (const stage of STAGES) {
      const plan: Plan = [
        { kind: "placeWorker", job: jobAt(level, stage), count: 1 },
      ];
      const saved = sooner(mountain, plan);
      if (best === undefined || saved > best.saved) {
        best = { plan, saved };
      }
    }
  }
  return freeWorkers(mountain) > 0 && best !== undefined ? best.plan : [];
}
