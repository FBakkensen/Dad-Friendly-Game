import { factor } from "./economy/factors";
import {
  EMPTY_MATERIALS,
  LAYERS,
  MAX_MATERIAL,
  addMaterials,
  type MaterialId,
  type Materials,
} from "./layers";
import type { Mountain } from "./mountain";
import { minedOut } from "./scale";
import type { TierId } from "./tiers";

/**
 * Workshop rules (M9). One bench, a clock that runs while the app is closed,
 * and gear the crew can feel. The screen that shows it is a later sitting.
 * Strength and cost factors default to 1. M9-7 lab-tunes the first cut.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Crew ×2 for this long after a blasting charge comes off the bench. */
export const CHARGE_MS = 20 * MINUTE;

/**
 * Sanity cap on a crafted level. Repeatable sinks stop here so a save stays
 * a whole number the rules can bound. Mirrored in firestore.rules.
 */
export const MAX_CRAFTED_LEVEL = 1000;

/** Longest craft. The same length as a night expedition. Mirrored in firestore.rules. */
export const MAX_CRAFT_MS = 4 * HOUR;

const RAILS_PER_LEVEL = 0.25;
const BITS_PER_LEVEL = 0.25;
const CORE_PER_LEVEL = 0.2;
const PROPS_RARER = 0.3;
const LAMP_OFTEN = 0.25;
const KIT_SHORTER = 0.2;
const CHARGE_MULTIPLIER = 2;
const REINFORCE_PER_LEVEL = 0.05;
const REINFORCE_CAP = 5;
/** Veins this much more often while a crystal flare is hot. */
const FLARE_OFTEN = 0.25;
const FLARE_MS = HOUR;
/** Added to 1 for the Great Machine while a heartstone ember is hot. ×1.25 at strength 1. */
const EMBER_BONUS = 0.25;
const EMBER_MS = 20 * MINUTE;

/**
 * Recipe ids the save may name. Expedition finds (the lamp and the kit) are
 * valid ids and are not granted when an older save moves to v6.
 */
export const RECIPE_IDS = [
  "iron-rails",
  "sturdy-props",
  "blasting-charge",
  "reinforce",
  "diamond-bits",
  "crystal-flare",
  "crystal-lamp",
  "engineers-kit",
  "heartstone-core",
  "heartstone-ember",
] as const;

export type RecipeId = (typeof RECIPE_IDS)[number];

/** Known before the workshop opens. Crafting still waits for the Granite. */
export const STARTING_RECIPE_IDS = [
  "iron-rails",
  "sturdy-props",
  "blasting-charge",
] as const satisfies readonly RecipeId[];

type Unlock = "start" | "granite" | "crystal" | "heart" | "found";

type TierEffect = {
  readonly kind: "tier";
  readonly tier: "cart" | "drill" | "machine";
  readonly perLevel: number;
};

type RecipeEffect =
  | TierEffect
  | { readonly kind: "trouble"; readonly rarer: number }
  | { readonly kind: "veins"; readonly often: number }
  | { readonly kind: "trip"; readonly shorter: number }
  | {
      readonly kind: "charge";
      readonly multiplier: number;
      readonly durationMs: number;
    }
  | {
      readonly kind: "flare";
      readonly often: number;
      readonly durationMs: number;
    }
  | {
      readonly kind: "ember";
      readonly bonus: number;
      readonly durationMs: number;
    }
  | { readonly kind: "reinforce"; readonly perLevel: number };

export type Recipe = {
  readonly id: RecipeId;
  readonly name: string;
  /** Stones, before the cost factor. */
  readonly stones: number;
  readonly materials: Partial<Record<MaterialId, number>>;
  readonly craftMs: number;
  /** Missing means the sink can be crafted until the save cap. */
  readonly maxLevel?: number;
  readonly unlock: Unlock;
  readonly effect: RecipeEffect;
};

/**
 * First cut. Costs, times, and effects are real numbers. Each effect is
 * multiplied by `recipe.<id>.strength`, which is 1 until M9-7. A timed buff's
 * length uses that same factor. Reinforce stops at 5. Crystal flare and the
 * heartstone ember refresh one live timer; they do not stack and they do not
 * change away pay.
 */
