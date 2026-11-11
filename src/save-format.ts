/**
 * The saved shape of a mountain, and the one place it meets the complete
 * mountain the game plays with. The document leaves out what is empty, zero
 * or unset, so older builds and `firestore.rules` read it as they always
 * have. `toSaved` drops those defaults; the readers fill them back in.
 */
import { NO_BOOSTS, parseBoosts, type BoostId } from "./boosts";
import { parseEngineers, type Engineer } from "./engineers";
import {
  parseExpeditions,
  parseFinds,
  type Expedition,
  type FindId,
} from "./expeditions";
import type { Materials } from "./layers";
import {
  BARE_MOUNTAIN,
  MAX_LEGACY,
  MOUNTAIN_STONES,
  isStaffedMark,
  type Mountain,
  type StaffedMark,
} from "./mountain";
import { MAX_STRETCH } from "./scale";
import { parseTeachIds } from "./teach";
import { NO_UPGRADES, parseUpgrades, type UpgradeId } from "./upgrades";
import {
  COLD_CLOCKS,
  MAX_CRAFTED_LEVEL,
  NOTHING_CRAFTED,
  isRecipeId,
  parseBench,
  parseChargeUntil,
  parseCrafted,
  parseMaterials,
  parseRecipes,
  type Bench,
  type Crafted,
  type KeptBench,
  type RecipeId,
  type TimerId,
} from "./workshop";

/** The mountain map of a save document. Missing means empty, zero or unset. */
export type SavedMountain = {
  readonly remaining: number;
  readonly pocket: number;
  readonly helpers: number;
  readonly carts: number;
  readonly drills: number;
  readonly borers: number;
  readonly machines: number;
  readonly kids: number;
  readonly upgrades?: Readonly<Partial<Record<UpgradeId, number>>>;
  readonly boosts?: Readonly<Partial<Record<BoostId, number>>>;
  readonly startedAt?: number;
  readonly staffed?: StaffedMark;
  readonly legacy?: number;
  readonly engineers?: readonly Engineer[];
  readonly expeditions?: readonly Expedition[];
  readonly finds?: readonly FindId[];
};

/**
 * The workshop map, one sibling of the mountain. Four extra document keys,
 * or four extra mountain keys, push a full crew past the Firestore
 * expression budget.
 */
export type WorkshopSave = {
  readonly materials: Materials;
  readonly recipes: readonly string[];
  readonly bench?: Bench | KeptBench;
  readonly crafted?: Readonly<Record<string, number>>;
  /** When a blasting charge cools. Missing means none is hot. */
  readonly chargeUntil?: number;
  /** When a crystal flare cools. Missing means none is hot. */
  readonly flareUntil?: number;
  /** When a heartstone ember cools. Missing means none is hot. */
  readonly emberUntil?: number;
  readonly axleUntil?: number;
  /** When a Gold rush ends (src/gold-rush.ts). Missing means none runs. */
  readonly rushUntil?: number;
  /** Stones held for the Gold rush. Missing means none. */
  readonly rushBank?: number;
  /** The run's stretch (M13). Missing means 1. */
  readonly stretch?: number;
  /** Notes opened (src/teach.ts). Missing means none. */
  readonly seen?: readonly string[];
  /** Systems used once (src/teach.ts). Missing means none written down. */
  readonly taught?: readonly string[];
};

/** The four craft clocks' field names in the workshop map. */
const CLOCK_FIELDS = {
  "blasting-charge": "chargeUntil",
  "crystal-flare": "flareUntil",
  "heartstone-ember": "emberUntil",
  "axle-grease": "axleUntil",
} as const satisfies Record<TimerId, keyof WorkshopSave>;

/** In the order the workshop map has always written them. */
const CLOCK_ORDER: readonly TimerId[] = [
  "blasting-charge",
  "crystal-flare",
  "heartstone-ember",
  "axle-grease",
];

function only<K extends string, V>(
  key: K,
  value: V,
  keep: boolean,
): Partial<Record<K, V>> {
  return keep ? ({ [key]: value } as Record<K, V>) : {};
}

function positives<K extends string>(
  levels: Readonly<Record<K, number>>,
): Partial<Record<K, number>> {
  return Object.fromEntries(
    Object.entries<number>(levels).filter(([, level]) => level > 0),
  ) as Partial<Record<K, number>>;
}

function nonEmpty(map: object): boolean {
  return Object.keys(map).length > 0;
}

