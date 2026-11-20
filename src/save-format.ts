/**
 * The game map of a save (#558): five kinds of fact, each keyed by id, and
 * the few records that are not a count. The one place the saved shape meets
 * the complete mountain the game plays with. Zero and empty are left out;
 * a missing key reads as its default, so adding a fact needs no new version.
 *
 * Reading answers `ok`, `newer` or `bad`. More than this build knows (an id,
 * a key, a named value, a count past its cap) is `newer`: the build goes
 * read-only rather than write back a save it does not fully understand.
 * Nonsense (a wrong type, a negative, a broken number) is `bad`.
 */
import {
  BUILDING_IDS,
  NO_PROJECT,
  nextBuilding,
  stepDone,
  stepRequires,
  type BuildingId,
  type Project,
  type Site,
  type StepIndex,
} from "./city";
import { SITE_GOOD_CAP, SITE_HOLDS } from "./building-site";
import {
  ENGINEER_NAMES,
  ENGINEER_POSTS,
  MAX_ENGINEERS,
  MAX_ENGINEER_TRIPS,
  onDuty,
  parseEngineers,
  type DutyEngineer,
  type Engineer,
} from "./engineers";
import {
  FIND_IDS,
  MAX_EXPEDITIONS,
  MAX_EXPEDITION_MS,
  TRIP_FIND_IDS,
  TUNNELS,
  parseExpeditions,
  type Expedition,
  type FindId,
  type SavedExpedition,
} from "./expeditions";
import { BARE_MOUNTAIN, type Mountain } from "./mountain";
import { MAX_STOCKYARD_LEVEL } from "./stockyard";
import { TEACH_IDS, type TeachId } from "./teach";
import { TIER_IDS, type TierId } from "./tiers";
import { NO_UPGRADES, UPGRADES, type UpgradeId } from "./upgrades";
import {
  MAX_CRAFTED_LEVEL,
  MAX_CRAFT_MS,
  NOTHING_CRAFTED,
  RECIPE_IDS,
  TIMER_IDS,
  parseBench,
  type Bench,
  type RecipeId,
  type TimerId,
} from "./workshop";
import { GOOD_IDS, priceAmount, type GoodId } from "./stock";
import {
  NO_ASSIGNED_RUNS,
  RUN_ORDER,
  VEHICLE_IDS,
  fleetSize,
  type AssignedRuns,
  type RunId,
  type VehicleId,
} from "./transport";
import {
  JOB_IDS,
  LEVEL_JOBS,
  workersOnJobs,
  type JobId,
  type Jobs,
} from "./workforce";
import { PILE_IDS, type MinePiles, type PileId } from "./mine-piles";
import {
  BLUEPRINT_IDS,
  IDLE_STATION,
  isBlueprintId,
  requiredLoads,
  type BlueprintId,
  type Station,
} from "./factory";
import {
  EMPTY_CYCLE_MICROS,
  EMPTY_MAKER_BUFFERS,
  MAKER_IDS,
  MAKER_INPUT_IDS,
  MAX_CYCLE_MICROS,
  makerJob,
  type CycleMicros,
  type MakerBuffers,
  type MakerId,
  type MakerInputId,
} from "./makers";
import {
  DEEPER_LEVEL_IDS,
  GRANITE_PILE_IDS,
  LEVEL_MACHINE_IDS,
  MINE_LEVEL_IDS,
  NO_MINE_LEVELS,
  type GranitePileId,
  type LevelMachineId,
  type MineLevelId,
  type MineLevels,
  type Pithead,
  type SunkLevel,
} from "./mine-levels";
import {
  carriedBy,
  cageKeys,
  hoistsOwned,
  restoredTrips,
  type Cages,
} from "./cages";

type LevelId = UpgradeId | RecipeId;

const LEVEL_IDS: readonly LevelId[] = [
  ...UPGRADES.map((upgrade) => upgrade.id),
  ...RECIPE_IDS,
];

/** The mark kinds, each a list of ids that have happened. */
const MARK_IDS = {
  seen: TEACH_IDS,
  taught: TEACH_IDS,
  recipes: RECIPE_IDS,
  finds: FIND_IDS,
  operational: BUILDING_IDS,
} as const;
type MarkKind = keyof typeof MARK_IDS;
const MARK_KINDS = Object.keys(MARK_IDS) as readonly MarkKind[];

/** `granite` is the part of the rock dug that was drilled on the Granite (#674). */
type RunKey = "rock" | "granite";

/**
 * Run keys a version 10 save may hold that this build no longer writes:
 * the pass's count of runs and the kid run's stretch (#729), and the depth
 * dug from the old mountain (#740). The reader still checks them against
 * these caps, so a save that held them reads, and ignores their values.
 */
const RETIRED_RUN_CAPS = {
  generation: 1000,
  stretch: 1_000_000,
  dug: 240_000_000,
} as const;
type RetiredRunKey = keyof typeof RETIRED_RUN_CAPS;

const GAME_KEYS = [
  "owned",
  "stock",
  "levels",
  "clocks",
  "marks",
  "run",
  "engineers",
  "expeditions",
  "bench",
  "fleet",
  "project",
  "jobs",
  "piles",
  "makers",
  "stockyard",
  "granite",
  "pithead",
  "makerBuffers",
  "cycleMicros",
  "assignedRuns",
  "station",
  "cages",
] as const;

/**
 * The cages' own keys (#724, ruling 12): the hoists assigned to each level,
 * and what the cages carry from each level. Never where a cage is (call 63).
 */
const CAGE_KEYS = ["assigned", "carried"] as const;

/** The cages as saved, each part by level. Left out while both are empty. */
type SavedCages = {
  readonly assigned?: Readonly<Partial<Record<MineLevelId, number>>>;
  readonly carried?: Readonly<Partial<Record<MineLevelId, number>>>;
};

