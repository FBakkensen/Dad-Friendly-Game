import {
  SITE_GOOD_CAP,
  SITE_HOLDS,
  buildRate,
  onSiteTotal,
} from "./building-site";
import {
  BUILDINGS,
  buildingById,
  nextBuilding,
  type BuildingId,
  type Site,
  type StepIndex,
} from "./city";
import { etaShort, formatCompact } from "./format";
import { opensWords, powerWords } from "./frame-cards-words";
import {
  GOOD_WORDS,
  STEP_NAMES,
  orderStrip,
  requirements,
  type Pip,
} from "./frame-view";
import type { Mountain } from "./mountain";
import { partThreeOn, slice2Part1On } from "./part-switch";
import { slice2LiveSnapshot, slice2OrderRates } from "./slice2-flow";
import type { BuyAmount } from "./tiers";
import type { GoodId } from "./stock";
import { effectiveRates } from "./rates";
import {
  VEHICLE_KEYS,
  VEHICLE_WORDS,
  formatSpeed,
  plural,
} from "./screen-words";
import {
  VEHICLES,
  VEHICLE_IDS,
  drivenFleet,
  fleetRate,
  orderLimit,
  orderNumbers,
  vehicleCarries,
  vehicleOpen,
  vehicleQuote,
  vehicleRecord,
  type Vehicle,
  type VehicleId,
} from "./transport";
import { jobRow, oneBuilderBuilds, type JobRow } from "./workforce-view";

/**
 * The city (#662; spec, "The city"): the transport plate, the skyline's
 * plots, and the project's card with its order key and its builders. Pure:
 * it reads the mountain and never writes it. It shows the order's numbers
 * and names no limit (rule 7.11).
 */

/** The transport plate on top of the skyline. */
export type TransportPlate = {
  /** "1 driver". */
  readonly drivers: string;
  /** "serving the city", "on hold" or "idle: no order". */
  readonly state: string;
  /** "1 horse wagon: 1 of 1 driver 9/s". */
  readonly fleet: string;
  readonly steps: JobRow;
};

const PLATE_STATES: Readonly<Record<Mountain["project"]["kind"], string>> = {
  delivering: "serving the city",
  onHold: "on hold",
  unordered: "idle: no order",
};

/** What transport is doing for the city's project. */
function plateState(mountain: Mountain): string {
  return PLATE_STATES[mountain.project.kind];
}

function fleetWords(
  mountain: Mountain,
  vehicle: Vehicle,
  driven: number,
): string {
  const owned = mountain.fleet[vehicle.id];
  const kind = plural(owned, VEHICLE_WORDS[vehicle.id]);
  const drivers = plural(owned, ["driver", "drivers"]);
  const carries = formatSpeed(driven * vehicleCarries(vehicle));
  return `${String(owned)} ${kind}: ${String(driven)} of ${String(owned)} ${drivers} ${carries}/s`;
}

export function transportPlate(mountain: Mountain): TransportPlate {
  const driving = mountain.jobs.driving;
  const driven = drivenFleet(mountain);
  return {
    drivers: `${String(driving)} ${plural(driving, ["driver", "drivers"])}`,
    state: plateState(mountain),
    fleet: VEHICLES.filter((vehicle) => mountain.fleet[vehicle.id] > 0)
      .map((vehicle) => fleetWords(mountain, vehicle, driven[vehicle.id]))
      .join(" · "),
    steps: jobRow(mountain, "driving"),
  };
}

/** A key for more vehicles at the amount key's amount, in the mine keys' form (#715). */
export type VehicleKey = {
  readonly id: VehicleId;
  /** What it is bought with: stone for a wagon, brick for a truck. */
  readonly good: GoodId;
  readonly count: number;
  readonly cost: number;
  readonly can: boolean;
  /** "+Wagon · 9/s", "+10 Wagons · 90/s". */
  readonly face: string;
  readonly price: string;
  /** "1 to run": a vehicle runs with one driver (rule 2.7). */
  readonly staff: string;
  readonly label: string;
};

/**
 * Part 1 sells horse wagons; trucks come with part 3 and the Warehouse, for
 * brick, and have no key before then (#754).
 */
