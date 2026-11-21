import { factor } from "./economy/factors";
import type { Stage } from "./line";
import type { Mountain } from "./mountain";
import { partThreeOn, slice2Part1On } from "./part-switch";
import { pay, type GoodId, type Price } from "./stock";

/** All tier numbers live here. See docs/DESIGN.md "M2: Automation". */
/** #357: workers climb ×1.06 a unit, and kids share the curve. */
export const HELPER_COST_GROWTH = 1.06;

/** #767 / #757: worker curve in Slice 2 Part 1 balancing machines vs bare hands and 8-worker borers/locomotives. */
const SLICE_2_HELPER_COST_GROWTH = 1.058;

/**
 * On the line (#543): machines climb ×1.219 a unit (the old ×1.15 times
 * 1.06), so a casual dad's run takes at least five days
 * with machines rated three times today's. Workers keep today's curve: a
 * steeper one priced the 200th worker of a late kid run like a Great
 * Machine, and the optimizer stalled for a month.
 */
export const LINE_MACHINE_COST_GROWTH = 1.219;

/**
 * First prices that differ on the line (#543). A worker is 60, three times
 * today's: it keeps the optimizer within a quarter of the evening dad's run
 * (regret) without the steeper worker curve that stalled late kid runs. It
 * costs the opening: the first ten minutes mine about 42K, not 247K. The Great
 * Machine is 0.8 of today's, so a checker's best buy is in reach within two
 * check-ins.
 */
const LINE_FIRST_COST: Readonly<Partial<Record<TierId, number>>> = {
  helper: 60,
  machine: 96_480_000,
};
/**
 * Part 3's first prices (#673): the borer and the locomotive cost cut stone,
 * on the line's curve. With part 3 off they cost what they did.
 */
const PART_THREE_PRICE: Readonly<
  Partial<Record<TierId, { readonly good: GoodId; readonly first: number }>>
> = {
  borer: { good: "cutStone", first: 40_000 },
  train: { good: "cutStone", first: 60_000 },
};

/** Slice 2 Part 1 (#767 / #757): borer and locomotive cut-stone prices tuned so both earn their keep on Granite. */
const SLICE_2_PART_THREE_PRICE: Readonly<
  Partial<Record<TierId, { readonly good: GoodId; readonly first: number }>>
> = {
  borer: { good: "cutStone", first: 12_000 },
  train: { good: "cutStone", first: 15_000 },
};

/** The good a tier is paid in: cut stone for the borer and the locomotive in part 3, else stones. */
export function tierGood(id: TierId): GoodId {
  const table = slice2Part1On()
    ? SLICE_2_PART_THREE_PRICE
    : partThreeOn()
      ? PART_THREE_PRICE
      : undefined;
  return table?.[id]?.good ?? "stones";
}

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
};