/** A sunk deeper level's own keys (#673, #766): its machines and its piles. */
const GRANITE_KEYS = ["machines", "piles"] as const;

/** The jobs and maker that stand on the Granite: none while it is unsunk (ruling 2). */
const GRANITE_JOBS: readonly JobId[] = [
  ...Object.values(LEVEL_JOBS.granite),
  makerJob("saw"),
];

/** One sunk deeper level as saved: `{}` with nothing on it. */
type SavedLevel = {
  readonly machines?: Readonly<Partial<Record<LevelMachineId, number>>>;
  readonly piles?: Readonly<Partial<Record<GranitePileId, number>>>;
};

/** A project in hand, as saved: an unordered city saves none (#654). */
type SavedProject = {
  readonly building: BuildingId;
  readonly state: "delivering" | "onHold";
  readonly step: StepIndex;
  readonly arrived: Readonly<Partial<Record<GoodId, number>>>;
  /** What of it is on the building site, not yet built in (#690). */
  readonly onSite?: Readonly<Partial<Record<GoodId, number>>>;
};

const PROJECT_STATES = ["delivering", "onHold"] as const;

/**
 * The factory's work order, as saved (#674): its blueprint, its state, and
 * what has arrived of each good, in loads. An idle station saves none; a
 * done one saves no `arrived`.
 */
type SavedStation = {
  readonly blueprint: BlueprintId;
  readonly state: "delivering" | "done";
  readonly arrived?: Readonly<Partial<Record<GoodId, number>>>;
};

const STATION_STATES = ["delivering", "done"] as const;
const STATION_KEYS = ["blueprint", "state", "arrived"] as const;

/** The game map as saved. Every key is left out when it would be zero or empty. */
export type SaveGame = {
  readonly owned?: Readonly<Partial<Record<TierId, number>>>;
  readonly stock?: Readonly<Partial<Record<GoodId, number>>>;
  readonly levels?: Readonly<Partial<Record<LevelId, number>>>;
  readonly clocks?: Readonly<Partial<Record<TimerId, number>>>;
  readonly marks?: {
    readonly seen?: readonly TeachId[];
    readonly taught?: readonly TeachId[];
    readonly recipes?: readonly RecipeId[];
    readonly finds?: readonly FindId[];
    readonly operational?: readonly BuildingId[];
  };
  readonly run?: Readonly<Partial<Record<RunKey | RetiredRunKey, number>>>;
  /** An engineer away on a trip is saved at post "tunnel". */
  readonly engineers?: readonly DutyEngineer[];
  /** Each trip keeps the post its engineer left, as `home`. */
  readonly expeditions?: readonly SavedExpedition[];
  readonly bench?: Bench;
  readonly fleet?: Readonly<Partial<Record<VehicleId, number>>>;
  readonly project?: SavedProject;
  /** Workers on each job (#689); the free workers are the rest of `owned.helper`. */
  readonly jobs?: Readonly<Partial<Record<JobId, number>>>;
  /** Drilled rock and rock at the shaft (#703); any whole number (ruling 2). */
  readonly piles?: Readonly<Partial<Record<PileId, number>>>;
  /** Makers owned, by kind (slice 1, part 2, #666). */
  readonly makers?: Readonly<Partial<Record<MakerId, number>>>;
  /** The stockyard's level (#666); 0 is left out. */
  readonly stockyard?: number;
  /** The Granite's machines and piles (#673); moves to `mineLevels` at the v11 reset (#769). */
  readonly granite?: SavedLevel;
  /** Pithead rock awaiting physical transport, by level (#766); zeros left out. */
  readonly pithead?: Readonly<Partial<Record<MineLevelId, number>>>;
  /** Separate finite input buffers per maker (#766); zeros left out. */
  readonly makerBuffers?: Readonly<
    Partial<Record<MakerId, Readonly<Partial<Record<MakerInputId, number>>>>>
  >;
  /** Persisted integer micro-cycle progress per maker, 0..999_999 (#766); zeros left out. */
  readonly cycleMicros?: Readonly<Partial<Record<MakerId, number>>>;
  /** Dedicated transport vehicles per run, reserved in v11 for Part 3 (#766); zeros left out. */
  readonly assignedRuns?: Readonly<Partial<Record<RunId, number>>>;
  /** The factory's work order (#674). Left out while the station is idle. */
  readonly station?: SavedStation;
  /**
   * The shaft's cages (#724, ruling 12): the hoists assigned to each level
   * and what the cages carry from each, never where they are. Left out while
   * both are all zero, so a part 2 save writes the same map as before.
   */
  readonly cages?: SavedCages;
};

// ---------------------------------------------------------------------------
// Writing

/** The non-zero entries, in the table's order. */
function positives<K extends string>(
  ids: readonly K[],
  value: (id: K) => number,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const id of ids) {
    const amount = value(id);
    if (amount !== 0) {
      out[id] = amount;
    }
  }
  return out;
}

function only<K extends string, V>(
  key: K,
  value: V,
  keep: boolean,
): Partial<Record<K, V>> {
  return keep ? ({ [key]: value } as Record<K, V>) : {};
}

function some<K extends string, V extends object>(
  key: K,
  value: V,
): Partial<Record<K, V>> {
  const empty = Array.isArray(value)
    ? value.length === 0
    : Object.keys(value).length === 0;
  return only(key, value, !empty);
}

function tierCount(mountain: Mountain, id: TierId): number {
  return mountain.owned[id];
}

function levelOf(mountain: Mountain, id: LevelId): number {
  return id in mountain.upgrades
    ? mountain.upgrades[id as UpgradeId]
    : mountain.crafted[id as RecipeId];
}

/** A trip with the post its engineer will come back to. */
function savedTrip(mountain: Mountain, trip: Expedition): SavedExpedition {
  const hand = mountain.engineers.find((one) => one.name === trip.engineer);
  return {
    engineer: trip.engineer,
    tunnel: trip.tunnel,
    sentAt: trip.sentAt,
    returnsAt: trip.returnsAt,
    home: hand?.post ?? "camp",
    find: trip.find,
  };
}

