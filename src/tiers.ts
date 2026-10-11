import type { Mountain } from "./mountain";

/** All tier numbers live here. See docs/DESIGN.md "M2: Automation". */
const COST_GROWTH = 1.15;

export type TierId = "helper" | "cart";

type CrewField = "helpers" | "carts";

export type Tier = {
  readonly id: TierId;
  /** Save field counting how many are owned. */
  readonly field: CrewField;
  readonly name: string;
  /** Stones the first one costs. */
  readonly firstCost: number;
  /** Stones a second each one mines. */
  readonly perSecond: number;
};

/** Cheapest first. Each tier is roughly 15× the cost and 8× the speed of the last. */
export const TIERS: readonly Tier[] = [
  {
    id: "helper",
    field: "helpers",
    name: "Helper",
    firstCost: 10,
    perSecond: 1,
  },
  {
    id: "cart",
    field: "carts",
    name: "Mine cart",
    firstCost: 150,
    perSecond: 8,
  },
];

export function tierById(id: TierId): Tier {
  const tier = TIERS.find((candidate) => candidate.id === id);
  if (tier === undefined) {
    throw new Error(`Unknown tier ${id}`);
  }
  return tier;
}

export function owned(mountain: Mountain, tier: Tier): number {
  return mountain[tier.field];
}

/** Cookie Clicker curve: each one costs 15% more than the last. */
export function tierCost(tier: Tier, ownedCount: number): number {
  return Math.ceil(tier.firstCost * COST_GROWTH ** ownedCount);
}

/** Pays for one of the tier from the pocket; unaffordable returns the same mountain. */
export function buyTier(mountain: Mountain, id: TierId): Mountain {
  const tier = tierById(id);
  const count = owned(mountain, tier);
  const cost = tierCost(tier, count);
  if (mountain.pocket < cost) {
    return mountain;
  }
  return {
    ...mountain,
    pocket: mountain.pocket - cost,
    [tier.field]: count + 1,
  };
}

/** A tier appears once you own one, or own one of the tier before it. */
export function tierShown(mountain: Mountain, tier: Tier): boolean {
  const index = TIERS.indexOf(tier);
  const previous = TIERS[index - 1];
  return (
    index === 0 ||
    owned(mountain, tier) > 0 ||
    (previous !== undefined && owned(mountain, previous) > 0)
  );
}

export function crewStonesPerSecond(mountain: Mountain): number {
  return TIERS.reduce(
    (total, tier) => total + owned(mountain, tier) * tier.perSecond,
    0,
  );
}
