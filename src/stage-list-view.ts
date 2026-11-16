import { formatCompact } from "./format";
import type { Stage } from "./line";
import { markLine } from "./milestones";
import { hoistingRow, levelStageTitle, levelsView } from "./mine-level-view";
import type { MineLevelId } from "./mine-levels";
import {
  machineKey,
  stageRows,
  STAGE_NAMES,
  type MachineKey,
  type RowPart,
  type StageRow,
} from "./mine-view";
import type { Mountain } from "./mountain";
import { MACHINE_WORDS, TOOL_WORDS, formatSpeed, plural } from "./screen-words";
import type { Price } from "./stock";
import { effectiveRates } from "./rates";
import { tierById, type BuyAmount, type MachineId } from "./tiers";
import { upgradeShown } from "./upgrade-reveal";
import { upgradeRowView } from "./upgrade-rows";
import {
  UPGRADES,
  upgradePrice,
  upgradeStage,
  type Upgrade,
  type UpgradeId,
} from "./upgrades";
import { stageMachines } from "./workforce";

/**
 * A stage's list (#661; spec, "What the prototype does not show"): what the
 * stage moves and who works with what, its machines with their ownership
 * marks and keys, and the upgrades that lift them. The worker's own upgrades
 * and marks are in the workforce, under the jobs. Pure: it reads the
 * mountain and never writes it. It names no limit and no best buy: the
 * numbers are his to compare.
 */

/** One line of who works with what: "6 carts", "6 of 6 workers", "360/s". */
export type ListPart = {
  readonly name: string;
  readonly detail: string;
  readonly moves: string;
};

/** A kind of machine in a stage's list. */
export type ListMachine = {
  readonly id: MachineId;
  /** "Carts". */
  readonly name: string;
  /** "4 owned". */
  readonly owned: string;
  /** Its next mark with the progress toward it, or that every mark is reached. */
  readonly mark: string | undefined;
  readonly key: MachineKey;
};

/** An upgrade's row: what it does in numbers, and its key. */
export type ListUpgrade = {
  readonly id: UpgradeId;
  readonly name: string;
  readonly effect: string;
  readonly why: string;
  /** Every level is bought: the row reads "Owned". */
  readonly owned: boolean;
  readonly price: string;
  /** The price on the key, which the buy sends: a different price today refuses it (#367). */
  readonly shownPrice: Price | undefined;
  readonly can: boolean;
  readonly label: string;
};

export type StageList = {
  readonly stage: Stage;
  readonly name: string;
  /** What the stage moves now, of what it can move. */
  readonly now: string;
  readonly can: string;
  /** The band under the numbers: what it can move, and what it moves, of the strongest stage. */
  readonly band: StageRow["band"];
  /** Who works with what, a line each, adding up to `can`. */
  readonly parts: readonly ListPart[];
  /** The same in one sentence, for a screen reader. */
  readonly sentence: string;
  readonly machines: readonly ListMachine[];
  readonly upgrades: readonly ListUpgrade[];
};