function savedMarks(mountain: Mountain): NonNullable<SaveGame["marks"]> {
  return {
    ...some("seen", mountain.seen),
    ...some("taught", mountain.taught),
    ...some("recipes", mountain.recipes),
    ...some("finds", mountain.finds),
    ...some("operational", mountain.operational),
  };
}

function savedRun(mountain: Mountain): NonNullable<SaveGame["run"]> {
  return {
    ...only("rock", mountain.rockDug, mountain.rockDug !== 0),
    ...only("granite", mountain.graniteDug, mountain.graniteDug !== 0),
  };
}

function savedStation(station: Station): Partial<SaveGame> {
  switch (station.kind) {
    case "idle":
      return {};
    case "done":
      return { station: { blueprint: station.blueprint, state: "done" } };
    case "delivering":
      return {
        station: {
          blueprint: station.blueprint,
          state: "delivering",
          ...some(
            "arrived",
            positives(GOOD_IDS, (id) => station.arrived[id]),
          ),
        },
      };
  }
}

function savedProject(project: Project): Partial<SaveGame> {
  if (project.kind === "unordered") {
    return {};
  }
  const { site } = project;
  return {
    project: {
      building: site.building,
      state: project.kind,
      step: site.step,
      arrived: positives(GOOD_IDS, (id) => site.arrived[id]),
      ...some(
        "onSite",
        positives(GOOD_IDS, (id) => site.onSite[id]),
      ),
    },
  };
}

function savedLevel(sunk: SunkLevel): SavedLevel {
  return {
    ...some(
      "machines",
      positives(LEVEL_MACHINE_IDS, (id) => sunk.machines[id]),
    ),
    ...some(
      "piles",
      positives(GRANITE_PILE_IDS, (id) => sunk.piles[id]),
    ),
  };
}

function savedGranite(mineLevels: MineLevels): Partial<SaveGame> {
  const sunk = mineLevels.granite;
  return sunk === undefined ? {} : { granite: savedLevel(sunk) };
}

function savedMakerBuffers(buffers: MakerBuffers): Partial<SaveGame> {
  const out: Partial<
    Record<MakerId, Readonly<Partial<Record<MakerInputId, number>>>>
  > = {};
  for (const id of MAKER_IDS) {
    const entries = positives(
      MAKER_INPUT_IDS[id],
      (input) => buffers[id][input] ?? 0,
    );
    if (Object.keys(entries).length > 0) {
      out[id] = entries;
    }
  }
  return some("makerBuffers", out);
}

/** What the cages carry and the hoists assigned, by level; nothing while all zero. */
function savedCages(cages: Cages): Partial<SaveGame> {
  const carried = carriedBy(cages.trips);
  return some("cages", {
    ...some(
      "assigned",
      positives(MINE_LEVEL_IDS, (id) => cages.assigned[id]),
    ),
    ...some(
      "carried",
      positives(MINE_LEVEL_IDS, (id) => carried[id]),
    ),
  });
}

/** The game map this mountain writes. */
export function writeGame(mountain: Mountain): SaveGame {
  return {
    ...some(
      "owned",
      positives(TIER_IDS, (id) => tierCount(mountain, id)),
    ),
    ...some(
      "stock",
      positives(GOOD_IDS, (id) => mountain.stock[id]),
    ),
    ...some(
      "levels",
      positives(LEVEL_IDS, (id) => levelOf(mountain, id)),
    ),
    ...some(
      "clocks",
      positives(TIMER_IDS, (id) => mountain.clocks[id]),
    ),
    ...some("marks", savedMarks(mountain)),
    ...some("run", savedRun(mountain)),
    ...some("engineers", onDuty(mountain)),
    ...some(
      "expeditions",
      mountain.expeditions.map((trip) => savedTrip(mountain, trip)),
    ),
    ...(mountain.bench === undefined ? {} : { bench: mountain.bench }),
    ...some(
      "fleet",
      positives(VEHICLE_IDS, (id) => mountain.fleet[id]),
    ),
    ...savedProject(mountain.project),
    ...some(
      "jobs",
      positives(JOB_IDS, (id) => mountain.jobs[id]),
    ),
    ...some(
      "piles",
      positives(PILE_IDS, (id) => mountain.piles[id]),
    ),
    ...some(
      "makers",
      positives(MAKER_IDS, (id) => mountain.makers[id]),
    ),
    ...(mountain.stockyard === 0 ? {} : { stockyard: mountain.stockyard }),
    ...savedGranite(mountain.mineLevels),
    ...some(
      "pithead",
      positives(MINE_LEVEL_IDS, (id) => mountain.pithead[id]),
    ),
    ...savedMakerBuffers(mountain.makerBuffers),
    ...some(
      "cycleMicros",
      positives(MAKER_IDS, (id) => mountain.cycleMicros[id] ?? 0),
    ),
    ...some(
      "assignedRuns",
      positives(RUN_ORDER, (id) => mountain.assignedRuns[id] ?? 0),
    ),
    ...savedStation(mountain.station),
    ...savedCages(mountain.cages),
  };
}

// ---------------------------------------------------------------------------
// Reading

/** What a part of the save says: its value, or why it cannot be played. */
type Part<T> = T | "newer" | "bad";

export type GameRead =
  | { readonly kind: "ok"; readonly mountain: Mountain }
  | { readonly kind: "newer" }
  | { readonly kind: "bad" };

