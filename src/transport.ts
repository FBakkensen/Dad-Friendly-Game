import {
  SITE_HOLDS,
  buildRate,
  buildSeconds,
  goodsTotal,
  onSiteTotal,
  stepWork,
} from "./building-site";
import {
  buildIn,
  receive,
  siteAfter,
  stillRequired,
  stillToBuild,
  type Site,
} from "./city";
import type { Mountain } from "./mountain";
import { quoteRun, type BuyAmount, type TierQuote } from "./tiers";
import { GOOD_IDS, pay, type GoodId, type Price, type Stock } from "./stock";

/**
 * Transport (slice 1, rule 7, #654): one fleet with one number. It carries
 * what he ordered from the pocket to the site, at goods a second, and only
 * what the step in hand still requires. A vehicle is bought like a machine.
 * It takes no workers, and there are no routes and nothing to dispatch.
 */

type VehicleRow = {
  readonly id: string;
  readonly name: string;
  /** The good its price is in. */
  readonly good: GoodId;
  /** What the first one bought costs. */
  readonly firstCost: number;
  readonly growth: number;
  /** Goods a second one carries. */
  readonly carries: number;
  /** How many a fresh mine is given. They are not on the price curve. */
  readonly given: number;
};

/**
 * In the order they open. Part 1 has horse wagons; trucks cost brick and
 * come with parts 2 and 3. The spec's starting numbers, for the lab (#655).
 */
const VEHICLE_ROWS = [
  {
    id: "horseWagon",
    name: "Horse wagon",
    good: "stones",
    firstCost: 500,
    growth: 1.219,
    // Set by the lab (#655): under half of what a fresh mine's line moves at
    // the start (18), so an order placed in the first minute leaves him
    // stones to buy with (risk 4).
    carries: 9,
    given: 1,
  },
] as const satisfies readonly VehicleRow[];

export type VehicleId = (typeof VEHICLE_ROWS)[number]["id"];

export type Vehicle = Omit<VehicleRow, "id"> & { readonly id: VehicleId };

export const VEHICLES: readonly Vehicle[] = VEHICLE_ROWS;

export const VEHICLE_IDS: readonly VehicleId[] = VEHICLES.map(
  (vehicle) => vehicle.id,
);

/** A complete record over the vehicle ids, every entry `value`. */
export function vehicleRecord<T>(value: T): Record<VehicleId, T> {
  return Object.fromEntries(VEHICLE_IDS.map((id) => [id, value])) as Record<
    VehicleId,
    T
  >;
}

/** The fleet a fresh mine starts with: each vehicle's given count. */
export function givenFleet(): Record<VehicleId, number> {
  return Object.fromEntries(
    VEHICLES.map((vehicle) => [vehicle.id, vehicle.given]),
  ) as Record<VehicleId, number>;
}

const VEHICLE_BY_ID = Object.fromEntries(
  VEHICLES.map((vehicle) => [vehicle.id, vehicle]),
) as Record<VehicleId, Vehicle>;

function vehicleById(id: VehicleId): Vehicle {
  return VEHICLE_BY_ID[id];
}

/** The best carriers first: the drivers take the trucks first (rule 2.7). */
const BY_LOAD: readonly Vehicle[] = [...VEHICLES].sort(
  (a, b) => b.carries - a.carries,
);

/**
 * The vehicles that run: each with one driver (slice 1, rule 2.7, #689),
 * the best carriers first. One with nobody on it is idle, not lost.
 */
export function drivenFleet(
  mountain: Pick<Mountain, "fleet" | "jobs">,
): Record<VehicleId, number> {
  const driven = vehicleRecord(0);
  let drivers = mountain.jobs.driving;
  for (const vehicle of BY_LOAD) {
    driven[vehicle.id] = Math.min(mountain.fleet[vehicle.id], drivers);
    drivers -= driven[vehicle.id];
  }
  return driven;
}

/** Vehicles he owns, of every kind. */
export function fleetSize(mountain: Pick<Mountain, "fleet">): number {
  return VEHICLE_IDS.reduce((total, id) => total + mountain.fleet[id], 0);
}

/** Goods a second the vehicles with a driver carry. */
export function fleetRate(mountain: Pick<Mountain, "fleet" | "jobs">): number {
  const driven = drivenFleet(mountain);
  let rate = 0;
  for (const vehicle of VEHICLES) {
    rate += driven[vehicle.id] * vehicle.carries;
  }
  return rate;
}

/** What the vehicle after `fleet` of them costs. The ones given are not on the curve. */
function vehicleCost(vehicle: Vehicle, fleet: number): number {
  const bought = Math.max(0, fleet - vehicle.given);
  return Math.ceil(
    Number((vehicle.firstCost * vehicle.growth ** bought).toPrecision(12)),
  );
}

