import {
  SITE_HOLDS,
  buildRate,
  buildSeconds,
  goodsTotal,
  onSiteTotal,
  shareOutKeys,
  shareProportional,
  siteGoodRoom,
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
import { loadOf, loadStation, loadable, stillToArrive } from "./factory";
import { makerBuffer, makerInputRoom } from "./makers";
import { graniteOpen, openLevels, type MineLevelId } from "./mine-levels";
import type { Mountain } from "./mountain";
import { partThreeOn } from "./part-switch";
import { evenShares } from "./piles";
import {
  GOOD_IDS,
  addedStock,
  pay,
  type GoodId,
  type Price,
  type Stock,
} from "./stock";
import { stockpileRoom } from "./stockyard";
import { quoteRun, type BuyAmount, type TierQuote } from "./tiers";

/**
 * Transport (slice 1, rule 7, #654): one fleet with one number. It carries
 * what he ordered from the pocket to the site, at goods a second, and only
 * what the step in hand still requires. A vehicle is bought like a machine.
 * It takes no workers, and there are no routes and nothing to dispatch.
 *
 * Slice 2 Part 1 (#766, rule 2): every inter-site movement runs on a typed
 * single-good run in deterministic `RUN_ORDER` with even-share water-filling
 * and `shareProportional` source contention; `assignedRuns` is reserved in the
 * save for Part 3 manual assignment.
 */

/** Goods that City projects deliver from the stockyard in Part 1, in `GOOD_IDS` order. */
export const CITY_RUN_GOODS = [
  "stones",
  "brick",
  "cutStone",
] as const satisfies readonly GoodId[];

export type CityRunGood = (typeof CITY_RUN_GOODS)[number];

export type StockToCityRunId = `stockToCity:${CityRunGood}`;

/** Every single-good transport run in deterministic allocation order (spec rule 2.2). */
export const RUN_ORDER = [
  "pitToStockyardStones",
  "pitTopsoilToKilns",
  "pitGraniteToSaws",
  "stockToCity:stones",
  "stockToCity:brick",
  "stockToCity:cutStone",
] as const;

export type RunId = (typeof RUN_ORDER)[number];

/** Dedicated vehicle counts per run (reserved in v11 save, active in Part 3). */
export type AssignedRuns = Readonly<Partial<Record<RunId, number>>>;

export const NO_ASSIGNED_RUNS: AssignedRuns = {};

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
  {
    id: "truck",
    name: "Truck",
    good: "brick",
    firstCost: 150_000,
    growth: 1.219,
    carries: 400,
    given: 0,
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

/**
 * The best carriers first: the drivers take the trucks first (rule 2.7).
 * The order `drivenFleet` hands drivers out in, which the city's road
 * draws in too (#754).
 */
export const BY_LOAD: readonly Vehicle[] = [...VEHICLES].sort(
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

/**
 * Whether the vehicle is for sale: the horse wagon always, the truck while
 * part 3 plays and the Warehouse is operational (#673).
 */
export function vehicleOpen(
  mountain: Pick<Mountain, "operational">,
  id: VehicleId,
): boolean {
  return (
    id === "horseWagon" ||
    (partThreeOn() && mountain.operational.includes("warehouse"))
  );
}

/** Buys one more, at once (rule 7.13); a pocket that does not cover it buys none. */
export function buyVehicle(mountain: Mountain, id: VehicleId): Mountain {
  if (!vehicleOpen(mountain, id)) {
    return mountain;
  }
  const paid = pay(mountain, vehiclePrice(mountain, id));
  return paid === mountain
    ? mountain
    : { ...paid, fleet: { ...paid.fleet, [id]: paid.fleet[id] + 1 } };
}

/** What the goods cost the pocket, as a price. */
export function priceOf(goods: Partial<Stock>): Price {
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
  const loaded = toStation(mountain, seconds, share);
  let state = loaded.mountain;
  let left = seconds;
  for (;;) {
    const project = state.project;
    if (project.kind === "unordered") {
      return state;
    }
    const carry = project.kind === "delivering" ? loaded.cityCarry : 0;
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
 * The work order's part of `seconds` of transport at `share` of its rate
 * (rule 7.7, #674), carried to the station first, and the goods a second
 * left for the city's project. With the station idle the city has it all.
 */
function toStation(
  mountain: Mountain,
  seconds: number,
  share: number,
): { readonly mountain: Mountain; readonly cityCarry: number } {
  const carry = fleetRate(mountain) * share;
  if (mountain.station.kind !== "delivering" || seconds <= 0) {
    return { mountain, cityCarry: carry };
  }
  const shares = orderShares(mountain, share, {});
  const loaded = loadStation(mountain, shares.station * seconds);
  return {
    mountain: loaded.mountain,
    cityCarry: carry - loaded.used / seconds,
  };
}

/** What each order gets of transport (rule 7.7): loads a second to the station, goods a second to the city. */
type Shares = { readonly station: number; readonly city: number };

/** The work order's share of transport while the city's order delivers too (rule 7.7: half each). */
export const STATION_SHARE = 0.5;

/**
 * Transport's rate at `share`, split between the factory's work order and
 * the city's project (rule 7.7, #674): with both delivering each gets half,
 * and what one cannot use goes to the other. Alone, an order gets it all.
 * `income` is what a dry stockpile gives a second. With the station idle the
 * city's part is the whole rate, exactly as before the factory.
 */
export function orderShares(
  mountain: Mountain,
  share: number,
  income: Partial<Stock>,
): Shares {
  const carry = fleetRate(mountain) * share;
  if (mountain.station.kind !== "delivering") {
    return { station: 0, city: carry };
  }
  const city =
    mountain.project.kind === "delivering"
      ? Math.min(cityCan(mountain, share, income), carry * (1 - STATION_SHARE))
      : 0;
  const station = Math.min(stationGives(mountain, income).total, carry - city);
  return { station, city: carry - station };
}

/**
 * What the station can take a second, good by good, in loads: unbounded
 * from a good it can load now (`loadable`), what comes in of a dry one, and
 * nothing of a good it no longer requires.
 */
function stationGives(
  mountain: Mountain,
  income: Partial<Stock>,
): {
  readonly goods: readonly GoodId[];
  readonly gives: readonly number[];
  readonly total: number;
} {
  const can = loadable(mountain);
  const need = stillToArrive(mountain.station);
  const goods = GOOD_IDS.filter((good) => need[good] > 0);
  const gives = goods.map((good) =>
    (can[good] ?? 0) > 0 ? Infinity : (income[good] ?? 0) * loadOf(good),
  );
  return { goods, gives, total: gives.reduce((sum, one) => sum + one, 0) };
}

/** Goods a second the city's project could take of transport now: no more than the builders once its site is full, nor than its goods give. */
function cityCan(
  mountain: Mountain,
  share: number,
  income: Partial<Stock>,
): number {
  const project = mountain.project;
  /* v8 ignore next 3 -- orderShares asks only while the project is delivering */
  if (project.kind !== "delivering") {
    return 0;
  }
  const site =
    onSiteTotal(project.site) >= SITE_HOLDS
      ? buildRate(mountain) * share
      : Infinity;
  const need = stillRequired(project.site);
  let gives = 0;
  for (const good of GOOD_IDS) {
    if (need[good] > 0) {
      gives += mountain.stock[good] > 0 ? Infinity : (income[good] ?? 0);
    }
  }
  return Math.min(site, gives);
}

/** The station's take a second, good by good (not loads), from its part of transport. */
function stationDraw(
  mountain: Mountain,
  rate: number,
  income: Partial<Stock>,
): Partial<Stock> {
  if (rate <= 0) {
    return {};
  }
  const { goods, gives } = stationGives(mountain, income);
  const loads = evenShares(rate, gives);
  const draw: Partial<Record<GoodId, number>> = {};
  for (const [index, good] of goods.entries()) {
    draw[good] = (loads[index] ?? 0) / loadOf(good);
  }
  return draw;
}

/**
 * What the station's work order takes of each good a second now, at `share`
 * of transport's rate: goods, not loads (#681 shows it as "arriving").
 */
export function stationTake(
  mountain: Mountain,
  share: number,
  income: Partial<Stock> = {},
): Partial<Stock> {
  return stationDraw(
    mountain,
    orderShares(mountain, share, income).station,
    income,
  );
}

/** `income` less what the station takes of each good a second: what the city's take can count on. */
function lessTaken(
  income: Partial<Stock>,
  taken: Partial<Stock>,
): Partial<Stock> {
  if (Object.keys(taken).length === 0) {
    return income;
  }
  const out: Partial<Record<GoodId, number>> = { ...income };
  for (const good of GOOD_IDS) {
    if ((taken[good] ?? 0) > 0) {
      out[good] = Math.max(0, (income[good] ?? 0) - (taken[good] ?? 0));
    }
  }
  return out;
}

/** Two takes a second added, good by good; the first as it is when the second is empty. */
function bothTakes(
  first: Partial<Stock>,
  second: Partial<Stock>,
): Partial<Stock> {
  if (Object.keys(second).length === 0) {
    return first;
  }
  const out: Partial<Record<GoodId, number>> = { ...first };
  for (const good of GOOD_IDS) {
    if (second[good] !== undefined) {
      out[good] = (first[good] ?? 0) + (second[good] ?? 0);
    }
  }
  return out;
}

/**
 * What transport takes from each stockpile a second now, at `share` of its
 * rate (#666): the work order's take (#674), and the city's, split evenly
 * between the goods the step still requires that the stockyard holds or the
 * mine brings in, and no more than the builders build in once the site is
 * full. A dry stockpile gives no more than `income` brings it a second, and
 * what it cannot give goes to the others, as `deliver` shares out what
 * transport carries. The mine's chain drains the stockpiles at it, so a full
 * stockpile fills again as fast as transport empties it. `deliver` is still
 * what takes.
 */
export function stockDraw(
  mountain: Mountain,
  share: number,
  income: Partial<Stock> = {},
): Partial<Stock> {
  const shares = orderShares(mountain, share, income);
  const station = stationDraw(mountain, shares.station, income);
  return bothTakes(
    cityDraw(mountain, shares.city, share, lessTaken(income, station)),
    station,
  );
}

/** The city's take a second, good by good, at `carry` goods a second (`stockDraw`). */
function cityDraw(
  mountain: Mountain,
  carry: number,
  share: number,
  income: Partial<Stock>,
): Partial<Stock> {
  const project = mountain.project;
  if (project.kind !== "delivering") {
    return {};
  }
  const rate =
    onSiteTotal(project.site) >= SITE_HOLDS
      ? Math.min(carry, buildRate(mountain) * share)
      : carry;
  const need = stillRequired(project.site);
  const gives = (good: GoodId): number =>
    mountain.stock[good] > 0 ? Infinity : (income[good] ?? 0);
  const goods = GOOD_IDS.filter((good) => need[good] > 0 && gives(good) > 0);
  const shares = evenShares(rate, goods.map(gives));
  const draw: Partial<Record<GoodId, number>> = {};
  for (const [index, good] of goods.entries()) {
    draw[good] = shares[index] ?? 0;
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
  const shares = orderShares(mountain, share, take);
  const station = stationDraw(mountain, shares.station, take);
  const soonest = stationChange(mountain, station, income);
  const project = mountain.project;
  if (project.kind !== "delivering") {
    return soonest;
  }
  return Math.min(
    soonest,
    cityChange(mountain, {
      share,
      carry: shares.city,
      draw: cityDraw(mountain, shares.city, share, lessTaken(take, station)),
      income: lessTaken(income, station),
    }),
  );
}

/** When the station's take changes (#674): a good's need met, its stockpile dry, or a dry one filling. */
function stationChange(
  mountain: Mountain,
  draw: Partial<Stock>,
  income: Partial<Stock>,
): number {
  const need = stillToArrive(mountain.station);
  let soonest = Infinity;
  for (const good of GOOD_IDS) {
    if ((draw[good] ?? 0) <= 0) {
      continue;
    }
    soonest = Math.min(
      soonest,
      goodChange(
        need[good] / loadOf(good),
        mountain.stock[good],
        draw[good] ?? 0,
        income[good] ?? 0,
      ),
    );
  }
  return soonest;
}

/**
 * When the city's take changes (`drawChange`), at `carry` goods a second,
 * with `draw` its take and `income` what comes in less the station's take.
 */
function cityChange(
  mountain: Mountain,
  {
    share,
    carry,
    draw,
    income,
  }: {
    readonly share: number;
    readonly carry: number;
    readonly draw: Partial<Stock>;
    readonly income: Partial<Stock>;
  },
): number {
  const project = mountain.project;
  /* v8 ignore next 3 -- drawChange asks only while the project is delivering */
  if (project.kind !== "delivering") {
    return Infinity;
  }
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
  const carry = orderShares(mountain, 1, income).city;
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
      ? arriving(
          site,
          mountain.stock,
          incomeOf(dug),
          orderShares(mountain, 1, incomeOf(dug)).city,
        )
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
  const carry =
    project.kind === "delivering"
      ? orderShares(mountain, share, income).city
      : 0;
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

// ---------------------------------------------------------------------------
// Slice 2 Part 1: physical single-good transport runs (even share, #766)

export function cityRunId(good: CityRunGood): StockToCityRunId {
  return `stockToCity:${good}`;
}

function makerRunForLevel(level: MineLevelId): RunId {
  return level === "topsoil" ? "pitTopsoilToKilns" : "pitGraniteToSaws";
}

function runRecord<T>(value: T): Record<RunId, T> {
  return Object.fromEntries(RUN_ORDER.map((id) => [id, value])) as Record<
    RunId,
    T
  >;
}

/** Snapshot of one single-good transport run at a moment in time. */
export type RunSnapshot = {
  readonly id: RunId;
  readonly open: boolean;
  readonly source: number;
  readonly destRoom: number;
  readonly active: boolean;
};

function snapshotOf(
  id: RunId,
  open: boolean,
  source: number,
  destRoom: number,
): RunSnapshot {
  return {
    id,
    open,
    source,
    destRoom,
    active: open && source > 0 && destRoom > 0,
  };
}

/** Open/source/room snapshot for every Part 1 run in deterministic `RUN_ORDER`. */
export function runSnapshots(mountain: Mountain): readonly RunSnapshot[] {
  const levels = openLevels(mountain);
  const pitTotal = levels.reduce((sum, l) => sum + mountain.pithead[l], 0);
  const stoneRoom = Math.max(
    0,
    stockpileRoom(mountain, "stones") - mountain.stock.stones,
  );
  const kilnRoom = Math.max(
    0,
    makerInputRoom(mountain, "kiln") -
      makerBuffer(mountain, "kiln", "topsoilRock"),
  );
  const gOpen = graniteOpen(mountain);
  const sawRoom = gOpen
    ? Math.max(
        0,
        makerInputRoom(mountain, "saw") -
          makerBuffer(mountain, "saw", "graniteRock"),
      )
    : 0;
  const project = mountain.project;
  const need =
    project.kind === "unordered" ? undefined : stillRequired(project.site);
  const cityRuns = CITY_RUN_GOODS.map((good) => {
    const open = need !== undefined && need[good] > 0;
    const room =
      project.kind === "delivering" ? siteGoodRoom(project.site, good) : 0;
    return snapshotOf(cityRunId(good), open, mountain.stock[good], room);
  });
  return [
    snapshotOf("pitToStockyardStones", true, pitTotal, stoneRoom),
    snapshotOf(
      "pitTopsoilToKilns",
      mountain.makers.kiln > 0,
      mountain.pithead.topsoil,
      kilnRoom,
    ),
    snapshotOf(
      "pitGraniteToSaws",
      gOpen && mountain.makers.saw > 0,
      gOpen ? mountain.pithead.granite : 0,
      sawRoom,
    ),
    ...cityRuns,
  ];
}

/** Integer units transferred across runs in a step, with pithead breakdown for stones. */
export type RunTransfer = {
  readonly moved: Readonly<Record<RunId, number>>;
  readonly stoneFromPithead: Readonly<Record<MineLevelId, number>>;
};

type TransferState = {
  readonly open: Readonly<Record<RunId, boolean>>;
  readonly openLvls: readonly MineLevelId[];
  readonly pithead: Record<MineLevelId, number>;
  readonly stock: Record<CityRunGood, number>;
  readonly destRoom: Record<RunId, number>;
  readonly moved: Record<RunId, number>;
  readonly stoneFromPithead: Record<MineLevelId, number>;
};

function buildTransferState(
  mountain: Mountain,
  destOverride?: Readonly<Partial<Record<RunId, number>>>,
): TransferState {
  const snaps = runSnapshots(mountain);
  const open = runRecord(false);
  const destRoom = runRecord(0);
  for (const snap of snaps) {
    open[snap.id] = snap.open;
    const raw = destOverride?.[snap.id] ?? snap.destRoom;
    destRoom[snap.id] = Number.isFinite(raw)
      ? Math.max(0, Math.floor(raw))
      : Number.MAX_SAFE_INTEGER;
  }
  return {
    open,
    openLvls: openLevels(mountain),
    pithead: {
      topsoil: mountain.pithead.topsoil,
      granite: graniteOpen(mountain) ? mountain.pithead.granite : 0,
    },
    stock: {
      stones: mountain.stock.stones,
      brick: mountain.stock.brick,
      cutStone: mountain.stock.cutStone,
    },
    destRoom,
    moved: runRecord(0),
    stoneFromPithead: { topsoil: 0, granite: 0 },
  };
}

function runWant(state: TransferState, id: RunId): number {
  if (!state.open[id] || state.destRoom[id] <= 0) {
    return 0;
  }
  if (id === "pitToStockyardStones") {
    const src = state.openLvls.reduce((sum, l) => sum + state.pithead[l], 0);
    return Math.min(src, state.destRoom[id]);
  }
  if (id === "pitTopsoilToKilns") {
    return Math.min(state.pithead.topsoil, state.destRoom[id]);
  }
  if (id === "pitGraniteToSaws") {
    return Math.min(state.pithead.granite, state.destRoom[id]);
  }
  const good = id.slice("stockToCity:".length) as CityRunGood;
  return Math.min(state.stock[good], state.destRoom[id]);
}

function resolvePitheadPass(
  state: TransferState,
  proposed: Readonly<Partial<Record<RunId, number>>>,
  tieOffset: number,
): number {
  const stoneProp = proposed.pitToStockyardStones ?? 0;
  const stoneSplit = shareProportional(
    stoneProp,
    state.openLvls,
    state.pithead,
    tieOffset,
  );
  let total = 0;
  for (const level of state.openLvls) {
    const makerRun = makerRunForLevel(level);
    const sWant = stoneSplit[level] ?? 0;
    const mWant = proposed[makerRun] ?? 0;
    if (sWant + mWant <= 0) {
      continue;
    }
    const split = shareProportional(
      state.pithead[level],
      ["stone", "maker"],
      {
        stone: sWant,
        maker: mWant,
      },
      tieOffset,
    );
    const sTake = split.stone ?? 0;
    const mTake = split.maker ?? 0;
    state.pithead[level] -= sTake + mTake;
    state.stoneFromPithead[level] += sTake;
    state.moved.pitToStockyardStones += sTake;
    state.destRoom.pitToStockyardStones -= sTake;
    state.moved[makerRun] += mTake;
    state.destRoom[makerRun] -= mTake;
    total += sTake + mTake;
  }
  return total;
}

function resolveStockPass(
  state: TransferState,
  proposed: Readonly<Partial<Record<RunId, number>>>,
): number {
  let total = 0;
  for (const good of CITY_RUN_GOODS) {
    const id = cityRunId(good);
    const take = Math.min(
      proposed[id] ?? 0,
      state.stock[good],
      state.destRoom[id],
    );
    if (take > 0) {
      state.stock[good] -= take;
      state.moved[id] += take;
      state.destRoom[id] -= take;
      total += take;
    }
  }
  return total;
}

/**
 * Computes exact integer transfers across Part 1 runs for total `capacity`
 * goods (spec rules 2.3 & 2.4): iterative water-filling via `shareOutKeys`
 * with proportional shared-source contention via `shareProportional`.
 */
export function planTransportTransfer(
  mountain: Mountain,
  capacity: number,
  destOverride?: Readonly<Partial<Record<RunId, number>>>,
  tieOffset = 0,
): RunTransfer {
  const state = buildTransferState(mountain, destOverride);
  let left = Math.max(0, Math.floor(capacity));
  for (let pass = 0; pass < RUN_ORDER.length && left > 0; pass += 1) {
    const wants: Partial<Record<RunId, number>> = {};
    for (const id of RUN_ORDER) {
      const want = runWant(state, id);
      if (want > 0) {
        wants[id] = want;
      }
    }
    const proposed = shareOutKeys(left, RUN_ORDER, wants, tieOffset);
    const movedNow =
      resolvePitheadPass(state, proposed, tieOffset) +
      resolveStockPass(state, proposed);
    if (movedNow <= 0) {
      break;
    }
    left -= movedNow;
  }
  return { moved: state.moved, stoneFromPithead: state.stoneFromPithead };
}

/**
 * Applies a planned integer `RunTransfer` to `mountain` (exact conservation).
 * Returns the updated mountain, stone gained from pithead, and goods delivered
 * to the City site.
 */
export function applyTransportTransfer(
  mountain: Mountain,
  transfer: RunTransfer,
): {
  readonly mountain: Mountain;
  readonly gainedStones: number;
  readonly cityDelivered: Partial<Stock>;
} {
  const { moved, stoneFromPithead } = transfer;
  const totalMoved = RUN_ORDER.reduce((sum, id) => sum + moved[id], 0);
  if (totalMoved <= 0) {
    return { mountain, gainedStones: 0, cityDelivered: {} };
  }
  const pithead = {
    topsoil:
      mountain.pithead.topsoil -
      stoneFromPithead.topsoil -
      moved.pitTopsoilToKilns,
    granite:
      mountain.pithead.granite -
      stoneFromPithead.granite -
      moved.pitGraniteToSaws,
  };
  const makerBuffers = {
    kiln:
      moved.pitTopsoilToKilns > 0
        ? {
            ...mountain.makerBuffers.kiln,
            topsoilRock:
              (mountain.makerBuffers.kiln.topsoilRock ?? 0) +
              moved.pitTopsoilToKilns,
          }
        : mountain.makerBuffers.kiln,
    saw:
      moved.pitGraniteToSaws > 0
        ? {
            ...mountain.makerBuffers.saw,
            graniteRock:
              (mountain.makerBuffers.saw.graniteRock ?? 0) +
              moved.pitGraniteToSaws,
          }
        : mountain.makerBuffers.saw,
  };
  const cityDelivered: Partial<Record<GoodId, number>> = {};
  const stockDelta: Partial<Record<GoodId, number>> = {};
  if (moved.pitToStockyardStones > 0) {
    stockDelta.stones = moved.pitToStockyardStones;
  }
  for (const good of CITY_RUN_GOODS) {
    const amt = moved[cityRunId(good)];
    if (amt > 0) {
      cityDelivered[good] = amt;
      stockDelta[good] = (stockDelta[good] ?? 0) - amt;
    }
  }
  const updated: Mountain = {
    ...mountain,
    pithead,
    makerBuffers,
    stock: addedStock(mountain.stock, stockDelta),
  };
  const next =
    goodsTotal(cityDelivered) > 0 ? receive(updated, cityDelivered) : updated;
  return {
    mountain: next,
    gainedStones: moved.pitToStockyardStones,
    cityDelivered,
  };
}

/** Source rate caps & pithead proportional weights for continuous rate allocation. */
export type RunSourceCaps = {
  readonly openLvls: readonly MineLevelId[];
  readonly pitheadCap: Readonly<Record<MineLevelId, number>>;
  readonly pitheadWeight: Readonly<Record<MineLevelId, number>>;
  readonly stockCap: Readonly<Record<CityRunGood, number>>;
};

const RATE_EPS = 1e-9;

function pitheadSplitFractions(
  openLvls: readonly MineLevelId[],
  pitheadCap: Readonly<Record<MineLevelId, number>>,
  pitheadWeight: Readonly<Record<MineLevelId, number>>,
): Record<MineLevelId, number> {
  const out: Record<MineLevelId, number> = { topsoil: 0, granite: 0 };
  const active = openLvls.filter((l) => pitheadCap[l] > RATE_EPS);
  if (active.length === 0) {
    return out;
  }
  const wSum = active.reduce(
    (sum, l) => sum + Math.max(0, pitheadWeight[l]),
    0,
  );
  if (wSum > RATE_EPS) {
    for (const l of active) {
      out[l] = Math.max(0, pitheadWeight[l]) / wSum;
    }
    return out;
  }
  for (const l of active) {
    out[l] = 1 / active.length;
  }
  return out;
}

function subCap(cap: number, used: number): number {
  return Number.isFinite(cap) ? Math.max(0, cap - used) : Infinity;
}

type RateState = {
  readonly open: Readonly<Record<RunId, boolean>>;
  readonly openLvls: readonly MineLevelId[];
  readonly pitheadWeight: Readonly<Record<MineLevelId, number>>;
  readonly remDest: Record<RunId, number>;
  readonly remPit: Record<MineLevelId, number>;
  readonly remStock: Record<CityRunGood, number>;
  readonly runRates: Record<RunId, number>;
  readonly pitheadDrain: Record<MineLevelId, number>;
  readonly stoneFromPithead: Record<MineLevelId, number>;
};

function rateWant(state: RateState, id: RunId): number {
  if (!state.open[id] || state.remDest[id] <= RATE_EPS) {
    return 0;
  }
  if (id === "pitToStockyardStones") {
    const src = state.openLvls.reduce((sum, l) => sum + state.remPit[l], 0);
    return Math.min(src, state.remDest[id]);
  }
  if (id === "pitTopsoilToKilns") {
    return Math.min(state.remPit.topsoil, state.remDest[id]);
  }
  if (id === "pitGraniteToSaws") {
    return Math.min(state.remPit.granite, state.remDest[id]);
  }
  const good = id.slice("stockToCity:".length) as CityRunGood;
  return Math.min(state.remStock[good], state.remDest[id]);
}

function resolvePitheadRatePass(
  state: RateState,
  prop: Readonly<Record<RunId, number>>,
): number {
  const fracs = pitheadSplitFractions(
    state.openLvls,
    state.remPit,
    state.pitheadWeight,
  );
  let moved = 0;
  for (const l of state.openLvls) {
    const mRun = makerRunForLevel(l);
    const sWant = prop.pitToStockyardStones * fracs[l];
    const mWant = prop[mRun];
    const total = sWant + mWant;
    if (total <= RATE_EPS) {
      continue;
    }
    const cap = state.remPit[l];
    const scale = Number.isFinite(cap) && total > cap ? cap / total : 1;
    const sTake = sWant * scale;
    const mTake = mWant * scale;
    state.runRates.pitToStockyardStones += sTake;
    state.runRates[mRun] += mTake;
    state.pitheadDrain[l] += sTake + mTake;
    state.stoneFromPithead[l] += sTake;
    state.remPit[l] = subCap(cap, sTake + mTake);
    state.remDest.pitToStockyardStones = subCap(
      state.remDest.pitToStockyardStones,
      sTake,
    );
    state.remDest[mRun] = subCap(state.remDest[mRun], mTake);
    moved += sTake + mTake;
  }
  return moved;
}

function resolveStockRatePass(
  state: RateState,
  prop: Readonly<Record<RunId, number>>,
): number {
  let moved = 0;
  for (const good of CITY_RUN_GOODS) {
    const id = cityRunId(good);
    const take = Math.min(prop[id], state.remStock[good], state.remDest[id]);
    if (take > RATE_EPS) {
      state.runRates[id] += take;
      state.remStock[good] = subCap(state.remStock[good], take);
      state.remDest[id] = subCap(state.remDest[id], take);
      moved += take;
    }
  }
  return moved;
}

/**
 * Continuous water-filling rate allocator across Part 1 runs (`evenShares` +
 * shared pithead contention), used by the coupled-stretch offline/lab solver
 * and live UI rate readouts.
 */
export function allocateRunRates(
  fleetRateTotal: number,
  open: Readonly<Record<RunId, boolean>>,
  destCaps: Readonly<Record<RunId, number>>,
  sources: RunSourceCaps,
): {
  readonly runRates: Readonly<Record<RunId, number>>;
  readonly pitheadDrain: Readonly<Record<MineLevelId, number>>;
  readonly stoneFromPithead: Readonly<Record<MineLevelId, number>>;
} {
  const state: RateState = {
    open,
    openLvls: sources.openLvls,
    pitheadWeight: sources.pitheadWeight,
    remDest: { ...destCaps },
    remPit: { ...sources.pitheadCap },
    remStock: { ...sources.stockCap },
    runRates: runRecord(0),
    pitheadDrain: { topsoil: 0, granite: 0 },
    stoneFromPithead: { topsoil: 0, granite: 0 },
  };
  let left = fleetRateTotal;
  for (let pass = 0; pass < RUN_ORDER.length && left > RATE_EPS; pass += 1) {
    const wants = RUN_ORDER.map((id) => rateWant(state, id));
    const shares = evenShares(left, wants);
    const prop = Object.fromEntries(
      RUN_ORDER.map((id, idx) => [id, shares[idx] ?? 0]),
    ) as Record<RunId, number>;
    const moved =
      resolvePitheadRatePass(state, prop) + resolveStockRatePass(state, prop);
    if (moved <= RATE_EPS) {
      break;
    }
    left = Math.max(0, left - moved);
  }
  return {
    runRates: state.runRates,
    pitheadDrain: state.pitheadDrain,
    stoneFromPithead: state.stoneFromPithead,
  };
}
