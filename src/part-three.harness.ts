import type { CageTrips, HoistsAssigned } from "./cages";
import type { Project } from "./city";
import { withFactors } from "./economy/factors";
import {
  EMPTY_PITHEAD,
  NO_GRANITE_PILES,
  NO_LEVEL_MACHINES,
  NO_MINE_LEVELS,
  shaftPrice,
  sinkShaft,
  type GranitePiles,
  type LevelMachines,
  type Pithead,
  type SunkLevel,
} from "./mine-levels";
import type { MinePiles } from "./mine-piles";
import { createMountain, type Mountain } from "./mountain";
import type { Jobs } from "./workforce";
import {
  PART_THREE_OFF,
  PART_TWO_OFF,
  PLAY_FACTORS,
  SLICE_2_PART_2_OFF,
} from "./part-switch";
import { EMPTY_STOCK, type GoodId, type Stock } from "./stock";

/**
 * Part 3's test mine (slice 1, #673, #724): a fresh mine with the Light
 * Tower up and the shaft sunk, shared by the tests that play the Granite, so
 * no test writes a sunk Granite by hand.
 */

/** Slice 1 with parts 2 and 3 on (before Slice 2 Part 1 physical transport). */
const PART_THREE_FACTORS: Readonly<Record<string, 0>> = {
  [PART_TWO_OFF]: 0,
  [PART_THREE_OFF]: 0,
};

/** Slice 1 with parts 2 and 3 on, and any other knobs set too. */
export const partThree = <T>(
  body: () => T,
  knobs: Readonly<Record<string, number>> = {},
): T => withFactors({ ...PART_THREE_FACTORS, ...knobs }, body);

/** Slice 2 Part 1 only (before Part 2, #769), plus any knobs. */
export const slice2Part1 = <T>(
  body: () => T,
  knobs: Readonly<Record<string, number>> = {},
): T =>
  withFactors({ ...PLAY_FACTORS, [SLICE_2_PART_2_OFF]: 1, ...knobs }, body);

/** Slice 2 Part 2 on (the live game since #780), plus any knobs. */
export const slice2Part2 = <T>(
  body: () => T,
  knobs: Readonly<Record<string, number>> = {},
): T => withFactors({ ...PLAY_FACTORS, ...knobs }, body);

/**
 * The knobs that put part 3's stages back as #724 built the cages on (#675
 * set them apart: rule 2.14): a hoist rated 60, so its load to the Topsoil
 * is 600; the tools of haulage and hoisting as drilling's; a drill on one
 * worker. The cages' and piles' tests do their sums on these numbers, and
 * `workforce.test.ts` tests part 3's own.
 */
export const AS_BUILT: Readonly<Record<string, number>> = {
  "output.hoist": 1 / 8,
  "tool.haul": 1 / 2,
  "tool.lift": 1 / 3,
  "staff.drill": 1 / 3,
};

/** Part 3 on, with its stages as #724 built the cages on (`AS_BUILT`). */
export const partThreeAsBuilt = <T>(
  body: () => T,
  knobs: Readonly<Record<string, number>> = {},
): T => partThree(body, { ...AS_BUILT, ...knobs });

export const partTwo = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0 }, body);

export type Setup = {
  /** Workers on the Topsoil's drilling and haulage: 3 a second each with tools, more as the workforce passes the workers' marks (6 at 25 workers, 12 at 50). */
  readonly topsoil?: number;
  /** Workers on the Granite's drilling and haulage. */
  readonly granite?: number;
  /** Workers on hoisting: one runs each hoist, the rest the winch. */
  readonly hoisting?: number;
  /** Hoists he owns (#724). */
  readonly hoists?: number;
  /** The hoists assigned to each level (#724). */
  readonly assigned?: Partial<HoistsAssigned>;
  /** The cages that are not fresh, by key (#724). */
  readonly trips?: CageTrips;
  readonly kilns?: number;
  readonly onKilns?: number;
  readonly saws?: number;
  readonly onSaws?: number;
  readonly piles?: Partial<MinePiles>;
  readonly granitePiles?: Partial<GranitePiles>;
  readonly pithead?: Partial<Pithead>;
  readonly machines?: Partial<LevelMachines>;
  readonly sunk?: boolean;
  readonly stock?: Partial<Stock>;
  readonly project?: Project;
  readonly driving?: number;
  readonly building?: number;
  /** The buildings up: the Light Tower by default, so the stockyard is open. */
  readonly operational?: Mountain["operational"];
  /** Fleet vehicles owned (in addition to given vehicles if omitted, or exact override when provided). */
  readonly fleet?: Partial<Mountain["fleet"]>;
  /** Jobs staffed on their own, over the counts above (each level's drilling apart from its haulage). */
  readonly jobs?: Partial<Jobs>;
};

/** The Granite as `sinkShaft` sinks it, with these machines and piles. */
function sunkGranite(machines: LevelMachines, piles: GranitePiles): SunkLevel {
  const sunk = partThree(() => {
    const start = createMountain();
    const stock: Record<GoodId, number> = { ...EMPTY_STOCK };
    for (const { good, amount } of shaftPrice()) {
      stock[good] = amount;
    }
    return sinkShaft({ ...start, stock, operational: ["lightTower"] });
  }).mineLevels.granite;
  if (sunk === undefined) {
    throw new Error("the harness could not sink the shaft");
  }
  return { ...sunk, machines, piles };
}

/** A fresh mine with the Light Tower up and the shaft sunk (by default), and these workers, makers, hoists, cages and piles. */
export function levels({
  topsoil = 0,
  granite = 0,
  hoisting = 0,
  hoists = 0,
  assigned = {},
  trips = {},
  kilns = 0,
  onKilns = kilns,
  saws = 0,
  onSaws = saws,
  piles = {},
  granitePiles = {},
  pithead = {},
  machines = {},
  sunk = true,
  stock = {},
  project = { kind: "unordered" },
  driving = 0,
  building = 0,
  operational = ["lightTower"],
  fleet = {},
  jobs = {},
}: Setup): Mountain {
  const start = createMountain();
  const own = { ...NO_LEVEL_MACHINES, ...machines };
  const staffed: Jobs = {
    drilling: topsoil,
    haulage: topsoil,
    hoisting,
    driving,
    building,
    kilns: onKilns,
    graniteDrilling: granite,
    graniteHaulage: granite,
    saws: onSaws,
    crystalDrilling: 0,
    crystalHaulage: 0,
    glassworks: 0,
    partsPress: 0,
    precisionAssembly: 0,
    ...jobs,
  };
  return {
    ...start,
    owned: {
      ...start.owned,
      // Every worker has a job.
      helper: Object.values(staffed).reduce((sum, count) => sum + count, 0),
      cart: start.owned.cart + own.cart,
      drill: start.owned.drill + own.drill,
      hoist: start.owned.hoist + hoists,
    },
    fleet: { ...start.fleet, ...fleet },
    jobs: staffed,
    stock: { ...EMPTY_STOCK, ...stock },
    makers: { ...start.makers, kiln: kilns, saw: saws },
    piles: { face: 0, shaft: 0, kiln: 0, ...piles },
    pithead: { ...EMPTY_PITHEAD, ...pithead },
    mineLevels: sunk
      ? { granite: sunkGranite(own, { ...NO_GRANITE_PILES, ...granitePiles }) }
      : NO_MINE_LEVELS,
    cages: {
      ...start.cages,
      assigned: { ...start.cages.assigned, ...assigned },
      trips,
    },
    operational,
    project,
  };
}
