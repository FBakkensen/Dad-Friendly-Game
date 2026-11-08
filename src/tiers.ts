import { BAND_STARTS, stretch } from "./scale";
import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import type { RelicId } from "./relics";

/** All tier numbers live here. See docs/DESIGN.md "M2: Automation". */
/**
 * #357: carts, drills, borers, and the Great Machine climb ×1.15 a unit, the
 * top of the 1.10–1.15 genre band, so the milestone marks do not let a
 * cart or drill stack crowd the borer out.
 */
export const MACHINE_COST_GROWTH = 1.15;
/** #357: workers climb ×1.06 a unit, and kids share the curve. */
export const HELPER_COST_GROWTH = 1.06;
/**
 * Kids follow the workers' curve from a late-game price. #327: cheap and
 * quick enough (25/s) that one pays back in hours, not days.
 */
const KID_FIRST_COST = 250_000;

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
    // #357 tune: dearer again, so the cart's marks do not crowd out the borer.
    firstCost: 600,
    perSecond: 6,
    staff: 1,
  },
  {
    id: "drill",
    field: "drills",
    name: "Steam drill",
    shortName: "Drill",
    // #357 tune: dearer, with the cart, yet cheap enough that a 2-minute
    // check-in still buys one in the Topsoil.
    firstCost: 73_080,
    perSecond: 36,
    staff: 1,
  },
  {
    id: "borer",
    field: "borers",
    name: "Tunnel borer",
    shortName: "Borer",
    // #356 tune: cheap enough that every casual dad buys one early in the
    // Granite, and the run stays close for the marathon and the evening dad.
    firstCost: 4_940_000,
    perSecond: 357,
    staff: 8,
    // Opens at the Granite start, the band that suits borers (D3), so no
    // dad meets it in the Topsoil (#356).
    opensAt: BAND_STARTS[1],
  },
  {
    id: "machine",
    field: "machines",
    name: "Great Machine",
    shortName: "Machine",
    // #357 tune: three times dearer, so its marks at 2/3/5/10 do not let the
    // marathon dad finish ahead of the casual dad.
    firstCost: 120_600_000,
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
    perSecond: 25,
    staff: 0,
    needs: "crown",
  },
];

/** A tier that takes helpers to run (staff > 0): cart, drill, borer, machine. */
export type MachineId = Exclude<TierId, "helper" | "kid">;

function isMachine(tier: Tier): tier is Tier & { readonly id: MachineId } {
  return tier.staff > 0;
}

/**
 * The machines, in tier order: every staffed tier. The one list the lab reads
 * (bands, generations, report), so a new machine tier joins it (#388).
 */
export const MACHINE_IDS: readonly MachineId[] = TIERS.filter(isMachine).map(
  (tier) => tier.id,
);

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

/** Cookie Clicker curve: machines climb ×1.15, helpers ×1.06. */
export function tierCost(tier: Tier, ownedCount: number, k = 1): number {
  // toPrecision drops float dust (500 × 1.6² is 1280.0000000000002, not 1,281).
  // A sweep multiplies the sticker and the growth. Both factors are 1 in play.
  const workerCurve = tier.staff === 0;
  const base = workerCurve ? HELPER_COST_GROWTH : MACHINE_COST_GROWTH;
  const growth =
    base * factor(workerCurve ? "growth.worker" : "growth.machine");
  const first = tier.firstCost * factor(`price.${tier.id}`) * k;
  return Math.ceil(Number((first * growth ** ownedCount).toPrecision(12)));
}

/** Pays for one of the tier from the pocket; unaffordable returns the same mountain. */
export function buyTier(mountain: Mountain, id: TierId): Mountain {
  const tier = tierById(id);
  const count = owned(mountain, tier);
  const cost = tierCost(tier, count, stretch(mountain));
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
