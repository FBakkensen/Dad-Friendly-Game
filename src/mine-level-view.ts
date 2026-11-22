import {
  cageAt,
  cageRates,
  legSeconds,
  unassignedHoists,
  type Cage,
  type ShaftCage,
} from "./cages";
import { formatCompact } from "./format";
import {
  levelSunk,
  openGranite,
  openLevels,
  shaftOpen,
  shaftPrice,
  type LevelMachineId,
  type MineLevelId,
  type SunkLevel,
} from "./mine-levels";
import {
  mineLevelFlows,
  mineTurnPerLoad,
  mineWork,
  pitheadRoom,
} from "./mine-piles";
import {
  LEVEL_NAMES,
  STAGE_NAMES,
  levelPile,
  levelScene,
  printedParts,
  rowParts,
  stageRow,
  stageRows,
  timed,
  type LevelScene,
  type RowPart,
  type RowPile,
  type StageRow,
} from "./mine-view";
import type { Mountain } from "./mountain";
import { partThreeOn, slice2Part1On } from "./part-switch";
import { crewTimer, effectiveRates } from "./rates";
import { MACHINE_WORDS, plural } from "./screen-words";
import { canPay, type GoodId } from "./stock";
import type { TierId } from "./tiers";
import {
  LEVEL_JOBS,
  STAGE_JOB,
  freeWorkers,
  lineWork,
  stageMachines,
  toolSpeed,
  type LevelStage,
} from "./workforce";

/**
 * The mine with two levels (#680; spec, The mine, With two levels): each
 * level's drilling and haulage rows and piles, Hoisting's row for the one
 * shaft, the strip that says which level each hoist serves, and the shaft's
 * gate before it is sunk. Pure: it reads the mountain and never writes it.
 * The rows are `StageRow`s, built as the one-level rows are (`stageRow`).
 * Nothing here names a limit, the bottleneck or which level a hoist should
 * serve.
 */

/** The strip's third cell: the hoists no level has. */
export const BOTH_IN_TURN = "Both in turn";

/**
 * The strip's one line, on a tap that moves nothing (ruling 10, Flemming's
 * to approve before the merge).
 */
export const HOIST_WAITS_LINE =
  "A hoist for one level waits there for a whole load, or until no more rock is coming. A hoist for both takes what is there and goes on to the other.";

/** The Granite's plate before the shaft (ruling 7). */
export const GRANITE_NOT_REACHED = "Granite · not reached";

/** The shaft's gate before the Light Tower (ruling 7). */
export const SHAFT_WAITS_LINE =
  "The shaft can be sunk once the Light Tower is operational.";

/** The Sink key, and its small line (the prototype's). */
export const SINK_KEY = "Sink the shaft to the Granite";
export const SINK_LINE = "A second level. Opens saws and locomotives.";

/** The machine card (ruling 5): it asks which level a machine is for. */
export const MACHINE_CARD_STAYS = "It stays on the level it is bought for.";
export const NOT_NOW = "Not now";

/** "A drill for which level?" */
export function machineCardTitle(id: LevelMachineId): string {
  return `A ${MACHINE_WORDS[id][0]} for which level?`;
}

/** "Topsoil: 2 drills": what a level has of a kind. */
export function levelHasLine(
  level: MineLevelId,
  id: LevelMachineId,
  count: number,
): string {
  return `${LEVEL_NAMES[level]}: ${String(count)} ${plural(count, MACHINE_WORDS[id])}`;
}

/** "Topsoil drilling", "Granite haulage": a level's row where it is said in words, and the title of the list it opens. */
export function levelStageTitle(level: MineLevelId, stage: LevelStage): string {
  return `${LEVEL_NAMES[level]} ${STAGE_NAMES[stage].toLowerCase()}`;
}

/** A level on the mine: its drilling and haulage rows, and the piles under its gallery. */
export type MineLevel = {
  readonly level: MineLevelId;
  readonly name: "Topsoil" | "Granite" | "Crystal Caves";
  /** Drilling, then haulage. */
  readonly rows: readonly [StageRow, StageRow];
  readonly piles: { readonly face: RowPile; readonly shaft: RowPile };
};