type Entries = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Entries {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** `bad` wins over `newer`: nonsense is never a newer build's save. */
function worst(parts: readonly unknown[]): "newer" | "bad" | undefined {
  if (parts.includes("bad")) {
    return "bad";
  }
  return parts.includes("newer") ? "newer" : undefined;
}

/** Keys this build does not know make the record `newer`. */
function unknownKeys(record: Entries, known: readonly string[]): boolean {
  return Object.keys(record).some((key) => !known.includes(key));
}

/**
 * A map of whole counts by id. Missing is all zero. A count past `cap` or an
 * id this build does not know is `newer`.
 */
function readCounts<K extends string>(
  value: unknown,
  ids: readonly K[],
  cap: (id: K) => number,
): Part<Record<K, number>> {
  const counts = Object.fromEntries(ids.map((id) => [id, 0])) as Record<
    K,
    number
  >;
  if (value === undefined) {
    return counts;
  }
  if (!isRecord(value)) {
    return "bad";
  }
  let newer = false;
  for (const [key, amount] of Object.entries(value)) {
    if (!isCount(amount)) {
      return "bad";
    }
    if (!(ids as readonly string[]).includes(key) || amount > cap(key as K)) {
      newer = true;
      continue;
    }
    counts[key as K] = amount;
  }
  return newer ? "newer" : counts;
}

const UNCAPPED = (): number => Number.MAX_SAFE_INTEGER;

function levelCap(id: LevelId): number {
  return (
    UPGRADES.find((upgrade) => upgrade.id === id)?.maxLevel ?? MAX_CRAFTED_LEVEL
  );
}

/** A list of ids that have happened. An id it does not know, or twice, is `newer`. */
function readIds<K extends string>(
  value: unknown,
  ids: readonly K[],
): Part<readonly K[]> {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return "bad";
  }
  const read: K[] = [];
  for (const item of value as readonly unknown[]) {
    if (typeof item !== "string") {
      return "bad";
    }
    if (
      !(ids as readonly string[]).includes(item) ||
      read.includes(item as K)
    ) {
      return "newer";
    }
    read.push(item as K);
  }
  return read;
}

type Marks = Pick<
  Mountain,
  "seen" | "taught" | "recipes" | "finds" | "operational"
>;

function readMarks(value: unknown): Part<Marks> {
  if (value === undefined) {
    return { seen: [], taught: [], recipes: [], finds: [], operational: [] };
  }
  if (!isRecord(value)) {
    return "bad";
  }
  const seen = readIds(value["seen"], MARK_IDS.seen);
  const taught = readIds(value["taught"], MARK_IDS.taught);
  const recipes = readIds(value["recipes"], MARK_IDS.recipes);
  const finds = readIds(value["finds"], MARK_IDS.finds);
  const operational = readIds(value["operational"], MARK_IDS.operational);
  const failed = worst([seen, taught, recipes, finds, operational]);
  if (failed === "bad") {
    return "bad";
  }
  if (failed === "newer" || unknownKeys(value, MARK_KINDS)) {
    return "newer";
  }
  return {
    seen: seen as readonly TeachId[],
    taught: taught as readonly TeachId[],
    recipes: recipes as readonly RecipeId[],
    finds: finds as readonly FindId[],
    operational: operational as readonly BuildingId[],
  };
}

type Run = Pick<Mountain, "rockDug" | "graniteDug">;

/** A retired stretch (#729): checked as it always was, then ignored. */
function readRetiredStretch(value: unknown): Part<true> {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return "bad";
  }
  return value > RETIRED_RUN_CAPS.stretch ? "newer" : true;
}

function readRun(value: unknown): Part<Run> {
  if (value === undefined) {
    return { rockDug: 0, graniteDug: 0 };
  }
  if (!isRecord(value)) {
    return "bad";
  }
  const counts = readCounts(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "stretch"),
    ),
    ["generation", "dug", "rock", "granite"] as const,
    (id) =>
      id === "generation" || id === "dug"
        ? RETIRED_RUN_CAPS[id]
        : Number.MAX_SAFE_INTEGER,
  );
  const stretch = readRetiredStretch(value["stretch"]);
  const failed = worst([counts, stretch]);
  if (failed !== undefined) {
    return failed;
  }
  const run = counts as Record<"generation" | "dug" | RunKey, number>;
  // The Granite's drilled rock is a part of all the rock dug (#674).
  if (run.granite > run.rock) {
    return "bad";
  }
  return {
    rockDug: run.rock,
    graniteDug: run.granite,
  };
}

/** Right types for an engineer; whether this build knows the names is the parser's call. */
function engineerTyped(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["name"] === "string" &&
    isCount(value["rank"]) &&
    isCount(value["trips"]) &&
    typeof value["post"] === "string"
  );
}

function tripTyped(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["engineer"] === "string" &&
    typeof value["tunnel"] === "string" &&
    Number.isSafeInteger(value["sentAt"]) &&
    Number.isSafeInteger(value["returnsAt"]) &&
    typeof value["home"] === "string" &&
    findTyped(value["find"])
  );
}

/** A find is its kind, and the id of what was found unless it was quiet. */
function findTyped(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["kind"] === "string" &&
    (value["id"] === undefined || typeof value["id"] === "string")
  );
}

/** A list whose items have the right types, else `bad`; then this build's parser, else `newer`. */
function readList<T>(
  value: unknown,
  typed: (item: unknown) => boolean,
  parse: (value: unknown) => readonly T[] | undefined,
): Part<readonly T[]> {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return "bad";
  }
  if (!(value as readonly unknown[]).every(typed)) {
    return "bad";
  }
  return parse(value) ?? "newer";
}

type Crew = Pick<Mountain, "engineers" | "expeditions">;

/**
 * The crew in memory: an engineer saved in the tunnel stands on the post
 * their trip left, or at camp when no trip holds them (#409).
 */