/** The next one's price. */
export function vehiclePrice(mountain: Mountain, id: VehicleId): Price {
  const vehicle = vehicleById(id);
  return [
    { good: vehicle.good, amount: vehicleCost(vehicle, mountain.fleet[id]) },
  ];
}

/**
 * What `amount` of a vehicle costs now (#715): the amount key's rule
 * (`quoteRun`, as a machine's key), each one at its price in turn.
 */
export function vehicleQuote(
  mountain: Mountain,
  id: VehicleId,
  amount: BuyAmount,
): TierQuote {
  const vehicle = vehicleById(id);
  const fleet = mountain.fleet[id];
  return quoteRun(
    (nth) => vehicleCost(vehicle, fleet + nth),
    amount,
    mountain.stock[vehicle.good],
  );
}

/** Buys one more, at once (rule 7.13); a pocket that does not cover it buys none. */
export function buyVehicle(mountain: Mountain, id: VehicleId): Mountain {
  const paid = pay(mountain, vehiclePrice(mountain, id));
  return paid === mountain
    ? mountain
    : { ...paid, fleet: { ...paid.fleet, [id]: paid.fleet[id] + 1 } };
}

/** What the goods cost the pocket, as a price. */
function priceOf(goods: Partial<Stock>): Price {
  return GOOD_IDS.flatMap((good) =>
    (goods[good] ?? 0) > 0 ? [{ good, amount: goods[good] ?? 0 }] : [],
  );
}

/**
 * Transport's and the builders' work over `seconds` at `share` of their
 * rates (1 live, the night shift output unattended, rule 7.12). Transport
 * carries what the pocket holds to the site of the step in hand, and the
 * builders build it in (#690); a step built in gives way to the next, with
 * the time left. It stops when the building is operational, or when neither
 * can do more. On hold, transport carries nothing and the builders still
 * build in what is on the site.
 */
export function deliver(
  mountain: Mountain,
  seconds: number,
  share: number,
): Mountain {
  let state = mountain;
  let left = seconds;
  for (;;) {
    const project = state.project;
    if (project.kind === "unordered") {
      return state;
    }
    const carry = project.kind === "delivering" ? fleetRate(state) * share : 0;
    const work = stepWork(
      project.site,
      state.stock,
      carry,
      buildRate(state) * share,
      left,
    );
    if (
      !work.done &&
      goodsTotal(work.delivered) + goodsTotal(work.built) === 0
    ) {
      return state;
    }
    const arrived = receive(
      pay(state, priceOf(work.delivered)),
      work.delivered,
    );
    state = buildIn(arrived, work.built);
    if (!work.done) {
      return state;
    }
    left -= work.seconds;
  }
}

/**
 * What transport takes from each stockpile a second now, at `share` of its
 * rate (#666): split evenly between the goods the step still requires that
 * the stockyard holds or the mine brings in, and no more than the builders
 * build in once the site is full. A dry stockpile gives no more than
 * `income` brings it a second, and what it cannot give goes to the others,
 * as `deliver` shares out what transport carries. The mine's chain drains
 * the stockpiles at it, so a full stockpile fills again as fast as transport
 * empties it. `deliver` is still what takes.
 */
export function stockDraw(
  mountain: Mountain,
  share: number,
  income: Partial<Stock> = {},
): Partial<Stock> {
  const project = mountain.project;
  if (project.kind !== "delivering") {
    return {};
  }
  const carry = fleetRate(mountain) * share;
  const rate =
    onSiteTotal(project.site) >= SITE_HOLDS
      ? Math.min(carry, buildRate(mountain) * share)
      : carry;
  const need = stillRequired(project.site);
  const gives = (good: GoodId): number =>
    mountain.stock[good] > 0 ? Infinity : (income[good] ?? 0);
  const goods = GOOD_IDS.filter((good) => need[good] > 0 && gives(good) > 0);
  goods.sort((a, b) => gives(a) - gives(b));
  const draw: Partial<Record<GoodId, number>> = {};
  let left = rate;
  for (const [index, good] of goods.entries()) {
    const take = Math.min(gives(good), left / (goods.length - index));
    draw[good] = take;
    left -= take;
  }
  return draw;
}

/**
 * Seconds until what transport takes from the stockpiles changes, at `share`
 * of its rate (#666). The take is `stockDraw` from `take`, as the mine's
 * chain works it out, and `income` is what really comes in a second of each
 * good: a good's need is met, its stockpile runs dry, a dry stockpile starts
 * to fill, or the site fills. Infinity when nothing changes. The mine's
 * stretches split here, so the take holds for the whole of each.
 */
