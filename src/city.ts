import type { Mountain } from "./mountain";
import {
  EMPTY_STOCK,
  GOOD_IDS,
  addedStock,
  priceAmount,
  stonesPrice,
  type Price,
  type Stock,
} from "./stock";

/**
 * The city (slice 1, rule 6, #654): one project at a time. A project is a
 * building, and a building rises in three steps. He orders it once, and
 * transport (src/transport.ts) carries what each step requires. With its
 * roof on, a building is operational and gives its power. Off in play: only
 * a fresh mine (`freshMineOn`) lists the moves that order one.
 */

/** A building's three steps, in order: foundation, structure, roof. */
export type StepIndex = 0 | 1 | 2;

/** The last step: the building goes operational when it is built in. */
export const ROOF: StepIndex = 2;

/** What an operational building gives, read from its row. */
type Power = {
  /** The night shift output (share of the crew's speed) it lights the night to. */
  readonly nightShift: number;
};

type BuildingRow = {
  readonly id: string;
  readonly name: string;
  /** What each step requires, as a short list of goods (#560). */
  readonly steps: readonly [Price, Price, Price];
  readonly power: Power;
};

/**
 * In the order he builds them. Part 1 has the Light Tower; the Warehouse and
 * the Foundry require brick and cut stone, and come with parts 2 and 3. The
 * lab set the Light Tower's steps (#655): a casual dad has its roof on in
 * about two days.
 */
const BUILDING_ROWS = [
  {
    id: "lightTower",
    name: "The Light Tower",
    steps: [stonesPrice(25_000), stonesPrice(250_000), stonesPrice(1_000_000)],
    // "Lights the night: night shift output is 45%, up from 30%."
    power: { nightShift: 0.45 },
  },
] as const satisfies readonly BuildingRow[];

export type BuildingId = (typeof BUILDING_ROWS)[number]["id"];

export type Building = Omit<BuildingRow, "id"> & { readonly id: BuildingId };

export const BUILDINGS: readonly Building[] = BUILDING_ROWS;

export const BUILDING_IDS: readonly BuildingId[] = BUILDINGS.map(
  (building) => building.id,
);

const BUILDING_BY_ID = Object.fromEntries(
  BUILDINGS.map((building) => [building.id, building]),
) as Record<BuildingId, Building>;

export function buildingById(id: BuildingId): Building {
  return BUILDING_BY_ID[id];
}

/**
 * The building in hand: its step, what has arrived of each good for that
 * step, and what of it is on the building site, not yet built in (#690).
 * What is built in is the rest: `arrived` less `onSite`.
 */
export type Site = {
  readonly building: BuildingId;
  readonly step: StepIndex;
  readonly arrived: Stock;
  readonly onSite: Stock;
};

/** The first step of a building, with nothing arrived. */
function freshSite(building: BuildingId, step: StepIndex): Site {
  return { building, step, arrived: EMPTY_STOCK, onSite: EMPTY_STOCK };
}

/**
 * The city's project. Nothing starts without his order, and the next
 * building is the first one that is not operational.
 */
export type Project =
  | { readonly kind: "unordered" }
  | { readonly kind: "delivering"; readonly site: Site }
  | { readonly kind: "onHold"; readonly site: Site };

export const NO_PROJECT: Project = { kind: "unordered" };

/** The next building to order, or none when every one is operational. */
export function nextBuilding(
  mountain: Pick<Mountain, "operational">,
): Building | undefined {
  return BUILDINGS.find(
    (building) => !mountain.operational.includes(building.id),
  );
}

/** He orders the next building: transport starts on its foundation. */
export function placeOrder(mountain: Mountain): Mountain {
  const next = nextBuilding(mountain);
  if (mountain.project.kind !== "unordered" || next === undefined) {
    return mountain;
  }
  return {
    ...mountain,
    project: { kind: "delivering", site: freshSite(next.id, 0) },
  };
}