function crewAtHome(
  saved: readonly DutyEngineer[],
  trips: readonly SavedExpedition[],
): Crew {
  const engineers = saved.map((one): Engineer => {
    if (one.post !== "tunnel") {
      return { ...one, post: one.post };
    }
    const trip = trips.find((each) => each.engineer === one.name);
    return { ...one, post: trip?.home ?? "camp" };
  });
  const expeditions = trips.map((trip): Expedition => ({
    engineer: trip.engineer,
    tunnel: trip.tunnel,
    sentAt: trip.sentAt,
    returnsAt: trip.returnsAt,
    find: trip.find,
  }));
  return { engineers, expeditions };
}

function readCrew(record: Entries): Part<Crew> {
  const engineers = readList(record["engineers"], engineerTyped, (raw) =>
    parseEngineers(raw),
  );
  if (engineers === "bad" || engineers === "newer") {
    return engineers;
  }
  const trips = readList(record["expeditions"], tripTyped, (raw) =>
    parseExpeditions(raw, engineers),
  );
  if (trips === "bad" || trips === "newer") {
    return trips;
  }
  return crewAtHome(engineers, trips);
}

function readBench(value: unknown): Part<Bench | undefined> {
  if (value === undefined) {
    return undefined;
  }
  if (
    !isRecord(value) ||
    typeof value["recipe"] !== "string" ||
    !isCount(value["startedAt"]) ||
    !isCount(value["endsAt"])
  ) {
    return "bad";
  }
  return parseBench(value) ?? "newer";
}

/**
 * Whether the site can stand on its step: only goods it requires, none
 * past its need, no more on the site than arrived or than SITE_GOOD_CAP per
 * good (rule 4.2), and not all of it built in.
 */
function fitsStep(site: Site): boolean {
  const requires = stepRequires(site);
  const need = (good: GoodId): number => priceAmount(requires, good);
  return (
    GOOD_IDS.every(
      (good) =>
        site.arrived[good] <= need(good) &&
        site.onSite[good] <= site.arrived[good] &&
        site.onSite[good] <= SITE_GOOD_CAP,
    ) && !stepDone(site)
  );
}

function projectTyped(value: Entries): boolean {
  return (
    typeof value["building"] === "string" &&
    typeof value["state"] === "string" &&
    (value["step"] === 0 || value["step"] === 1 || value["step"] === 2)
  );
}

/** A building, state or key this build does not know. */
function projectNewer(value: Entries): boolean {
  return (
    !(BUILDING_IDS as readonly string[]).includes(
      value["building"] as string,
    ) ||
    !(PROJECT_STATES as readonly string[]).includes(value["state"] as string) ||
    unknownKeys(value, ["building", "state", "step", "arrived", "onSite"])
  );
}

/**
 * The project in hand. A building, state or good this build does not know
 * is `newer`. A wrong type, a step past the roof, a step already all in, or
 * a building that is not the next one to order is `bad`, and bad wins.
 */
function readProject(value: unknown, marks: Part<Marks>): Part<Project> {
  if (value === undefined) {
    return NO_PROJECT;
  }
  if (!isRecord(value) || !projectTyped(value)) {
    return "bad";
  }
  const arrived = readCounts(value["arrived"] ?? {}, GOOD_IDS, UNCAPPED);
  const onSite = readCounts(value["onSite"] ?? {}, GOOD_IDS, UNCAPPED);
  if (arrived === "bad" || onSite === "bad") {
    return "bad";
  }
  if (arrived === "newer" || onSite === "newer" || projectNewer(value)) {
    return "newer";
  }
  if (typeof marks === "string") {
    return marks;
  }
  const site: Site = {
    building: value["building"] as BuildingId,
    step: value["step"] as StepIndex,
    arrived,
    onSite,
  };
  if (nextBuilding(marks)?.id !== site.building || !fitsStep(site)) {
    return "bad";
  }
  return { kind: value["state"] as SavedProject["state"], site };
}

function stationTyped(value: Entries): boolean {
  return (
    typeof value["blueprint"] === "string" && typeof value["state"] === "string"
  );
}

/** A blueprint, state or key this build does not know. */
function stationNewer(value: Entries): boolean {
  return (
    !isBlueprintId(value["blueprint"]) ||
    !(STATION_STATES as readonly string[]).includes(value["state"] as string) ||
    unknownKeys(value, STATION_KEYS)
  );
}

/** Whether the work order's goods fit it: none past what it requires, and a delivering one not all in. */
function stationFits(station: Station): boolean {
  if (station.kind !== "delivering") {
    return true;
  }
  const required = requiredLoads(station.blueprint);
  return (
    GOOD_IDS.every((good) => station.arrived[good] <= required[good]) &&
    GOOD_IDS.some((good) => station.arrived[good] < required[good])
  );
}

/**
 * The factory's work order (#674). A blueprint, state or good this build
 * does not know is `newer`. A wrong type, more arrived than it requires, a
 * delivering one already all in, a done one with goods, or a work order
 * while the shaft is not sunk is `bad`.
 */
function readStation(
  value: unknown,
  mineLevels: Part<MineLevels>,
): Part<Station> {
  if (value === undefined) {
    return IDLE_STATION;
  }
  if (!isRecord(value) || !stationTyped(value)) {
    return "bad";
  }
  const arrived = readCounts(value["arrived"] ?? {}, GOOD_IDS, UNCAPPED);
  if (arrived === "bad") {
    return "bad";
  }
  if (arrived === "newer" || stationNewer(value)) {
    return "newer";
  }
  if (typeof mineLevels === "string") {
    return mineLevels;
  }
  const blueprint = value["blueprint"] as BlueprintId;
  const station: Station =
    value["state"] === "done"
      ? { kind: "done", blueprint }
      : { kind: "delivering", blueprint, arrived };
  const stray = value["state"] === "done" && value["arrived"] !== undefined;
  return mineLevels.granite === undefined || stray || !stationFits(station)
    ? "bad"
    : station;
}

/** The stockyard's level: a whole number, 0 when left out, newer past the last (#666). */
function readLevel(value: unknown): Part<number> {
  if (value === undefined) {
    return 0;
  }
  if (!isCount(value)) {
    return "bad";
  }
  return value > MAX_STOCKYARD_LEVEL ? "newer" : value;
}

