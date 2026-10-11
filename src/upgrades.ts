import type { Mountain } from "./mountain";
import { owned, tierById, type TierId } from "./tiers";

/** Permanent, one-level-at-a-time purchases. See docs/DESIGN.md "M3: Strategy". */
export type UpgradeId =
  | "tap"
  | "boots"
  | "steady"
  | "cartSyn"
  | "drillSyn"
  | "borerSyn"
  | "machineSyn";

export type Upgrades = Readonly<Partial<Record<UpgradeId, number>>>;

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
  tap: {
    id: "tap",
    name: "Strong arms",
    perLevel: "Each tap also mines 1% of your crew's speed.",
    firstCost: 5_000,
    costGrowth: 5,
    maxLevel: 10,
  },
  boots: {
    id: "boots",
    name: "Better boots",
    perLevel: "Helpers mine 10% faster.",
    firstCost: 15_000,
    costGrowth: 1,
    maxLevel: 1,
    unlock: { tier: "helper", count: 10 },
  },
  steady: {
    id: "steady",
    name: "Steady hands",
    perLevel: "Time away pays 25% more.",
    firstCost: 10_000_000,
    costGrowth: 1,
    maxLevel: 1,
    unlock: { tier: "cart", count: 1 },
  },
  cartSyn: {
    id: "cartSyn",
    name: "Helping hands",
    perLevel: "Each helper makes carts 1% faster.",
    firstCost: 500_000,
    costGrowth: 1,
    maxLevel: 1,
    unlock: { tier: "cart", count: 5 },
    synergy: { from: "helper", to: "cart" },
  },
  drillSyn: {
    id: "drillSyn",
    name: "Cart roads",
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
  machineSyn: {
    id: "machineSyn",
    name: "Borer tracks",
    perLevel: "Each borer makes the Great Machine 1% faster.",
    firstCost: 30_000_000,
    costGrowth: 1,
    maxLevel: 1,
    unlock: { tier: "machine", count: 1 },
    synergy: { from: "borer", to: "machine" },
  },
};

export const UPGRADES: readonly Upgrade[] = Object.values(BY_ID);

/** Tap power: each level adds this share of the crew's speed to every tap. */
export const TAP_SHARE_PER_LEVEL = 0.01;

/** Crew synergies: speed each `from` unit adds to its `to` tier. */
export const SYNERGY_PER_UNIT = 0.01;

/** Better boots: helper speed gained per level. */
export const BOOTS_SPEED_PER_LEVEL = 0.1;
/** Steady hands: away pay gained per level, relative to the base rate. */
export const STEADY_AWAY_PER_LEVEL = 0.25;

/** Whether the crew owns enough to see and buy this upgrade. */
export function upgradeUnlocked(mountain: Mountain, upgrade: Upgrade): boolean {
  return (
    upgrade.unlock === undefined ||
    owned(mountain, tierById(upgrade.unlock.tier)) >= upgrade.unlock.count
  );
}

/** Extra speed (0.2 = +20%) a synergy gives its tier with the crew as it is. */
export function synergyBonus(mountain: Mountain, upgrade: Upgrade): number {
  return upgrade.synergy === undefined
    ? 0
    : owned(mountain, tierById(upgrade.synergy.from)) * SYNERGY_PER_UNIT;
}

/** The bought synergy boosting this tier, if any. */
export function tierSynergy(mountain: Mountain, tier: TierId): number {
  const upgrade = UPGRADES.find(
    (candidate) =>
      candidate.synergy?.to === tier &&
      upgradeLevel(mountain, candidate.id) > 0,
  );
  return upgrade === undefined ? 0 : synergyBonus(mountain, upgrade);
}

export function upgradeById(id: UpgradeId): Upgrade {
  return BY_ID[id];
}

export function upgradeLevel(mountain: Mountain, id: UpgradeId): number {
  return mountain.upgrades?.[id] ?? 0;
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

/** Buys the next level if affordable; otherwise the same mountain. */
export function buyUpgrade(mountain: Mountain, id: UpgradeId): Mountain {
  const level = upgradeLevel(mountain, id);
  const cost = upgradeCost(upgradeById(id), level);
  if (
    cost === undefined ||
    mountain.pocket < cost ||
    !upgradeUnlocked(mountain, upgradeById(id))
  ) {
    return mountain;
  }
  return {
    ...mountain,
    pocket: mountain.pocket - cost,
    upgrades: { ...mountain.upgrades, [id]: level + 1 },
  };
}

/** Untrusted save data: only known ids, whole levels within range. */
export function parseUpgrades(value: unknown): Upgrades | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const parsed: Partial<Record<UpgradeId, number>> = {};
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
