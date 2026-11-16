import { factor } from "./economy/factors";
import {
  BLUEPRINT_IDS,
  MATERIAL_HOLDS,
  blueprintOpen,
  installable,
  loadOf,
  requiredLoads,
  workOrderPrice,
  type BlueprintId,
  type Station,
} from "./factory";
import { chipTime, formatCompact } from "./format";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { formatSpeed } from "./screen-words";
import { GOOD_IDS, priceAmount, type GoodId } from "./stock";
import type { TierId } from "./tiers";
import { orderShares } from "./transport";
import {
  MAX_CRAFTED_LEVEL,
  craftedLevel,
  hotTimers,
  recipeById,
  reinforceTier,
  type RecipeId,
  type TimerId,
} from "./workshop";

/**
 * The factory (#681; spec, The factory): the bins, the station and the
 * blueprints, as the page shows them. Pure: it reads the mountain and never
 * writes it. It shows the numbers and names no limit: a material that is
 * short is seen in its bin and on its own line, never said.
 */

export const STATION_IDLE = "Station idle";
export const STATION_IDLE_LINE =
  "Drag a blueprint here. Transport brings the materials.";
export const CANCEL_LINE = "Cancel · what arrived goes back";
export const INSTALL = "Install";
const FULLY_INSTALLED = "Fully installed";

/** A material's bin: its count, what it holds, and where it comes from. */
export type Bin = {
  readonly good: "clay" | "iron";
  readonly count: number;
  readonly holds: number;
  /** "Clay 8/10 · source: Topsoil". */
  readonly text: string;
};

const BIN_ROWS = [
  { good: "clay", name: "Clay", source: "Topsoil" },
  { good: "iron", name: "Iron", source: "Granite" },
] as const;

function bins(mountain: Mountain): readonly Bin[] {
  return BIN_ROWS.map(({ good, name, source }) => {
    const count = Math.floor(mountain.stock[good]);
    const holds = MATERIAL_HOLDS[good];
    return {
      good,
      count,
      holds,
      text: `${name} ${String(count)}/${String(holds)} · source: ${source}`,
    };
  });
}

const GOOD_NAMES: Readonly<Partial<Record<GoodId, string>>> = {
  stones: "Stone",
  clay: "Clay",
  iron: "Iron",
};

/** One good a work order requires, and how much of it has arrived. */
export type StationGood = {
  readonly good: GoodId;
  /** "Stone 105K of 250K", "Clay 3 of 10". */
  readonly text: string;
  readonly share: number;
};

/** What the station shows: idle, a work order delivering, or one done. */
export type StationView =
  | {
      readonly kind: "idle";
      readonly title: string;
      readonly line: string;
    }
  | {
      readonly kind: "delivering";
      readonly blueprint: BlueprintId;
      readonly title: string;
      /** "arriving 36/s": goods a second transport brings it now. */
      readonly line: string;
      readonly goods: readonly StationGood[];
      /** How far it is, over every load it requires. */
      readonly share: number;
      readonly percent: string;
      readonly cancel: string;
    }
  | {
      readonly kind: "done";
      readonly blueprint: BlueprintId;
      readonly title: string;
      /** Its effect. */
      readonly line: string;
      readonly install: string;
      /** False when its gear reached its last level meanwhile: only Cancel. */
      readonly installable: boolean;
      readonly cancel: string;
    };

const strength = (id: RecipeId): number => factor(`recipe.${id}.strength`);
const percent = (share: number): string =>
  `${String(Math.round(share * 100))}%`;

/** "Drills", "Borers": the machine reinforce lifts. */
const REINFORCED: Readonly<Partial<Record<TierId, string>>> = {
  drill: "Drills",
  borer: "Borers",
  machine: "Winding engines",
};

/**
 * What a blueprint does once installed, in the rules' numbers. Reinforce
 * names the machine it lifts now; before a cart runs that is the drill.
 */
export function effectWords(mountain: Mountain, id: BlueprintId): string {
  const effect = recipeById(id).effect;
  switch (effect.kind) {
    case "tier":
      return `Carts +${percent(effect.perLevel * strength(id))}`;
    case "trouble":
      return `Trouble ${percent(effect.rarer * strength(id))} rarer`;
    case "charge":
      return `Throughput ×${formatSpeed(1 + (effect.multiplier - 1) * strength(id))} for ${String(Math.round(effect.durationMs / 60_000))} min`;
    case "axle":
      return `Throughput ×${formatSpeed(1 + effect.bonus * strength(id))} for ${String(Math.round((effect.durationMs * strength(id)) / 60_000))} min`;
    case "reinforce":
      return `${REINFORCED[reinforceTier(mountain) ?? "drill"] ?? "Drills"} +${percent(effect.perLevel * strength(id))}`;
    /* v8 ignore next 2 -- the blueprints are the five above */
    default:
      return "";
  }
}

/** Whole goods of `loads` of a good. */
const unitsOf = (good: GoodId, loads: number): number =>
  Math.floor(loads / loadOf(good));

function stationGoods(
  blueprint: BlueprintId,
  arrived: Readonly<Record<GoodId, number>>,
): readonly StationGood[] {
  const required = requiredLoads(blueprint);
  return GOOD_IDS.filter((good) => required[good] > 0).map((good) => ({
    good,
    text: `${GOOD_NAMES[good] ?? good} ${formatCompact(unitsOf(good, arrived[good]))} of ${formatCompact(unitsOf(good, required[good]))}`,
    share: Math.min(1, arrived[good] / required[good]),
  }));
}