/** Workers on each job: never more in all than the workers he owns (#689). */
function readJobs(value: unknown, facts: Part<Facts>): Part<Jobs> {
  const jobs = readCounts(value, JOB_IDS, UNCAPPED);
  if (typeof jobs === "string" || typeof facts === "string") {
    return jobs;
  }
  return workersOnJobs({ jobs }) > facts.owned.helper ? "bad" : jobs;
}

type Makers = Record<MakerId, number>;

/** One sunk deeper level's maps: machines and piles (uncapped: over room is full). */
function readSunkLevel(value: unknown): Part<SunkLevel> {
  if (!isRecord(value)) {
    return "bad";
  }
  const machines = readCounts(value["machines"], LEVEL_MACHINE_IDS, UNCAPPED);
  const piles = readCounts(value["piles"], GRANITE_PILE_IDS, UNCAPPED);
  const failed = worst([machines, piles]);
  if (failed === "bad") {
    return "bad";
  }
  if (failed === "newer" || unknownKeys(value, GRANITE_KEYS)) {
    return "newer";
  }
  return {
    machines: machines as Record<LevelMachineId, number>,
    piles: piles as Record<GranitePileId, number>,
  };
}

/**
 * Whether sunk deeper levels fit the rest of the save: total machines across
 * deeper levels never exceed owned (Topsoil holds the rest), and while Granite
 * is unsunk nobody works Granite jobs or owns a saw.
 */
function mineLevelsFit(
  mineLevels: MineLevels,
  owned: Facts["owned"],
  jobs: Jobs,
  makers: Makers,
): boolean {
  if (mineLevels.granite === undefined) {
    if (GRANITE_JOBS.some((job) => jobs[job] !== 0) || makers.saw !== 0) {
      return false;
    }
  }
  return LEVEL_MACHINE_IDS.every((id) => {
    let sum = 0;
    for (const level of DEEPER_LEVEL_IDS) {
      sum += mineLevels[level]?.machines[id] ?? 0;
    }
    return sum <= owned[id];
  });
}

/** Sunk Granite read into `mineLevels.granite` (#673, generalized in #766). */
function readMineLevels(
  graniteValue: unknown,
  facts: Part<Facts>,
  jobs: Part<Jobs>,
  makers: Part<Makers>,
): Part<MineLevels> {
  const levels: Part<MineLevels> =
    graniteValue === undefined
      ? NO_MINE_LEVELS
      : (() => {
          const granite = readSunkLevel(graniteValue);
          return typeof granite === "string" ? granite : { granite };
        })();
  if (
    typeof levels === "string" ||
    typeof facts === "string" ||
    typeof jobs === "string" ||
    typeof makers === "string"
  ) {
    return levels;
  }
  return mineLevelsFit(levels, facts.owned, jobs, makers) ? levels : "bad";
}

/** Rock drilled on the Granite only once the shaft is sunk (#674). */
function graniteDugFits(
  run: Part<Run>,
  mineLevels: Part<MineLevels>,
): Part<true> {
  if (typeof run === "string" || typeof mineLevels === "string") {
    return true;
  }
  return run.graniteDug > 0 && mineLevels.granite === undefined ? "bad" : true;
}

/** Pithead rock buffers (#766): uncapped whole counts, none on an unsunk level. */
function readPithead(
  value: unknown,
  mineLevels: Part<MineLevels>,
): Part<Pithead> {
  const pithead = readCounts(value, MINE_LEVEL_IDS, UNCAPPED);
  if (typeof pithead === "string" || typeof mineLevels === "string") {
    return pithead;
  }
  return pithead.granite > 0 && mineLevels.granite === undefined
    ? "bad"
    : pithead;
}

/** One maker's saved input buffer map, with zero entries omitted. */
function readMakerBufferEntry(
  id: MakerId,
  value: unknown,
): Part<Readonly<Partial<Record<MakerInputId, number>>>> {
  const counts = readCounts(value, MAKER_INPUT_IDS[id], UNCAPPED);
  if (typeof counts === "string") {
    return counts;
  }
  return positives(MAKER_INPUT_IDS[id], (input) => counts[input]);
}

/** Maker input buffers (#766): uncapped whole counts per maker input, none on unsunk levels. */
function readMakerBuffers(
  value: unknown,
  mineLevels: Part<MineLevels>,
): Part<MakerBuffers> {
  if (value === undefined) {
    return EMPTY_MAKER_BUFFERS;
  }
  if (!isRecord(value)) {
    return "bad";
  }
  const kiln = readMakerBufferEntry("kiln", value["kiln"]);
  const saw = readMakerBufferEntry("saw", value["saw"]);
  const failed = worst([kiln, saw]);
  if (failed === "bad") {
    return "bad";
  }
  if (failed === "newer" || unknownKeys(value, MAKER_IDS)) {
    return "newer";
  }
  if (typeof mineLevels === "string") {
    return mineLevels;
  }
  const sawMap = saw as Readonly<Partial<Record<MakerInputId, number>>>;
  if (Object.keys(sawMap).length > 0 && mineLevels.granite === undefined) {
    return "bad";
  }
  return {
    kiln: kiln as Readonly<Partial<Record<MakerInputId, number>>>,
    saw: sawMap,
  };
}

