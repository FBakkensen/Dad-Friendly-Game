import {
  buildingStillRequired,
  receive,
  stillRequired,
  type Site,
} from "./city";
import type { Mountain } from "./mountain";
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
    carries: 25,
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

/** Goods a second the whole fleet carries. */
export function fleetRate(mountain: Pick<Mountain, "fleet">): number {
  let rate = 0;
  for (const vehicle of VEHICLES) {
    rate += mountain.fleet[vehicle.id] * vehicle.carries;
  }
  return rate;
}

/** The next one's price. The ones given are not on the curve. */
export function vehiclePrice(mountain: Mountain, id: VehicleId): Price {
  const vehicle = vehicleById(id);
  const bought = Math.max(0, mountain.fleet[id] - vehicle.given);
  const cost = Math.ceil(
    Number((vehicle.firstCost * vehicle.growth ** bought).toPrecision(12)),
  );
  return [{ good: vehicle.good, amount: cost }];
}

/** Buys one more, at once (rule 7.13); a pocket that does not cover it buys none. */
export function buyVehicle(mountain: Mountain, id: VehicleId): Mountain {
  const paid = pay(mountain, vehiclePrice(mountain, id));
  return paid === mountain
    ? mountain
    : { ...paid, fleet: { ...paid.fleet, [id]: paid.fleet[id] + 1 } };
}

/**
 * Up to `capacity` goods split evenly between the goods in `wants`, each at
 * most its want. What one good cannot use goes to the others.
 */
function shareOut(
  capacity: number,
  wants: Readonly<Partial<Record<GoodId, number>>>,
): Partial<Record<GoodId, number>> {
  const goods = GOOD_IDS.filter((good) => (wants[good] ?? 0) > 0).sort(
    (a, b) => (wants[a] ?? 0) - (wants[b] ?? 0),
  );
  const out: Partial<Record<GoodId, number>> = {};
  let left = capacity;
  for (const [index, good] of goods.entries()) {
    const even = Math.floor(left / (goods.length - index));
    const amount = Math.min(wants[good] ?? 0, even);
    out[good] = amount;
    left -= amount;
  }
  return out;
}

/** What the pocket can give the step in hand: its need, capped by what is held. */
function wants(site: Site, stock: Stock): Partial<Record<GoodId, number>> {
  const left = stillRequired(site);
  const out: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    out[good] = Math.min(left[good], stock[good]);
  }
  return out;
}

/**
 * Transport's work over `seconds` whole seconds at `share` of its rate (1
 * live, the night shift output unattended, rule 7.11). It carries what the
 * pocket holds to the step in hand, steps on through the building with what
 * capacity is left, and stops when the building is operational or the
 * pocket has nothing the step requires. On hold, it carries nothing.
 */
export function deliver(
  mountain: Mountain,
  seconds: number,
  share: number,
): Mountain {
  let capacity = Math.floor(fleetRate(mountain) * share * seconds + 1e-9);
  let state = mountain;
  while (capacity > 0 && state.project.kind === "delivering") {
    const amounts = shareOut(capacity, wants(state.project.site, state.stock));
    const carried = GOOD_IDS.reduce(
      (sum, good) => sum + (amounts[good] ?? 0),
      0,
    );
    if (carried === 0) {
      break;
    }
    const price = GOOD_IDS.flatMap((good) =>
      (amounts[good] ?? 0) > 0 ? [{ good, amount: amounts[good] ?? 0 }] : [],
    );
    state = receive(pay(state, price), amounts);
    capacity -= carried;
  }
  return state;
}

/** What an order says (rule 7.10). */
export type OrderLimit =
  | { readonly kind: "unordered" }
  | { readonly kind: "onHold" }
  | {
      readonly kind: "delivering";
      /** Goods a second arriving now. */
      readonly perSecond: number;
      /** Seconds the step in hand has left at this rate. */
      readonly secondsLeft: number;
      /** What holds it back: transport, or a good the pocket runs out of. */
      readonly limit: "transport" | GoodId;
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

/**
 * The order's limit, with the goods a second and the time the step in hand
 * has left, live. `stonesPerSecond` is what the crew digs.
 */
export function orderLimit(
  mountain: Mountain,
  stonesPerSecond: number,
): OrderLimit {
  const project = mountain.project;
  if (project.kind !== "delivering") {
    return { kind: project.kind };
  }
  const income: Partial<Stock> = { stones: stonesPerSecond };
  const carry = fleetRate(mountain);
  const each = legs(stillRequired(project.site), mountain.stock, income, carry);
  let slowest: (Leg & { readonly good: GoodId }) | undefined;
  let perSecond = 0;
  for (const leg of each) {
    const share = carry / each.length;
    perSecond +=
      mountain.stock[leg.good] > 0
        ? share
        : Math.min(share, income[leg.good] ?? 0);
    if (slowest === undefined || leg.seconds > slowest.seconds) {
      slowest = leg;
    }
  }
  return {
    kind: "delivering",
    perSecond,
    secondsLeft: slowest?.seconds ?? 0,
    limit: slowest?.byGood === true ? slowest.good : "transport",
  };
}

/**
 * Seconds until the whole building is operational at `share` of transport's
 * rate and `stonesPerSecond` dug, or Infinity when it cannot finish (on
 * hold, nothing ordered, or nothing left to carry). Unattended time splits
 * the night here, where a roof's power begins.
 */
export function secondsToFinish(
  mountain: Mountain,
  share: number,
  stonesPerSecond: number,
): number {
  const project = mountain.project;
  if (project.kind !== "delivering") {
    return Infinity;
  }
  const income: Partial<Stock> = { stones: stonesPerSecond };
  const each = legs(
    buildingStillRequired(project.site),
    mountain.stock,
    income,
    fleetRate(mountain) * share,
  );
  return Math.max(0, ...each.map((leg) => leg.seconds));
}