/** Goods a second transport brings the station now: its share of the fleet (rule 7.7). */
function arriving(mountain: Mountain, now: number | undefined): number {
  const line = effectiveRates(mountain, now).exactCrewPerSecond;
  return orderShares(mountain, 1, { stones: line }).station;
}

function stationView(mountain: Mountain, now: number | undefined): StationView {
  const station: Station = mountain.station;
  switch (station.kind) {
    case "idle":
      return { kind: "idle", title: STATION_IDLE, line: STATION_IDLE_LINE };
    case "delivering": {
      const required = requiredLoads(station.blueprint);
      const all = GOOD_IDS.reduce((sum, good) => sum + required[good], 0);
      const got = GOOD_IDS.reduce(
        (sum, good) => sum + Math.min(station.arrived[good], required[good]),
        0,
      );
      const share = all > 0 ? got / all : 0;
      return {
        kind: "delivering",
        blueprint: station.blueprint,
        title: recipeById(station.blueprint).name,
        line: `arriving ${formatSpeed(arriving(mountain, now))}/s`,
        goods: stationGoods(station.blueprint, station.arrived),
        share,
        percent: `${String(Math.floor(share * 100))}%`,
        cancel: CANCEL_LINE,
      };
    }
    case "done":
      return {
        kind: "done",
        blueprint: station.blueprint,
        title: `${recipeById(station.blueprint).name}: complete`,
        line: effectWords(mountain, station.blueprint),
        install: INSTALL,
        installable: installable(mountain),
        cancel: CANCEL_LINE,
      };
  }
}

/** One good a blueprint requires: its amount, and whether the stockyard holds less. */
export type Requirement = {
  readonly good: GoodId;
  readonly text: string;
  readonly short: boolean;
};

/** A blueprint under the station. */
export type BlueprintCard = {
  readonly id: BlueprintId;
  readonly name: string;
  readonly effect: string;
  /** "1/2": installed of its last level; "" for one with no last level. */
  readonly level: string;
  /** Open to place; busy while the station has a work order; installed at its last level. */
  readonly state: "open" | "busy" | "installed";
  readonly requires: readonly Requirement[];
  /** "Fully installed", or "". */
  readonly line: string;
  readonly label: string;
};

function lastLevel(id: BlueprintId): number | undefined {
  return recipeById(id).maxLevel;
}

function cardState(
  mountain: Mountain,
  id: BlueprintId,
): BlueprintCard["state"] {
  const last = lastLevel(id) ?? MAX_CRAFTED_LEVEL;
  if (craftedLevel(mountain, id) >= last) {
    return "installed";
  }
  return mountain.station.kind === "idle" && blueprintOpen(mountain, id)
    ? "open"
    : "busy";
}

function card(mountain: Mountain, id: BlueprintId): BlueprintCard {
  const name = recipeById(id).name;
  const effect = effectWords(mountain, id);
  const last = lastLevel(id);
  const level =
    last === undefined
      ? ""
      : `${String(craftedLevel(mountain, id))}/${String(last)}`;
  const state = cardState(mountain, id);
  const price = workOrderPrice(id);
  const requires =
    state === "installed"
      ? []
      : GOOD_IDS.filter((good) => priceAmount(price, good) > 0).map((good) => ({
          good,
          text: formatCompact(priceAmount(price, good)),
          short: mountain.stock[good] < priceAmount(price, good),
        }));
  const needs = requires
    .map(
      (need) =>
        `${need.text} ${(GOOD_NAMES[need.good] ?? need.good).toLowerCase()}`,
    )
    .join(", ");
  return {
    id,
    name,
    effect,
    level,
    state,
    requires,
    line: state === "installed" ? FULLY_INSTALLED : "",
    label:
      state === "installed"
        ? `${name}: ${FULLY_INSTALLED.toLowerCase()}`
        : `Place a work order for ${name.toLowerCase()}. ${effect}. Requires ${needs}.`,
  };
}

/** The lasting gear the head counts, in short. */
const HEAD_GEAR: readonly (readonly [BlueprintId, string])[] = [
  ["iron-rails", "rails"],
  ["sturdy-props", "props"],
  ["reinforce", "reinforce"],
];

function installedLine(mountain: Mountain): string {
  return `Installed: ${HEAD_GEAR.map(
    ([id, short]) =>
      `${short} ${String(craftedLevel(mountain, id))}/${String(lastLevel(id) ?? MAX_CRAFTED_LEVEL)}`,
  ).join(" · ")}`;
}

/** What a live timer does while it runs, as the head says it. */
const TIMER_WORDS: Readonly<Partial<Record<TimerId, string>>> = {
  "blasting-charge": "Throughput ×2",
  "axle-grease": "Throughput ×2",
};

function timers(
  mountain: Mountain,
  now: number | undefined,
): readonly string[] {
  if (now === undefined) {
    return [];
  }
  return hotTimers(mountain, now).flatMap((timer) => {
    const words = TIMER_WORDS[timer.id];
    return words === undefined
      ? []
      : [`${words}: ${chipTime(timer.until - now)}`];
  });
}

export type FactoryView = {
  readonly installed: string;
  readonly timers: readonly string[];
  readonly bins: readonly Bin[];
  readonly station: StationView;
  readonly blueprints: readonly BlueprintCard[];
};

export function factoryView(mountain: Mountain, now?: number): FactoryView {
  return {
    installed: installedLine(mountain),
    timers: timers(mountain, now),
    bins: bins(mountain),
    station: stationView(mountain, now),
    blueprints: BLUEPRINT_IDS.map((id) => card(mountain, id)),
  };
}
