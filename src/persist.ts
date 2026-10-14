import { materialsFromMined, type Materials } from "./layers";
import {
  MOUNTAIN_STONES,
  createMountain,
  minedOut,
  parseMountain,
  type Mountain,
} from "./mountain";
import {
  MAX_CRAFTED_LEVEL,
  isRecipeId,
  parseBench,
  parseMaterials,
  parseChargeUntil,
  recipesForMined,
  type Bench,
  type Crafted,
  type KeptBench,
  type KeptWorkshop,
  type RecipeId,
} from "./workshop";

/** v3 saves were a 1,000,000-stone mountain. v4 placed that on 100,000,000. */
const V3_MOUNTAIN_STONES = 1_000_000;
const V4_MOUNTAIN_STONES = 100_000_000;
/** Frozen at the v4 depth so a v3 dad is not stretched again when the bottom moves. */
const V3_SCALE = V4_MOUNTAIN_STONES / V3_MOUNTAIN_STONES;

type WorkshopSave = {
  readonly materials: Materials;
  readonly recipes: readonly string[];
  readonly bench?: Bench | KeptBench;
  readonly crafted?: Crafted | Readonly<Record<string, number>>;
  /** When a blasting charge cools. Missing means none is hot. */
  readonly chargeUntil?: number;
  /** When a crystal flare cools. Missing means none is hot. */
  readonly flareUntil?: number;
  /** When a heartstone ember cools. Missing means none is hot. */
  readonly emberUntil?: number;
  readonly axleUntil?: number;
};

export type MountainSaveV6 = {
  readonly version: 6;
  readonly mountain: Mountain;
  readonly workshop: WorkshopSave;
  readonly lastSeen: number;
};

export type ParsedSave = {
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
};

export function serializeSave({
  mountain,
  lastSeen,
}: {
  mountain: Mountain;
  lastSeen: number;
}): MountainSaveV6 {
  return {
    version: 6,
    mountain: {
      remaining: mountain.remaining,
      pocket: mountain.pocket,
      helpers: mountain.helpers,
      carts: mountain.carts,
      drills: mountain.drills,
      borers: mountain.borers,
      machines: mountain.machines,
      kids: mountain.kids,
      ...(mountain.upgrades === undefined ||
      Object.keys(mountain.upgrades).length === 0
        ? {}
        : { upgrades: mountain.upgrades }),
      ...(mountain.boosts === undefined ||
      Object.keys(mountain.boosts).length === 0
        ? {}
        : { boosts: mountain.boosts }),
      ...(mountain.startedAt === undefined
        ? {}
        : { startedAt: mountain.startedAt }),
      ...(mountain.staffed === undefined ? {} : { staffed: mountain.staffed }),
      ...(mountain.legacy === undefined || mountain.legacy === 0
        ? {}
        : { legacy: mountain.legacy }),
      ...(mountain.engineers === undefined || mountain.engineers.length === 0
        ? {}
        : { engineers: mountain.engineers }),
      ...(mountain.expeditions === undefined ||
      mountain.expeditions.length === 0
        ? {}
        : { expeditions: mountain.expeditions }),
      ...(mountain.finds === undefined || mountain.finds.length === 0
        ? {}
        : { finds: mountain.finds }),
    },
    // One sibling of the mountain. Four extra document keys, or four extra
    // mountain keys, push a full crew past the Firestore expression budget.
    workshop: {
      materials: mountain.materials ?? materialsFromMined(minedOut(mountain)),
      ...workshopBench(mountain),
      ...workshopCrafted(mountain),
      recipes: workshopRecipes(mountain),
      ...(mountain.chargeUntil === undefined
        ? {}
        : { chargeUntil: mountain.chargeUntil }),
      ...(mountain.flareUntil === undefined
        ? {}
        : { flareUntil: mountain.flareUntil }),
      ...(mountain.emberUntil === undefined
        ? {}
        : { emberUntil: mountain.emberUntil }),
      ...(mountain.axleUntil === undefined
        ? {}
        : { axleUntil: mountain.axleUntil }),
    },
    lastSeen,
  };
}

