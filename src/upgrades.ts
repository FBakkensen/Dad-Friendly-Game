import type { Mountain } from "./mountain";

/** Permanent, one-level-at-a-time purchases. See docs/DESIGN.md "M3: Strategy". */
export type UpgradeId = "tap";

export type Upgrades = Readonly<Partial<Record<UpgradeId, number>>>;

export type Upgrade = {
  readonly id: UpgradeId;
  readonly name: string;
  /** What one more level does, in the player's words. */
  readonly perLevel: string;
  readonly firstCost: number;
  readonly costGrowth: number;
  readonly maxLevel: number;
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
};

export const UPGRADES: readonly Upgrade[] = Object.values(BY_ID);

/** Tap power: each level adds this share of the crew's speed to every tap. */
export const TAP_SHARE_PER_LEVEL = 0.01;

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
  if (cost === undefined || mountain.pocket < cost) {
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