export function vehicleKeys(
  mountain: Mountain,
  amount: BuyAmount,
): readonly VehicleKey[] {
  return VEHICLES.filter((vehicle) => vehicleOpen(mountain, vehicle.id)).map(
    (vehicle) => {
      const { count, cost } = vehicleQuote(mountain, vehicle.id, amount);
      const one = count === 1;
      const moves = `${formatSpeed(vehicleCarries(vehicle) * count)}/s`;
      const key = plural(count, VEHICLE_KEYS[vehicle.id]);
      const words = plural(count, VEHICLE_WORDS[vehicle.id]);
      const price = formatCompact(cost);
      const good = GOOD_WORDS[vehicle.good];
      return {
        id: vehicle.id,
        good: vehicle.good,
        count,
        cost,
        can: cost <= mountain.stock[vehicle.good],
        face: one
          ? `+${key} · ${moves}`
          : `+${String(count)} ${key} · ${moves}`,
        price,
        staff: `${String(count)} to run`,
        label: one
          ? `Buy a ${words} for ${price} ${good}. It carries ${moves} and takes 1 to run.`
          : `Buy ${String(count)} ${words} for ${price} ${good}. They carry ${moves} and take ${String(count)} to run.`,
      };
    },
  );
}

/**
 * The dark cell in the trucks' key's place while the Warehouse is the
 * project in hand in part 3 (#754; spec, The city): it says when trucks
 * come and buys nothing. Undefined before part 3, with the Light Tower in
 * hand, and once the Warehouse is operational and the key itself shows.
 */
export function vehicleHint(mountain: Mountain): string | undefined {
  return partThreeOn() && inHand(mountain) === "warehouse"
    ? "Trucks: after the Warehouse"
    : undefined;
}

/** How far the building in hand has risen: its step and the share of it built in. */
function risen(mountain: Mountain): number {
  const project = mountain.project;
  return project.kind === "unordered"
    ? 0
    : project.site.step + builtShare(project.site);
}

/** What of the step is built in, over every good it requires. */
function builtShare(site: Site): number {
  const each = requirements(site);
  const built = each.reduce((sum, r) => sum + r.built, 0);
  const requires = each.reduce((sum, r) => sum + r.requires, 0);
  return requires > 0 ? Math.min(1, built / requires) : 0;
}

/** A plot in the skyline, and the tag under it. */
export type Plot = {
  readonly building: BuildingId | undefined;
  /** "The Light Tower", or "Vacant plot". */
  readonly name: string;
  /** "operational", "foundation", or "unassigned". */
  readonly state: string;
  /** 0 to 3: the steps built in, for the picture. */
  readonly risen: number;
};

/** The skyline has three plots; part 1 builds on the first. */
const PLOTS = 3;

/** The building in hand: the one ordered, or the next to order. */
function inHand(mountain: Mountain): BuildingId | undefined {
  const project = mountain.project;
  return project.kind === "unordered"
    ? nextBuilding(mountain)?.id
    : project.site.building;
}

export function plots(mountain: Mountain): readonly Plot[] {
  const hand = inHand(mountain);
  const project = mountain.project;
  const step = project.kind === "unordered" ? 0 : project.site.step;
  return Array.from({ length: PLOTS }, (_, at): Plot => {
    const building = BUILDINGS[at];
    if (building !== undefined && mountain.operational.includes(building.id)) {
      return {
        building: building.id,
        name: building.name,
        state: "operational",
        risen: 3,
      };
    }
    if (building !== undefined && building.id === hand) {
      return {
        building: building.id,
        name: building.name,
        state: STEP_NAMES[step].toLowerCase(),
        risen: risen(mountain),
      };
    }
    return {
      building: undefined,
      name: "Vacant plot",
      state: "unassigned",
      risen: 0,
    };
  });
}

/** The order key on the card: three states, and what each says. */
export type OrderKey = {
  readonly kind: "place" | "hold" | "resume";
  readonly title: string;
  readonly lines: readonly [string, string, string];
  /** Green: a tap places or resumes the order. */
  readonly can: boolean;
  /** Amber: the order is running. */
  readonly run: boolean;
  readonly label: string;
};

/** "Foundation 25K", "Structure 250K", "Roof 1M": what each step requires, from the building's row. */
function stepsRequired(id: BuildingId): [string, string, string] {
  const [foundation, structure, roof] = buildingById(id).steps.map(
    (price, at) =>
      `${STEP_NAMES[at as StepIndex]} ${price.map((part) => formatCompact(part.amount)).join(" + ")}`,
  );
  return [foundation ?? "", structure ?? "", roof ?? ""];
}