/** Persisted integer micro-cycles per maker, 0..999_999 (#766). */
function readCycleMicros(
  value: unknown,
  mineLevels: Part<MineLevels>,
): Part<CycleMicros> {
  if (value === undefined) {
    return EMPTY_CYCLE_MICROS;
  }
  if (!isRecord(value)) {
    return "bad";
  }
  const out: Partial<Record<MakerId, number>> = {};
  let newer = false;
  for (const [key, amount] of Object.entries(value)) {
    if (!isCount(amount) || amount > MAX_CYCLE_MICROS) {
      return "bad";
    }
    if (!(MAKER_IDS as readonly string[]).includes(key)) {
      newer = true;
      continue;
    }
    if (amount > 0) {
      out[key as MakerId] = amount;
    }
  }
  if (newer) {
    return "newer";
  }
  if (typeof mineLevels === "string") {
    return mineLevels;
  }
  return (out.saw ?? 0) > 0 && mineLevels.granite === undefined ? "bad" : out;
}

/** Reserved Part 3 vehicle run assignments (#766): validated `sum <= fleetSize`. */
function readAssignedRuns(
  value: unknown,
  fleet: Part<Record<VehicleId, number>>,
): Part<AssignedRuns> {
  if (value === undefined) {
    return NO_ASSIGNED_RUNS;
  }
  const counts = readCounts(value, RUN_ORDER, UNCAPPED);
  if (typeof counts === "string" || typeof fleet === "string") {
    return counts;
  }
  const total = RUN_ORDER.reduce((sum, id) => sum + counts[id], 0);
  if (total > fleetSize({ fleet })) {
    return "bad";
  }
  return positives(RUN_ORDER, (id) => counts[id]);
}

type LevelCounts = Record<MineLevelId, number>;
type CageMaps = {
  readonly assigned: LevelCounts;
  readonly carried: LevelCounts;
};

/**
 * The cages' own maps. Missing is none. Counts are whole and uncapped; a
 * key or level this build does not know is `newer`.
 */
function readCageMaps(value: unknown): Part<CageMaps> {
  // Left out, the cages are all zero: each map reads as `readCounts`' zeros.
  const maps = value === undefined ? {} : value;
  if (!isRecord(maps)) {
    return "bad";
  }
  const assigned = readCounts(maps["assigned"], MINE_LEVEL_IDS, UNCAPPED);
  const carried = readCounts(maps["carried"], MINE_LEVEL_IDS, UNCAPPED);
  const failed = worst([assigned, carried]);
  if (failed === "bad") {
    return "bad";
  }
  if (failed === "newer" || unknownKeys(maps, CAGE_KEYS)) {
    return "newer";
  }
  return { assigned: assigned as LevelCounts, carried: carried as LevelCounts };
}

/**
 * Whether the cages fit the rest of the save (ruling 12): no more hoists
 * assigned than he owns, the engines among them; none assigned and no rock
 * carried from the Granite while the shaft is unsunk; and no more levels
 * with rock carried than the shaft has cages, so the winch's cage alone
 * never holds rock from both.
 */
function cagesFit(
  maps: CageMaps,
  owned: Facts["owned"],
  mineLevels: MineLevels,
): boolean {
  const { assigned, carried } = maps;
  if (assigned.topsoil + assigned.granite > hoistsOwned(owned)) {
    return false;
  }
  const unsunk = mineLevels.granite === undefined;
  if (
    unsunk &&
    (assigned.topsoil + assigned.granite > 0 || carried.granite > 0)
  ) {
    return false;
  }
  const levelsCarried = MINE_LEVEL_IDS.filter((id) => carried[id] > 0).length;
  return levelsCarried <= cageKeys(owned).length;
}

/**
 * The cages (#724), refused when they do not fit the rest of the save. Each
 * level's carried rock comes back in a cage at the top (ruling 12).
 */
function readCages(
  value: unknown,
  facts: Part<Facts>,
  mineLevels: Part<MineLevels>,
): Part<Cages> {
  const maps = readCageMaps(value);
  if (typeof maps === "string") {
    return maps;
  }
  // A part the cages lean on that cannot be read stops the cages here, as
  // `cagesFit` cannot run on it; its failure is reported once, by its own part.
  if (typeof facts === "string") {
    return facts;
  }
  if (typeof mineLevels === "string") {
    return mineLevels;
  }
  if (!cagesFit(maps, facts.owned, mineLevels)) {
    return "bad";
  }
  return {
    assigned: maps.assigned,
    trips: restoredTrips(maps.carried, cageKeys(facts.owned)),
  };
}

type Facts = Pick<
  Mountain,
  "owned" | "stock" | "upgrades" | "crafted" | "clocks"
>;

/** The four count maps, laid onto the mountain's own fields. */
function readFacts(record: Entries): Part<Facts> {
  const owned = readCounts(record["owned"], TIER_IDS, UNCAPPED);
  const stock = readCounts(record["stock"], GOOD_IDS, UNCAPPED);
  const levels = readCounts(record["levels"], LEVEL_IDS, levelCap);
  const clocks = readCounts(record["clocks"], TIMER_IDS, UNCAPPED);
  const failed = worst([owned, stock, levels, clocks]);
  if (failed !== undefined) {
    return failed;
  }
  return {
    owned: owned as Record<TierId, number>,
    stock: stock as Record<GoodId, number>,
    ...levelCounts(levels as Record<LevelId, number>),
    clocks: clocks as Record<TimerId, number>,
  };
}

function levelCounts(
  levels: Record<LevelId, number>,
): Pick<Mountain, "upgrades" | "crafted"> {
  const upgrades: Record<UpgradeId, number> = { ...NO_UPGRADES };
  for (const upgrade of UPGRADES) {
    upgrades[upgrade.id] = levels[upgrade.id];
  }
  const crafted: Record<RecipeId, number> = { ...NOTHING_CRAFTED };
  for (const id of RECIPE_IDS) {
    crafted[id] = levels[id];
  }
  return { upgrades, crafted };
}