/**
 * What the running cages lift a second, counted as rates (rule 5.14): a
 * cage for one level its load each trip to that level; the cages for both
 * `perLoad` a second for each load: a load from each level in the turn once
 * a round of their trips (`mineTurnPerLoad`), as the night shares them out.
 */
function liftOf(cages: readonly ShaftCage[], perLoad: number): number {
  const { own, loads } = cageRates(cages);
  return own.topsoil + own.granite + own.crystal + loads * perLoad;
}

/** The workers a part has on tools: those who run the winch. */
function winchWorkers(part: RowPart): number {
  if (part.kind === "tools") {
    return part.count;
  }
  return part.kind === "stands" ? part.workers : 0;
}

/** The shaft's running cages and what a load for both lifts a second: one reading of the shaft a paint. */
type ShaftReading = {
  readonly running: readonly ShaftCage[];
  readonly perLoad: number;
};

/**
 * Hoisting's parts with two levels (ruling 3): the hoists' and engines'
 * kinds, each moving what its running cages lift as they are assigned, and
 * the winch's workers moving the winch's lift, all under the crew timer.
 * The counts read the cages' own clock (`mineWork`, with no `now`), so what
 * runs and what it lifts are one reading of the shaft; the speeds are the
 * paint's, as the keys read them.
 */
function hoistParts(
  mountain: Mountain,
  speed: Readonly<Record<TierId, number>>,
  timer: number,
  shaft: ShaftReading,
): RowPart[] {
  const parts = rowParts(
    stageMachines(mountain, speed, "lift"),
    mountain.jobs[STAGE_JOB.lift],
    toolSpeed(speed, "lift"),
  );
  const { running, perLoad } = shaft;
  const lift = (cages: readonly ShaftCage[]): number => liftOf(cages, perLoad);
  const winch = lift(running.filter((cage) => cage.key === "winch"));
  const onWinch = parts.reduce((sum, part) => sum + winchWorkers(part), 0);
  return parts.map((part) => {
    const moves =
      part.kind === "runs"
        ? lift(running.filter((cage) => cage.key.startsWith(`${part.id}:`)))
        : onWinch > 0
          ? (winch * winchWorkers(part)) / onWinch
          : 0;
    return timed({ ...part, moves }, timer);
  });
}

/** What the five stages of the mine with two levels are built from. */
type LevelsWork = {
  readonly speed: Readonly<Record<TierId, number>>;
  readonly timer: number;
  readonly shaft: ShaftReading;
  readonly hoisting: readonly RowPart[];
  readonly hoistCan: number;
  readonly cans: Readonly<Record<MineLevelId, Record<LevelStage, number>>>;
  readonly flows: ReturnType<typeof mineLevelFlows>;
  readonly strongest: number;
  readonly free: number;
};

function levelsWork(mountain: Mountain, now: number | undefined): LevelsWork {
  const speed = effectiveRates(mountain, now).tierSpeed;
  const timer = crewTimer();
  const { levels } = lineWork(mountain, speed);
  const shaft: ShaftReading = {
    running: mineWork(mountain).cages.filter((cage) => cage.runs),
    perLoad: mineTurnPerLoad(mountain),
  };
  const hoisting = hoistParts(mountain, speed, timer, shaft);
  const hoistCan = hoisting.reduce((sum, part) => sum + part.moves, 0);
  const cans = {
    topsoil: {
      face: levels.topsoil.face * timer,
      haul: levels.topsoil.haul * timer,
    },
    granite: {
      face: levels.granite.face * timer,
      haul: levels.granite.haul * timer,
    },
    crystal: {
      face: levels.crystal.face * timer,
      haul: levels.crystal.haul * timer,
    },
  };
  return {
    speed,
    timer,
    shaft,
    hoisting,
    hoistCan,
    cans,
    flows: mineLevelFlows(mountain),
    // The band's scale is the strongest of all open stages (ruling 2).
    strongest: Math.max(
      1,
      hoistCan,
      ...openLevels(mountain).flatMap((level) => [
        cans[level].face,
        cans[level].haul,
      ]),
    ),
    free: freeWorkers(mountain),
  };
}