/**
 * On hold: nothing leaves the pocket for it, and the builders still build
 * in what is on the site. Free and instant (rule 7.10).
 */
export function holdOrder(mountain: Mountain): Mountain {
  return mountain.project.kind === "delivering"
    ? { ...mountain, project: { kind: "onHold", site: mountain.project.site } }
    : mountain;
}

/** Deliveries start again where they stopped. Free and instant. */
export function resumeOrder(mountain: Mountain): Mountain {
  return mountain.project.kind === "onHold"
    ? {
        ...mountain,
        project: { kind: "delivering", site: mountain.project.site },
      }
    : mountain;
}

/** What the site's step requires in all. */
export function stepRequires(site: Site): Price {
  return buildingById(site.building).steps[site.step];
}

/** What the step in hand still requires transport to bring, good by good. */
export function stillRequired(site: Site): Stock {
  const requires = stepRequires(site);
  const left: Record<keyof Stock, number> = { ...EMPTY_STOCK };
  for (const good of GOOD_IDS) {
    left[good] = Math.max(0, priceAmount(requires, good) - site.arrived[good]);
  }
  return left;
}

/** The next step's empty site, or none after the roof. */
export function siteAfter(site: Site): Site | undefined {
  return site.step < ROOF
    ? freshSite(site.building, (site.step + 1) as StepIndex)
    : undefined;
}

/** What the step in hand still requires the builders to build in, good by good. */
export function stillToBuild(site: Site): Stock {
  const requires = stepRequires(site);
  const left: Record<keyof Stock, number> = { ...EMPTY_STOCK };
  for (const good of GOOD_IDS) {
    const built = site.arrived[good] - site.onSite[good];
    left[good] = Math.max(0, priceAmount(requires, good) - built);
  }
  return left;
}

/** A step is done when what it requires is built in (rule 7.8). */
export function stepDone(site: Site): boolean {
  const left = stillToBuild(site);
  return GOOD_IDS.every((good) => left[good] === 0);
}

/**
 * Goods that transport brought to the site in hand (rule 7.8: they stay).
 * They wait on the building site until the builders build them in.
 */
export function receive(mountain: Mountain, goods: Partial<Stock>): Mountain {
  const project = mountain.project;
  if (project.kind !== "delivering") {
    return mountain;
  }
  const site = {
    ...project.site,
    arrived: addedStock(project.site.arrived, goods),
    onSite: addedStock(project.site.onSite, goods),
  };
  return { ...mountain, project: { kind: "delivering", site } };
}

/**
 * Goods the builders built in from the site, delivering or on hold (#690).
 * A step whose goods are all built in gives way to the next one at once, in
 * the same state; the roof's makes the building operational, and the project
 * waits for his next order.
 */
export function buildIn(mountain: Mountain, goods: Partial<Stock>): Mountain {
  const project = mountain.project;
  if (project.kind === "unordered") {
    return mountain;
  }
  const taken: Partial<Record<keyof Stock, number>> = {};
  for (const good of GOOD_IDS) {
    taken[good] = -Math.min(goods[good] ?? 0, project.site.onSite[good]);
  }
  const site = {
    ...project.site,
    onSite: addedStock(project.site.onSite, taken),
  };
  if (!stepDone(site)) {
    return { ...mountain, project: { kind: project.kind, site } };
  }
  const next = siteAfter(site);
  if (next !== undefined) {
    return { ...mountain, project: { kind: project.kind, site: next } };
  }
  return {
    ...mountain,
    project: NO_PROJECT,
    operational: [...mountain.operational, site.building],
  };
}

/**
 * The night shift output the operational buildings light the night to (the
 * highest), or undefined when none has that power.
 */
export function nightShiftShare(
  mountain: Pick<Mountain, "operational">,
): number | undefined {
  let share: number | undefined;
  for (const id of mountain.operational) {
    const lit = buildingById(id).power.nightShift;
    share = share === undefined ? lit : Math.max(share, lit);
  }
  return share;
}