/** Cheapest first. Each tier is 6–10× the speed of the last. */
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
  },
  {
    // The haul's second machine (M15, #533): 3,200 at the line's ×3, about
    // 1,067 in today's units. Opens at the Crystal Caves.
    id: "train",
    // On screen the locomotive (the slice 1 spec's Names, #680); the id stays "train".
    name: "Locomotive",
    shortName: "Locomotive",
    firstCost: 30_000_000,
    perSecond: 1_067,
    staff: 8,
    stage: "haul",
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
  },
  {
    // Kids mine, staff machines, and teach the crew (rates.ts).
    id: "kid",
    name: "Kid worker",
    shortName: "Kid",
    firstCost: KID_FIRST_COST,
    perSecond: 25,
    staff: 0,
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

export function isShownTier<T extends TierId>(
  id: T,
): id is Exclude<T, LineTierId> {
  return id !== "hoist" && id !== "train";
}

/**
 * The workers each machine takes from part 3 (rule 2.14, #675), where it
 * differs from its row: a drill takes three, so a line in balance has the
 * most workers on drilling. A sweep scales it with `staff.<id>`.
 */
const PART_THREE_STAFF: Readonly<Partial<Record<TierId, number>>> = {
  drill: 3,
};

/** The workers a machine takes: its row's, and part 3's where the stages are set apart. 0 for a worker or a kid. */
export function machineStaff(tier: Pick<Tier, "id" | "staff">): number {
  if (tier.staff === 0 || !partThreeOn()) {
    return tier.staff;
  }
  const staff = PART_THREE_STAFF[tier.id] ?? tier.staff;
  return Math.max(1, Math.round(staff * factor(`staff.${tier.id}`)));
}

export function isMachine(
  tier: Tier,
): tier is Tier & { readonly id: MachineId } {
  return tier.staff > 0;
}

/**
 * The machines, in tier order: every staffed tier. The one list the lab reads
 * (bands, report), so a new machine tier joins it (#388).
 */
export const MACHINE_IDS: readonly MachineId[] = TIERS.filter(isMachine).map(
  (tier) => tier.id,
);

/**
 * The machines in play: `MACHINE_IDS` whose door is open in the fresh mine
 * (`tierInPlay`). What the lab measures and reports (#533; until #739 it
 * also left out the line's machines while the line was off).
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

/** A tier's first price in the line: Slice 2 Part 1's, else part 3's, else the line's, else its own. */
function lineSticker(tier: Tier): number {
  const partThree = slice2Part1On()
    ? SLICE_2_PART_THREE_PRICE[tier.id]
    : partThreeOn()
      ? PART_THREE_PRICE[tier.id]
      : undefined;
  return partThree?.first ?? LINE_FIRST_COST[tier.id] ?? tier.firstCost;
}

/** Cookie Clicker curve: machines climb ×1.15, helpers ×1.06 (×1.058 in Slice 2 Part 1). */
export function tierCost(tier: Tier, ownedCount: number): number {
  // toPrecision drops float dust (500 × 1.6² is 1280.0000000000002, not 1,281).
  // A sweep multiplies the sticker and the growth. Both factors are 1 in play.
  const workerCurve = tier.staff === 0;
  const base = workerCurve
    ? slice2Part1On()
      ? SLICE_2_HELPER_COST_GROWTH
      : HELPER_COST_GROWTH
    : LINE_MACHINE_COST_GROWTH;
  const growth =
    base * factor(workerCurve ? "growth.worker" : "growth.machine");
  const first = lineSticker(tier) * factor(`price.${tier.id}`);
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
  return quoteRun(
    (nth) => tierCost(tier, count + nth),
    amount,
    mountain.stock[tierGood(tier.id)],
  );
}

/**
 * The amount key's one rule for every key that buys (#715): `costAt(n)` is
 * what the nth one more costs (0 is the next). ×10 is ten, affordable or
 * not. Max is as many as `pocket` holds, and one, at its price, when it
 * holds none.
 */
export function quoteRun(
  costAt: (nth: number) => number,
  amount: BuyAmount,
  pocket: number,
): TierQuote {
  let bought = 1;
  let cost = costAt(0);
  const more =
    amount === "ten"
      ? () => bought < 10
      : amount === "max"
        ? () => cost + costAt(bought) <= pocket
        : () => false;
  while (more()) {
    cost += costAt(bought);
    bought += 1;
  }
  return { count: bought, cost };
}

/** The next one of the tier, as a price (#560): in stones, or cut stone in part 3 (#673). */
function tierPrice(mountain: Mountain, id: TierId): Price {
  return [
    { good: tierGood(id), amount: tierCost(tierById(id), mountain.owned[id]) },
  ];
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
  | { readonly kind: "later"; readonly at: "granite" | "foundry" | "school" };

/**
 * Nothing gates a machine but its price and where it opens (rule 2.6,
 * #689): the cart, the hoist and the drill are for sale from the first
 * evening, before anyone can run them.
 */
const FRESH_DOORS: Readonly<Record<TierId, FreshDoor>> = {
  helper: { kind: "start" },
  cart: { kind: "start" },
  hoist: { kind: "start" },
  drill: { kind: "start" },
  // The locomotive and the borer open with the Granite (part 3).
  borer: { kind: "later", at: "granite" },
  train: { kind: "later", at: "granite" },
  // The old Great Machine (the winding engine) never opens: it is out of
  // the game (Flemming, 16 Nov 2026, `docs/decisions.md`).
  machine: { kind: "later", at: "foundry" },
  // Kid workers wait for the School, a later slice.
  kid: { kind: "later", at: "school" },
};

/** This tier's door in a fresh mine. */
export function freshDoor(id: TierId): FreshDoor {
  return FRESH_DOORS[id];
}

/**
 * False for a tier whose door is a later part's (#653): it is never shown,
 * never for sale, takes no hands and moves nothing. The Granite's opens
 * while part 3 plays (#673). Every tier in play is shown from the first
 * minute, with what its door waits for (`tierLock`).
 */
export function tierInPlay(tier: Tier): boolean {
  const door = FRESH_DOORS[tier.id];
  return door.kind !== "later" || (door.at === "granite" && partThreeOn());
}
