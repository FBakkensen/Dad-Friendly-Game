import type { Mountain } from "./mountain";
import type { RelicId } from "./relics";

/** All tier numbers live here. See docs/DESIGN.md "M2: Automation". */
const COST_GROWTH = 2;
/**
 * Helpers staff every machine, so they need far more of them: a gentle curve
 * keeps the hundredth helper affordable. Tuned by src/pacing.test.ts.
 */
const HELPER_COST_GROWTH = 1.15;
/** Kids follow the helpers' gentle curve from a late-game price. */
const KID_FIRST_COST = 1_000_000;

export type TierId = "helper" | "cart" | "drill" | "borer" | "machine" | "kid";

type CrewField =
  "helpers" | "carts" | "drills" | "borers" | "machines" | "kids";

export type Tier = {
  readonly id: TierId;
  /** Save field counting how many are owned. */
  readonly field: CrewField;
  readonly name: string;
  /** For the compact, three-to-a-row card. */
  readonly shortName: string;
  /** Stones the first one costs. */
  readonly firstCost: number;
  /** Stones a second each one mines. */
  readonly perSecond: number;
  /** Helpers it takes to run one; without them it sits idle (see rates.ts). */
  readonly staff: number;
  /** A relic that must be found before it can be built (see crew.ts). */
  readonly needs?: RelicId;
};

/** Cheapest first. Each tier is 6–10× the speed of the last; tuned by src/pacing.test.ts. */
export const TIERS: readonly Tier[] = [
  {
    id: "helper",
    field: "helpers",
    name: "Helper",
    shortName: "Helper",
    firstCost: 20,
    perSecond: 1,
    staff: 0,
  },
  {
    id: "cart",
    field: "carts",
    name: "Mine cart",
    shortName: "Cart",
    firstCost: 100,
    perSecond: 10,
    staff: 1,
  },
  {
    id: "drill",
    field: "drills",
    name: "Steam drill",
    shortName: "Drill",
    firstCost: 20_000,
    perSecond: 60,
    staff: 2,
  },
  {
    id: "borer",
    field: "borers",
    name: "Tunnel borer",
    shortName: "Borer",
    firstCost: 8_000_000,
    perSecond: 350,
    staff: 4,
  },
  {
    id: "machine",
    field: "machines",
    name: "Great Machine",
    shortName: "Machine",
    firstCost: 80_000_000,
    perSecond: 3_500,
    staff: 10,
    needs: "hammer",
  },
  {
    // Crown of Wisdom: kids mine, staff machines, and teach the crew (rates.ts).
    id: "kid",
    field: "kids",
    name: "Kid helper",
    shortName: "Kid",
    firstCost: KID_FIRST_COST,
    perSecond: 1,
    staff: 0,
    needs: "crown",
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

/** Cookie Clicker curve: machines double each time; helpers grow gently. */
export function tierCost(tier: Tier, ownedCount: number): number {
  // toPrecision drops float dust (500 × 1.6² is 1280.0000000000002, not 1,281).
  return Math.ceil(
    Number(
      (
        tier.firstCost *
        (tier.staff === 0 ? HELPER_COST_GROWTH : COST_GROWTH) ** ownedCount
      ).toPrecision(12),
    ),
  );
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