/**
 * Accepts v6 (materials, bench, crafted, recipes, and the live buff clocks). A v5 save keeps every
 * stone already mined and is granted the materials those stones would have
 * dug. v4 keeps that place and gains the depth below the old bottom. v3
 * scales onto that same place. Legacy v1/v2 3x3 grids still migrate. v1
 * through v5 all arrive as v6 in memory.
 */
export function parseSaveValue(value: unknown): ParsedSave | undefined {
  if (typeof value !== "object" || value === null || !("version" in value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  switch (record["version"]) {
    case 1: {
      const mountain = migrateLegacyGrid(record["grid"]);
      return mountain === undefined
        ? undefined
        : { mountain: grantFromStones(mountain), lastSeen: undefined };
    }
    case 2:
    case 3:
    case 4:
    case 5: {
      const loaded = loadOlderMountain(record);
      return loaded === undefined
        ? undefined
        : {
            mountain: grantFromStones(loaded.mountain),
            lastSeen: loaded.lastSeen,
          };
    }
    case 6: {
      const lastSeen = record["lastSeen"];
      if (typeof lastSeen !== "number" || !Number.isFinite(lastSeen)) {
        return undefined;
      }
      const base = parseMountain(record["mountain"]);
      const workshop = record["workshop"];
      if (typeof workshop !== "object" || workshop === null) {
        return undefined;
      }
      const sheet = workshop as Record<string, unknown>;
      const materials = parseMaterials(sheet["materials"]);
      const recipes = readRecipes(sheet["recipes"]);
      const bench = readBench(sheet["bench"]);
      const crafted = readCrafted(sheet["crafted"]);
      const chargeUntil = readClock(sheet["chargeUntil"]);
      const flareUntil = readClock(sheet["flareUntil"]);
      const emberUntil = readClock(sheet["emberUntil"]);
      const axleUntil = readClock(sheet["axleUntil"]);
      if (
        base === undefined ||
        materials === undefined ||
        recipes === "bad" ||
        bench === "bad" ||
        crafted === "bad" ||
        chargeUntil === "bad" ||
        flareUntil === "bad" ||
        emberUntil === "bad" ||
        axleUntil === "bad"
      ) {
        return undefined;
      }
      const kept = keptWorkshop(recipes.kept, bench.kept, crafted.kept);
      return {
        mountain: {
          ...base,
          materials,
          recipes: recipes.known,
          ...(bench.bench === undefined ? {} : { bench: bench.bench }),
          ...(crafted.crafted === undefined ||
          Object.keys(crafted.crafted).length === 0
            ? {}
            : { crafted: crafted.crafted }),
          ...(kept === undefined ? {} : { kept }),
          ...(chargeUntil === undefined ? {} : { chargeUntil }),
          ...(flareUntil === undefined ? {} : { flareUntil }),
          ...(emberUntil === undefined ? {} : { emberUntil }),
          ...(axleUntil === undefined ? {} : { axleUntil }),
        },
        lastSeen,
      };
    }
    default:
      return undefined;
  }
}

/** An id this build can write back without treating it as a recipe it knows. */
const MAX_KEPT_ID = 40;
const MAX_KEPT_RECIPES = 8;
/** Wider than today's longest craft, so a newer timer still comes home. */
const MAX_KEPT_BENCH_MS = 7 * 24 * 60 * 60 * 1000;

function keptId(value: string): boolean {
  return value.length >= 1 && value.length <= MAX_KEPT_ID;
}

function workshopRecipes(mountain: Mountain): readonly string[] {
  const known = [...(mountain.recipes ?? recipesForMined(minedOut(mountain)))];
  const seen = new Set<string>(known);
  const all: string[] = [...known];
  for (const id of mountain.kept?.recipes ?? []) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    all.push(id);
  }
  return all;
}

function workshopBench(mountain: Mountain): { bench?: Bench | KeptBench } {
  const bench = mountain.bench ?? mountain.kept?.bench;
  return bench === undefined ? {} : { bench };
}

function workshopCrafted(mountain: Mountain): {
  crafted?: Readonly<Record<string, number>>;
} {
  const crafted = {
    ...(mountain.kept?.crafted ?? {}),
    ...(mountain.crafted ?? {}),
  };
  return Object.keys(crafted).length === 0 ? {} : { crafted };
}

function keptWorkshop(
  recipes: readonly string[],
  bench: KeptBench | undefined,
  crafted: Readonly<Record<string, number>> | undefined,
): KeptWorkshop | undefined {
  const kept: {
    recipes?: readonly string[];
    bench?: KeptBench;
    crafted?: Readonly<Record<string, number>>;
  } = {};
  if (recipes.length > 0) {
    kept.recipes = recipes;
  }
  if (bench !== undefined) {
    kept.bench = bench;
  }
  if (crafted !== undefined && Object.keys(crafted).length > 0) {
    kept.crafted = crafted;
  }
  return kept.recipes === undefined &&
    kept.bench === undefined &&
    kept.crafted === undefined
    ? undefined
    : kept;
}

/**
 * Known ids stay playable. An id this build has never heard of is kept,
 * so the next write does not forget a newer recipe.
 */
function readRecipes(
  value: unknown,
):
  | { readonly known: readonly RecipeId[]; readonly kept: readonly string[] }
  | "bad" {
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
      !keptId(item) ||
      kept.length >= MAX_KEPT_RECIPES ||
      kept.includes(item)
    ) {
      continue;
    }
    kept.push(item);
  }
  return { known, kept };
}