/** The mountain map this mountain writes. */
export function savedMountain(mountain: Mountain): SavedMountain {
  const upgrades = positives(mountain.upgrades);
  const boosts = positives(mountain.boosts);
  return {
    // A stretched run digs in fractions of a depth stone. The cloud keeps
    // whole numbers, so round up: at most one stone of depth comes back.
    remaining: Math.ceil(mountain.remaining),
    pocket: mountain.pocket,
    helpers: mountain.helpers,
    carts: mountain.carts,
    drills: mountain.drills,
    borers: mountain.borers,
    machines: mountain.machines,
    kids: mountain.kids,
    ...only("upgrades", upgrades, nonEmpty(upgrades)),
    ...only("boosts", boosts, nonEmpty(boosts)),
    ...only("startedAt", mountain.startedAt, mountain.startedAt !== 0),
    ...(mountain.staffed === 0 ? {} : { staffed: mountain.staffed }),
    ...only("legacy", mountain.legacy, mountain.legacy !== 0),
    ...only("engineers", mountain.engineers, mountain.engineers.length > 0),
    ...only(
      "expeditions",
      mountain.expeditions,
      mountain.expeditions.length > 0,
    ),
    ...only("finds", mountain.finds, mountain.finds.length > 0),
  };
}

/** The workshop map this mountain writes, with a newer build's ids put back. */
export function savedWorkshop(mountain: Mountain): WorkshopSave {
  const kept = mountain.kept;
  const bench = mountain.bench ?? kept.bench;
  const crafted = { ...kept.crafted, ...positives(mountain.crafted) };
  const seen = [...mountain.seen, ...kept.seen];
  const taught = [...mountain.taught, ...kept.taught];
  return {
    materials: mountain.materials,
    ...(bench === undefined ? {} : { bench }),
    ...only("crafted", crafted, nonEmpty(crafted)),
    recipes: [
      ...mountain.recipes,
      ...kept.recipes.filter(
        (id) => !new Set<string>(mountain.recipes).has(id),
      ),
    ],
    ...savedClocks(mountain),
    ...only("stretch", mountain.stretch, mountain.stretch !== 1),
    ...only("seen", seen, seen.length > 0),
    ...only("taught", taught, taught.length > 0),
  };
}

type SavedClockField = (typeof CLOCK_FIELDS)[TimerId];

function savedClocks(mountain: Mountain): Partial<WorkshopSave> {
  const clocks: Partial<Record<SavedClockField, number>> = {};
  for (const id of CLOCK_ORDER) {
    if (mountain.clocks[id] !== 0) {
      clocks[CLOCK_FIELDS[id]] = mountain.clocks[id];
    }
  }
  return {
    ...clocks,
    ...only("rushUntil", mountain.rushUntil, mountain.rushUntil !== 0),
    ...only("rushBank", mountain.rushBank, mountain.rushBank !== 0),
  };
}

// ---------------------------------------------------------------------------
// Reading

type Read<T> = T | "bad";

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** A missing field is its default; a present one must parse. */
function field<T>(
  value: unknown,
  fallback: T,
  parse: (value: unknown) => T | undefined,
): Read<T> {
  if (value === undefined) {
    return fallback;
  }
  return parse(value) ?? "bad";
}

/** A whole count up to `max`; missing is `fallback`. */
function count(
  value: unknown,
  fallback = 0,
  max = Number.MAX_SAFE_INTEGER,
): Read<number> {
  return field(value, fallback, (raw) =>
    isCount(raw) && raw <= max ? raw : undefined,
  );
}

/** A count every save has. */
function needed(value: unknown, max = Number.MAX_SAFE_INTEGER): Read<number> {
  return isCount(value) && value <= max ? value : "bad";
}

type Counts = Pick<
  Mountain,
  | "remaining"
  | "pocket"
  | "helpers"
  | "carts"
  | "drills"
  | "borers"
  | "machines"
  | "kids"
>;

/** The crew and the stones. `total` is the mountain's size in that version. */
function readCounts(
  record: Readonly<Record<string, unknown>>,
  total: number,
): Counts | undefined {
  const remaining = needed(record["remaining"], total);
  const pocket = needed(record["pocket"]);
  const helpers = needed(record["helpers"]);
  const carts = count(record["carts"]);
  const drills = count(record["drills"]);
  const borers = count(record["borers"]);
  const machines = count(record["machines"]);
  const kids = count(record["kids"]);
  if (
    remaining === "bad" ||
    pocket === "bad" ||
    helpers === "bad" ||
    carts === "bad" ||
    drills === "bad" ||
    borers === "bad" ||
    machines === "bad" ||
    kids === "bad"
  ) {
    return undefined;
  }
  return { remaining, pocket, helpers, carts, drills, borers, machines, kids };
}

