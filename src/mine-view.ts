import { tierOnSale } from "./crew";
import { formatCompact } from "./format";
import { STAGES, type Stage } from "./line";
import { PILE_HOLDS, mineChain, type PileId } from "./mine-piles";
import type { Mountain } from "./mountain";
import { chainFlows } from "./piles";
import { crewTimer, effectiveRates } from "./rates";
import { MACHINE_WORDS, TOOL_WORDS, formatSpeed, plural } from "./screen-words";
import {
  TIERS,
  tierQuote,
  type BuyAmount,
  type MachineId,
  type Tier,
} from "./tiers";
import {
  STAGE_JOB,
  freeWorkers,
  lineWork,
  stageMachines,
  stageWork,
  toolSpeed,
  type JobId,
  type StageMachine,
} from "./workforce";

/**
 * The mine (#660; spec, "The mine"): the level's plate, a key for each
 * stage's next machine, and a row for each stage with what it moves now of
 * what it can move and who works with what. Pure: it reads the mountain and
 * never writes it. Nothing here names or lights the stage that limits the
 * line: the rows give the numbers, and he compares them.
 */

export const STAGE_NAMES: Readonly<Record<Stage, string>> = {
  face: "Drilling",
  haul: "Haulage",
  lift: "Hoisting",
};

/** Part 1 has one level, the Topsoil, and does not name the next (spec, While a part is the end of the game). */
export const DEEPER_STRATA =
  "Deeper strata: not yet surveyed. The city has to grow first.";

/** The level's plate: its name, its rock a second, and one line. */
export type LevelPlate = {
  readonly name: string;
  readonly rate: string;
  readonly line: string;
};

export function levelPlate(mountain: Mountain, now?: number): LevelPlate {
  const rock = effectiveRates(mountain, now).crewPerSecond;
  return {
    name: "Topsoil",
    rate: `${formatCompact(rock)}/s`,
    // One level: every crew is on it, and no maker takes its rock yet.
    line: "4 crews · all rock is hoisted as stone",
  };
}

/** The strongest machine a stage can buy now: in play, shown and open. */
function nextMachine(mountain: Mountain, stage: Stage): Tier | undefined {
  return TIERS.filter(
    (tier) => tier.stage === stage && tierOnSale(mountain, tier),
  ).at(-1);
}

/** A stage's key: its next machine, what it moves, its price and the workers it takes. */
export type MachineKey = {
  readonly stage: Stage;
  readonly id: MachineId;
  readonly count: number;
  readonly cost: number;
  readonly can: boolean;
  /** "+Drill · 108/s", "+10 Drills · 1,080/s". */
  readonly face: string;
  readonly price: string;
  /** "1 to run". */
  readonly staff: string;
  readonly label: string;
};

