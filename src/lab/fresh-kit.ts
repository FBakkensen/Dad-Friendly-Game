import { buildingById, nextBuilding, resumeOrder } from "../city";
import { applyAction, helperBill, type Action } from "../economy/actions";
import { activeFactors } from "../economy/factors";
import { steadyIncome, steadyLevels } from "../mine-piles";
import type { MineLevelId } from "../mine-levels";
import type { Mountain } from "../mountain";
import { GOOD_IDS, type GoodId, type Price, type Stock } from "../stock";
import { secondsToFinish } from "../transport";
import type { JobId } from "../workforce";
import { AT_ONCE, FRESH_DUST } from "./targets";

/**
 * What every fresh dad's planner works with (slice 1, Lab, #655, #675): a
 * plan, a mine to try it on, what it costs in each good, and what it does
 * for the building in hand. `fresh-dad` plays parts 1 and 2 with these, and
 * `fresh-levels` the levels of part 3.
 */

/** Moves that go together, applied in order. Empty: nothing to do now. */
export type Plan = readonly Action[];

/** One buy with its stones: a plan and what it costs. */
export type Priced = { readonly plan: Plan; readonly cost: number };

/**
 * What the mine brings of each good a second at full output: the running
 * kilns and saws take their rock first and make their good of it, and the
 * rest is stone (rule 3, #666, #675). The chain's own split
 * (`steadyIncome`), so the dad plans on what the mine does.
 */
export const goodsIncome: (mountain: Mountain) => Partial<Stock> =
  perMountain(steadyIncome);

/** Each level's stages at full output (`steadyLevels`), read once a mountain. */
export const levelsRates: typeof steadyLevels = perMountain(steadyLevels);

/**
 * A reading of a mountain, kept per mountain: a mountain is never changed in
 * place, and the dad weighs the same one many times a second (#675). The
 * sweep's factors are part of the answer, so another map reads again (as
 * `effectiveRates` keeps its rates).
 */
function perMountain<T>(
  read: (mountain: Mountain) => T,
): (mountain: Mountain) => T {
  const kept = new WeakMap<
    Mountain,
    { readonly factors: ReturnType<typeof activeFactors>; readonly value: T }
  >();
  return (mountain) => {
    const factors = activeFactors();
    const hit = kept.get(mountain);
    if (hit !== undefined && hit.factors === factors) {
      return hit.value;
    }
    const value = read(mountain);
    kept.set(mountain, { factors, value });
    return value;
  };
}

/** As much of every good as anything costs. */
const RICH = Number.MAX_SAFE_INTEGER;

/** A copy with a pocket that pays for anything, to try a plan on. */
export function funded(mountain: Mountain): Mountain {
  const stock: Record<GoodId, number> = { ...mountain.stock };
  for (const good of GOOD_IDS) {
    stock[good] = RICH;
  }
  return { ...mountain, stock };
}

export function applied(mountain: Mountain, plan: Plan): Mountain {
  let next = mountain;
  for (const action of plan) {
    next = applyAction(next, action, 0);
  }
  return next;
}

/** What the next worker costs. */
export function hirePrice(mountain: Mountain): number {
  return helperBill(mountain, 1);
}

/** Hire one and put him on `job`, or put a free one there. */
export function staffed(mountain: Mountain, job: JobId, free: number): Priced {
  return free > 0
    ? { plan: [{ kind: "placeWorker", job, count: 1 }], cost: 0 }
    : {
        plan: [
          { kind: "buyTier", id: "helper" },
          { kind: "placeWorker", job, count: 1 },
        ],
        cost: hirePrice(mountain),
      };
}

/** Seconds until the building is up if the order delivered from now, at what the mine brings of each good. */
export const buildingSeconds: (mountain: Mountain) => number = perMountain(
  (mountain) =>
    secondsToFinish(resumeOrder(mountain), 1, goodsIncome(mountain)),
);

/**
 * What a plan costs in each good (#675): what it takes from a pocket that
 * pays for anything, applied move by move, so each machine is priced after
 * the one before it. A move the rules refuse costs nothing.
 */
export function planPrice(mountain: Mountain, plan: Plan): Price {
  const rich = funded(mountain);
  const after = applied(rich, plan);
  return GOOD_IDS.flatMap((good) => {
    const amount = rich.stock[good] - after.stock[good];
    return amount > 0 ? [{ good, amount }] : [];
  });
}

/** The pocket holds `hoardK` times each good of the price. */
export function coversPrice(
  mountain: Mountain,
  price: Price,
  hoardK: number,
): boolean {
  return price.every(
    (line) => mountain.stock[line.good] >= line.amount * Math.max(1, hoardK),
  );
}

/**
 * Goods the building in hand (or the next) still requires in its steps to
 * come. A good it does not require is spare: what the pocket holds of it
 * buys at no cost to the order (#675).
 */