/** A level's two piles: its drilled rock, and its rock at the shaft (`levelPile`, as the one-level rows have them). */
function levelPiles(
  mountain: Mountain,
  granite: SunkLevel,
  level: MineLevelId,
): MineLevel["piles"] {
  const held = level === "topsoil" ? mountain.piles : granite.piles;
  return {
    face: levelPile(mountain, "face", level, held.face),
    shaft: levelPile(mountain, "shaft", level, held.shaft),
  };
}

/** A level's drilling or haulage row: that level's workers on its own machines (ruling 2). */
function levelRow(
  mountain: Mountain,
  work: LevelsWork,
  place: { readonly level: MineLevelId; readonly stage: LevelStage },
  pile: RowPile,
): StageRow {
  const { level, stage } = place;
  const { speed, timer } = work;
  const job = LEVEL_JOBS[level][stage];
  const workers = mountain.jobs[job];
  return stageRow({
    stage,
    job,
    workers,
    parts: rowParts(
      stageMachines(mountain, speed, stage, level),
      workers,
      toolSpeed(speed, stage),
    ).map((part) => timed(part, timer)),
    can: work.cans[level][stage],
    moving: work.flows.levels[level][stage],
    strongest: work.strongest,
    free: work.free,
    pile,
  });
}

/** Each level's two rows, from the one reading of the mine a paint (`levelsWork`). */
function levelViews(
  mountain: Mountain,
  granite: SunkLevel,
  work: LevelsWork,
): readonly [MineLevel, MineLevel] {
  const view = (level: MineLevelId): MineLevel => {
    const piles = levelPiles(mountain, granite, level);
    return {
      level,
      name: LEVEL_NAMES[level],
      rows: [
        levelRow(mountain, work, { level, stage: "face" }, piles.face),
        levelRow(mountain, work, { level, stage: "haul" }, piles.shaft),
      ],
      piles,
    };
  };
  return [view("topsoil"), view("granite")];
}

/** Pithead readout for the two-level Hoisting row under Slice 2 Part 1 (#768). */
function shaftPitheadPile(mountain: Mountain): RowPile | undefined {
  if (!slice2Part1On()) {
    return undefined;
  }
  const holds = pitheadRoom(mountain);
  const topsoil = mountain.pithead.topsoil;
  const granite = mountain.pithead.granite;
  const tFull = topsoil >= holds;
  const gFull = granite >= holds;
  if (tFull && gFull) {
    return {
      label: "Both pitheads",
      held: holds,
      holds,
      full: true,
    };
  }
  if (tFull) {
    return { label: "Topsoil pithead", held: topsoil, holds, full: true };
  }
  if (gFull) {
    return { label: "Granite pithead", held: granite, holds, full: true };
  }
  const level: MineLevelId = granite > topsoil ? "granite" : "topsoil";
  return {
    label: `${LEVEL_NAMES[level]} pithead`,
    held: mountain.pithead[level],
    holds,
    full: false,
  };
}

/**
 * Hoisting's row with two levels (ruling 3): it can move what the running
 * cages lift as they are assigned, and moves now what the shared hoisting
 * lifts through the piles; its sum is the hoists' and engines' parts and the
 * winch's.
 */
function shaftRow(mountain: Mountain, work: LevelsWork): StageRow {
  return stageRow({
    stage: "lift",
    job: STAGE_JOB.lift,
    workers: mountain.jobs[STAGE_JOB.lift],
    parts: work.hoisting,
    can: work.hoistCan,
    moving: work.flows.lift,
    strongest: work.strongest,
    free: work.free,
    pile: shaftPitheadPile(mountain),
  });
}

