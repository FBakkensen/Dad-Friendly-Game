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
import { BOOSTS, NO_BOOSTS, type BoostId, type Boosts } from "./boosts";
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
import { SITE_HOLDS, onSiteTotal } from "./building-site";
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
import {
  BARE_MOUNTAIN,
  MAX_LEGACY,
  MOUNTAIN_STONES,
  type Mountain,
} from "./mountain";
import { MAX_STRETCH } from "./scale";
import { MAX_STOCKYARD_LEVEL } from "./stockyard";
import { TEACH_IDS, type TeachId } from "./teach";
import { TIER_IDS, type TierId } from "./tiers";
import { NO_UPGRADES, UPGRADES, type UpgradeId } from "./upgrades";
import {
  COLD_CLOCKS,
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
import { VEHICLE_IDS, type VehicleId } from "./transport";
import { JOB_IDS, workersOnJobs, type JobId, type Jobs } from "./workforce";
import { PILE_IDS, type MinePiles, type PileId } from "./mine-piles";
import { MAKER_IDS, type MakerId } from "./makers";

/** The Gold rush's end time, in the clocks map. */
const GOLD_RUSH = "gold-rush";

type LevelId = UpgradeId | RecipeId;
type ClockId = BoostId | TimerId | typeof GOLD_RUSH;

const LEVEL_IDS: readonly LevelId[] = [
  ...UPGRADES.map((upgrade) => upgrade.id),
  ...RECIPE_IDS,
];
const CLOCK_IDS: readonly ClockId[] = [
  ...BOOSTS.map((boost) => boost.id),
  ...TIMER_IDS,
  GOLD_RUSH,
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

type RunKey = "generation" | "stretch" | "dug" | "rushBank" | "rock";

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
] as const;

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

/** The game map as saved. Every key is left out when it would be zero or empty. */
export type SaveGame = {
  readonly owned?: Readonly<Partial<Record<TierId, number>>>;
  readonly stock?: Readonly<Partial<Record<GoodId, number>>>;
  readonly levels?: Readonly<Partial<Record<LevelId, number>>>;
  readonly clocks?: Readonly<Partial<Record<ClockId, number>>>;
  readonly marks?: {
    readonly seen?: readonly TeachId[];
    readonly taught?: readonly TeachId[];
    readonly recipes?: readonly RecipeId[];
    readonly finds?: readonly FindId[];
    readonly operational?: readonly BuildingId[];
  };
  readonly run?: Readonly<Partial<Record<RunKey, number>>>;
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

function clockOf(mountain: Mountain, id: ClockId): number {
  if (id === GOLD_RUSH) {
    return mountain.rushUntil;
  }
  return id in mountain.boosts
    ? mountain.boosts[id as BoostId]
    : mountain.clocks[id as TimerId];
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
  // A stretched run digs in fractions of a depth stone. The save keeps whole
  // numbers, so the stones left round up: at most one stone of depth comes back.
  const dug = MOUNTAIN_STONES - Math.ceil(mountain.remaining);
  return {
    ...only("generation", mountain.legacy, mountain.legacy !== 0),
    ...only("stretch", mountain.stretch, mountain.stretch !== 1),
    ...only("dug", dug, dug !== 0),
    ...only("rushBank", mountain.rushBank, mountain.rushBank !== 0),
    ...only("rock", mountain.rockDug, mountain.rockDug !== 0),
  };
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
      positives(CLOCK_IDS, (id) => clockOf(mountain, id)),
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

type Run = Pick<
  Mountain,
  "legacy" | "stretch" | "remaining" | "rushBank" | "rockDug"
>;

function readStretch(value: unknown): Part<number> {
  if (value === undefined) {
    return 1;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return "bad";
  }
  return value > MAX_STRETCH ? "newer" : value;
}

function readRun(value: unknown): Part<Run> {
  if (value === undefined) {
    return {
      legacy: 0,
      stretch: 1,
      remaining: MOUNTAIN_STONES,
      rushBank: 0,
      rockDug: 0,
    };
  }
  if (!isRecord(value)) {
    return "bad";
  }
  const counts = readCounts(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "stretch"),
    ),
    ["generation", "dug", "rushBank", "rock"] as const,
    (id) =>
      id === "generation"
        ? MAX_LEGACY
        : id === "dug"
          ? MOUNTAIN_STONES
          : Number.MAX_SAFE_INTEGER,
  );
  const stretch = readStretch(value["stretch"]);
  const failed = worst([counts, stretch]);
  if (failed !== undefined) {
    return failed;
  }
  const run = counts as Record<
    "generation" | "dug" | "rushBank" | "rock",
    number
  >;
  return {
    legacy: run.generation,
    stretch: stretch as number,
    remaining: MOUNTAIN_STONES - run.dug,
    rushBank: run.rushBank,
    rockDug: run.rock,
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
 * past its need, no more on the site than arrived or than it holds, and not
 * all of it built in (a complete step has already given way to the next).
 */
function fitsStep(site: Site): boolean {
  const requires = stepRequires(site);
  const need = (good: GoodId): number => priceAmount(requires, good);
  return (
    GOOD_IDS.every(
      (good) =>
        site.arrived[good] <= need(good) &&
        site.onSite[good] <= site.arrived[good],
    ) &&
    onSiteTotal(site) <= SITE_HOLDS &&
    !stepDone(site)
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

type Facts = Pick<
  Mountain,
  "owned" | "stock" | "upgrades" | "crafted" | "boosts" | "clocks" | "rushUntil"
>;

/** The four count maps, laid onto the mountain's own fields. */
function readFacts(record: Entries): Part<Facts> {
  const owned = readCounts(record["owned"], TIER_IDS, UNCAPPED);
  const stock = readCounts(record["stock"], GOOD_IDS, UNCAPPED);
  const levels = readCounts(record["levels"], LEVEL_IDS, levelCap);
  const clocks = readCounts(record["clocks"], CLOCK_IDS, UNCAPPED);
  const failed = worst([owned, stock, levels, clocks]);
  if (failed !== undefined) {
    return failed;
  }
  return {
    owned: owned as Record<TierId, number>,
    stock: stock as Record<GoodId, number>,
    ...levelCounts(levels as Record<LevelId, number>),
    ...clockCounts(clocks as Record<ClockId, number>),
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

function clockCounts(
  clocks: Record<ClockId, number>,
): Pick<Mountain, "boosts" | "clocks" | "rushUntil"> {
  const boosts: Record<BoostId, number> = { ...NO_BOOSTS };
  for (const boost of BOOSTS) {
    boosts[boost.id] = clocks[boost.id];
  }
  const timers: Record<TimerId, number> = { ...COLD_CLOCKS };
  for (const id of TIMER_IDS) {
    timers[id] = clocks[id];
  }
  return {
    boosts: boosts satisfies Boosts,
    clocks: timers,
    rushUntil: clocks[GOLD_RUSH],
  };
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
      makers: makers as Record<MakerId, number>,
      stockyard: stockyard as number,
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
};

export function shippedFacts(): ShippedFacts {
  return {
    gameKeys: GAME_KEYS,
    owned: TIER_IDS,
    stock: GOOD_IDS,
    levels: Object.fromEntries(LEVEL_IDS.map((id) => [id, levelCap(id)])),
    clocks: CLOCK_IDS,
    marks: MARK_IDS,
    run: {
      generation: MAX_LEGACY,
      stretch: MAX_STRETCH,
      dug: MOUNTAIN_STONES,
      rushBank: Number.MAX_SAFE_INTEGER,
      rock: Number.MAX_SAFE_INTEGER,
    },
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
      stockyard: MAX_STOCKYARD_LEVEL,
    },
  };
}
