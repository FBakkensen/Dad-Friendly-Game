import { BAND_STARTS, stretch } from "./scale";
import { factor } from "./economy/factors";
import type { Stage } from "./line";
import type { Mountain } from "./mountain";
import type { RelicId } from "./relics";
import { pay, stonesPrice, type Price } from "./stock";

/** All tier numbers live here. See docs/DESIGN.md "M2: Automation". */
/**
 * The line (#543, on in play since #536): machines climb ×1.219 a unit (the
 * old ×1.15 times 1.06), so a casual dad's run takes at least five days with
 * machines rated three times the old. Workers keep ×1.06 (#357), and kids
 * share their curve: a steeper one priced the 200th worker of a late kid run
 * like a Great Machine, and the optimizer stalled for a month.
 */
export const MACHINE_COST_GROWTH = 1.219;
/** #357: workers climb ×1.06 a unit, and kids share the curve. */
export const HELPER_COST_GROWTH = 1.06;
/**
 * Kids follow the workers' curve from a late-game price. #327: cheap and
 * quick enough (25/s) that one pays back in hours, not days.
 */
const KID_FIRST_COST = 250_000;

/** A row of the tier table: one thing he can own and buy in Buys. */
type TierRow = {
  readonly id: string;
  readonly name: string;
  /** For the compact, three-to-a-row card. */
  readonly shortName: string;
  /** Stones the first one costs. */
  readonly firstCost: number;
  /** Stones a second each one mines. */
  readonly perSecond: number;
  /** Helpers it takes to run one; without them it sits idle (see rates.ts). */
  readonly staff: number;
  /**
   * The line's stage a machine works (M15, #532; the rule is in
   * src/line.ts). Every machine has one; the hands have none.
   */
  readonly stage?: Stage;
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
const TIER_ROWS = [
  {
    id: "helper",
    name: "Worker",
    shortName: "Worker",
    // #543: three times the old 20, so the optimizer stays within a quarter
    // of the evening dad's run. The first ten minutes mine about 42K.
    firstCost: 60,
    perSecond: 1,
    staff: 0,
  },
  {
    id: "cart",
    name: "Mine cart",
    shortName: "Cart",
    // #357 tune: dearer again, so the cart's marks do not crowd out the borer.
    firstCost: 600,
    perSecond: 6,
    staff: 1,
    stage: "haul",
  },
  {
    // The lift's first machine (M15, #533): 60 a second at the line's ×3
    // (rule 3, `lineRating`). Shown once a cart is owned.
    id: "hoist",
    name: "Hoist",
    shortName: "Hoist",
    firstCost: 6_000,
    perSecond: 20,
    staff: 1,
    stage: "lift",
  },
  {
    id: "drill",
    name: "Steam drill",
    shortName: "Drill",
    // #357 tune: dearer, with the cart, yet cheap enough that a 2-minute
    // check-in still buys one in the Topsoil.
    firstCost: 73_080,
    perSecond: 36,
    staff: 1,
    stage: "face",
  },
  {
    id: "borer",
    name: "Tunnel borer",
    shortName: "Borer",
    // #356 tune: cheap enough that every casual dad buys one early in the
    // Granite, and the run stays close for the marathon and the evening dad.
    firstCost: 4_940_000,
    perSecond: 357,
    staff: 8,
    stage: "face",
    // Opens at the Granite start, the band that suits borers (D3), so no
    // dad meets it in the Topsoil (#356).
    opensAt: BAND_STARTS[1],
  },
  {
    // The haul's second machine (M15, #533): about 3,200 a second at the
    // line's ×3. Opens at the Crystal Caves.
    id: "train",
    name: "Pit train",
    shortName: "Train",
    firstCost: 30_000_000,
    perSecond: 1_067,
    staff: 8,
    stage: "haul",
    opensAt: BAND_STARTS[2],
  },
  {
    id: "machine",
    name: "Great Machine",
    shortName: "Machine",
    // #543: 0.8 of the old 120,600,000, so a checker's best buy is in reach
    // within two check-ins.
    firstCost: 96_480_000,
    perSecond: 2_100,
    staff: 10,
    stage: "lift",
    needs: "hammer",
    // M12 retune (#252): the Deep Heart entrance, the band that suits it.
    opensAt: 120_000_000,
  },
  {
    // Crown of Wisdom: kids mine, staff machines, and teach the crew (rates.ts).
    id: "kid",
    name: "Kid worker",
    shortName: "Kid",
    firstCost: KID_FIRST_COST,
    perSecond: 25,
    staff: 0,
    needs: "crown",
  },
] as const satisfies readonly TierRow[];

/** Every id he can own: the table's, so a typo is a type error. */
export type TierId = (typeof TIER_ROWS)[number]["id"];

export type Tier = Omit<TierRow, "id"> & { readonly id: TierId };

export const TIERS: readonly Tier[] = TIER_ROWS;

/** The table's ids, in its order. */
export const TIER_IDS: readonly TierId[] = TIERS.map((tier) => tier.id);

/** A tier that works a stage of the line and takes helpers to run: every machine. */
export type MachineId = Extract<
  (typeof TIER_ROWS)[number],
  { readonly stage: Stage }
>["id"];

/**
 * The machines of the line (#533). On sale in Buys and offered by Ready now
 * since #536; the machine bays show them from #537, the stage bays.
 */
export type LineTierId = "hoist" | "train";

/** A machine the bays show until the stage bays (#537). */
export type ShownMachineId = Exclude<MachineId, LineTierId>;

export function isShownTier<T extends TierId>(
  id: T,
): id is Exclude<T, LineTierId> {
  return id !== "hoist" && id !== "train";
}

export function isMachine(
  tier: Tier,
): tier is Tier & { readonly id: MachineId } {
  return tier.staff > 0;
}

/**
 * The machines, in tier order: every staffed tier. The one list the lab reads
 * (bands, generations, report), so a new machine tier joins it (#388).
 */
export const MACHINE_IDS: readonly MachineId[] = TIERS.filter(isMachine).map(
  (tier) => tier.id,
);

/** A complete record over the tier ids, every entry `value`. */
export function tierRecord<T>(value: T): Record<TierId, T> {
  return Object.fromEntries(TIER_IDS.map((id) => [id, value])) as Record<
    TierId,
    T
  >;
}

/** A complete record over the machine ids, every entry `value`. */
export function machineRecord<T>(value: T): Record<MachineId, T> {
  return Object.fromEntries(MACHINE_IDS.map((id) => [id, value])) as Record<
    MachineId,
    T
  >;
}

export function tierById(id: TierId): Tier {
  const tier = TIERS.find((candidate) => candidate.id === id);
  if (tier === undefined) {
    throw new Error(`Unknown tier ${id}`);
  }
  return tier;
}

export function owned(mountain: Mountain, tier: Tier): number {
  return mountain.owned[tier.id];
}

/** The mountain with `count` of one tier owned, every other count kept. */
export function setOwned(
  mountain: Mountain,
  id: TierId,
  count: number,
): Mountain {
  return { ...mountain, owned: { ...mountain.owned, [id]: count } };
}

/** Cookie Clicker curve: machines climb ×1.219, helpers ×1.06. */
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

/** How many a Buys tap buys (#358): one, exactly ten, or as many as the pocket holds. */
export type BuyAmount = "one" | "ten" | "max";

/** A count of one tier and what they cost together. */
export type TierQuote = { readonly count: number; readonly cost: number };

/**
 * What `amount` of a tier costs now: the sum of `tierCost` unit by unit, the price `buyTier`
 * charges for each in turn. ×10 is ten, affordable or not. Max is as many as the pocket holds,
 * and one, at its price, when it holds none.
 */
export function tierQuote(
  mountain: Mountain,
  tier: Tier,
  amount: BuyAmount,
): TierQuote {
  const count = owned(mountain, tier);
  const k = stretch(mountain);
  const first = tierCost(tier, count, k);
  if (amount === "one") {
    return { count: 1, cost: first };
  }
  let bought = 1;
  let cost = first;
  const enough =
    amount === "ten"
      ? () => bought >= 10
      : () => cost + tierCost(tier, count + bought, k) > mountain.stock.stones;
  while (!enough()) {
    cost += tierCost(tier, count + bought, k);
    bought += 1;
  }
  return { count: bought, cost };
}

/** The next one of the tier, as a price (#560). Every tier is priced in stones. */
function tierPrice(mountain: Mountain, id: TierId): Price {
  return stonesPrice(
    tierCost(tierById(id), mountain.owned[id], stretch(mountain)),
  );
}

/** Pays for one of the tier from the stock; unaffordable returns the same mountain. */
export function buyTier(mountain: Mountain, id: TierId): Mountain {
  const paid = pay(mountain, tierPrice(mountain, id));
  return paid === mountain
    ? mountain
    : setOwned(paid, id, mountain.owned[id] + 1);
}

/** Each tier's previous tier in the table: the machine chain a tier is shown by. */
const PREVIOUS: ReadonlyMap<TierId, Tier | undefined> = new Map(
  TIERS.map((tier, index) => [tier.id, TIERS[index - 1]]),
);

/**
 * The cart is shown once he owns this many workers (#536): then it adds its
 * full +6 a second to the line, since twelve hands dig, carry and lift 12 a
 * second and a cart rated 18 frees the hands that carried.
 */
export const CART_SHOWN_AT = 12;

/**
 * A tier appears once you own one, or own one of the tier before it, so a
 * hoist follows the cart and a drill the hoist. The cart waits for
 * `CART_SHOWN_AT` workers, so a first buy never reads +0.
 */
export function tierShown(mountain: Mountain, tier: Tier): boolean {
  if (tier.id === "helper" || owned(mountain, tier) > 0) {
    return true;
  }
  if (tier.id === "cart") {
    return mountain.owned.helper >= CART_SHOWN_AT;
  }
  const previous = PREVIOUS.get(tier.id);
  return previous !== undefined && owned(mountain, previous) > 0;
}
