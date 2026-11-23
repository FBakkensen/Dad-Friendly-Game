import type { Stage } from "./line";
import type { Mountain } from "./mountain";
import { slice2Part2On } from "./part-switch";
import { RESEARCH_FOR_UPGRADE, researchDone } from "./research";
import { owned, tierById, type TierId } from "./tiers";
import { pay, stonesPrice, type Price } from "./stock";
import { haulageWorkers } from "./workforce";

/** Permanent, one-level-at-a-time purchases. See docs/DESIGN.md "M3: Strategy". */
export type UpgradeId = "boots" | "cartSyn" | "drillSyn" | "borerSyn";

export type Upgrades = Readonly<Record<UpgradeId, number>>;

export const NO_UPGRADES: Upgrades = {
  boots: 0,
  cartSyn: 0,
  drillSyn: 0,
  borerSyn: 0,
};

export type Upgrade = {
  readonly id: UpgradeId;
  readonly name: string;
  /** What one more level does, in the player's words. */
  readonly perLevel: string;
  readonly firstCost: number;
  readonly costGrowth: number;
  readonly maxLevel: number;
  /** Shown and buyable once the crew has this many of a tier. */
  readonly unlock?: { readonly tier: TierId; readonly count: number };
  /** Crew synergy: each `from` owned makes every `to` SYNERGY_PER_UNIT faster. */
  readonly synergy?: { readonly from: TierId; readonly to: TierId };
};

const BY_ID: Readonly<Record<UpgradeId, Upgrade>> = {
  boots: {
    id: "boots",
    name: "Work boots",
    perLevel: "Workers go from 1/s to 2.4/s.",
    firstCost: 1_625_000,
    costGrowth: 1,
    maxLevel: 1,
    unlock: { tier: "helper", count: 10 },
  },
  cartSyn: {
    id: "cartSyn",
    name: "Loading crews",
    perLevel: "Each worker makes carts 1% faster.",
    firstCost: 2_000_000,
    costGrowth: 1,
    maxLevel: 1,
    unlock: { tier: "cart", count: 5 },
    synergy: { from: "helper", to: "cart" },
  },
  drillSyn: {
    id: "drillSyn",
    name: "Haul roads",
    perLevel: "Each cart makes drills 1% faster.",
    firstCost: 3_000_000,
    costGrowth: 1,
    maxLevel: 1,
    unlock: { tier: "drill", count: 5 },
    synergy: { from: "cart", to: "drill" },
  },
  borerSyn: {
    id: "borerSyn",
    name: "Drill crews",
    perLevel: "Each drill makes borers 1% faster.",
    firstCost: 15_000_000,
    costGrowth: 1,
    maxLevel: 1,
    unlock: { tier: "borer", count: 3 },
    synergy: { from: "drill", to: "borer" },
  },
};

export const UPGRADES: readonly Upgrade[] = Object.values(BY_ID);

/** Crew synergies: speed each `from` unit adds to its `to` tier. */
const SYNERGY_PER_UNIT = 0.01;

/** Work boots: helper speed gained per level. */
export const BOOTS_SPEED_PER_LEVEL = 1.36;
/** Whether the crew owns enough to see and buy this upgrade. */
export function upgradeUnlocked(mountain: Mountain, upgrade: Upgrade): boolean {
  return (
    upgrade.unlock === undefined ||
    owned(mountain, tierById(upgrade.unlock.tier)) >= upgrade.unlock.count
  );
}

/** Extra speed (0.2 = +20%) a synergy gives its tier with the crew as it is. */
export function synergyBonus(mountain: Mountain, upgrade: Upgrade): number {
  if (upgrade.synergy === undefined) {
    return 0;
  }
  // Loading crews counts the workers on haulage (rule 2.9).
  const count =
    upgrade.synergy.from === "helper"
      ? haulageWorkers(mountain)
      : owned(mountain, tierById(upgrade.synergy.from));
  return count * SYNERGY_PER_UNIT;
}

/** The bought synergy boosting this tier, if any (honors Part 2 Research equivalents without double-stacking). */
export function tierSynergy(mountain: Mountain, tier: TierId): number {
  const upgrade = UPGRADES.find(
    (candidate) =>
      candidate.synergy?.to === tier &&
      (upgradeLevel(mountain, candidate.id) > 0 ||
        researchDone(mountain, RESEARCH_FOR_UPGRADE[candidate.id])),
  );
  return upgrade === undefined ? 0 : synergyBonus(mountain, upgrade);
}

/**
 * The stage whose machine an upgrade lifts, where its list shows it (#661):
 * a synergy's machine's stage. Undefined for the worker's own upgrades
 * (Work boots), which the workforce shows.
 */
export function upgradeStage(upgrade: Upgrade): Stage | undefined {
  return upgrade.synergy === undefined
    ? undefined
    : tierById(upgrade.synergy.to).stage;
}

export function upgradeById(id: UpgradeId): Upgrade {
  return BY_ID[id];
}

export function upgradeLevel(mountain: Mountain, id: UpgradeId): number {
  return mountain.upgrades[id];
}

/** Price of the next level, or undefined once maxed. */
export function upgradeCost(
  upgrade: Upgrade,
  level: number,
): number | undefined {
  return level >= upgrade.maxLevel
    ? undefined
    : Math.ceil(
        Number(
          (upgrade.firstCost * upgrade.costGrowth ** level).toPrecision(12),
        ),
      );
}

/** The next level's stones, or undefined once maxed: the one the Buy shows. */
export function nextUpgradeCost(
  mountain: Mountain,
  id: UpgradeId,
): number | undefined {
  return upgradeCost(upgradeById(id), upgradeLevel(mountain, id));
}

/** The next level's price (#560), or undefined once maxed. */
export function upgradePrice(
  mountain: Mountain,
  id: UpgradeId,
): Price | undefined {
  const cost = nextUpgradeCost(mountain, id);
  return cost === undefined ? undefined : stonesPrice(cost);
}

/** Buys the next level if affordable; disabled under Slice 2 Part 2 where Research holds all upgrades. */
export function buyUpgrade(mountain: Mountain, id: UpgradeId): Mountain {
  if (slice2Part2On()) {
    return mountain;
  }
  const level = upgradeLevel(mountain, id);
  const price = upgradePrice(mountain, id);
  if (price === undefined || !upgradeUnlocked(mountain, upgradeById(id))) {
    return mountain;
  }
  const paid = pay(mountain, price);
  return paid === mountain
    ? mountain
    : { ...paid, upgrades: { ...mountain.upgrades, [id]: level + 1 } };
}

/** Untrusted save data: only known ids, whole levels within range. */
export function parseUpgrades(value: unknown): Upgrades | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const parsed: Record<UpgradeId, number> = { ...NO_UPGRADES };
  for (const [key, level] of Object.entries(value)) {
    const upgrade = UPGRADES.find((candidate) => candidate.id === key);
    if (
      upgrade === undefined ||
      !Number.isSafeInteger(level) ||
      (level as number) < 0 ||
      (level as number) > upgrade.maxLevel
    ) {
      return undefined;
    }
    parsed[upgrade.id] = level as number;
  }
  return parsed;
}