const BY_ID: Readonly<Record<RecipeId, Recipe>> = {
  "iron-rails": {
    id: "iron-rails",
    name: "Iron rails",
    stones: 4_200_000,
    materials: { iron: 12 },
    craftMs: HOUR,
    maxLevel: 3,
    unlock: "start",
    effect: { kind: "tier", tier: "cart", perLevel: RAILS_PER_LEVEL },
  },
  "sturdy-props": {
    id: "sturdy-props",
    name: "Sturdy props",
    stones: 2_000_000,
    materials: { clay: 20, iron: 8 },
    craftMs: HOUR,
    maxLevel: 1,
    unlock: "start",
    effect: { kind: "trouble", rarer: PROPS_RARER },
  },
  "blasting-charge": {
    id: "blasting-charge",
    name: "Blasting charge",
    stones: 800_000,
    materials: { clay: 6 },
    craftMs: 10 * MINUTE,
    unlock: "start",
    effect: {
      kind: "charge",
      multiplier: CHARGE_MULTIPLIER,
      durationMs: CHARGE_MS,
    },
  },
  reinforce: {
    id: "reinforce",
    name: "Reinforce",
    stones: 0,
    materials: { iron: 8 },
    craftMs: 10 * MINUTE,
    unlock: "granite",
    maxLevel: REINFORCE_CAP,
    effect: { kind: "reinforce", perLevel: REINFORCE_PER_LEVEL },
  },
  "diamond-bits": {
    id: "diamond-bits",
    name: "Diamond bits",
    stones: 15_000_000,
    materials: { crystal: 12 },
    craftMs: HOUR,
    maxLevel: 3,
    unlock: "crystal",
    effect: { kind: "tier", tier: "drill", perLevel: BITS_PER_LEVEL },
  },
  "crystal-flare": {
    id: "crystal-flare",
    name: "Crystal flare",
    stones: 1_000_000,
    materials: { crystal: 4 },
    craftMs: 10 * MINUTE,
    unlock: "crystal",
    effect: { kind: "flare", often: FLARE_OFTEN, durationMs: FLARE_MS },
  },
  "crystal-lamp": {
    id: "crystal-lamp",
    name: "Miner's crystal lamp",
    stones: 0,
    materials: { crystal: 10, iron: 8 },
    craftMs: HOUR,
    maxLevel: 1,
    unlock: "found",
    effect: { kind: "veins", often: LAMP_OFTEN },
  },
  "engineers-kit": {
    id: "engineers-kit",
    name: "Engineer's kit",
    stones: 0,
    materials: { iron: 12, crystal: 8 },
    craftMs: 4 * HOUR,
    maxLevel: 1,
    unlock: "found",
    effect: { kind: "trip", shorter: KIT_SHORTER },
  },
  "heartstone-core": {
    id: "heartstone-core",
    name: "Heartstone core",
    stones: 40_000_000,
    materials: { heartstone: 8 },
    craftMs: 4 * HOUR,
    maxLevel: 3,
    unlock: "heart",
    effect: { kind: "tier", tier: "machine", perLevel: CORE_PER_LEVEL },
  },
  "heartstone-ember": {
    id: "heartstone-ember",
    name: "Heartstone ember",
    stones: 2_000_000,
    materials: { heartstone: 4 },
    craftMs: 10 * MINUTE,
    unlock: "heart",
    effect: { kind: "ember", bonus: EMBER_BONUS, durationMs: EMBER_MS },
  },
};

export const RECIPES: readonly Recipe[] = RECIPE_IDS.map((id) => BY_ID[id]);

const GRANITE_FROM = LAYERS[1].from;
const CRYSTAL_FROM = LAYERS[2].from;
const HEART_FROM = LAYERS[3].from;

export type Bench = {
  readonly recipe: RecipeId;
  readonly startedAt: number;
  readonly endsAt: number;
};

export type Crafted = Readonly<Partial<Record<RecipeId, number>>>;

export type RecipeCost = {
  readonly stones: number;
  readonly materials: Materials;
};