/**
 * The order key before the order: what each step requires, one step a line,
 * so he can do the sum before he orders (#715). The label says it in one.
 */
function placeKey(mountain: Mountain): OrderKey {
  const id = inHand(mountain);
  const lines = id === undefined ? (["", "", ""] as const) : stepsRequired(id);
  return {
    kind: "place",
    title: "Place order",
    lines,
    can: true,
    run: false,
    label: `Place order · ${lines.filter((line) => line !== "").join(" · ")}`,
  };
}

function slice2CityFlows(mountain: Mountain): {
  readonly brings: number;
  readonly builds: number;
} {
  const snap = slice2LiveSnapshot(mountain);
  return {
    brings:
      snap.runRates["stockToCity:stones"] +
      snap.runRates["stockToCity:brick"] +
      snap.runRates["stockToCity:cutStone"],
    builds: snap.build.stones + snap.build.brick + snap.build.cutStone,
  };
}

function orderKey(mountain: Mountain, now: number | undefined): OrderKey {
  const project = mountain.project;
  if (project.kind === "unordered") {
    return placeKey(mountain);
  }
  const slice2 = slice2Part1On();
  const s2 = slice2 ? slice2OrderRates(mountain) : undefined;
  const line = effectiveRates(mountain, now).exactCrewPerSecond;
  const { brings, builds } = slice2
    ? slice2CityFlows(mountain)
    : (() => {
        const numbers = orderNumbers(mountain, line);
        return {
          brings: numbers.kind === "unordered" ? 0 : numbers.brings,
          builds: numbers.kind === "unordered" ? 0 : numbers.builds,
        };
      })();
  const building = `building ${formatSpeed(builds)}/s`;
  if (project.kind === "onHold") {
    return {
      kind: "resume",
      title: "Resume",
      lines: ["on hold", builds > 0 ? building : "", ""],
      can: true,
      run: false,
      label: "Resume the order",
    };
  }
  const limit =
    s2 !== undefined
      ? orderLimit(mountain, s2.income, s2.cityCarry)
      : orderLimit(mountain, line);
  const left =
    limit.kind === "delivering" && Number.isFinite(limit.secondsLeft)
      ? ` · ${etaShort(limit.secondsLeft * 1000)}`
      : "";
  return {
    kind: "hold",
    title: "Delivering",
    lines: [
      `arriving ${formatSpeed(brings)}/s`,
      `${building}${left}`,
      "tap to hold",
    ],
    can: false,
    run: true,
    label: "Put the order on hold",
  };
}

/** The builders under the bars, with their − and +. */
type BuildersRow = JobRow & {
  /** "2 builders ×8/s · on site 400 of 500" (or "2 builders ×50/s" in Slice 2 where each good has its own cap). */
  readonly line: string;
};

function buildersRow(mountain: Mountain): BuildersRow {
  const count = mountain.jobs.building;
  const each = `${String(count)} ${plural(count, ["builder", "builders"])} ×${formatSpeed(oneBuilderBuilds())}/s`;
  const project = mountain.project;
  const site =
    project.kind === "unordered" || slice2Part1On()
      ? ""
      : ` · on site ${formatCompact(onSiteTotal(project.site))} of ${formatCompact(SITE_HOLDS)}`;
  return { ...jobRow(mountain, "building"), line: `${each}${site}` };
}

/** One good the step requires: what is built in of it, and its bar. */
type CardBar = {
  readonly good: GoodId;
  readonly line: string;
  /** Per-good on-site buffer under Slice 2 Part 1 ("180/500 on site"). */
  readonly onSite?: string;
  readonly share: number;
};

/** The project's card under the skyline. */
export type ProjectCard =
  | {
      readonly kind: "project";
      readonly name: string;
      readonly steps: readonly { readonly name: string; readonly pip: Pip }[];
      readonly bars: readonly CardBar[];
      readonly key: OrderKey;
      readonly builders: BuildersRow;
      /** "On completion: night shift output 45%, up from 30%." */
      readonly completion: string;
    }
  /**
   * After the part's last roof: the last building with its steps done, the
   * order strip's line in place of the bars, and no order key.
   */
  | {
      readonly kind: "planning";
      readonly name: string;
      readonly steps: readonly { readonly name: string; readonly pip: Pip }[];
      readonly line: string;
      readonly builders: BuildersRow;
    };