const capital = (words: string): string =>
  `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/** A summand of the row as a line of the list, its moves as the row prints them. */
export function listPart(stage: Stage, part: RowPart, moves: string): ListPart {
  const perSecond = `${moves}/s`;
  if (part.kind === "tools") {
    return {
      name: `${String(part.count)} ${plural(part.count, TOOL_WORDS[stage])}`,
      detail: "",
      moves: perSecond,
    };
  }
  const noun = MACHINE_WORDS[part.id];
  if (part.kind === "stands") {
    // The third state (call 51): the machines stand, and their workers move more with tools.
    const machines = plural(part.standing, noun);
    return {
      name: `${String(part.standing)} ${machines} ${part.standing === 1 ? "stands" : "stand"}`,
      detail:
        part.workers === 0
          ? ""
          : `${String(part.workers)} ${plural(part.workers, ["worker moves", "workers move"])} ${plural(part.workers, TOOL_WORDS[stage])}, ${formatSpeed(part.onMachines)}/s on the ${machines}`,
      moves: perSecond,
    };
  }
  const count =
    part.running < part.owned
      ? `${String(part.running)} of ${String(part.owned)}`
      : String(part.owned);
  return {
    name: `${count} ${plural(part.owned, noun)}`,
    detail: `${String(part.has)} of ${String(part.takes)} ${plural(part.takes, ["worker", "workers"])}`,
    moves: perSecond,
  };
}

function upgradeRow(
  mountain: Mountain,
  upgrade: Upgrade,
  now: number,
): ListUpgrade {
  const row = upgradeRowView(mountain, now, upgrade);
  const owned = row.state === "owned";
  return {
    id: upgrade.id,
    name: row.name,
    effect: row.info[0] ?? "",
    why: row.why,
    owned,
    price: row.price,
    shownPrice: owned ? undefined : upgradePrice(mountain, upgrade.id),
    can: row.can,
    label: row.aria,
  };
}

/** The upgrades shown that a stage's list holds, or, for none, the workers' own. */
function shownUpgrades(
  mountain: Mountain,
  stage: Stage | undefined,
  now: number,
): readonly ListUpgrade[] {
  return UPGRADES.filter(
    (upgrade) =>
      upgradeStage(upgrade) === stage && upgradeShown(mountain, upgrade),
  ).map((upgrade) => upgradeRow(mountain, upgrade, now));
}

/**
 * The list's name and row: with two levels a level's drilling or haulage
 * (its own row, "Granite drilling"), and Hoisting the shaft's row
 * (`hoistingRow`), so a list says what the row he tapped says; with one
 * level, the one-level row.
 */
function listHead(
  mountain: Mountain,
  stage: Stage,
  now: number,
  level: MineLevelId | undefined,
): {
  readonly name: string;
  readonly row: StageRow | undefined;
  /** The level it shows, or undefined for the whole mine's stage. */
  readonly level: MineLevelId | undefined;
} {
  if (stage === "lift") {
    return {
      name: STAGE_NAMES.lift,
      row: hoistingRow(mountain, now),
      level: undefined,
    };
  }
  const shown = levelsView(mountain, now)?.levels.find(
    (each) => each.level === level,
  );
  return shown === undefined
    ? {
        name: STAGE_NAMES[stage],
        row: stageRows(mountain, now).find((each) => each.stage === stage),
        level: undefined,
      }
    : {
        name: levelStageTitle(shown.level, stage),
        row: shown.rows[stage === "face" ? 0 : 1],
        level: shown.level,
      };
}

/**
 * A stage's list. With two levels, `level` is the level whose row opened
 * it: the list shows that level's numbers and machines (#680).
 */
export function stageList(
  mountain: Mountain,
  stage: Stage,
  amount: BuyAmount,
  now: number,
  level?: MineLevelId,
): StageList {
  const head = listHead(mountain, stage, now, level);
  const { name, row } = head;
  const speed = effectiveRates(mountain, now).tierSpeed;
  // A level's list counts that level's machines; the marks count every one he owns.
  const machines = stageMachines(mountain, speed, stage, head.level).map(
    (machine): ListMachine => {
      const { id } = machine;
      const total = mountain.owned[id];
      return {
        id,
        name: capital(MACHINE_WORDS[id][1]),
        owned: `${formatCompact(head.level === undefined ? total : machine.owned)} owned`,
        mark: markLine(id, total, formatCompact),
        key: machineKey(mountain, stage, tierById(id), amount, now),
      };
    },
  );
  return {
    stage,
    name,
    now: `${row?.now ?? "0"}/s`,
    can: row?.can ?? "0/s",
    band: row?.band ?? { can: 0, now: 0 },
    parts:
      row?.parts.map((part, index) =>
        listPart(stage, part, row.printed[index] ?? "0"),
      ) ?? [],
    sentence:
      row === undefined
        ? ""
        : `Moves ${row.now}/s of ${row.can}: ${row.sum[0]}.`,
    machines,
    upgrades: shownUpgrades(mountain, stage, now),
  };
}

/**
 * The workers' own upgrades and marks, in the workforce under the jobs: the
 * workers as a machine's row is, without a key (hiring is in the frame).
 */
export type WorkersList = {
  readonly name: string;
  /** "30 hired" (#715). */
  readonly owned: string;
  readonly mark: string | undefined;
  readonly upgrades: readonly ListUpgrade[];
};

export function workersList(mountain: Mountain, now: number): WorkersList {
  return {
    name: "Workers",
    owned: `${formatCompact(mountain.owned.helper)} hired`,
    mark: markLine("helper", mountain.owned.helper, formatCompact),
    upgrades: shownUpgrades(mountain, undefined, now),
  };
}
