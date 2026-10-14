import {
  LAYERS,
  MAX_MATERIAL,
  type MaterialId,
  type Materials,
} from "./layers";

/**
 * Recipe ids the save may name (M9). The workshop that spends them is a
 * later sitting. Expedition recipes are valid here and are not granted when
 * an older save moves to v6.
 */
export const RECIPE_IDS = [
  "iron-rails",
  "sturdy-props",
  "blasting-charge",
  "diamond-bits",
  "crystal-lamp",
  "engineers-kit",
  "heartstone-core",
] as const;

export type RecipeId = (typeof RECIPE_IDS)[number];

/** Known when the workshop opens. Every migrated save starts with these. */
export const STARTING_RECIPE_IDS = [
  "iron-rails",
  "sturdy-props",
  "blasting-charge",
] as const satisfies readonly RecipeId[];

const CRYSTAL_FROM = LAYERS[2].from;
const HEART_FROM = LAYERS[3].from;

/** Longest craft. The same length as a night expedition. Mirrored in firestore.rules. */
export const MAX_CRAFT_MS = 4 * 60 * 60 * 1000;

/**
 * Sanity cap on a crafted level until the workshop sets each recipe's max.
 * Mirrored in firestore.rules.
 */
export const MAX_CRAFTED_LEVEL = 1000;

export type Bench = {
  readonly recipe: RecipeId;
  readonly startedAt: number;
  readonly endsAt: number;
};

export type Crafted = Readonly<Partial<Record<RecipeId, number>>>;

/**
 * Starting three, plus the layer recipe for each band already reached.
 * Diamond bits at the Crystal Caves, the Heartstone core in the Deep Heart.
 * The lamp and the kit are found, not granted.
 */
export function recipesForMined(mined: number): readonly RecipeId[] {
  const reached = Math.max(0, mined);
  const recipes: RecipeId[] = [...STARTING_RECIPE_IDS];
  if (reached >= CRYSTAL_FROM) {
    recipes.push("diamond-bits");
  }
  if (reached >= HEART_FROM) {
    recipes.push("heartstone-core");
  }
  return recipes;
}

export function isRecipeId(value: unknown): value is RecipeId {
  return typeof value === "string" && RECIPE_IDS.some((id) => id === value);
}

function isWhole(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Exactly the four materials, each a whole count inside its band. */
export function parseMaterials(value: unknown): Materials | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4) {
    return undefined;
  }
  const parsed = {} as Record<MaterialId, number>;
  for (const layer of LAYERS) {
    const count = record[layer.material];
    if (!isWhole(count) || count > MAX_MATERIAL[layer.material]) {
      return undefined;
    }
    parsed[layer.material] = count;
  }
  return parsed;
}

/** One craft on the bench, or nothing. A null bench is empty. */
export function parseBench(value: unknown): Bench | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const { recipe, startedAt, endsAt } = record;
  if (Object.keys(record).length !== 3) {
    return undefined;
  }
  if (!isRecipeId(recipe) || !isWhole(startedAt) || !isWhole(endsAt)) {
    return undefined;
  }
  if (endsAt <= startedAt || endsAt - startedAt > MAX_CRAFT_MS) {
    return undefined;
  }
  return { recipe, startedAt, endsAt };
}

/** Levels already crafted. An empty map means nothing is made. */
export function parseCrafted(value: unknown): Crafted | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const parsed: Partial<Record<RecipeId, number>> = {};
  for (const [key, level] of Object.entries(value)) {
    if (!isRecipeId(key) || !isWhole(level) || level > MAX_CRAFTED_LEVEL) {
      return undefined;
    }
    parsed[key] = level;
  }
  return parsed;
}

/** Found recipes, in the order they were saved. No duplicates. */
export function parseRecipes(value: unknown): readonly RecipeId[] | undefined {
  if (!Array.isArray(value) || value.length > RECIPE_IDS.length) {
    return undefined;
  }
  const parsed: RecipeId[] = [];
  for (const item of value) {
    if (!isRecipeId(item) || parsed.includes(item)) {
      return undefined;
    }
    parsed.push(item);
  }
  return parsed;
}
