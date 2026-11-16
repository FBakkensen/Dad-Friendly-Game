import { shareOut } from "./building-site";
import { graniteOpen } from "./mine-levels";
import type { Mountain } from "./mountain";
import {
  EMPTY_STOCK,
  GOOD_IDS,
  addedStock,
  priceAmount,
  type GoodId,
  type Price,
  type Stock,
} from "./stock";
import {
  MAX_CRAFTED_LEVEL,
  craftedLevel,
  fitGear,
  recipeById,
  recipePrice,
  type RecipeId,
} from "./workshop";

/**
 * The factory (slice 1, rule 7.13, #674): one station, one work order at a
 * time, and no clock. He places a work order from a blueprint; transport
 * carries its stone and its materials to the station, shared with the city's
 * order (`transport.ts`); it is done when everything it requires has arrived,
 * and he installs it. The gear, its effects and its live timers are the
 * workshop's (`workshop.ts`). The station opens with the shaft, behind
 * part 3's switch, on in play since #682.
 */

/**
 * The blueprints in slice 1: the recipes whose materials an open level gives
 * (clay from the Topsoil, iron from the Granite). The rest wait for the slice
 * that opens their level ("Where today's parts land").
 */
export const BLUEPRINT_IDS = [
  "iron-rails",
  "sturdy-props",
  "blasting-charge",
  "reinforce",
  "axle-grease",
] as const satisfies readonly RecipeId[];

export type BlueprintId = (typeof BLUEPRINT_IDS)[number];

/**
 * The blueprints he can order: all but sturdy props. They made trouble
 * rarer, and expeditions, trouble and engineers are out of the game
 * (Flemming, 16 Nov 2026, `docs/decisions.md`). The id stays in
 * `BLUEPRINT_IDS`, which the save reads, so no save is reset.
 */
export const ORDER_IDS: readonly BlueprintId[] = BLUEPRINT_IDS.filter(
  (id) => id !== "sturdy-props",
);

/**
 * The stone each work order requires, as the lab sized it with no clock
 * (`src/lab/work-orders.ts`, #674): lasting gear about half an hour of half
 * a part 3 fleet, a blasting charge about five minutes, and reinforce and
 * axle grease iron only, as today. The materials are today's recipe's.
 */
const WORK_ORDER_STONES: Readonly<Record<BlueprintId, number>> = {
  "iron-rails": 250_000,
  "sturdy-props": 250_000,
  "blasting-charge": 50_000,
  reinforce: 0,
  "axle-grease": 0,
};

export function isBlueprintId(value: unknown): value is BlueprintId {
  return BLUEPRINT_IDS.some((id) => id === value);
}

/** What a work order requires, as a price: its own stone, then its recipe's materials. Scaled by `recipe.<id>.cost`. */
export function workOrderPrice(id: BlueprintId): Price {
  return recipePrice(id, WORK_ORDER_STONES[id]);
}

/**
 * What one of a good takes of a load (rule 7.13): one clay or one iron
 * counts as 500 stone, every other good as itself.
 */
const MATERIAL_LOAD = 500;

export function loadOf(good: GoodId): number {
  return good === "clay" || good === "iron" ? MATERIAL_LOAD : 1;
}

/**
 * The station: idle, a work order delivering (its blueprint, and what has
 * arrived of each good, in loads, so a clay can be part carried), or a work
 * order done, waiting for him to install it.
 */
export type Station =
  | { readonly kind: "idle" }
  | {
      readonly kind: "delivering";
      readonly blueprint: BlueprintId;
      readonly arrived: Stock;
    }
  | { readonly kind: "done"; readonly blueprint: BlueprintId };

export const IDLE_STATION: Station = { kind: "idle" };

/** The station is open with the shaft (rule 7's site bar: the factory with the shaft), in part 3. */
export function stationOpen(mountain: Pick<Mountain, "granite">): boolean {
  return graniteOpen(mountain);
}

/** A gear's last level, or the save's cap for a repeatable one. */
function lastLevel(id: BlueprintId): number {
  return recipeById(id).maxLevel ?? MAX_CRAFTED_LEVEL;
}