/** The power a building gives, as the card says it, and what it opens. */
function completion(id: BuildingId): string {
  const words = powerWords(id);
  if (words.length === 0) {
    return "";
  }
  const opened = opensWords(id);
  return `On completion: ${words.join(" ")}${opened === "" ? "" : ` ${opened}`}`;
}

export function projectCard(mountain: Mountain, now?: number): ProjectCard {
  const strip = orderStrip(mountain);
  const builders = buildersRow(mountain);
  const steps = strip.pips.map((pip, at) => ({
    name: STEP_NAMES[at as StepIndex],
    pip,
  }));
  if (strip.kind === "planning") {
    return {
      kind: "planning",
      name: strip.name,
      steps,
      line: strip.line,
      builders,
    };
  }
  const id = inHand(mountain);
  const slice2 = slice2Part1On();
  const onSite =
    mountain.project.kind === "unordered"
      ? undefined
      : mountain.project.site.onSite;
  return {
    kind: "project",
    name: strip.name,
    steps,
    bars: strip.requires.map((r) => {
      const held = onSite === undefined ? 0 : onSite[r.good];
      const bar: CardBar = {
        good: r.good,
        line: r.line,
        share: r.requires > 0 ? Math.min(1, r.built / r.requires) : 0,
        ...(slice2 && onSite !== undefined
          ? {
              onSite: `${formatCompact(held)}/${formatCompact(SITE_GOOD_CAP)} on site`,
            }
          : {}),
      };
      return bar;
    }),
    key: orderKey(mountain, now),
    builders,
    completion: id === undefined ? "" : completion(id),
  };
}

/** What the city's scene draws: the plots risen, the site, the builders and the wagons. */
export type CityScene = {
  readonly plots: readonly Plot[];
  /** Where the site lies: the plot of the building in hand, or none. */
  readonly sitePlot: number | undefined;
  /** What is on the site, of what it holds. */
  readonly siteFill: number;
  readonly builders: number;
  /** The share of the builders' time they build in. */
  readonly building: number;
  /** Vehicles with a driver, and those without, by kind (#754). */
  readonly driven: Readonly<Record<VehicleId, number>>;
  readonly undriven: Readonly<Record<VehicleId, number>>;
  /** What transport brings of what the driven fleet carries: 0 when it stands. */
  readonly load: number;
};

const share = (part: number, whole: number): number =>
  whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;

export function cityScene(mountain: Mountain, now?: number): CityScene {
  const shown = plots(mountain);
  const project = mountain.project;
  const slice2 = slice2Part1On();
  const line = effectiveRates(mountain, now).exactCrewPerSecond;
  const { brings, builds } = slice2
    ? slice2CityFlows(mountain)
    : (() => {
        const numbers = orderNumbers(mountain, line);
        return {
          brings: numbers.kind === "unordered" ? 0 : numbers.brings,
          builds: numbers.kind === "unordered" ? 0 : numbers.builds,
        };
      })();
  const rate = buildRate(mountain);
  const driven = drivenFleet(mountain);
  const undriven = vehicleRecord(0);
  for (const id of VEHICLE_IDS) {
    undriven[id] = mountain.fleet[id] - driven[id];
  }
  const ordered =
    project.kind === "unordered" ? undefined : project.site.building;
  const at = shown.findIndex(
    (plot) => ordered !== undefined && plot.building === ordered,
  );
  const siteFill =
    project.kind === "unordered"
      ? 0
      : slice2
        ? Math.max(
            0,
            ...Object.values(project.site.onSite).map((held) =>
              share(held, SITE_GOOD_CAP),
            ),
          )
        : share(onSiteTotal(project.site), SITE_HOLDS);
  return {
    plots: shown,
    sitePlot: at < 0 ? undefined : at,
    siteFill,
    builders: mountain.jobs.building,
    building: project.kind === "unordered" ? 0 : share(builds, rate),
    driven,
    undriven,
    load: share(brings, fleetRate(mountain)),
  };
}