/** One cell of the strip: a place the hoists serve, how many, and what they lift. */
export type StripCell = {
  readonly place: MineLevelId | "both";
  readonly name: string;
  readonly count: number;
  readonly unit: "hoist" | "hoists";
  /** What its running hoists lift a second, printed so the three add up. */
  readonly rate: string;
  readonly rateValue: number;
  readonly canLess: boolean;
  readonly canMore: boolean;
};

const STRIP_PLACES = ["topsoil", "granite", "both"] as const;

/**
 * The strip (ruling 4): the hoists assigned to each level and those for
 * both in turn, adding up to the hoists and engines he owns; and what the
 * running ones lift, adding up to Hoisting's row's hoists and engines. −
 * is dark at none, + dark with none left for both; the both cell has no
 * keys.
 */
function stripOf(
  mountain: Mountain,
  work: LevelsWork,
): readonly [StripCell, StripCell, StripCell] {
  const hoists = work.shaft.running.filter((cage) => cage.key !== "winch");
  const values = STRIP_PLACES.map(
    (place) =>
      liftOf(
        hoists.filter((cage) => cage.serves === place),
        work.shaft.perLoad,
      ) * work.timer,
  );
  const printed = printedParts(
    values,
    values.reduce((sum, value) => sum + value, 0),
  );
  const left = unassignedHoists(mountain);
  const { assigned } = mountain.cages;
  const cell = (index: 0 | 1 | 2): StripCell => {
    const place = STRIP_PLACES[index];
    const count = place === "both" ? left : assigned[place];
    const level = place !== "both";
    return {
      place,
      name: level ? LEVEL_NAMES[place] : BOTH_IN_TURN,
      count,
      unit: count === 1 ? "hoist" : "hoists",
      rate: printed.parts[index] ?? "0",
      rateValue: values[index] ?? 0,
      canLess: level && count > 0,
      canMore: level && left > 0,
    };
  };
  return [cell(0), cell(1), cell(2)];
}

/** The mine with two levels as one paint reads it: each level, Hoisting's row and the strip. */
export type LevelsView = {
  readonly levels: readonly [MineLevel, MineLevel];
  readonly hoisting: StageRow;
  readonly strip: readonly [StripCell, StripCell, StripCell];
};

/**
 * The mine with two levels while the shaft is sunk and part 3 plays (ruling
 * 1), worked out once (`levelsWork`) for the rows, the strip and the scene;
 * undefined with one level.
 */
export function levelsView(
  mountain: Mountain,
  now?: number,
): LevelsView | undefined {
  const granite = openGranite(mountain);
  if (granite === undefined) {
    return undefined;
  }
  const work = levelsWork(mountain, now);
  return {
    levels: levelViews(mountain, granite, work),
    hoisting: shaftRow(mountain, work),
    strip: stripOf(mountain, work),
  };
}

/** The mine's two levels while the shaft is sunk and part 3 plays (ruling 1), else none. */
export function mineLevels(
  mountain: Mountain,
  now?: number,
): readonly MineLevel[] {
  return levelsView(mountain, now)?.levels ?? [];
}

/**
 * Hoisting's row (ruling 3): with two levels the shaft's (`shaftRow`), with
 * one the one-level mine's hoisting row. Hoisting's list reads it too.
 */
export function hoistingRow(mountain: Mountain, now?: number): StageRow {
  const view = levelsView(mountain, now);
  if (view !== undefined) {
    return view.hoisting;
  }
  const lift = stageRows(mountain, now).find((row) => row.stage === "lift");
  if (lift === undefined) {
    throw new Error("mine-level-view: the mine has no hoisting row");
  }
  return lift;
}

/** The strip, while the Granite is open (ruling 4); it throws with one level, which has no strip. */
export function hoistStrip(
  mountain: Mountain,
  now?: number,
): readonly [StripCell, StripCell, StripCell] {
  const view = levelsView(mountain, now);
  if (view === undefined) {
    throw new Error("mine-level-view: the strip has one level");
  }
  return view.strip;
}