/** The gear's level once the old bench's craft of it, if one runs, is fitted. */
function levelInHand(
  mountain: Pick<Mountain, "crafted" | "bench">,
  id: BlueprintId,
): number {
  return craftedLevel(mountain, id) + (mountain.bench?.recipe === id ? 1 : 0);
}

/**
 * Whether this blueprint can be placed: one he can order, the station is
 * open, and the gear is not at its last level, counting a craft of it still
 * on the old bench.
 */
export function blueprintOpen(
  mountain: Pick<Mountain, "granite" | "crafted" | "bench">,
  id: BlueprintId,
): boolean {
  return (
    ORDER_IDS.includes(id) &&
    stationOpen(mountain) &&
    levelInHand(mountain, id) < lastLevel(id)
  );
}

/**
 * Whether a done work order can be installed: its gear is not at its last
 * level, counting a craft of it still on the old bench (which may have got
 * there first). Cancel gives its goods back.
 */
export function installable(
  mountain: Pick<Mountain, "station" | "crafted" | "bench">,
): boolean {
  const { station } = mountain;
  return (
    station.kind === "done" &&
    levelInHand(mountain, station.blueprint) < lastLevel(station.blueprint)
  );
}

/** He places a work order on an idle station. It costs nothing: transport brings what it requires. */
export function placeWorkOrder(mountain: Mountain, id: BlueprintId): Mountain {
  if (mountain.station.kind !== "idle" || !blueprintOpen(mountain, id)) {
    return mountain;
  }
  return {
    ...mountain,
    station: { kind: "delivering", blueprint: id, arrived: EMPTY_STOCK },
  };
}

/** What a work order requires in all, good by good, in loads. */
export function requiredLoads(id: BlueprintId): Stock {
  const price = workOrderPrice(id);
  const loads: Record<GoodId, number> = { ...EMPTY_STOCK };
  for (const good of GOOD_IDS) {
    loads[good] = priceAmount(price, good) * loadOf(good);
  }
  return loads;
}

/** Whole goods taken from the stockyard for `loads` of a good: a part-carried one has left it. */
function unitsTaken(good: GoodId, loads: number): number {
  return Math.ceil(loads / loadOf(good));
}

/** What the work order in hand still requires, good by good, in loads; nothing on an idle or done station. */
export function stillToArrive(station: Station): Stock {
  if (station.kind !== "delivering") {
    return EMPTY_STOCK;
  }
  const required = requiredLoads(station.blueprint);
  const left: Record<GoodId, number> = { ...EMPTY_STOCK };
  for (const good of GOOD_IDS) {
    left[good] = Math.max(0, required[good] - station.arrived[good]);
  }
  return left;
}

/**
 * Loads of each good transport could take to the station now: what it still
 * requires, up to the rest of a part-carried good and what the stockpile holds.
 */
export function loadable(
  mountain: Pick<Mountain, "station" | "stock">,
): Partial<Stock> {
  const { station } = mountain;
  if (station.kind !== "delivering") {
    return {};
  }
  const need = stillToArrive(station);
  const out: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    if (need[good] <= 0) {
      continue;
    }
    const load = loadOf(good);
    const begun =
      unitsTaken(good, station.arrived[good]) * load - station.arrived[good];
    out[good] = Math.min(need[good], begun + mountain.stock[good] * load);
  }
  return out;
}

/** Whether every good the work order requires has arrived. */
function allArrived(arrived: Stock, id: BlueprintId): boolean {
  const required = requiredLoads(id);
  return GOOD_IDS.every((good) => arrived[good] >= required[good]);
}

/**
 * Up to `load` whole loads carried to the station, split evenly between the
 * goods it can take (`loadable`). A good leaves the stockpile whole when its
 * first load is carried. When everything has arrived the work order is done.
 * `used` is the loads carried, so the city's order gets the rest.
 */
