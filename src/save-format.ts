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
  TUNNELS,
  parseExpeditions,
  type Expedition,
  type FindId,
  type SavedExpedition,
} from "./expeditions";
import { EMPTY_MATERIALS, LAYERS, type MaterialId } from "./layers";
import {
  BARE_MOUNTAIN,
  MAX_LEGACY,
  MOUNTAIN_STONES,
  type Mountain,
} from "./mountain";
import { MAX_STRETCH } from "./scale";
import { TEACH_IDS, type TeachId } from "./teach";
import { TIERS, type TierId } from "./tiers";
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

/** The good the pocket holds, beside the four materials. */
const STONES = "stones";
/** The Gold rush's end time, in the clocks map. */
const GOLD_RUSH = "gold-rush";

type StockId = typeof STONES | MaterialId;
type LevelId = UpgradeId | RecipeId;
type ClockId = BoostId | TimerId | typeof GOLD_RUSH;

const OWNED_IDS: readonly TierId[] = TIERS.map((tier) => tier.id);
const STOCK_IDS: readonly StockId[] = [
  STONES,
  ...LAYERS.map((layer) => layer.material),
];
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
} as const;
type MarkKind = keyof typeof MARK_IDS;
const MARK_KINDS = Object.keys(MARK_IDS) as readonly MarkKind[];

type RunKey = "generation" | "stretch" | "dug" | "rushBank";

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
] as const;

/** The game map as saved. Every key is left out when it would be zero or empty. */
export type SaveGame = {
  readonly owned?: Readonly<Partial<Record<TierId, number>>>;
  readonly stock?: Readonly<Partial<Record<StockId, number>>>;
  readonly levels?: Readonly<Partial<Record<LevelId, number>>>;
  readonly clocks?: Readonly<Partial<Record<ClockId, number>>>;
  readonly marks?: {
    readonly seen?: readonly TeachId[];
    readonly taught?: readonly TeachId[];
    readonly recipes?: readonly RecipeId[];
    readonly finds?: readonly FindId[];
  };
  readonly run?: Readonly<Partial<Record<RunKey, number>>>;
  /** An engineer away on a trip is saved at post "tunnel". */
  readonly engineers?: readonly DutyEngineer[];
  /** Each trip keeps the post its engineer left, as `home`. */
  readonly expeditions?: readonly SavedExpedition[];
  readonly bench?: Bench;
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
  const tier = TIERS.find((each) => each.id === id);
  return tier === undefined ? 0 : mountain[tier.field];
}

function stockOf(mountain: Mountain, id: StockId): number {
  return id === STONES ? mountain.pocket : mountain.materials[id];
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
  };
}

/** The game map this mountain writes. */
export function writeGame(mountain: Mountain): SaveGame {
  return {
    ...some(
      "owned",
      positives(OWNED_IDS, (id) => tierCount(mountain, id)),
    ),
    ...some(
      "stock",
      positives(STOCK_IDS, (id) => stockOf(mountain, id)),
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

type Marks = Pick<Mountain, "seen" | "taught" | "recipes" | "finds">;

function readMarks(value: unknown): Part<Marks> {
  if (value === undefined) {
    return { seen: [], taught: [], recipes: [], finds: [] };
  }
  if (!isRecord(value)) {
    return "bad";
  }
  const seen = readIds(value["seen"], MARK_IDS.seen);
  const taught = readIds(value["taught"], MARK_IDS.taught);
  const recipes = readIds(value["recipes"], MARK_IDS.recipes);
  const finds = readIds(value["finds"], MARK_IDS.finds);
  const failed = worst([seen, taught, recipes, finds]);
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
  };
}

type Run = Pick<Mountain, "legacy" | "stretch" | "remaining" | "rushBank">;

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
    return { legacy: 0, stretch: 1, remaining: MOUNTAIN_STONES, rushBank: 0 };
  }
  if (!isRecord(value)) {
    return "bad";
  }
  const counts = readCounts(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "stretch"),
    ),
    ["generation", "dug", "rushBank"] as const,
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
  const run = counts as Record<"generation" | "dug" | "rushBank", number>;
  return {
    legacy: run.generation,
    stretch: stretch as number,
    remaining: MOUNTAIN_STONES - run.dug,
    rushBank: run.rushBank,
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

type Facts = Pick<
  Mountain,
  | "helpers"
  | "carts"
  | "hoists"
  | "drills"
  | "borers"
  | "trains"
  | "machines"
  | "kids"
  | "pocket"
  | "materials"
  | "upgrades"
  | "crafted"
  | "boosts"
  | "clocks"
  | "rushUntil"
>;

/** The four count maps, laid onto the mountain's own fields. */
function readFacts(record: Entries): Part<Facts> {
  const owned = readCounts(record["owned"], OWNED_IDS, UNCAPPED);
  const stock = readCounts(record["stock"], STOCK_IDS, UNCAPPED);
  const levels = readCounts(record["levels"], LEVEL_IDS, levelCap);
  const clocks = readCounts(record["clocks"], CLOCK_IDS, UNCAPPED);
  const failed = worst([owned, stock, levels, clocks]);
  if (failed !== undefined) {
    return failed;
  }
  return {
    ...crewCounts(owned as Record<TierId, number>),
    ...stockCounts(stock as Record<StockId, number>),
    ...levelCounts(levels as Record<LevelId, number>),
    ...clockCounts(clocks as Record<ClockId, number>),
  };
}

function crewCounts(
  owned: Record<TierId, number>,
): Pick<Mountain, (typeof TIERS)[number]["field"]> {
  return Object.fromEntries(
    TIERS.map((tier) => [tier.field, owned[tier.id]]),
  ) as Pick<Mountain, (typeof TIERS)[number]["field"]>;
}

function stockCounts(
  stock: Record<StockId, number>,
): Pick<Mountain, "pocket" | "materials"> {
  const materials = { ...EMPTY_MATERIALS };
  for (const layer of LAYERS) {
    materials[layer.material] = stock[layer.material];
  }
  return { pocket: stock[STONES], materials };
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
  const failed = worst([facts, marks, run, crew, bench]);
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
  readonly caps: Readonly<Record<string, number>>;
};

export function shippedFacts(): ShippedFacts {
  return {
    gameKeys: GAME_KEYS,
    owned: OWNED_IDS,
    stock: STOCK_IDS,
    levels: Object.fromEntries(LEVEL_IDS.map((id) => [id, levelCap(id)])),
    clocks: CLOCK_IDS,
    marks: MARK_IDS,
    run: {
      generation: MAX_LEGACY,
      stretch: MAX_STRETCH,
      dug: MOUNTAIN_STONES,
      rushBank: Number.MAX_SAFE_INTEGER,
    },
    engineerNames: ENGINEER_NAMES,
    posts: [...ENGINEER_POSTS, "tunnel"],
    tunnels: TUNNELS.map((tunnel) => tunnel.id),
    caps: {
      engineers: MAX_ENGINEERS,
      engineerTrips: MAX_ENGINEER_TRIPS,
      expeditions: MAX_EXPEDITIONS,
      expeditionMs: MAX_EXPEDITION_MS,
      craftMs: MAX_CRAFT_MS,
    },
  };
}