export function drawChange(
  mountain: Mountain,
  share: number,
  {
    take,
    income,
  }: { readonly take: Partial<Stock>; readonly income: Partial<Stock> },
): number {
  const project = mountain.project;
  if (project.kind !== "delivering") {
    return Infinity;
  }
  const draw = stockDraw(mountain, share, take);
  const need = stillRequired(project.site);
  let soonest = Infinity;
  for (const good of GOOD_IDS) {
    soonest = Math.min(
      soonest,
      goodChange(
        need[good],
        mountain.stock[good],
        draw[good] ?? 0,
        income[good] ?? 0,
      ),
    );
  }
  const carry = fleetRate(mountain) * share;
  const build = buildRate(mountain) * share;
  const held = onSiteTotal(project.site);
  if (held < SITE_HOLDS && carry > build) {
    soonest = Math.min(soonest, (SITE_HOLDS - held) / (carry - build));
  }
  return soonest;
}

/**
 * When one good's draw changes: its need met, its stock run dry, or a dry
 * stockpile starting to fill, which may let it give more. A dry stockpile
 * taken at what comes in holds steady.
 */
function goodChange(
  need: number,
  stock: number,
  draw: number,
  income: number,
): number {
  if (need <= 0) {
    return Infinity;
  }
  const met = draw > 0 ? need / draw : Infinity;
  if (stock > 0) {
    return Math.min(met, draw > income ? stock / (draw - income) : Infinity);
  }
  return income > draw ? Math.min(met, 1) : met;
}

/** What holds an order back, for the lab (rule 7.11: the page names none). */
export type OrderLimit =
  | { readonly kind: "unordered" }
  | { readonly kind: "onHold" }
  | {
      readonly kind: "delivering";
      /** Goods a second arriving now. */
      readonly perSecond: number;
      /** Seconds the step in hand has left at these rates. */
      readonly secondsLeft: number;
      /** What holds it back: transport, a good the pocket runs out of, or the builders. */
      readonly limit: "transport" | "builders" | GoodId;
    };

type Leg = { readonly seconds: number; readonly byGood: boolean };

/**
 * Seconds to carry `need` at `carry` a second, from `pocket` and `income` a
 * second dug: the pocket covers it, or it runs dry and the dig limits it.
 */
function legTime(
  need: number,
  pocket: number,
  income: number,
  carry: number,
): Leg {
  if (need <= 0) {
    return { seconds: 0, byGood: false };
  }
  if (carry <= 0) {
    return { seconds: Infinity, byGood: false };
  }
  if (pocket >= need || income >= carry) {
    return { seconds: need / carry, byGood: false };
  }
  if (income <= 0) {
    return { seconds: Infinity, byGood: true };
  }
  const dry = pocket / (carry - income);
  return carry * dry >= need
    ? { seconds: need / carry, byGood: false }
    : { seconds: dry + (need - carry * dry) / income, byGood: true };
}

/** Each good's leg, with transport split evenly between the goods still needed. */
function legs(
  need: Stock,
  stock: Stock,
  income: Partial<Stock>,
  carry: number,
): readonly (Leg & { readonly good: GoodId })[] {
  const goods = GOOD_IDS.filter((good) => need[good] > 0);
  return goods.map((good) => ({
    good,
    ...legTime(
      need[good],
      stock[good],
      income[good] ?? 0,
      carry / goods.length,
    ),
  }));
}

/** Goods a second transport brings the step in hand now, from the pocket and the dig. */
function arriving(
  site: Site,
  stock: Stock,
  income: Partial<Stock>,
  carry: number,
): number {
  const each = legs(stillRequired(site), stock, income, carry);
  let perSecond = 0;
  for (const leg of each) {
    const share = carry / each.length;
    perSecond +=
      stock[leg.good] > 0 ? share : Math.min(share, income[leg.good] ?? 0);
  }
  return perSecond;
}

/** What the mine brings a second: stone alone, or each good's (part 2, #667). */
export type Dug = number | Partial<Stock>;

function incomeOf(dug: Dug): Partial<Stock> {
  return typeof dug === "number" ? { stones: dug } : dug;
}

/**
 * The order's limit, with the goods a second and the time the step in hand
 * has left, live. `dug` is what the crew digs: stone, or each good's.
 */