export function goodsAhead(mountain: Mountain): ReadonlySet<GoodId> {
  const project = mountain.project;
  const building =
    project.kind === "unordered"
      ? nextBuilding(mountain)
      : buildingById(project.site.building);
  if (building === undefined) {
    return new Set();
  }
  const from = project.kind === "unordered" ? 0 : project.site.step;
  return new Set(
    building.steps
      .slice(from)
      .flatMap((price) =>
        price.filter((line) => line.amount > 0).map((line) => line.good),
      ),
  );
}

/**
 * Seconds the mine takes to make a price at what it brings now, good by
 * good, added up: Infinity when it makes none of a good the price asks for.
 * A spare good (`goodsAhead`), or one the mine makes none of now, counts
 * only what the pocket lacks of it.
 */
export function earnSeconds(mountain: Mountain, price: Price): number {
  const income = goodsIncome(mountain);
  const ahead = goodsAhead(mountain);
  let seconds = 0;
  for (const line of price) {
    const rate = income[line.good] ?? 0;
    const made = rate > FRESH_DUST;
    const amount =
      ahead.has(line.good) && made
        ? line.amount
        : Math.max(0, line.amount - mountain.stock[line.good]);
    if (amount <= 0) {
      continue;
    }
    seconds += made ? amount / rate : Infinity;
  }
  return seconds;
}

/** The mountain with `price` added to its pocket. */
function withPocket(mountain: Mountain, price: Price): Mountain {
  const stock: Record<GoodId, number> = { ...mountain.stock };
  for (const line of price) {
    stock[line.good] += line.amount;
  }
  return { ...mountain, stock };
}

/**
 * A plan weighed for the building (#675): the seconds sooner the building is
 * up if he buys it out of the pocket (its price added to the pocket first,
 * so buying it must beat keeping the goods for the order), and the seconds
 * the mine takes to make its price. Infinity saved when the building cannot
 * finish without it and can with it. `covered` when the pocket holds its
 * price now.
 */
export type Weighed = {
  readonly plan: Plan;
  readonly price: Price;
  readonly saved: number;
  readonly earn: number;
  readonly covered: boolean;
};

export function weighed(mountain: Mountain, plan: Plan): Weighed {
  const price = planPrice(mountain, plan);
  const rich = withPocket(mountain, price);
  const bought = applied(rich, plan);
  const before = buildingSeconds(rich);
  const after = buildingSeconds(bought);
  // While the building cannot finish as the mine stands (a level nobody
  // works), what a plan can bring sooner is the goods the mine makes.
  const saved =
    before === Infinity && after === Infinity
      ? secondsSooner(madeSeconds(rich), madeSeconds(bought))
      : secondsSooner(before, after);
  return {
    plan,
    price,
    saved,
    earn: earnSeconds(mountain, price),
    covered: coversPrice(mountain, price, 1),
  };
}

/** Seconds sooner: Infinity when only `after` can finish, none when neither can. */
function secondsSooner(before: number, after: number): number {
  if (before === Infinity) {
    return after === Infinity ? 0 : Infinity;
  }
  return Math.max(0, before - after);
}

/** The level whose rock makes a good, for the goods a level's maker makes. */
const GOOD_LEVEL: Readonly<Partial<Record<GoodId, MineLevelId>>> = {
  brick: "topsoil",
  cutStone: "granite",
};

/** Seconds until the building is up as `buildingSeconds`, with the goods of a level that lifts nothing coming at once. */
function madeSeconds(mountain: Mountain): number {
  const income: Partial<Record<GoodId, number>> = { ...goodsIncome(mountain) };
  const levels = levelsRates(mountain);
  for (const good of goodsAhead(mountain)) {
    const level = GOOD_LEVEL[good];
    const rates = level === undefined ? undefined : levels[level];
    if (
      rates !== undefined &&
      Math.min(rates.face, rates.haul, rates.lift) <= FRESH_DUST
    ) {
      income[good] = AT_ONCE;
    }
  }
  return secondsToFinish(resumeOrder(mountain), 1, income);
}

/**
 * It brings the building sooner by more than the mine takes to make its
 * price; or the building cannot finish without it and the pocket holds its
 * price, though the mine makes none of a good it costs (a saw's brick with
 * nobody on the Topsoil).
 */
export function pays(weigh: Weighed): boolean {
  if (weigh.saved === Infinity) {
    return weigh.covered || Number.isFinite(weigh.earn);
  }
  return (
    Number.isFinite(weigh.earn) &&
    weigh.saved > FRESH_DUST &&
    weigh.saved >= weigh.earn
  );
}

/** Seconds saved per second of income spent, a second at least: what the dad ranks plans by. Infinity for a plan the building cannot finish without. */
export function worth(weigh: Weighed): number {
  return weigh.saved === Infinity
    ? Infinity
    : weigh.saved / Math.max(1, weigh.earn);
}