export function loadStation(
  mountain: Mountain,
  load: number,
): { readonly mountain: Mountain; readonly used: number } {
  const { station } = mountain;
  if (station.kind !== "delivering" || load < 1) {
    return { mountain, used: 0 };
  }
  const carried = shareOut(Math.floor(load), loadable(mountain));
  const arrived = addedStock(station.arrived, carried);
  const taken: Partial<Record<GoodId, number>> = {};
  let used = 0;
  for (const good of GOOD_IDS) {
    const amount = carried[good] ?? 0;
    used += amount;
    taken[good] = -(
      unitsTaken(good, arrived[good]) - unitsTaken(good, station.arrived[good])
    );
  }
  if (used === 0) {
    return { mountain, used: 0 };
  }
  const stock = addedStock(mountain.stock, taken);
  return {
    mountain: {
      ...mountain,
      stock,
      station: allArrived(arrived, station.blueprint)
        ? { kind: "done", blueprint: station.blueprint }
        : { ...station, arrived },
    },
    used,
  };
}

/**
 * The work order taken off the station: what left the stockyard for it
 * comes back in full, even past a stockpile's room (a full stockpile only
 * stops production, rule 4). A done one gives back all it required.
 */
export function cancelWorkOrder(mountain: Mountain): Mountain {
  const { station } = mountain;
  if (station.kind === "idle") {
    return mountain;
  }
  const arrived =
    station.kind === "done"
      ? requiredLoads(station.blueprint)
      : station.arrived;
  const back: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    back[good] = unitsTaken(good, arrived[good]);
  }
  return {
    ...mountain,
    stock: addedStock(mountain.stock, back),
    station: IDLE_STATION,
  };
}

/**
 * He installs a done work order: its gear goes up a level, or its live
 * timer starts now (`fitGear`), and the station is idle again. Not on gear
 * already at its last level: cancel gives its goods back.
 */
export function installWorkOrder(mountain: Mountain, now: number): Mountain {
  const { station } = mountain;
  if (
    station.kind !== "done" ||
    !installable(mountain) ||
    !Number.isSafeInteger(now) ||
    now < 0
  ) {
    return mountain;
  }
  return {
    ...fitGear(mountain, station.blueprint, now),
    station: IDLE_STATION,
  };
}

/** The most of each material the stockyard holds (rule 5.13): 10 clay and 35 iron. */
export const MATERIAL_HOLDS = { clay: 10, iron: 35 } as const;

/** Rock drilled on a level for one unit of its material (rule 5.13): 1M for a clay or an iron. */
export const ROCK_PER_UNIT = { clay: 1_000_000, iron: 1_000_000 } as const;

/** Whole units of a material between two counts of a level's drilled rock. */
function unitsBetween(
  material: "clay" | "iron",
  before: number,
  after: number,
): number {
  const every = ROCK_PER_UNIT[material];
  return Math.floor(after / every) - Math.floor(before / every);
}

/** A material's stock with `units` more, up to what it holds; never lowered. */
function filled(
  material: "clay" | "iron",
  stock: number,
  units: number,
): number {
  return Math.max(stock, Math.min(MATERIAL_HOLDS[material], stock + units));
}

/**
 * Clay and iron from the rock drilled between two states of the mine (rule
 * 5.13): one clay for each 1M rock drilled on the Topsoil, one iron for each
 * 1M on the Granite, each up to what it holds, and refilled up to that. Only
 * while the station is open. `after` comes back unchanged when nothing is
 * gained.
 */
export function withMaterials(before: Mountain, after: Mountain): Mountain {
  if (!stationOpen(after)) {
    return after;
  }
  const deepBefore = before.graniteDug;
  const deepAfter = after.graniteDug;
  const clay = unitsBetween(
    "clay",
    before.rockDug - deepBefore,
    after.rockDug - deepAfter,
  );
  const iron = unitsBetween("iron", deepBefore, deepAfter);
  if (clay <= 0 && iron <= 0) {
    return after;
  }
  const stock = {
    ...after.stock,
    clay: filled("clay", after.stock.clay, clay),
    iron: filled("iron", after.stock.iron, iron),
  };
  return stock.clay === after.stock.clay && stock.iron === after.stock.iron
    ? after
    : { ...after, stock };
}
