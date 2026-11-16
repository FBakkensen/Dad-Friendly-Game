import { activeFactors } from "../economy/factors";
import { stillRequired } from "../city";
import { tierLocked } from "../crew";
import type { Action } from "../economy/actions";
import { STAGES, narrowStage, type Stage } from "../line";
import {
  LEVEL_MACHINE_IDS,
  MINE_LEVEL_IDS,
  graniteOpen,
  openGranite,
  type LevelMachineId,
  type MineLevelId,
} from "../mine-levels";
import type { LevelRates } from "../mine-piles";
import type { Mountain } from "../mountain";
import { makerRate, makerTakes } from "../makers";
import type { GoodId } from "../stock";
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
 * How a fresh dad plays the levels of part 3 (slice 1, Lab, rules 5.1 to
 * 5.8, #675): the shaft he saves for, the raises he weighs on each level,
 * the hoists he assigns, and where he puts the workers of drilling and
 * haulage, by his level habit (`FreshHabits.levels`). Nothing here buys:
 * `fresh-dad` weighs these plans with the rest and spends.
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

/** The goods a building still to build requires that a maker makes: brick (a kiln) and cut stone (a saw). */
export function makersWanted(mountain: Mountain): readonly ("kiln" | "saw")[] {
  const goods = goodsAhead(mountain);
  return [
    ...(goods.has("brick") ? (["kiln"] as const) : []),
    ...(goods.has("cutStone") && graniteOpen(mountain)
      ? (["saw"] as const)
      : []),
  ];
}

/** The levels open: the Topsoil, and the Granite once the shaft is sunk. */
function openLevels(mountain: Mountain): readonly MineLevelId[] {
  return graniteOpen(mountain) ? MINE_LEVEL_IDS : ["topsoil"];
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

/** The level the whole-workforce dad works: the Granite once every level worker is there. */
function workedLevel(mountain: Mountain): MineLevelId {
  return graniteOpen(mountain) &&
    levelWorkers(mountain, "granite") > 0 &&
    levelWorkers(mountain, "topsoil") === 0
    ? "granite"
    : "topsoil";
}

/** The levels he builds on: every open one, or the one the whole-workforce dad works. */
export function buildLevels(
  mountain: Mountain,
  habits: FreshHabits,
): readonly MineLevelId[] {
  return habits.levels === "whole" && graniteOpen(mountain)
    ? [workedLevel(mountain)]
    : openLevels(mountain);
}

/** The job of a stage on a level: hoisting is the shaft's, for both. */
function jobAt(level: MineLevelId, stage: Stage): JobId {
  return stage === "lift" ? STAGE_JOB.lift : LEVEL_JOBS[level][stage];
}

function isLevelMachine(id: Tier["id"]): id is LevelMachineId {
  return (LEVEL_MACHINE_IDS as readonly string[]).includes(id);
}

/** The machine bought for a level: on the Topsoil as before, on the Granite with its own move. */
function machineMove(tier: Tier, level: MineLevelId): Action {
  return level === "granite" && isLevelMachine(tier.id)
    ? { kind: "buyGraniteMachine", id: tier.id, count: 1 }
    : { kind: "buyTier", id: tier.id };
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
    for (let hire = 0; hire < machineStaff(tier); hire += 1) {
      plan.push(...hireOnto(job));
    }
    buys.push(plan);
    if (stage === "lift" && assigns(mountain, habits)) {
      buys.push([...plan, { kind: "assignHoist", level, count: 1 }]);
    }
  }
  return buys;
}

/** The dad who assigns hoists: by need, with two levels open. */
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
function levelRaise(
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

/**
 * A maker's plan, with a raise for the level its rock comes from while that
 * level moves nothing and he builds there (ruling 7): a saw on a Granite
 * nobody works makes no cut stone, and no Granite raise brings the building
 * sooner without a saw, so the two are weighed together.
 */
export function makerWithLevel(
  mountain: Mountain,
  habits: FreshHabits,
  id: "kiln" | "saw",
  plan: Plan,
): Plan {
  const level: MineLevelId = id === "saw" ? "granite" : "topsoil";
  if (
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
  Partial<Record<GoodId, { level: MineLevelId; maker: "kiln" | "saw" }>>
> = {
  brick: { level: "topsoil", maker: "kiln" },
  cutStone: { level: "granite", maker: "saw" },
};

/**
 * The maker of a good the order waits for, while the makers take less rock
 * than its level lifts, else that level's raise (ruling 7): stone is the
 * Topsoil's raise. When the makers take just what the level lifts, more
 * rock only makes stone and another maker has no rock, so the two go
 * together. None when he does not build on that level.
 */
export function goodRaise(
  mountain: Mountain,
  habits: FreshHabits,
  good: GoodId,
  makerPlan: (id: "kiln" | "saw") => Plan,
): Plan | undefined {
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
  for (const level of MINE_LEVEL_IDS) {
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
 * factor map it looked with.
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
    mountain.granite.kind === "sunk" ? mountain.granite.machines : 0,
    mountain.upgrades,
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

/** Every worker of a level's drilling and haulage moved to the other level. */
function wholeMove(mountain: Mountain, from: MineLevelId): Plan {
  const to: MineLevelId = from === "topsoil" ? "granite" : "topsoil";
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
const LEVEL_GOOD: Readonly<Record<MineLevelId, GoodId>> = {
  topsoil: "brick",
  granite: "cutStone",
};

/** What the step in hand still requires of a level's good beyond what the stockyard holds. */
function levelShortfall(mountain: Mountain, level: MineLevelId): number {
  const project = mountain.project;
  if (project.kind === "unordered") {
    return 0;
  }
  const good = LEVEL_GOOD[level];
  return Math.max(0, stillRequired(project.site)[good] - mountain.stock[good]);
}

/**
 * The whole-workforce dad's move (ruling 8): every worker on drilling and
 * haulage to the other level, once the step in hand is short of the other
 * level's good by `WHOLE_MOVE_MARGIN` times what it is short of his, and
 * he could buy its maker there; or at once when he cannot buy his level's.
 */
function wholeMoves(mountain: Mountain): Plan {
  const from = workedLevel(mountain);
  const to: MineLevelId = from === "topsoil" ? "granite" : "topsoil";
  if (levelWorkers(mountain, from) === 0) {
    return [];
  }
  const both = from === "topsoil" && levelWorkers(mountain, "granite") > 0;
  if (both) {
    // A hire placed on the Granite by need joins the level he works.
    return wholeMove(mountain, "granite");
  }
  const move = wholeMove(mountain, from);
  if (makerStranded(mountain, from)) {
    return move;
  }
  const short = levelShortfall(mountain, to);
  return short > 0 &&
    short > WHOLE_MOVE_MARGIN * levelShortfall(mountain, from) &&
    !makerStranded(applied(mountain, move), to)
    ? move
    : [];
}

/**
 * The maker of the level he works cannot be bought: its price is a good
 * the pocket lacks and the level that makes it has nobody on it (a saw's
 * brick with nobody on the Topsoil, the dead end the spec names). He goes
 * where it is made.
 */
function makerStranded(mountain: Mountain, level: MineLevelId): boolean {
  const maker = MAKING[LEVEL_GOOD[level]]?.maker;
  if (maker === undefined) {
    return false;
  }
  return planPrice(mountain, [{ kind: "buyMaker", id: maker }]).some((line) => {
    const making = MAKING[line.good];
    return (
      mountain.stock[line.good] < line.amount &&
      making !== undefined &&
      levelWorkers(mountain, making.level) === 0
    );
  });
}

/** The even dad splits once: half of each of the Topsoil's drilling and haulage to the Granite, while the Granite is untouched. */
function evenMoves(mountain: Mountain): Plan {
  const granite = openGranite(mountain);
  if (
    granite === undefined ||
    levelWorkers(mountain, "granite") > 0 ||
    LEVEL_MACHINE_IDS.some((id) => granite.machines[id] > 0)
  ) {
    return [];
  }
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