export function orderLimit(mountain: Mountain, dug: Dug): OrderLimit {
  const project = mountain.project;
  if (project.kind !== "delivering") {
    return { kind: project.kind };
  }
  const income = incomeOf(dug);
  const carry = fleetRate(mountain);
  const need = stillRequired(project.site);
  let slowest: (Leg & { readonly good: GoodId }) | undefined;
  for (const leg of legs(need, mountain.stock, income, carry)) {
    if (slowest === undefined || leg.seconds > slowest.seconds) {
      slowest = leg;
    }
  }
  const brought = slowest?.seconds ?? 0;
  const built = buildSeconds(project.site, buildRate(mountain));
  return {
    kind: "delivering",
    perSecond: arriving(project.site, mountain.stock, income, carry),
    secondsLeft: Math.max(brought, built),
    limit:
      built > brought
        ? "builders"
        : slowest?.byGood === true
          ? slowest.good
          : "transport",
  };
}

/** An order's numbers, for the page (rule 7.11): no limit is named. */
export type OrderNumbers =
  | { readonly kind: "unordered" }
  | {
      readonly kind: "delivering" | "onHold";
      /** Goods a second transport brings to the site now. */
      readonly brings: number;
      /** Goods a second the builders build in now. */
      readonly builds: number;
      /** What is on the building site, of each good. */
      readonly onSite: Stock;
      /** What the step still requires built in, of each good. */
      readonly stillRequires: Stock;
    };

/**
 * What the order's page shows, live (#690). Transport brings no more than
 * the builders make room for once the site is full, and the builders build
 * no faster than what reaches them once it is empty.
 */
export function orderNumbers(mountain: Mountain, dug: Dug): OrderNumbers {
  const project = mountain.project;
  if (project.kind === "unordered") {
    return project;
  }
  const site = project.site;
  const rate = buildRate(mountain);
  const carried =
    project.kind === "delivering"
      ? arriving(site, mountain.stock, incomeOf(dug), fleetRate(mountain))
      : 0;
  const held = onSiteTotal(site);
  const brings = held >= SITE_HOLDS ? Math.min(carried, rate) : carried;
  return {
    kind: project.kind,
    brings,
    builds: held > 0 ? rate : Math.min(rate, brings),
    onSite: site.onSite,
    stillRequires: stillToBuild(site),
  };
}

/**
 * Seconds until the whole building is operational at `share` of transport's
 * and the builders' rates and `dug` (stone, or each good), or Infinity when it
 * cannot finish (nothing ordered, on hold with goods still to bring, nobody
 * building, or a good it needs that never comes). Each step takes what its
 * goods take to arrive or what the builders take to build them in, the
 * longer.
 */
export function secondsToFinish(
  mountain: Mountain,
  share: number,
  dug: Dug,
): number {
  return walkSteps(mountain, share, dug, Infinity);
}

/**
 * Seconds until the step in hand is built in, on the same terms as
 * `secondsToFinish`, or Infinity when it cannot finish. Unattended time
 * splits the night here (#663), so each step's end has its exact second and
 * a roof's power begins at its own.
 */
export function secondsToStep(
  mountain: Mountain,
  share: number,
  income: number | Partial<Stock>,
): number {
  return walkSteps(mountain, share, income, 1);
}

/**
 * The one walk over the steps: the seconds the next `steps` of them take.
 * `dug` is the stone a second the mine brings up, or each good's (#666).
 */
function walkSteps(
  mountain: Mountain,
  share: number,
  dug: number | Partial<Stock>,
  steps: number,
): number {
  const project = mountain.project;
  if (project.kind === "unordered") {
    return Infinity;
  }
  const income = incomeOf(dug);
  const carry = project.kind === "delivering" ? fleetRate(mountain) * share : 0;
  const build = buildRate(mountain) * share;
  let site: Site | undefined = project.site;
  let stock = mountain.stock;
  let seconds = 0;
  for (let walked = 0; site !== undefined && walked < steps; walked += 1) {
    const need = stillRequired(site);
    const each = legs(need, stock, income, carry);
    const step = Math.max(
      buildSeconds(site, build),
      ...each.map((leg) => leg.seconds),
    );
    if (!Number.isFinite(step)) {
      return Infinity;
    }
    seconds += step;
    stock = afterStep(stock, need, income, step);
    site = siteAfter(site);
  }
  return seconds;
}

/** The pocket after a step: what it required gone, and what was dug meanwhile added. */
function afterStep(
  stock: Stock,
  need: Stock,
  income: Partial<Stock>,
  seconds: number,
): Stock {
  const out: Record<GoodId, number> = { ...stock };
  for (const good of GOOD_IDS) {
    out[good] = Math.max(
      0,
      stock[good] - need[good] + (income[good] ?? 0) * seconds,
    );
  }
  return out;
}
