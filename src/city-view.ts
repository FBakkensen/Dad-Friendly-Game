import { SITE_HOLDS, buildRate, onSiteTotal } from "./building-site";
import {
  BUILDINGS,
  buildingById,
  nextBuilding,
  type BuildingId,
  type Site,
  type StepIndex,
} from "./city";
import { etaShort, formatCompact } from "./format";
import { STEP_NAMES, orderStrip, requirements, type Pip } from "./frame-view";
import type { Mountain } from "./mountain";
import { canPay, priceAmount } from "./stock";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import {
  VEHICLE_KEYS,
  VEHICLE_WORDS,
  formatSpeed,
  percent,
  plural,
} from "./screen-words";
import {
  VEHICLES,
  drivenFleet,
  fleetRate,
  orderLimit,
  orderNumbers,
  vehiclePrice,
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

function fleetWords(
  mountain: Mountain,
  vehicle: Vehicle,
  driven: number,
): string {
  const owned = mountain.fleet[vehicle.id];
  const kind = plural(owned, VEHICLE_WORDS[vehicle.id]);
  const drivers = plural(owned, ["driver", "drivers"]);
  const carries = formatSpeed(driven * vehicle.carries);
  return `${String(owned)} ${kind}: ${String(driven)} of ${String(owned)} ${drivers} ${carries}/s`;
}

export function transportPlate(mountain: Mountain): TransportPlate {
  const driving = mountain.jobs.driving;
  const driven = drivenFleet(mountain);
  return {
    drivers: `${String(driving)} ${plural(driving, ["driver", "drivers"])}`,
    state: PLATE_STATES[mountain.project.kind],
    fleet: VEHICLES.filter((vehicle) => mountain.fleet[vehicle.id] > 0)
      .map((vehicle) => fleetWords(mountain, vehicle, driven[vehicle.id]))
      .join(" · "),
    steps: jobRow(mountain, "driving"),
  };
}

/** A key for one more vehicle, in the mine keys' form. */
export type VehicleKey = {
  readonly id: VehicleId;
  readonly can: boolean;
  /** "+Wagon · 9/s". */
  readonly face: string;
  readonly price: string;
  /** "1 to run": a vehicle runs with one driver (rule 2.7). */
  readonly staff: string;
  readonly label: string;
};

/** Part 1 sells horse wagons; trucks come with part 3 and have no key before then. */
export function vehicleKeys(mountain: Mountain): readonly VehicleKey[] {
  return VEHICLES.map((vehicle) => {
    const price = vehiclePrice(mountain, vehicle.id);
    const cost = priceAmount(price, vehicle.good);
    const moves = `${formatSpeed(vehicle.carries)}/s`;
    return {
      id: vehicle.id,
      can: canPay(mountain.stock, price),
      face: `+${VEHICLE_KEYS[vehicle.id]} · ${moves}`,
      price: formatCompact(cost),
      staff: "1 to run",
      label: `Buy a ${VEHICLE_WORDS[vehicle.id][0]} for ${formatCompact(cost)} stone. It carries ${moves} and takes 1 to run.`,
    };
  });
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

function orderKey(mountain: Mountain, now: number | undefined): OrderKey {
  const project = mountain.project;
  if (project.kind === "unordered") {
    return {
      kind: "place",
      title: "Place order",
      lines: ["the whole building", "", ""],
      can: true,
      run: false,
      label: "Place the order for the whole building",
    };
  }
  const line = effectiveRates(mountain, now).exactCrewPerSecond;
  const numbers = orderNumbers(mountain, line);
  const builds = numbers.kind === "unordered" ? 0 : numbers.builds;
  const brings = numbers.kind === "unordered" ? 0 : numbers.brings;
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
  const limit = orderLimit(mountain, line);
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
  /** "2 builders ×8/s · on site 400 of 500". */
  readonly line: string;
};

function buildersRow(mountain: Mountain): BuildersRow {
  const count = mountain.jobs.building;
  const each = `${String(count)} ${plural(count, ["builder", "builders"])} ×${formatSpeed(oneBuilderBuilds())}/s`;
  const project = mountain.project;
  const site =
    project.kind === "unordered"
      ? ""
      : ` · on site ${formatCompact(onSiteTotal(project.site))} of ${formatCompact(SITE_HOLDS)}`;
  return { ...jobRow(mountain, "building"), line: `${each}${site}` };
}

/** One good the step requires: what is built in of it, and its bar. */
type CardBar = {
  readonly good: string;
  readonly line: string;
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

function completion(id: BuildingId): string {
  const power = buildingById(id).power;
  return `On completion: night shift output ${percent(power.nightShift)}, up from ${percent(AWAY_PAY_RATE)}.`;
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
  return {
    kind: "project",
    name: strip.name,
    steps,
    bars: strip.requires.map((r) => ({
      good: r.good,
      line: r.line,
      share: r.requires > 0 ? Math.min(1, r.built / r.requires) : 0,
    })),
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
  /** Vehicles with a driver, and those without. */
  readonly driven: number;
  readonly undriven: number;
  /** What transport brings of what the driven fleet carries: 0 when it stands. */
  readonly load: number;
};

const share = (part: number, whole: number): number =>
  whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;

export function cityScene(mountain: Mountain, now?: number): CityScene {
  const shown = plots(mountain);
  const project = mountain.project;
  const numbers = orderNumbers(
    mountain,
    effectiveRates(mountain, now).exactCrewPerSecond,
  );
  const rate = buildRate(mountain);
  const driven = Object.values(drivenFleet(mountain)).reduce(
    (sum, n) => sum + n,
    0,
  );
  const owned = Object.values(mountain.fleet).reduce((sum, n) => sum + n, 0);
  const ordered =
    project.kind === "unordered" ? undefined : project.site.building;
  const at = shown.findIndex(
    (plot) => ordered !== undefined && plot.building === ordered,
  );
  return {
    plots: shown,
    sitePlot: at < 0 ? undefined : at,
    siteFill:
      project.kind === "unordered"
        ? 0
        : share(onSiteTotal(project.site), SITE_HOLDS),
    builders: mountain.jobs.building,
    building: numbers.kind === "unordered" ? 0 : share(numbers.builds, rate),
    driven,
    undriven: owned - driven,
    load:
      numbers.kind === "unordered"
        ? 0
        : share(numbers.brings, fleetRate(mountain)),
  };
}