/**
 * `null` is an empty bench. A recipe this client does not know stays on
 * the bench until its clock ends, and the next write puts it back.
 */
function readBench(
  value: unknown,
): { readonly bench?: Bench; readonly kept?: KeptBench } | "bad" {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return "bad";
  }
  const record = value as Record<string, unknown>;
  const recipe = record["recipe"];
  if (typeof recipe === "string" && !isRecipeId(recipe)) {
    const startedAt = record["startedAt"];
    const endsAt = record["endsAt"];
    if (
      !keptId(recipe) ||
      !isWhole(startedAt) ||
      !isWhole(endsAt) ||
      endsAt <= startedAt ||
      endsAt - startedAt > MAX_KEPT_BENCH_MS
    ) {
      return {};
    }
    return { kept: { recipe, startedAt, endsAt } };
  }
  const bench = parseBench(value);
  return bench === undefined ? "bad" : { bench };
}

function isWhole(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Missing means that buff is cold. Anything else must be a whole time. */
function readClock(value: unknown): number | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseChargeUntil(value);
  return parsed === undefined ? "bad" : parsed;
}

/**
 * Missing means nothing crafted. A level this build knows is playable.
 * A level it does not know is written back. A bad level on a known id
 * rejects the save; a bad level on an unknown id is skipped.
 */
function readCrafted(value: unknown):
  | {
      readonly crafted?: Crafted;
      readonly kept?: Readonly<Record<string, number>>;
    }
  | "bad" {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "bad";
  }
  const crafted: Partial<Record<RecipeId, number>> = {};
  const kept: Record<string, number> = {};
  for (const [key, level] of Object.entries(value)) {
    const whole = isWhole(level) && level <= MAX_CRAFTED_LEVEL;
    if (isRecipeId(key)) {
      if (!whole) {
        return "bad";
      }
      crafted[key] = level;
      continue;
    }
    if (
      !whole ||
      !keptId(key) ||
      Object.keys(kept).length >= MAX_KEPT_RECIPES
    ) {
      continue;
    }
    kept[key] = level;
  }
  return {
    ...(Object.keys(crafted).length === 0 ? {} : { crafted }),
    ...(Object.keys(kept).length === 0 ? {} : { kept }),
  };
}