const capital = (words: string): string =>
  `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/** A machine's key at the amount key's amount: the mine's keys, and a row in a stage's list (#661). */
export function machineKey(
  mountain: Mountain,
  stage: Stage,
  tier: Tier,
  amount: BuyAmount,
  now?: number,
): MachineKey {
  const speed = effectiveRates(mountain, now).tierSpeed;
  // A crew timer speeds every machine, so the key says what it will move now.
  const timer = crewTimer(mountain, now);
  const { count, cost } = tierQuote(mountain, tier, amount);
  const id = tier.id as MachineId;
  const kind = capital(plural(count, MACHINE_WORDS[id]));
  const name = count === 1 ? kind : `${formatCompact(count)} ${kind}`;
  const moves = `${formatSpeed(speed[id] * count * timer)}/s`;
  const takes = tier.staff * count;
  return {
    stage,
    id,
    count,
    cost,
    can: cost <= mountain.stock.stones,
    face: `+${name} · ${moves}`,
    price: formatCompact(cost),
    staff: `${formatCompact(takes)} to run`,
    label: `Buy ${count === 1 ? "a" : String(count)} ${plural(count, MACHINE_WORDS[id])} for ${formatCompact(cost)} stone. It moves ${moves} and takes ${String(takes)} to run.`,
  };
}

export function machineKeys(
  mountain: Mountain,
  amount: BuyAmount,
  now?: number,
): readonly MachineKey[] {
  return STAGES.flatMap((stage) => {
    const tier = nextMachine(mountain, stage);
    return tier === undefined
      ? []
      : [machineKey(mountain, stage, tier, amount, now)];
  });
}

/** One summand of a stage's row: a kind of machine, or the workers with tools. */
export type RowPart =
  /** Machines of a kind: those that run, of those owned, and their workers of the workers they take. */
  | {
      readonly kind: "runs";
      readonly id: MachineId;
      readonly owned: number;
      readonly running: number;
      readonly has: number;
      readonly takes: number;
      readonly moves: number;
    }
  /**
   * The third state (rule 2.5): a kind of machine that moves less than its
   * workers with tools, so none of it runs. `workers` are the tool workers
   * it could take now (none when the stage has nobody spare); `moves` is
   * what they move with tools, a summand of the row, and `onMachines` what
   * they would move on the machines.
   */
  | {
      readonly kind: "stands";
      readonly id: MachineId;
      readonly standing: number;
      readonly workers: number;
      readonly moves: number;
      readonly onMachines: number;
    }
  | { readonly kind: "tools"; readonly count: number; readonly moves: number };

/**
 * Who works with what on a stage, as summands that add up to what it can
 * move. `machines` are the stage's kinds in play, `tool` what a worker with a
 * tool moves.
 */
export function rowParts(
  machines: readonly StageMachine[],
  workers: number,
  tool: number,
): readonly RowPart[] {
  const work = stageWork(machines, workers, tool);
  let tools = work.tools;
  const parts: RowPart[] = [];
  for (const machine of machines.filter((each) => each.owned > 0)) {
    const running = work.running[machine.id] ?? 0;
    // `stageWork` never runs a machine that moves no more than its workers
    // with tools, so every one of that kind stands, idle by choice.
    if (machine.speed <= machine.staff * tool) {
      const takes = Math.min(machine.owned, Math.floor(tools / machine.staff));
      const standWorkers = takes * machine.staff;
      tools -= standWorkers;
      parts.push({
        kind: "stands",
        id: machine.id,
        standing: machine.owned,
        workers: standWorkers,
        moves: standWorkers * tool,
        onMachines: takes * machine.speed,
      });
      continue;
    }
    parts.push({
      kind: "runs",
      id: machine.id,
      owned: machine.owned,
      running,
      has: running * machine.staff,
      takes: machine.owned * machine.staff,
      moves: running * machine.speed,
    });
  }
  if (tools > 0 || parts.length === 0) {
    parts.push({ kind: "tools", count: tools, moves: tools * tool });
  }
  return parts;
}

/**
 * The parts' numbers as printed: each at the total's precision, rounded so
 * that they add up to the printed total (largest remainder). A part is never
 * printed so that the sum no longer holds.
 */
export function printedParts(
  values: readonly number[],
  total: number,
): { readonly parts: readonly string[]; readonly total: string } {
  const decimals =
    total < 100 && values.some((value) => !Number.isInteger(value)) ? 1 : 0;
  const scale = 10 ** decimals;
  const whole = Math.round(total * scale);
  const floors = values.map((value) => Math.floor(value * scale + 1e-9));
  let left = whole - floors.reduce((sum, value) => sum + value, 0);
  const order = values
    .map((value, index) => ({
      index,
      rest: value * scale - (floors[index] ?? 0),
    }))
    .sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (left <= 0) {
      break;
    }
    floors[index] = (floors[index] ?? 0) + 1;
    left -= 1;
  }
  const print = (units: number): string =>
    (units / scale).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  return { parts: floors.map(print), total: print(whole) };
}

/** The row's sum in three forms, the fullest first: the screen shows the fullest that fits. */
function sumForms(
  stage: Stage,
  parts: readonly RowPart[],
  printed: readonly string[],
): readonly [string, string, string] {
  const forms = [0, 1, 2].map((form) =>
    parts
      .map((part, index) => partWords(stage, part, printed[index] ?? "0", form))
      .join(" + "),
  );
  return [forms[0] ?? "", forms[1] ?? "", forms[2] ?? ""];
}

function partWords(
  stage: Stage,
  part: RowPart,
  moves: string,
  form: number,
): string {
  const perSecond = form === 0 ? "/s" : "";
  if (part.kind === "tools") {
    const tool = plural(part.count, TOOL_WORDS[stage]);
    const short = form === 2 ? tool.replace(/^\w+ (an? )?/, "") : tool;
    return `${String(part.count)} ${short} ${moves}${perSecond}`;
  }
  const noun = MACHINE_WORDS[part.id];
  if (part.kind === "stands") {
    // The spec's words (call 51), approved by Flemming on 15 Nov 2026 (#660).
    const machines = plural(part.standing, noun);
    const stand = `${String(part.standing)} ${machines} ${part.standing === 1 ? "stands" : "stand"}`;
    if (part.workers === 0) {
      return stand;
    }
    const workers = `${String(part.workers)} ${plural(part.workers, ["worker moves", "workers move"])}`;
    const tools = plural(part.workers, TOOL_WORDS[stage]);
    return `${stand} · ${workers} ${moves}${perSecond} ${tools}, ${formatSpeed(part.onMachines)}${perSecond} on the ${machines}`;
  }
  const kinds = plural(part.owned, noun);
  if (form === 2) {
    return `${String(part.owned)} ${kinds} ${String(part.has)}/${String(part.takes)} ${moves}`;
  }
  const count =
    part.running < part.owned
      ? `${String(part.running)} of ${String(part.owned)}`
      : String(part.owned);
  return `${count} ${kinds}: ${String(part.has)} of ${String(part.takes)} ${plural(part.takes, ["worker", "workers"])} ${moves}${perSecond}`;
}

/** The pile after a stage (#703): where its rock waits for the next stage, and how much. */
export type RowPile = {
  readonly label: string;
  readonly held: number;
  readonly holds: number;
};

/** The pile each stage puts its rock on. Hoisting lifts it up as stone. */
const PILE_AFTER: Readonly<Record<Stage, PileId | undefined>> = {
  face: "face",
  haul: "shaft",
  lift: undefined,
};

/** The piles' words (#703), Flemming's to approve. */
export const PILE_LABELS: Readonly<Record<PileId, string>> = {
  face: "Rock at the face",
  shaft: "Rock at the shaft",
};

function rowPile(mountain: Mountain, stage: Stage): RowPile | undefined {
  const id = PILE_AFTER[stage];
  return id === undefined
    ? undefined
    : {
        label: PILE_LABELS[id],
        held: mountain.piles[id],
        holds: PILE_HOLDS[id],
      };
}

/** A stage's row. */
export type StageRow = {
  readonly stage: Stage;
  readonly job: JobId;
  readonly name: string;
  /** What this stage moves now: its own rate while it has rock in front and room after (#703). */
  readonly now: string;
  /** What this stage can move. */
  readonly can: string;
  /** The band behind the row: what it can move, and what it moves, of the strongest stage. */
  readonly band: { readonly can: number; readonly now: number };
  readonly parts: readonly RowPart[];
  readonly sum: readonly [string, string, string];
  /** Each part's moves as printed, so the parts add up to `can` (a stage's list shows them as rows). */
  readonly printed: readonly string[];
  readonly workers: number;
  readonly canPlace: boolean;
  readonly canFree: boolean;
  /** The pile after the stage: drilling's and haulage's; hoisting has none. */
  readonly pile: RowPile | undefined;
};

/** A part under a crew timer (Overtime and the like): every machine and tool moves that much more. */
function timed(part: RowPart, timer: number): RowPart {
  if (timer === 1) {
    return part;
  }
  return part.kind === "stands"
    ? {
        ...part,
        moves: part.moves * timer,
        onMachines: part.onMachines * timer,
      }
    : { ...part, moves: part.moves * timer };
}

export function stageRows(
  mountain: Mountain,
  now?: number,
): readonly StageRow[] {
  const rates = effectiveRates(mountain, now);
  const timer = crewTimer(mountain, now);
  const work = lineWork(mountain, rates.tierSpeed);
  const tool = toolSpeed(rates.tierSpeed);
  const flows = chainFlows(mineChain(mountain, 1, true));
  const strongest = Math.max(
    1,
    ...STAGES.map((stage) => work.stages[stage] * timer),
  );
  const free = freeWorkers(mountain);
  return STAGES.map((stage) => {
    const job = STAGE_JOB[stage];
    const workers = mountain.jobs[job];
    const parts = rowParts(
      stageMachines(mountain, rates.tierSpeed, stage),
      workers,
      tool,
    ).map((part) => timed(part, timer));
    const can = work.stages[stage] * timer;
    const moving = (flows[STAGES.indexOf(stage)] ?? 0) * timer;
    const printed = printedParts(
      parts.map((part) => part.moves),
      can,
    );
    return {
      stage,
      job,
      name: STAGE_NAMES[stage],
      now: formatCompact(moving),
      can: `${printed.total}/s`,
      band: { can: can / strongest, now: Math.min(moving, can) / strongest },
      parts,
      sum: sumForms(stage, parts, printed.parts),
      printed: printed.parts,
      workers,
      canPlace: free > 0,
      canFree: workers > 0,
      pile: rowPile(mountain, stage),
    };
  });
}

/** A stage in the scene: its workers, the share of the time they work, and its machines. */
type StageScene = {
  readonly workers: number;
  /** The share of its rate the stage moves now: it waits on an empty pile in front or a full one after. */
  readonly busy: number;
  readonly owned: number;
  readonly running: number;
  /** Machines left standing because tools move more: nobody sleeps beside them. */
  readonly standing: number;
};

/**
 * What the scene shows (spec, The mine: the state is seen in the scene),
 * from what each stage moves now through the piles (#703): rock lies at the
 * face and at the shaft as much as the piles hold, and a stage that waits
 * on a pile stands. Nothing here is said in words.
 */
export type MineScene = {
  readonly moving: boolean;
  readonly stages: Readonly<Record<Stage, StageScene>>;
  /** The pile at the face, between drilling and haulage: the share of its room it holds. */
  readonly facePile: number;
  /** The pile at the shaft, between haulage and hoisting. */
  readonly shaftPile: number;
  /** The share of tubs that leave the face with rock in them. */
  readonly load: number;
  /** The share of the time the tubs can unload at the shaft. */
  readonly unload: number;
};

const share = (part: number, whole: number): number =>
  whole > 0 ? Math.min(1, part / whole) : 0;

function stageScene(
  parts: readonly RowPart[],
  workers: number,
  busy: number,
): StageScene {
  let owned = 0;
  let running = 0;
  let standing = 0;
  for (const part of parts) {
    if (part.kind === "runs") {
      owned += part.owned;
      running += part.running;
    } else if (part.kind === "stands") {
      owned += part.standing;
      standing += part.standing;
    }
  }
  return { workers, busy, owned, running, standing };
}

export function mineScene(mountain: Mountain): MineScene {
  const rates = effectiveRates(mountain);
  const work = lineWork(mountain, rates.tierSpeed);
  const tool = toolSpeed(rates.tierSpeed);
  const [drills = 0, hauls = 0, lifts = 0] = chainFlows(
    mineChain(mountain, 1, true),
  );
  const flows: Readonly<Record<Stage, number>> = {
    face: drills,
    haul: hauls,
    lift: lifts,
  };
  const stages = Object.fromEntries(
    STAGES.map((stage) => {
      const parts = rowParts(
        stageMachines(mountain, rates.tierSpeed, stage),
        mountain.jobs[STAGE_JOB[stage]],
        tool,
      );
      return [
        stage,
        stageScene(
          parts,
          mountain.jobs[STAGE_JOB[stage]],
          share(flows[stage], work.stages[stage]),
        ),
      ];
    }),
  ) as Record<Stage, StageScene>;
  return {
    moving: drills + hauls + lifts > 0,
    stages,
    facePile: share(mountain.piles.face, PILE_HOLDS.face),
    shaftPile: share(mountain.piles.shaft, PILE_HOLDS.shaft),
    // Tubs leave the face empty while its pile is bare, and queue at the
    // shaft while its pile is full: haulage moves less than it could.
    load: mountain.piles.face > 0 ? 1 : share(hauls, work.stages.haul),
    unload:
      mountain.piles.shaft < PILE_HOLDS.shaft
        ? 1
        : share(hauls, work.stages.haul),
  };
}