/** The game map as a complete mountain, on the run that began at `startedAt`. */
export function readGame(value: unknown, startedAt: number): GameRead {
  if (!isRecord(value)) {
    return { kind: "bad" };
  }
  const facts = readFacts(value);
  const marks = readMarks(value["marks"]);
  const run = readRun(value["run"]);
  const crew = readCrew(value);
  const bench = readBench(value["bench"]);
  const fleet = readCounts(value["fleet"], VEHICLE_IDS, UNCAPPED);
  const project = readProject(value["project"], marks);
  const jobs = readJobs(value["jobs"], facts);
  // A pile over the room this build allows is full (ruling 2): no cap.
  const piles = readCounts(value["piles"], PILE_IDS, UNCAPPED);
  const makers = readCounts(value["makers"], MAKER_IDS, UNCAPPED);
  const stockyard = readLevel(value["stockyard"]);
  const mineLevels = readMineLevels(value["granite"], facts, jobs, makers);
  const pithead = readPithead(value["pithead"], mineLevels);
  const makerBuffers = readMakerBuffers(value["makerBuffers"], mineLevels);
  const cycleMicros = readCycleMicros(value["cycleMicros"], mineLevels);
  const assignedRuns = readAssignedRuns(value["assignedRuns"], fleet);
  const station = readStation(value["station"], mineLevels);
  const cages = readCages(value["cages"], facts, mineLevels);
  const failed = worst([
    facts,
    marks,
    run,
    crew,
    bench,
    fleet,
    project,
    jobs,
    piles,
    makers,
    stockyard,
    mineLevels,
    pithead,
    makerBuffers,
    cycleMicros,
    assignedRuns,
    station,
    cages,
    graniteDugFits(run, mineLevels),
  ]);
  if (failed !== undefined) {
    return { kind: failed };
  }
  if (unknownKeys(value, GAME_KEYS)) {
    return { kind: "newer" };
  }
  return {
    kind: "ok",
    mountain: {
      ...BARE_MOUNTAIN,
      ...(facts as Facts),
      ...(marks as Marks),
      ...(run as Run),
      ...(crew as Crew),
      bench: bench as Bench | undefined,
      fleet: fleet as Record<VehicleId, number>,
      project: project as Project,
      jobs: jobs as Jobs,
      piles: piles as MinePiles,
      makers: makers as Makers,
      stockyard: stockyard as number,
      mineLevels: mineLevels as MineLevels,
      pithead: pithead as Pithead,
      makerBuffers: makerBuffers as MakerBuffers,
      cycleMicros: cycleMicros as CycleMicros,
      assignedRuns: assignedRuns as AssignedRuns,
      station: station as Station,
      cages: cages as Cages,
      startedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// What has shipped

/** Every id, named value and cap this build reads, for the ledger of what has shipped. */
export type ShippedFacts = {
  readonly gameKeys: readonly string[];
  readonly owned: readonly string[];
  readonly stock: readonly string[];
  readonly levels: Readonly<Record<string, number>>;
  readonly clocks: readonly string[];
  readonly marks: Readonly<Record<string, readonly string[]>>;
  readonly run: Readonly<Record<string, number>>;
  /** Run keys still read at these caps and never written (#729). */
  readonly retiredRun: Readonly<Record<string, number>>;
  readonly engineerNames: readonly string[];
  readonly posts: readonly string[];
  readonly tunnels: readonly string[];
  readonly tripFinds: Readonly<Record<string, readonly string[]>>;
  readonly fleet: readonly string[];
  readonly projectStates: readonly string[];
  readonly jobs: readonly string[];
  readonly piles: readonly string[];
  readonly makers: readonly string[];
  readonly caps: Readonly<Record<string, number>>;
  readonly granite: Readonly<Record<"machines" | "piles", readonly string[]>>;
  readonly pithead: readonly string[];
  readonly makerBuffers: Readonly<Record<MakerId, readonly string[]>>;
  readonly cycleMicros: readonly string[];
  readonly assignedRuns: readonly string[];
  readonly station: Readonly<
    Record<"blueprints" | "states", readonly string[]>
  >;
  readonly cages: Readonly<
    Record<(typeof CAGE_KEYS)[number], readonly string[]>
  >;
};

export function shippedFacts(): ShippedFacts {
  return {
    gameKeys: GAME_KEYS,
    owned: TIER_IDS,
    stock: GOOD_IDS,
    levels: Object.fromEntries(LEVEL_IDS.map((id) => [id, levelCap(id)])),
    clocks: TIMER_IDS,
    marks: MARK_IDS,
    run: {
      rock: Number.MAX_SAFE_INTEGER,
      granite: Number.MAX_SAFE_INTEGER,
    },
    retiredRun: RETIRED_RUN_CAPS,
    engineerNames: ENGINEER_NAMES,
    posts: [...ENGINEER_POSTS, "tunnel"],
    tunnels: TUNNELS.map((tunnel) => tunnel.id),
    tripFinds: TRIP_FIND_IDS,
    fleet: VEHICLE_IDS,
    projectStates: PROJECT_STATES,
    jobs: JOB_IDS,
    piles: PILE_IDS,
    makers: MAKER_IDS,
    caps: {
      engineers: MAX_ENGINEERS,
      engineerTrips: MAX_ENGINEER_TRIPS,
      expeditions: MAX_EXPEDITIONS,
      expeditionMs: MAX_EXPEDITION_MS,
      craftMs: MAX_CRAFT_MS,
      siteHolds: SITE_HOLDS,
      siteGoodCap: SITE_GOOD_CAP,
      cycleMicros: MAX_CYCLE_MICROS,
      stockyard: MAX_STOCKYARD_LEVEL,
    },
    granite: { machines: LEVEL_MACHINE_IDS, piles: GRANITE_PILE_IDS },
    pithead: MINE_LEVEL_IDS,
    makerBuffers: MAKER_INPUT_IDS,
    cycleMicros: MAKER_IDS,
    assignedRuns: RUN_ORDER,
    station: { blueprints: BLUEPRINT_IDS, states: STATION_STATES },
    cages: { assigned: MINE_LEVEL_IDS, carried: MINE_LEVEL_IDS },
  };
}
