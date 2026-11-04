import { stretch } from "./scale";
import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import type { RelicId } from "./relics";

/** All tier numbers live here. See docs/DESIGN.md "M2: Automation". */
const COST_GROWTH = 2;
/**
 * Workers staff every machine. M7 (#140) steepens the curve from ×1.15 to
 * ×1.25 so a borer comes with a real hiring bill. Tuned by src/pacing.test.ts.
 * Kids share it.
 */
const HELPER_COST_GROWTH = 1.1875;
/** Kids follow the workers' curve from a late-game price. */
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
  /**
   * Stones mined before it opens for sale (M12-2, #250). Until then the
   * card shows locked with this depth, so the next machine is a fixed,
   * predictable point on the way down, never a share of the pocket.
   */
  readonly opensAt?: number;
};

/** Cheapest first. Each tier is 6–10× the speed of the last; tuned by src/pacing.test.ts. */
export const TIERS: readonly Tier[] = [
  {
    id: "helper",
    field: "helpers",
    name: "Worker",
    shortName: "Worker",
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
    perSecond: 6,
    staff: 1,
  },
  {
    id: "drill",
    field: "drills",
    name: "Steam drill",
    shortName: "Drill",
    firstCost: 14_000,
    perSecond: 36,
    staff: 1,
  },
  {
    id: "borer",
    field: "borers",
    name: "Tunnel borer",
    shortName: "Borer",
    // M12 retune (#252): priced so the checker buys one within two sittings,
    // and no dearer, so the evening dad still buys it early in the Granite.
    firstCost: 7_600_000,
    perSecond: 357,
    staff: 8,
    // Opens just above the Granite, the band that suits borers (D3).
    opensAt: 7_000_000,
  },
  {
    id: "machine",
    field: "machines",
    name: "Great Machine",
    shortName: "Machine",
    firstCost: 40_200_000,
    perSecond: 2_100,
    staff: 10,
    needs: "hammer",
    // M12 retune (#252): the Deep Heart entrance, the band that suits it.
    opensAt: 120_000_000,
  },
  {
    // Crown of Wisdom: kids mine, staff machines, and teach the crew (rates.ts).
    id: "kid",
    field: "kids",
    name: "Kid worker",
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

/**
 * Borers climb at ×1.5 so the second and third stay in reach on the way to
 * the Great Machine (#177). Carts, drills, and the machine still double.
 * The sweep's machine-growth knob scales every staffed curve, this one too.
 */
const BORER_COST_GROWTH = 1.5;

/**
 * M12 retune (#252): drills and the Great Machine climb more gently so an
 * older machine is still worth another one in its own band.
 */
const TIER_COST_GROWTH: Partial<Record<TierId, number>> = {
  drill: 1.5,
  borer: BORER_COST_GROWTH,
  machine: 1.4,
};

/** Cookie Clicker curve: machines double each time; helpers grow gently. */
export function tierCost(tier: Tier, ownedCount: number): number {
  // toPrecision drops float dust (500 × 1.6² is 1280.0000000000002, not 1,281).
  // A sweep multiplies the sticker and the growth. Both factors are 1 in play.
  const workerCurve = tier.staff === 0;
  const base = workerCurve
    ? HELPER_COST_GROWTH
    : (TIER_COST_GROWTH[tier.id] ?? COST_GROWTH);
  const growth =
    base * factor(workerCurve ? "growth.worker" : "growth.machine");
  const first = tier.firstCost * factor(`price.${tier.id}`) * stretch();
  return Math.ceil(Number((first * growth ** ownedCount).toPrecision(12)));
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