/** The shaft's gate before it is sunk (ruling 7): what it waits for, or its price. */
export type ShaftGate =
  | { readonly kind: "waits"; readonly words: string }
  | {
      readonly kind: "open";
      readonly price: readonly {
        readonly good: GoodId;
        readonly amount: number;
        readonly text: string;
      }[];
      readonly can: boolean;
    };

/** The shaft's gate while part 3 plays and the Granite is not sunk, else undefined. */
export function shaftGate(mountain: Mountain): ShaftGate | undefined {
  if (!partThreeOn() || levelSunk(mountain, "granite")) {
    return undefined;
  }
  if (!shaftOpen(mountain)) {
    return { kind: "waits", words: SHAFT_WAITS_LINE };
  }
  const price = shaftPrice();
  return {
    kind: "open",
    price: price.map(({ good, amount }) => ({
      good,
      amount,
      text: formatCompact(amount),
    })),
    can: canPay(mountain.stock, price),
  };
}

/**
 * A cage in the scene (ruling 8): how deep it is, 0 at the top, 1 at the
 * Topsoil's floor and 2 at the Granite's, and whether it carries rock.
 */
export type CageSprite = { readonly depth: number; readonly loaded: boolean };

/**
 * What the scene with two levels shows (ruling 8): each level's stages,
 * piles and tubs, every cage where its trip has taken it, and hoisting's
 * workers by the shaft with the share of the time they lift. Nothing here
 * is said in words.
 */
export type TwoLevelScene = {
  readonly levels: Readonly<Record<"topsoil" | "granite", LevelScene>>;
  readonly cages: readonly CageSprite[];
  readonly hoisting: { readonly workers: number; readonly busy: number };
};

/** How deep each level's floor is, in levels. */
const LEVEL_DEPTH: Readonly<Record<MineLevelId, number>> = {
  topsoil: 1,
  granite: 2,
  crystal: 3,
};

/**
 * Where a cage is on its trip: at the top, at its level while loading, or on
 * a leg by the seconds left of it. A cage goes at one speed: the Granite is
 * twice the Topsoil's trip, and twice as deep.
 */
function cageDepth(cage: Cage): number {
  const deep = LEVEL_DEPTH[cage.level];
  const { leg } = cage;
  switch (leg.kind) {
    case "top":
      return 0;
    case "loading":
      return deep;
    case "down":
      return (
        deep * (1 - Math.min(1, leg.left / legSeconds(cage.level, "down")))
      );
    case "up":
      return deep * Math.min(1, leg.left / legSeconds(cage.level, "up"));
  }
}

/**
 * Every cage the shaft has, at its depth with its load. Those at the top
 * stand one over the other, so the scene draws one of them, with rock if
 * any of them has some, first.
 */
function cageSprites(mountain: Mountain): readonly CageSprite[] {
  const open = openLevels(mountain);
  const sprites = mineWork(mountain).cages.map((cage, place) => {
    const trip = cageAt(mountain.cages.trips, cage.key, place, open);
    return { depth: cageDepth(trip), loaded: trip.carried > 0 };
  });
  const top = sprites.filter((sprite) => sprite.depth <= 0);
  const below = sprites.filter((sprite) => sprite.depth > 0);
  return top.length === 0
    ? below
    : [{ depth: 0, loaded: top.some((sprite) => sprite.loaded) }, ...below];
}

/** The scene with two levels, while the Granite is open (ruling 8), from the paint's view; it throws with one level. */
export function twoLevelScene(
  mountain: Mountain,
  view: LevelsView | undefined = levelsView(mountain),
): TwoLevelScene {
  if (view === undefined) {
    throw new Error("mine-level-view: the scene has one level");
  }
  const [topsoil, granite] = view.levels;
  const scene = (level: MineLevel): LevelScene =>
    levelScene(level.rows[0], level.rows[1], level.piles);
  return {
    levels: { topsoil: scene(topsoil), granite: scene(granite) },
    cages: cageSprites(mountain),
    hoisting: {
      workers: view.hoisting.workers,
      busy: view.hoisting.busy,
    },
  };
}