/** The workshop opens on the first Granite stone, beside the Shield. */
export function workshopUnlocked(mountain: {
  readonly remaining: number;
}): boolean {
  return minedOut(mountain) >= GRANITE_FROM;
}

function knownWhen(unlock: Unlock, mined: number): boolean {
  switch (unlock) {
    case "start":
      return true;
    case "granite":
      return mined >= GRANITE_FROM;
    case "crystal":
      return mined >= CRYSTAL_FROM;
    case "heart":
      return mined >= HEART_FROM;
    case "found":
      return false;
  }
}

/**
 * Starting three, plus the Granite sink once that band is reached, plus each
 * layer recipe for a band already reached. The lamp and the kit are found,
 * not granted.
 */
export function recipesForMined(mined: number): readonly RecipeId[] {
  const reached = Math.max(0, mined);
  return RECIPES.filter((recipe) => knownWhen(recipe.unlock, reached)).map(
    (recipe) => recipe.id,
  );
}

export function isRecipeId(value: unknown): value is RecipeId {
  return typeof value === "string" && RECIPE_IDS.some((id) => id === value);
}

function isWhole(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function recipeById(id: RecipeId): Recipe {
  return BY_ID[id];
}

export function recipeStrengthId(id: RecipeId): string {
  return `recipe.${id}.strength`;
}

export function recipeCostId(id: RecipeId): string {
  return `recipe.${id}.cost`;
}

function scaledCount(base: number, scale: number): number {
  if (base === 0) {
    return 0;
  }
  return Math.ceil(Number((base * scale).toPrecision(12)));
}

/** Stones and materials a craft spends right now. The cost factor defaults to 1. */
export function recipeCost(id: RecipeId): RecipeCost {
  const recipe = recipeById(id);
  const scale = factor(recipeCostId(id));
  return {
    stones: scaledCount(recipe.stones, scale),
    materials: {
      clay: scaledCount(recipe.materials.clay ?? 0, scale),
      iron: scaledCount(recipe.materials.iron ?? 0, scale),
      crystal: scaledCount(recipe.materials.crystal ?? 0, scale),
      heartstone: scaledCount(recipe.materials.heartstone ?? 0, scale),
    },
  };
}

export function craftedLevel(
  mountain: { readonly crafted?: Crafted },
  id: RecipeId,
): number {
  return mountain.crafted?.[id] ?? 0;
}

function effectLevel(
  recipe: Recipe,
  mountain: { readonly crafted?: Crafted },
): number {
  const level = craftedLevel(mountain, recipe.id);
  return Math.min(level, recipe.maxLevel ?? MAX_CRAFTED_LEVEL);
}

function strengthOf(id: RecipeId): number {
  return factor(recipeStrengthId(id));
}

/** First-cut number times this recipe's strength factor. 1 leaves it alone. */
function tuned(base: number, id: RecipeId): number {
  return base * strengthOf(id);
}

function materialsOf(mountain: Mountain): Materials {
  return mountain.materials ?? EMPTY_MATERIALS;
}

function canAfford(have: Materials, cost: Materials): boolean {
  return (
    have.clay >= cost.clay &&
    have.iron >= cost.iron &&
    have.crystal >= cost.crystal &&
    have.heartstone >= cost.heartstone
  );
}

function spendMaterials(have: Materials, cost: Materials): Materials {
  return {
    clay: have.clay - cost.clay,
    iron: have.iron - cost.iron,
    crystal: have.crystal - cost.crystal,
    heartstone: have.heartstone - cost.heartstone,
  };
}

function atCap(recipe: Recipe, mountain: Mountain): boolean {
  const level = craftedLevel(mountain, recipe.id);
  if (level >= MAX_CRAFTED_LEVEL) {
    return true;
  }
  return recipe.maxLevel !== undefined && level >= recipe.maxLevel;
}

/**
 * Puts one craft on the bench and spends the cost. The same mountain comes
 * back when the workshop is locked, the recipe is unknown, the bench is
 * taken, the gear is finished, or the pocket is short.
 */
export function startCraft(
  mountain: Mountain,
  id: RecipeId,
  now: number,
): Mountain {
  if (!workshopUnlocked(mountain) || !isWhole(now)) {
    return mountain;
  }
  if (
    !(mountain.recipes?.includes(id) ?? false) ||
    mountain.bench !== undefined
  ) {
    return mountain;
  }
  const recipe = recipeById(id);
  if (atCap(recipe, mountain)) {
    return mountain;
  }
  const cost = recipeCost(id);
  const have = materialsOf(mountain);
  if (mountain.pocket < cost.stones || !canAfford(have, cost.materials)) {
    return mountain;
  }
  return {
    ...mountain,
    pocket: mountain.pocket - cost.stones,
    materials: spendMaterials(have, cost.materials),
    bench: {
      recipe: id,
      startedAt: now,
      endsAt: now + recipe.craftMs,
    },
  };
}

function dropBench(mountain: Mountain): Mountain {
  const rest = { ...mountain };
  Reflect.deleteProperty(rest, "bench");
  return rest;
}

/**
 * A craft whose clock has rung is fitted once: the bench clears and the
 * level goes up. Calling it again, after a reload, does not fit it twice.
 * A charge's twenty minutes start when the craft finished, and a later
 * charge adds another twenty after that window. A flare or an ember
 * replaces its clock; crafting it again does not multiply the effect.
 */
export function settleBench(mountain: Mountain, now: number): Mountain {
  const bench = mountain.bench;
  if (bench === undefined || now < bench.endsAt) {
    return mountain;
  }
  const recipe = recipeById(bench.recipe);
  const level = effectLevel(recipe, {
    crafted: {
      ...mountain.crafted,
      [recipe.id]: craftedLevel(mountain, recipe.id) + 1,
    },
  });
  const fitted = dropBench({
    ...mountain,
    crafted: { ...mountain.crafted, [recipe.id]: level },
  });
  if (recipe.effect.kind === "charge") {
    const previous = mountain.chargeUntil ?? bench.endsAt;
    const from = previous > bench.endsAt ? previous : bench.endsAt;
    return { ...fitted, chargeUntil: from + recipe.effect.durationMs };
  }
  if (recipe.effect.kind === "flare") {
    return {
      ...fitted,
      flareUntil:
        bench.endsAt + Math.round(tuned(recipe.effect.durationMs, recipe.id)),
    };
  }
  if (recipe.effect.kind === "ember") {
    return {
      ...fitted,
      emberUntil:
        bench.endsAt + Math.round(tuned(recipe.effect.durationMs, recipe.id)),
    };
  }
  return fitted;
}

/**
 * Takes the craft off the bench and returns every stone and material it
 * spent. A craft that has already finished is fitted instead, so a late
 * tap cannot both refund the pocket and keep the gear.
 */
export function cancelCraft(mountain: Mountain, now: number): Mountain {
  const bench = mountain.bench;
  if (bench === undefined) {
    return mountain;
  }
  if (now >= bench.endsAt) {
    return settleBench(mountain, now);
  }
  const cost = recipeCost(bench.recipe);
  return {
    ...dropBench(mountain),
    pocket: mountain.pocket + cost.stones,
    materials: addMaterials(materialsOf(mountain), cost.materials),
  };
}

function leveled(perLevel: number, level: number, strength: number): number {
  if (level <= 0) {
    return 1;
  }
  return (1 + perLevel * strength) ** level;
}

/** The next tier after the highest machine already running, or none yet. */
function reinforceTarget(mountain: Mountain): TierId | undefined {
  if (mountain.machines > 0 || mountain.borers > 0) {
    return "machine";
  }
  if (mountain.drills > 0) {
    return "borer";
  }
  if (mountain.carts > 0) {
    return "drill";
  }
  return undefined;
}

/** Carts, drills, borers, or the Great Machine, from fitted gear. 1 when none. */
export function gearMultiplier(mountain: Mountain, tierId: TierId): number {
  let scale = 1;
  for (const recipe of RECIPES) {
    if (recipe.effect.kind !== "tier" || recipe.effect.tier !== tierId) {
      continue;
    }
    scale *= leveled(
      recipe.effect.perLevel,
      effectLevel(recipe, mountain),
      strengthOf(recipe.id),
    );
  }
  const reinforce = recipeById("reinforce");
  const levels = effectLevel(reinforce, mountain);
  if (levels > 0 && reinforceTarget(mountain) === tierId) {
    scale *= leveled(tuned(REINFORCE_PER_LEVEL, "reinforce"), levels, 1);
  }
  return scale;
}

/** How much longer the gap between troubles is. 1 without sturdy props. */
export function troubleGapScale(mountain: {
  readonly crafted?: Crafted;
}): number {
  let scale = 1;
  for (const recipe of RECIPES) {
    if (recipe.effect.kind !== "trouble") {
      continue;
    }
    const level = effectLevel(recipe, mountain);
    if (level <= 0) {
      continue;
    }
    const rarer = Math.min(0.95, recipe.effect.rarer * strengthOf(recipe.id));
    scale *= 1 / (1 - rarer);
  }
  return scale;
}

/**
 * How much more often a golden vein shows. 1 until a lamp is fitted.
 * A hot crystal flare multiplies that while `now` is inside its hour.
 * Leave `now` out, as away pay does, and the flare stays dark.
 */
export function veinOftenScale(
  mountain: { readonly crafted?: Crafted; readonly flareUntil?: number },
  now?: number,
): number {
  let scale = 1;
  for (const recipe of RECIPES) {
    if (recipe.effect.kind !== "veins") {
      continue;
    }
    const level = effectLevel(recipe, mountain);
    if (level <= 0) {
      continue;
    }
    scale *= leveled(recipe.effect.often, level, strengthOf(recipe.id));
  }
  if (
    now !== undefined &&
    mountain.flareUntil !== undefined &&
    mountain.flareUntil > now
  ) {
    scale *= 1 + tuned(FLARE_OFTEN, "crystal-flare");
  }
  return scale;
}

/**
 * Great Machine multiplier while a heartstone ember is hot. 1 with no `now`,
 * so away pay never sees it. Crafting another ember refreshes this, and the
 * crafted count does not multiply it.
 */
export function emberMachineMultiplier(
  mountain: { readonly emberUntil?: number },
  now?: number,
): number {
  if (
    now === undefined ||
    mountain.emberUntil === undefined ||
    mountain.emberUntil <= now
  ) {
    return 1;
  }
  return 1 + tuned(EMBER_BONUS, "heartstone-ember");
}

/** How much of the tunnel time is left. 1 without the engineer's kit. */
export function expeditionCraftScale(mountain: {
  readonly crafted?: Crafted;
}): number {
  let scale = 1;
  for (const recipe of RECIPES) {
    if (recipe.effect.kind !== "trip") {
      continue;
    }
    const level = effectLevel(recipe, mountain);
    if (level <= 0) {
      continue;
    }
    const shorter = Math.min(
      0.9,
      recipe.effect.shorter * strengthOf(recipe.id),
    );
    scale *= 1 - shorter;
  }
  return scale;
}

/**
 * Crew multiplier while a blasting charge is still hot. Away pay passes no
 * `now`, so a charge never doubles stones earned while the app was closed.
 */
export function chargeCrewMultiplier(
  mountain: Mountain,
  now: number | undefined,
): number {
  if (
    now === undefined ||
    mountain.chargeUntil === undefined ||
    mountain.chargeUntil <= now
  ) {
    return 1;
  }
  return 1 + (CHARGE_MULTIPLIER - 1) * strengthOf("blasting-charge");
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
    if (!isRecipeId(key)) {
      continue;
    }
    if (!isWhole(level) || level > MAX_CRAFTED_LEVEL) {
      return undefined;
    }
    parsed[key] = level;
  }
  return parsed;
}

/**
 * Found recipes, in the order they were saved. An id this client does not
 * know, and a duplicate, are dropped so a newer recipe cannot lock the save.
 */
export function parseRecipes(value: unknown): readonly RecipeId[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed: RecipeId[] = [];
  for (const item of value) {
    if (!isRecipeId(item) || parsed.includes(item)) {
      continue;
    }
    parsed.push(item);
  }
  return parsed;
}

/** When the blasting charge cools. Missing means none is hot. */
export function parseChargeUntil(value: unknown): number | undefined {
  return isWhole(value) ? value : undefined;
}