/** Only checks that a present value parses. */
function checked(parse: (value: unknown) => unknown) {
  return (value: unknown): true | undefined =>
    parse(value) === undefined ? undefined : true;
}

/**
 * Workshop fields an old document kept on the mountain map. Every version
 * overwrites them, but a bad one still rejects the save, as it always has.
 */
function oldWorkshopFieldsBad(
  record: Readonly<Record<string, unknown>>,
): boolean {
  return [
    field(record["materials"], true, checked(parseMaterials)),
    field(record["recipes"], true, checked(parseRecipes)),
    field(record["bench"], true, (raw) =>
      raw === null ? true : checked(parseBench)(raw),
    ),
    field(record["crafted"], true, checked(parseCrafted)),
  ].includes("bad");
}

type Owned = Pick<
  Mountain,
  | "upgrades"
  | "boosts"
  | "startedAt"
  | "staffed"
  | "legacy"
  | "engineers"
  | "expeditions"
  | "finds"
>;

function readOwned(
  record: Readonly<Record<string, unknown>>,
): Owned | undefined {
  const upgrades = field(record["upgrades"], NO_UPGRADES, parseUpgrades);
  const boosts = field(record["boosts"], NO_BOOSTS, parseBoosts);
  const startedAt = count(record["startedAt"]);
  const staffed = field<StaffedMark | 0>(record["staffed"], 0, (raw) =>
    isStaffedMark(raw) ? raw : undefined,
  );
  const legacy = count(record["legacy"], 0, MAX_LEGACY);
  const engineers = field(record["engineers"], [], parseEngineers);
  // A trip needs its engineer on the crew: none saved means none can be out.
  const expeditions = field(record["expeditions"], [], (raw) =>
    parseExpeditions(
      raw,
      record["engineers"] === undefined || engineers === "bad"
        ? undefined
        : engineers,
    ),
  );
  const finds = field(record["finds"], [], parseFinds);
  if (
    upgrades === "bad" ||
    boosts === "bad" ||
    startedAt === "bad" ||
    staffed === "bad" ||
    legacy === "bad" ||
    engineers === "bad" ||
    expeditions === "bad" ||
    finds === "bad"
  ) {
    return undefined;
  }
  return {
    upgrades,
    boosts,
    startedAt,
    staffed,
    legacy,
    engineers,
    expeditions,
    finds,
  };
}

/**
 * The mountain map of any version, as a complete mountain. The workshop's
 * fields are left at their defaults for the caller to fill in. Every field
 * must be a sane whole number, and a bad one rejects the save.
 */
export function parseMountain(
  value: unknown,
  total: number = MOUNTAIN_STONES,
): Mountain | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const counts = readCounts(record, total);
  const owned = readOwned(record);
  if (
    counts === undefined ||
    owned === undefined ||
    oldWorkshopFieldsBad(record)
  ) {
    return undefined;
  }
  return { ...BARE_MOUNTAIN, ...counts, ...owned };
}

/** Builds before #366 wrote stretches up to this. They load at MAX_STRETCH. */
const OLD_MAX_STRETCH = 100_000_000;

function readStretch(value: unknown): Read<number> {
  return field(value, 1, (raw) =>
    typeof raw === "number" && raw >= 1 && raw <= OLD_MAX_STRETCH
      ? Math.min(raw, MAX_STRETCH)
      : undefined,
  );
}

/** Missing means that buff is cold. Anything else must be a whole time. */
function readClock(value: unknown): Read<number> {
  return field(value, 0, parseChargeUntil);
}

type Timers = Pick<Mountain, "clocks" | "rushUntil" | "rushBank" | "stretch">;

/** Every clock the workshop map holds; one bad clock rejects the save. */
function readTimers(
  sheet: Readonly<Record<string, unknown>>,
): Timers | undefined {
  const clocks: Record<TimerId, number> = { ...COLD_CLOCKS };
  for (const id of CLOCK_ORDER) {
    const at = readClock(sheet[CLOCK_FIELDS[id]]);
    if (at === "bad") {
      return undefined;
    }
    clocks[id] = at;
  }
  const rushUntil = readClock(sheet["rushUntil"]);
  const rushBank = readClock(sheet["rushBank"]);
  const stretch = readStretch(sheet["stretch"]);
  if (rushUntil === "bad" || rushBank === "bad" || stretch === "bad") {
    return undefined;
  }
  return { clocks, rushUntil, rushBank, stretch };
}