function loadOlderMountain(
  record: Record<string, unknown>,
): { mountain: Mountain; lastSeen: number } | undefined {
  const lastSeen = record["lastSeen"];
  if (typeof lastSeen !== "number" || !Number.isFinite(lastSeen)) {
    return undefined;
  }
  const mountain =
    record["version"] === 2
      ? migrateLegacyGrid(record["grid"])
      : record["version"] === 3
        ? scaleV3(parseMountain(record["mountain"], V3_MOUNTAIN_STONES))
        : record["version"] === 4
          ? deepen(
              parseMountain(record["mountain"], V4_MOUNTAIN_STONES),
              V4_MOUNTAIN_STONES,
            )
          : parseMountain(record["mountain"]);
  return mountain === undefined ? undefined : { mountain, lastSeen };
}

/**
 * What that digging would have earned. The bench is empty and nothing is
 * crafted. Recipes are the starting three, plus Reinforce once the Granite
 * is reached, plus the layer recipe for each band already reached.
 * A materials field already on the document is not trusted: v1–v5 did not
 * have one.
 */
function grantFromStones(mountain: Mountain): Mountain {
  const kept = Object.fromEntries(
    Object.entries(mountain).filter(
      ([key]) =>
        key !== "bench" &&
        key !== "crafted" &&
        key !== "materials" &&
        key !== "recipes",
    ),
  ) as Mountain;
  return {
    ...kept,
    materials: materialsFromMined(minedOut(mountain)),
    recipes: recipesForMined(minedOut(mountain)),
  };
}

const LEGACY_CELL_STONES = { covered: 0, dug: 0, stone: 1, chunk: 2 } as const;

/**
 * The old 3x3 grid becomes a head start: every dug cell is a stone already out
 * of the mountain, and stones (1) and chunks (2) on the grid go to the pocket.
 */
export function migrateLegacyGrid(grid: unknown): Mountain | undefined {
  if (typeof grid !== "object" || grid === null) {
    return undefined;
  }
  const { width, height, cells } = grid as Record<string, unknown>;
  if (
    width !== 3 ||
    height !== 3 ||
    !Array.isArray(cells) ||
    cells.length !== 9
  ) {
    return undefined;
  }
  let dug = 0;
  let pocket = 0;
  for (const cell of cells as unknown[]) {
    const kind =
      typeof cell === "object" && cell !== null
        ? (cell as Record<string, unknown>)["kind"]
        : undefined;
    if (typeof kind !== "string" || !Object.hasOwn(LEGACY_CELL_STONES, kind)) {
      return undefined;
    }
    if (kind !== "covered") {
      dug += 1;
    }
    pocket += LEGACY_CELL_STONES[kind as keyof typeof LEGACY_CELL_STONES];
  }
  return { ...createMountain(), remaining: MOUNTAIN_STONES - dug, pocket };
}

/**
 * Keeps a v3 dad at the same place in the deeper mountain: stones mined are
 * scaled up, so relics already found stay found. Pocket and crew are kept.
 */
function scaleV3(mountain: Mountain | undefined): Mountain | undefined {
  if (mountain === undefined) {
    return undefined;
  }
  const mined = (V3_MOUNTAIN_STONES - mountain.remaining) * V3_SCALE;
  return { ...mountain, remaining: MOUNTAIN_STONES - mined };
}

/** Keeps stones already mined and puts the new depth under them. */
function deepen(
  mountain: Mountain | undefined,
  oldTotal: number,
): Mountain | undefined {
  if (mountain === undefined) {
    return undefined;
  }
  const mined = oldTotal - mountain.remaining;
  return { ...mountain, remaining: MOUNTAIN_STONES - mined };
}
