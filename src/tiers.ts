import { BAND_STARTS, stretch } from "./scale";
import { factor } from "./economy/factors";
import { freshMineOn, lineOn } from "./line-switch";
import type { Stage } from "./line";
import type { Mountain } from "./mountain";
import type { RelicId } from "./relics";
import { pay, stonesPrice, type Price } from "./stock";

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
 * On the line (#543, labs only until #536): machines climb ×1.219 a unit
 * (today's ×1.15 times 1.06), so a casual dad's run takes at least five days
 * with machines rated three times today's. Workers keep today's curve: a
 * steeper one priced the 200th worker of a late kid run like a Great
 * Machine, and the optimizer stalled for a month.
 */
export const LINE_MACHINE_COST_GROWTH = 1.219;

/**
 * First prices that differ on the line (#543). A worker is 60, three times
 * today's: it keeps the optimizer within a quarter of the evening dad's run
 * (regret) without the steeper worker curve that stalled late kid runs. It
 * costs the opening: the first ten minutes mine about 42K, not 247K, and the
 * Hammer comes half a day later (the Lantern does not move). The Great
 * Machine is 0.8 of today's, so a checker's best buy is in reach within two
 * check-ins.
 */
const LINE_FIRST_COST: Readonly<Partial<Record<TierId, number>>> = {
  helper: 60,
  machine: 96_480_000,
};
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
  /**
   * A machine of the line (M15, #533): on sale and running only where the
   * line's rule is on (`lineOn`, src/line-switch.ts). Off in play until #536.
   */
  readonly line?: true;
};

/** Cheapest first. Each tier is 6–10× the speed of the last; tuned by src/pacing.test.ts. */
const TIER_ROWS = [
  {
    id: "helper",
    name: "Worker",
    shortName: "Worker",
    firstCost: 20,
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
    // The lift's first machine (M15, #533). The spec rates it 60 at the
    // line's ×3 (rule 3); 20 is that in today's units, which #534 moves
    // with every other machine. Shown once a cart is owned.
    id: "hoist",
    name: "Hoist",
    shortName: "Hoist",
    firstCost: 6_000,
    perSecond: 20,
    staff: 1,
    stage: "lift",
    line: true,
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
    // The haul's second machine (M15, #533): 3,200 at the line's ×3, about
    // 1,067 in today's units. Opens at the Crystal Caves.
    id: "train",
    name: "Pit train",
    shortName: "Train",
    firstCost: 30_000_000,
    perSecond: 1_067,
    staff: 8,
    stage: "haul",
    opensAt: BAND_STARTS[2],
    line: true,
  },
  {
    id: "machine",
    name: "Great Machine",
    shortName: "Machine",
    // #357 tune: three times dearer, so its marks at 2/3/5/10 do not let the
    // marathon dad finish ahead of the casual dad.
    firstCost: 120_600_000,
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
 * The machines of the line (#533). Off in play, so no screen shows them
 * yet: the stage bays and Buys by stage (#537, #538) widen the screens.
 */
export type LineTierId = "hoist" | "train";

/** A tier the screens show today. */
export type ShownTierId = Exclude<TierId, LineTierId>;

/** A machine the screens show today. */
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

/**
 * The machines in play: `MACHINE_IDS` less the line's machines while the
 * line is off (#533). What the lab measures and reports, so a run with the
 * line off reads as before.
 */
export function machinesInPlay(): readonly MachineId[] {
  return MACHINE_IDS.filter((id) => tierInPlay(tierById(id)));
}

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

/** Cookie Clicker curve: machines climb ×1.15, helpers ×1.06. */
export function tierCost(tier: Tier, ownedCount: number, k = 1): number {
  // toPrecision drops float dust (500 × 1.6² is 1280.0000000000002, not 1,281).
  // A sweep multiplies the sticker and the growth. Both factors are 1 in play.
  const workerCurve = tier.staff === 0;
  const line = lineOn();
  const base = workerCurve
    ? HELPER_COST_GROWTH
    : line
      ? LINE_MACHINE_COST_GROWTH
      : MACHINE_COST_GROWTH;
  const growth =
    base * factor(workerCurve ? "growth.worker" : "growth.machine");
  const sticker = line
    ? (LINE_FIRST_COST[tier.id] ?? tier.firstCost)
    : tier.firstCost;
  const first = sticker * factor(`price.${tier.id}`) * k;
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

/**
 * What opens a tier in a fresh mine (slice 1, rule 1's table, #653): it is
 * there from the start, it opens once he owns enough of another tier, or its
 * door is a later part's (the Granite, the Foundry, the School).
 */
export type FreshDoor =
  | { readonly kind: "start" }
  | { readonly kind: "owns"; readonly tier: TierId; readonly count: number }
  | { readonly kind: "later"; readonly at: "granite" | "foundry" | "school" };

/** Workers he owns before the first cart opens in a fresh mine (the line spec). */
export const CART_OPENS_AT_WORKERS = 12;

const FRESH_DOORS: Readonly<Record<TierId, FreshDoor>> = {
  helper: { kind: "start" },
  cart: { kind: "owns", tier: "helper", count: CART_OPENS_AT_WORKERS },
  hoist: { kind: "owns", tier: "cart", count: 1 },
  drill: { kind: "owns", tier: "hoist", count: 1 },
  // The locomotive and the borer open with the Granite (part 3).
  borer: { kind: "later", at: "granite" },
  train: { kind: "later", at: "granite" },
  // The winding engine, once the Foundry is operational (part 3).
  machine: { kind: "later", at: "foundry" },
  // Kid workers wait for the School, a later slice.
  kid: { kind: "later", at: "school" },
};

/** This tier's door in a fresh mine. */
export function freshDoor(id: TierId): FreshDoor {
  return FRESH_DOORS[id];
}

/**
 * False for a machine of the line while the line's rule is off (#533): it is
 * never shown, never for sale, takes no hands and moves nothing. In a fresh
 * mine, false for a tier whose door is a later part's (#653).
 */
export function tierInPlay(tier: Tier): boolean {
  if (freshMineOn()) {
    return FRESH_DOORS[tier.id].kind !== "later";
  }
  return tier.line !== true || lineOn();
}

/** Each tier's previous tier in play, with the line off and on (#533). */
function previousTiers(
  inPlay: (tier: Tier) => boolean,
): ReadonlyMap<TierId, Tier | undefined> {
  return new Map(
    TIERS.map((tier, index) => [
      tier.id,
      TIERS.slice(0, index).filter(inPlay).at(-1),
    ]),
  );
}

const PREVIOUS = {
  off: previousTiers((tier) => tier.line !== true),
  on: previousTiers(() => true),
} as const;

/**
 * A tier appears once you own one, or own one of the tier in play before
 * it. With the line off the hoist is skipped, so the drill follows the cart.
 * In a fresh mine every tier in play is shown (#653).
 */
export function tierShown(mountain: Mountain, tier: Tier): boolean {
  if (!tierInPlay(tier)) {
    return false;
  }
  // A fresh mine shows each machine in play from the first minute, with what
  // its door waits for (`tierLock`), as the prototype's stage plates do.
  if (freshMineOn()) {
    return true;
  }
  const previous = (lineOn() ? PREVIOUS.on : PREVIOUS.off).get(tier.id);
  return (
    tier.id === "helper" ||
    owned(mountain, tier) > 0 ||
    (previous !== undefined && owned(mountain, previous) > 0)
  );
}
