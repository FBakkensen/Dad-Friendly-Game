import {
  cageRates,
  tripSeconds,
  unassignedHoists,
  type ShaftCage,
} from "./cages";
import { formatCompact } from "./format";
import {
  MINE_LEVEL_IDS,
  openGranite,
  shaftOpen,
  shaftPrice,
  type LevelMachineId,
  type MineLevelId,
  type SunkGranite,
} from "./mine-levels";
import { faceHolds, mineLevelFlows, mineWork, shaftHolds } from "./mine-piles";
import {
  PILE_LABELS,
  printedParts,
  rowParts,
  stageRow,
  stageRows,
  timed,
  type RowPart,
  type RowPile,
  type StageRow,
} from "./mine-view";
import type { Mountain } from "./mountain";
import { partThreeOn } from "./part-switch";
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

/** The levels' names, as the mine and the strip say them. */
export const LEVEL_NAMES: Readonly<Record<MineLevelId, "Topsoil" | "Granite">> =
  { topsoil: "Topsoil", granite: "Granite" };

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
export const SINK_LINE =
  "A second level. Opens saws, the factory, locomotives.";

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

/** The workforce's groups with the Granite open (ruling 9). */
export const WORKFORCE_GROUPS = {
  topsoil: "Topsoil",
  granite: "Granite",
  shaft: "Shaft",
} as const;

/** A level on the mine: its drilling and haulage rows, and the piles under its gallery. */
export type MineLevel = {
  readonly level: MineLevelId;
  readonly name: "Topsoil" | "Granite";
  /** Drilling, then haulage. */
  readonly rows: readonly [StageRow, StageRow];
  readonly piles: { readonly face: RowPile; readonly shaft: RowPile };
};

/**
 * What the running cages lift a second, counted as rates (rule 5.14): a
 * cage for one level its load each trip to that level; the cages for both
 * their loads once a round, one load from each level (`Branches`' turn).
 */
function liftOf(cages: readonly ShaftCage[]): number {
  const { own, loads } = cageRates(cages);
  const round = MINE_LEVEL_IDS.reduce(
    (sum, level) => sum + tripSeconds(level),
    0,
  );
  return own.topsoil + own.granite + (MINE_LEVEL_IDS.length * loads) / round;
}

/** The workers a part has on tools: those who run the winch. */
function winchWorkers(part: RowPart): number {
  if (part.kind === "tools") {
    return part.count;
  }
  return part.kind === "stands" ? part.workers : 0;
}

/**
 * Hoisting's parts with two levels (ruling 3): the hoists' and engines'
 * kinds, each moving what its running cages lift as they are assigned, and
 * the winch's workers moving the winch's lift, all under the crew timer.
 * The counts read the cages' own clock (`mineWork`, with no `now`), so what
 * runs and what it lifts are one reading of the shaft.
 */
function hoistParts(mountain: Mountain, timer: number): RowPart[] {
  const speed = effectiveRates(mountain).tierSpeed;
  const parts = rowParts(
    stageMachines(mountain, speed, "lift"),
    mountain.jobs[STAGE_JOB.lift],
    toolSpeed(speed),
  );
  const running = mineWork(mountain).cages.filter((cage) => cage.runs);
  const winch = liftOf(running.filter((cage) => cage.key === "winch"));
  const onWinch = parts.reduce((sum, part) => sum + winchWorkers(part), 0);
  return parts.map((part) => {
    const moves =
      part.kind === "runs"
        ? liftOf(running.filter((cage) => cage.key.startsWith(`${part.id}:`)))
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
  readonly hoisting: readonly RowPart[];
  readonly hoistCan: number;
  readonly cans: Readonly<Record<MineLevelId, Record<LevelStage, number>>>;
  readonly flows: ReturnType<typeof mineLevelFlows>;
  readonly strongest: number;
  readonly free: number;
};

function levelsWork(mountain: Mountain, now: number | undefined): LevelsWork {
  const speed = effectiveRates(mountain, now).tierSpeed;
  const timer = crewTimer(mountain, now);
  const { levels } = lineWork(mountain, speed);
  const hoisting = hoistParts(mountain, timer);
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
  };
  return {
    speed,
    timer,
    hoisting,
    hoistCan,
    cans,
    flows: mineLevelFlows(mountain, now),
    // The band's scale is the strongest of all five stages (ruling 2).
    strongest: Math.max(
      1,
      hoistCan,
      ...MINE_LEVEL_IDS.flatMap((level) => [
        cans[level].face,
        cans[level].haul,
      ]),
    ),
    free: freeWorkers(mountain),
  };
}

/** A level's two piles: its drilled rock, and its rock at the shaft. */
function levelPiles(
  mountain: Mountain,
  granite: SunkGranite,
  level: MineLevelId,
): MineLevel["piles"] {
  const held = level === "topsoil" ? mountain.piles : granite.piles;
  return {
    face: { label: PILE_LABELS.face, held: held.face, holds: faceHolds(level) },
    shaft: {
      label: PILE_LABELS.shaft,
      held: held.shaft,
      holds: shaftHolds(mountain),
    },
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
      toolSpeed(speed),
    ).map((part) => timed(part, timer)),
    can: work.cans[level][stage],
    moving: work.flows.levels[level][stage],
    strongest: work.strongest,
    free: work.free,
    pile,
  });
}

/** The mine's two levels while the shaft is sunk and part 3 plays (ruling 1), else none. */
export function mineLevels(
  mountain: Mountain,
  now?: number,
): readonly MineLevel[] {
  const granite = openGranite(mountain);
  if (granite === undefined) {
    return [];
  }
  const work = levelsWork(mountain, now);
  return MINE_LEVEL_IDS.map((level) => {
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
  });
}

/**
 * Hoisting's row (ruling 3). With two levels, it can move what the running
 * cages lift as they are assigned, and moves now what the shared hoisting
 * lifts through the piles; its sum is the hoists' and engines' parts and the
 * winch's. With one level, it is the one-level mine's hoisting row.
 */
export function hoistingRow(mountain: Mountain, now?: number): StageRow {
  const granite = openGranite(mountain);
  if (granite === undefined) {
    const lift = stageRows(mountain, now).find((row) => row.stage === "lift");
    if (lift === undefined) {
      throw new Error("mine-level-view: the mine has no hoisting row");
    }
    return lift;
  }
  const work = levelsWork(mountain, now);
  return stageRow({
    stage: "lift",
    job: STAGE_JOB.lift,
    workers: mountain.jobs[STAGE_JOB.lift],
    parts: work.hoisting,
    can: work.hoistCan,
    moving: work.flows.lift,
    strongest: work.strongest,
    free: work.free,
    pile: undefined,
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
 * keys. Read with the Granite open: with one level every cage serves the
 * Topsoil.
 */
export function hoistStrip(
  mountain: Mountain,
  now?: number,
): readonly [StripCell, StripCell, StripCell] {
  const timer = crewTimer(mountain, now);
  const hoists = mineWork(mountain).cages.filter(
    (cage) => cage.runs && cage.key !== "winch",
  );
  const values = STRIP_PLACES.map(
    (place) => liftOf(hoists.filter((cage) => cage.serves === place)) * timer,
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
  if (!partThreeOn() || mountain.granite.kind !== "unsunk") {
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
