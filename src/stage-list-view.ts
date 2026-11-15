import { formatCompact } from "./format";
import type { Stage } from "./line";
import { REACHED_LINE, milestonesReached, nextMark } from "./milestones";
import {
  machineKey,
  stageRows,
  STAGE_NAMES,
  type MachineKey,
} from "./mine-view";
import type { Mountain } from "./mountain";
import {
  MACHINE_WORDS,
  upgradeEffectLine,
  upgradeName,
  upgradeWhyLine,
} from "./screen-words";
import { canPay } from "./stock";
import {
  TIERS,
  tierInPlay,
  type BuyAmount,
  type MachineId,
  type TierId,
} from "./tiers";
import { upgradeShown } from "./upgrade-reveal";
import {
  UPGRADES,
  upgradeLevel,
  upgradePrice,
  upgradeStage,
  type Upgrade,
  type UpgradeId,
} from "./upgrades";

/**
 * A stage's list (#661; spec, "What the prototype does not show"): its
 * machines with their ownership marks and keys, and the upgrades that lift
 * them. The worker's own upgrades and marks are in the workforce, under the
 * jobs. Pure: it reads the mountain and never writes it. It names no limit
 * and no best buy: the numbers are his to compare.
 */

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
  readonly can: boolean;
  readonly label: string;
};

export type StageList = {
  readonly stage: Stage;
  readonly name: string;
  /** The stage's row in one sentence. */
  readonly sentence: string;
  readonly machines: readonly ListMachine[];
  readonly upgrades: readonly ListUpgrade[];
};

const capital = (words: string): string =>
  `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/** "4 of 10 · Every cart hauls twice as fast.", "Twice as fast now.", or none for a tier without marks. */
function markLine(id: TierId, count: number): string | undefined {
  const next = nextMark(id, count, formatCompact);
  if (next !== undefined) {
    return `${next.progress} · ${next.payoff}`;
  }
  return milestonesReached(id, count) > 0 ? REACHED_LINE : undefined;
}

function upgradeRow(
  mountain: Mountain,
  upgrade: Upgrade,
  now: number,
): ListUpgrade {
  const name = upgradeName(upgrade);
  const effect = upgradeEffectLine(upgrade, mountain, now);
  const price = upgradePrice(mountain, upgrade.id);
  const owned =
    price === undefined ||
    upgradeLevel(mountain, upgrade.id) >= upgrade.maxLevel;
  const cost = price?.reduce((sum, part) => sum + part.amount, 0) ?? 0;
  return {
    id: upgrade.id,
    name,
    effect,
    why: upgradeWhyLine(upgrade, mountain, now),
    owned,
    price: formatCompact(cost),
    can: price !== undefined && canPay(mountain.stock, price),
    label: owned
      ? `${name}, owned. ${effect}`
      : `Buy ${name} for ${formatCompact(cost)} stone. ${effect}`,
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

export function stageList(
  mountain: Mountain,
  stage: Stage,
  amount: BuyAmount,
  now = 0,
): StageList {
  const row = stageRows(mountain, now).find((each) => each.stage === stage);
  const machines = TIERS.filter(
    (tier) => tier.stage === stage && tierInPlay(tier),
  ).map((tier): ListMachine => {
    const id = tier.id as MachineId;
    const count = mountain.owned[id];
    return {
      id,
      name: capital(MACHINE_WORDS[id][1]),
      owned: `${formatCompact(count)} owned`,
      mark: markLine(id, count),
      key: machineKey(mountain, stage, tier, amount, now),
    };
  });
  return {
    stage,
    name: STAGE_NAMES[stage],
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
  /** "30 owned". */
  readonly owned: string;
  readonly mark: string | undefined;
  readonly upgrades: readonly ListUpgrade[];
};

export function workersList(mountain: Mountain, now = 0): WorkersList {
  return {
    name: "Workers",
    owned: `${formatCompact(mountain.owned.helper)} owned`,
    mark: markLine("helper", mountain.owned.helper),
    upgrades: shownUpgrades(mountain, undefined, now),
  };
}