/** Lays the workshop map over a mountain map; undefined when the save is bad. */
export function withWorkshop(
  base: Mountain,
  value: unknown,
): Mountain | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const sheet = value as Readonly<Record<string, unknown>>;
  const materials = parseMaterials(sheet["materials"]);
  const recipes = readRecipes(sheet["recipes"]);
  const bench = readBench(sheet["bench"]);
  const crafted = readCrafted(sheet["crafted"]);
  const seen = parseTeachIds(sheet["seen"]);
  const taught = parseTeachIds(sheet["taught"]);
  const timers = readTimers(sheet);
  if (
    materials === undefined ||
    recipes === "bad" ||
    bench === "bad" ||
    crafted === "bad" ||
    seen === "bad" ||
    taught === "bad" ||
    timers === undefined
  ) {
    return undefined;
  }
  return {
    ...base,
    ...timers,
    materials,
    recipes: recipes.known,
    bench: bench.bench,
    crafted: crafted.crafted,
    seen: seen.known,
    taught: taught.known,
    kept: {
      recipes: recipes.kept,
      bench: bench.kept,
      crafted: crafted.kept,
      seen: seen.kept,
      taught: taught.kept,
    },
  };
}

/** An id this build can write back without treating it as a recipe it knows. */
const MAX_KEPT_ID = 40;
const MAX_KEPT_RECIPES = 8;
/** Wider than today's longest craft, so a newer timer still comes home. */
const MAX_KEPT_BENCH_MS = 7 * 24 * 60 * 60 * 1000;

function keptId(value: string): boolean {
  return value.length >= 1 && value.length <= MAX_KEPT_ID;
}

type RecipesRead = {
  readonly known: readonly RecipeId[];
  readonly kept: readonly string[];
};

/**
 * Known ids stay playable. An id this build has never heard of is kept,
 * so the next write does not forget a newer recipe.
 */
function readRecipes(value: unknown): Read<RecipesRead> {
  if (!Array.isArray(value)) {
    return "bad";
  }
  const known: RecipeId[] = [];
  const kept: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    if (isRecipeId(item)) {
      if (!known.includes(item)) {
        known.push(item);
      }
      continue;
    }
    if (
      keptId(item) &&
      kept.length < MAX_KEPT_RECIPES &&
      !kept.includes(item)
    ) {
      kept.push(item);
    }
  }
  return { known, kept };
}

type BenchRead = {
  readonly bench: Bench | undefined;
  readonly kept: KeptBench | undefined;
};

const FREE_BENCH: BenchRead = { bench: undefined, kept: undefined };

/**
 * `null` is an empty bench. A recipe this client does not know stays on
 * the bench until its clock ends, and the next write puts it back.
 */
function readBench(value: unknown): Read<BenchRead> {
  if (value === undefined || value === null) {
    return FREE_BENCH;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return "bad";
  }
  const recipe = (value as Record<string, unknown>)["recipe"];
  if (typeof recipe === "string" && !isRecipeId(recipe)) {
    return { bench: undefined, kept: keptBench(recipe, value) };
  }
  const bench = parseBench(value);
  return bench === undefined ? "bad" : { bench, kept: undefined };
}

function keptBench(recipe: string, value: object): KeptBench | undefined {
  const { startedAt, endsAt } = value as Record<string, unknown>;
  if (
    !keptId(recipe) ||
    !isCount(startedAt) ||
    !isCount(endsAt) ||
    endsAt <= startedAt ||
    endsAt - startedAt > MAX_KEPT_BENCH_MS
  ) {
    return undefined;
  }
  return { recipe, startedAt, endsAt };
}

type CraftedRead = {
  readonly crafted: Crafted;
  readonly kept: Readonly<Record<string, number>>;
};

/**
 * Missing means nothing crafted. A level this build knows is playable.
 * A level it does not know is written back. A bad level on a known id
 * rejects the save; a bad level on an unknown id is skipped.
 */
function readCrafted(value: unknown): Read<CraftedRead> {
  if (value === undefined) {
    return { crafted: NOTHING_CRAFTED, kept: {} };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "bad";
  }
  const crafted: Record<RecipeId, number> = { ...NOTHING_CRAFTED };
  const kept: Record<string, number> = {};
  for (const [key, level] of Object.entries(value)) {
    const whole = isCount(level) && level <= MAX_CRAFTED_LEVEL;
    if (isRecipeId(key)) {
      if (!whole) {
        return "bad";
      }
      crafted[key] = level;
    } else if (
      whole &&
      keptId(key) &&
      Object.keys(kept).length < MAX_KEPT_RECIPES
    ) {
      kept[key] = level;
    }
  }
  return { crafted, kept };
}
