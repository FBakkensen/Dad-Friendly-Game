import { factor } from "./economy/factors";
import {
  EMPTY_MATERIALS,
  LAYERS,
  MATERIAL_EVERY,
  addMaterials,
  type LayerId,
  type MaterialId,
  type Materials,
} from "./layers";
import type { Mountain } from "./mountain";
import { minedOut, stretch } from "./scale";
import type { TierId } from "./tiers";

/**
 * Workshop rules (M9). One bench, a clock that runs while the app is closed,
 * and gear the crew can feel. The sheet is `workshop-panel`. Strength and
 * cost factors default to 1.
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
const CORE_PER_LEVEL = 0.1;
const PROPS_RARER = 0.3;
const LAMP_OFTEN = 0.25;
const KIT_SHORTER = 0.2;
const CHARGE_MULTIPLIER = 2;
/** Clay in one Blasting charge, and so the clay that opens the Topsoil bench. */
const CHARGE_CLAY = 4;
const REINFORCE_PER_LEVEL = 0.05;
const REINFORCE_CAP = 5;
/**
 * Whole crew ×2 while axle grease is hot. Live only, and it does not
 * stack: another craft refreshes the clock.
 */
const AXLE_BONUS = 1;
export const AXLE_MS = 20 * MINUTE;
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
  "axle-grease",
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
  | { readonly kind: "reinforce"; readonly perLevel: number }
  | {
      readonly kind: "axle";
      readonly bonus: number;
      readonly durationMs: number;
    };

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
 * Tuned costs, times, and effects. Each effect is multiplied by
 * `recipe.<id>.strength`. A timed buff's length uses that same factor, and
 * the buff starts when the craft goes on the bench, so a ten-minute sitting
 * feels it before the dad walks away. Reinforce stops at 5. Axle grease
 * is a live crew timer: crafting it again refreshes the clock and does not
 * stack. Crystal flare and the heartstone ember work the same way. Axle
 * grease and a blasting charge do not multiply with each other or with
 * Overtime; `effectiveRates` keeps the strongest crew timer. None of those
 * timers change away pay.
 */
const BY_ID: Readonly<Record<RecipeId, Recipe>> = {
  "iron-rails": {
    id: "iron-rails",
    name: "Iron rails",
    stones: 500_000,
    materials: { iron: 4 },
    craftMs: 10 * MINUTE,
    maxLevel: 2,
    unlock: "start",
    effect: { kind: "tier", tier: "cart", perLevel: RAILS_PER_LEVEL },
  },
  "sturdy-props": {
    id: "sturdy-props",
    name: "Sturdy props",
    stones: 250_000,
    materials: { clay: 10, iron: 4 },
    craftMs: 10 * MINUTE,
    maxLevel: 1,
    unlock: "start",
    effect: { kind: "trouble", rarer: PROPS_RARER },
  },
  "blasting-charge": {
    id: "blasting-charge",
    name: "Blasting charge",
    stones: 100_000,
    materials: { clay: CHARGE_CLAY },
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
    materials: { iron: 5 },
    craftMs: 10 * MINUTE,
    unlock: "granite",
    maxLevel: REINFORCE_CAP,
    effect: { kind: "reinforce", perLevel: REINFORCE_PER_LEVEL },
  },
  "axle-grease": {
    id: "axle-grease",
    name: "Axle grease",
    stones: 0,
    materials: { iron: 1 },
    craftMs: 10 * MINUTE,
    unlock: "granite",
    effect: { kind: "axle", bonus: AXLE_BONUS, durationMs: AXLE_MS },
  },
  "diamond-bits": {
    id: "diamond-bits",
    name: "Diamond bits",
    stones: 2_000_000,
    materials: { crystal: 5 },
    craftMs: 10 * MINUTE,
    maxLevel: 3,
    unlock: "crystal",
    effect: { kind: "tier", tier: "drill", perLevel: BITS_PER_LEVEL },
  },
  "crystal-flare": {
    id: "crystal-flare",
    name: "Crystal flare",
    stones: 200_000,
    materials: { crystal: 4 },
    craftMs: 10 * MINUTE,
    unlock: "crystal",
    effect: { kind: "flare", often: FLARE_OFTEN, durationMs: FLARE_MS },
  },
  "crystal-lamp": {
    id: "crystal-lamp",
    name: "Miner's crystal lamp",
    stones: 0,
    materials: { crystal: 6, iron: 4 },
    craftMs: HOUR,
    maxLevel: 1,
    unlock: "found",
    effect: { kind: "veins", often: LAMP_OFTEN },
  },
  "engineers-kit": {
    id: "engineers-kit",
    name: "Engineer's kit",
    stones: 0,
    materials: { iron: 4, crystal: 4 },
    craftMs: 4 * HOUR,
    maxLevel: 1,
    unlock: "found",
    effect: { kind: "trip", shorter: KIT_SHORTER },
  },
  "heartstone-core": {
    id: "heartstone-core",
    name: "Heartstone core",
    stones: 5_000_000,
    materials: { heartstone: 4 },
    craftMs: HOUR,
    maxLevel: 3,
    unlock: "heart",
    effect: { kind: "tier", tier: "machine", perLevel: CORE_PER_LEVEL },
  },
  "heartstone-ember": {
    id: "heartstone-ember",
    name: "Heartstone ember",
    stones: 500_000,
    materials: { heartstone: 2 },
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

export type Crafted = Readonly<Record<RecipeId, number>>;

export const NOTHING_CRAFTED: Crafted = Object.fromEntries(
  RECIPE_IDS.map((id) => [id, 0]),
) as Record<RecipeId, number>;

export type RecipeCost = {
  readonly stones: number;
  readonly materials: Materials;
};

/**
 * Clay-only recipes work in the Topsoil (D1, #244): the bench opens once the
 * Topsoil has dug the clay for one Blasting charge. Everything that needs a
 * deeper material waits for the full workshop in the Granite.
 */
function clayOnly(id: RecipeId): boolean {
  const materials = recipeCost(id).materials;
  return (
    materials.iron === 0 &&
    materials.crystal === 0 &&
    materials.heartstone === 0
  );
}

/** Stones dug when the first charge's clay is in hand: 4 clay is 4M. */
export const TOPSOIL_BENCH_FROM = CHARGE_CLAY * MATERIAL_EVERY.clay;

/** The bench is open: from the first charge's clay in the Topsoil. */
export function workshopUnlocked(mountain: {
  readonly remaining: number;
}): boolean {
  return minedOut(mountain) >= TOPSOIL_BENCH_FROM;
}

/** Every recipe is open from the first Granite stone, beside the Shield. */
export function fullWorkshop(mountain: {
  readonly remaining: number;
}): boolean {
  return minedOut(mountain) >= GRANITE_FROM;
}

/** This recipe can go on the bench at this depth. */
export function recipeOpen(
  mountain: { readonly remaining: number },
  id: RecipeId,
): boolean {
  return workshopUnlocked(mountain) && (fullWorkshop(mountain) || clayOnly(id));
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

/** Recipes a break-in hands over. The Topsoil's three are known from the start. */
export function layerRecipeIds(id: LayerId): readonly RecipeId[] {
  switch (id) {
    case "topsoil":
      return [];
    case "granite":
      return ["reinforce", "axle-grease"];
    case "crystal":
      return ["diamond-bits", "crystal-flare"];
    case "heart":
      return ["heartstone-core", "heartstone-ember"];
    /* v8 ignore next 3 -- layer ids are the closed list */
    default: {
      const never: never = id;
      return never;
    }
  }
}

/**
 * Adds recipes the dad did not already have. The same mountain comes back
 * when every id is already known.
 */
export function grantRecipes(
  mountain: Mountain,
  ids: readonly RecipeId[],
): { readonly mountain: Mountain; readonly found: readonly RecipeId[] } {
  const known = mountain.recipes;
  const found = ids.filter((id) => !known.includes(id));
  if (found.length === 0) {
    return { mountain, found };
  }
  return {
    mountain: { ...mountain, recipes: [...known, ...found] },
    found,
  };
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

/**
 * Stones and materials a craft spends right now. The cost factor defaults to 1.
 * `k` is the run's stretch (M13): only the stone price grows with the mountain;
 * materials stay the same count.
 */
export function recipeCost(id: RecipeId, k = 1): RecipeCost {
  const recipe = recipeById(id);
  const scale = factor(recipeCostId(id));
  return {
    stones: scaledCount(recipe.stones, scale * k),
    materials: {
      clay: scaledCount(recipe.materials.clay ?? 0, scale),
      iron: scaledCount(recipe.materials.iron ?? 0, scale),
      crystal: scaledCount(recipe.materials.crystal ?? 0, scale),
      heartstone: scaledCount(recipe.materials.heartstone ?? 0, scale),
    },
  };
}

export function craftedLevel(
  mountain: Pick<Mountain, "crafted">,
  id: RecipeId,
): number {
  return mountain.crafted[id];
}

function effectLevel(
  recipe: Recipe,
  mountain: Pick<Mountain, "crafted">,
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
  return mountain.materials;
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
  if (!recipeOpen(mountain, id) || !isWhole(now)) {
    return mountain;
  }
  if (!mountain.recipes.includes(id) || mountain.bench !== undefined) {
    return mountain;
  }
  const recipe = recipeById(id);
  if (atCap(recipe, mountain)) {
    return mountain;
  }
  const cost = recipeCost(id, stretch(mountain));
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
  return { ...mountain, bench: undefined };
}

/**
 * Where a timer's window is measured from. A charge still running past the
 * new craft keeps its end and then adds another stretch. Every other timer
 * starts when the craft goes on the bench, so the sitting that started it
 * is the sitting that feels it.
 */
/** A clock still running at `now`. 0 is a cold clock, whatever the clock says. */
function hotAt(until: number, now: number): boolean {
  return until !== 0 && until > now;
}

function timerFrom(bench: Bench, previous: number, extend: boolean): number {
  if (extend && previous > bench.startedAt) {
    return previous;
  }
  return bench.startedAt;
}

/**
 * A craft whose clock has rung is fitted once: the bench clears and the
 * level goes up. Calling it again, after a reload, does not fit it twice.
 * A charge's twenty minutes are measured from when the craft started, and
 * a later charge adds another twenty after the window still running. A
 * flare or an ember replaces its clock from that same start; crafting it
 * again does not multiply the effect.
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
    const from = timerFrom(bench, mountain.clocks["blasting-charge"], true);
    return withClock(
      fitted,
      "blasting-charge",
      from + recipe.effect.durationMs,
    );
  }
  if (
    recipe.effect.kind === "flare" ||
    recipe.effect.kind === "ember" ||
    recipe.effect.kind === "axle"
  ) {
    return withClock(
      fitted,
      recipe.id as TimerId,
      bench.startedAt + Math.round(tuned(recipe.effect.durationMs, recipe.id)),
    );
  }
  return fitted;
}

/** Length of a live timer, or none when the craft is lasting gear. */
export function recipeWindowMs(id: RecipeId): number | undefined {
  return liveTimerMs(recipeById(id));
}

/** Length of a live timer, or none when the craft is lasting gear. */
function liveTimerMs(recipe: Recipe): number | undefined {
  const effect = recipe.effect;
  switch (effect.kind) {
    case "charge":
      return effect.durationMs;
    case "flare":
    case "ember":
    case "axle":
      return Math.round(tuned(effect.durationMs, recipe.id));
    default:
      return undefined;
  }
}

/** Whole units of `amount` given back for the unused share of a timer. */
function refundUnits(
  amount: number,
  unusedMs: number,
  durationMs: number,
): number {
  if (amount <= 0) {
    return 0;
  }
  return Math.floor((amount * unusedMs) / durationMs);
}

/** Stones and materials a cancel would put back. Nothing once the clock has rung. */
export type CraftRefund = {
  readonly stones: number;
  readonly materials: Materials;
};

const NO_REFUND: CraftRefund = { stones: 0, materials: EMPTY_MATERIALS };

/** What is still owed if this craft leaves the bench before it finishes. */
function owed(mountain: Mountain, bench: Bench, now: number): CraftRefund {
  const cost = recipeCost(bench.recipe, stretch(mountain));
  const duration = liveTimerMs(recipeById(bench.recipe));
  if (duration === undefined) {
    return { stones: cost.stones, materials: cost.materials };
  }
  const unusedMs = Math.max(0, duration - Math.max(0, now - bench.startedAt));
  return {
    stones: refundUnits(cost.stones, unusedMs, duration),
    materials: {
      clay: refundUnits(cost.materials.clay, unusedMs, duration),
      iron: refundUnits(cost.materials.iron, unusedMs, duration),
      crystal: refundUnits(cost.materials.crystal, unusedMs, duration),
      heartstone: refundUnits(cost.materials.heartstone, unusedMs, duration),
    },
  };
}

/**
 * What `cancelCraft` would return. Undefined when the bench is empty.
 * A finished craft is fitted instead, so the refund is nothing.
 */
export function cancelRefund(
  mountain: Mountain,
  now: number,
): CraftRefund | undefined {
  const bench = mountain.bench;
  if (bench === undefined) {
    return undefined;
  }
  if (now >= bench.endsAt) {
    return NO_REFUND;
  }
  return owed(mountain, bench, now);
}

/**
 * Takes the craft off the bench. Lasting gear comes back in full, because
 * its effect has not started. A live timer has already started, so the
 * refund is only the unused share of that window, and the effect stops.
 * A craft that has already finished is fitted instead, so a late tap cannot
 * both refund the pocket and keep the gear.
 */
export function cancelCraft(mountain: Mountain, now: number): Mountain {
  const bench = mountain.bench;
  if (bench === undefined) {
    return mountain;
  }
  if (now >= bench.endsAt) {
    return settleBench(mountain, now);
  }
  const refund = owed(mountain, bench, now);
  const cleared = dropBench(mountain);
  return {
    ...cleared,
    pocket: mountain.pocket + refund.stones,
    materials: addMaterials(materialsOf(mountain), refund.materials),
  };
}

/** Live buffs the sheet can count down. A charge, grease, flare, or ember. */
export const TIMER_IDS = [
  "blasting-charge",
  "axle-grease",
  "crystal-flare",
  "heartstone-ember",
] as const;

export type TimerId = (typeof TIMER_IDS)[number];

/** When each live timer stops (epoch ms). 0 is cold. */
export type Clocks = Readonly<Record<TimerId, number>>;

export const COLD_CLOCKS: Clocks = {
  "blasting-charge": 0,
  "axle-grease": 0,
  "crystal-flare": 0,
  "heartstone-ember": 0,
};

/** The same mountain with one live timer set to stop at `until`. */
export function withClock(
  mountain: Mountain,
  id: TimerId,
  until: number,
): Mountain {
  return { ...mountain, clocks: { ...mountain.clocks, [id]: until } };
}

export type HotTimer = {
  readonly id: TimerId;
  readonly until: number;
};

export function timerDurationMs(id: TimerId): number {
  const effect = recipeById(id).effect;
  switch (effect.kind) {
    case "charge":
      return effect.durationMs;
    case "flare":
    case "ember":
    case "axle":
      return Math.round(tuned(effect.durationMs, id));
    /* v8 ignore next 3 -- these four recipes are live timers */
    default:
      return 0;
  }
}

/**
 * Buffs that are still hot at `now`, including the minutes a timer is on
 * the bench. The later end wins when a stored clock and the bench overlap.
 */
export function hotTimers(
  mountain: Mountain,
  now: number,
): readonly HotTimer[] {
  if (!isWhole(now)) {
    return [];
  }
  const hot: HotTimer[] = [];
  for (const id of TIMER_IDS) {
    const duration = timerDurationMs(id);
    const stored = mountain.clocks[id];
    const ends: number[] = [];
    if (hotAt(stored, now)) {
      ends.push(stored);
    }
    const bench = mountain.bench;
    if (
      bench !== undefined &&
      bench.recipe === id &&
      now >= bench.startedAt &&
      now < bench.startedAt + duration
    ) {
      ends.push(bench.startedAt + duration);
    }
    const until = ends.reduce<number | undefined>(
      (later, end) => (later === undefined || end > later ? end : later),
      undefined,
    );
    if (until !== undefined) {
      hot.push({ id, until });
    }
  }
  return hot;
}

function leveled(perLevel: number, level: number, strength: number): number {
  if (level <= 0) {
    return 1;
  }
  return (1 + perLevel * strength) ** level;
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
  if (levels > 0 && reinforceTier(mountain) === tierId) {
    scale *= leveled(tuned(REINFORCE_PER_LEVEL, "reinforce"), levels, 1);
  }
  return scale;
}

/** The next tier Reinforce lifts, or none until a cart is running. */
export function reinforceTier(mountain: Mountain): TierId | undefined {
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

/** How much longer the gap between troubles is. 1 without sturdy props. */
export function troubleGapScale(mountain: Pick<Mountain, "crafted">): number {
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
 * True while this timer is on the bench and `now` is inside the window
 * that began when the craft started. Away pay passes no `now`.
 */
function benchWindow(
  mountain: Pick<Mountain, "bench">,
  id: "blasting-charge" | "crystal-flare" | "heartstone-ember" | "axle-grease",
  durationMs: number,
  now: number | undefined,
): boolean {
  const bench = mountain.bench;
  if (
    now === undefined ||
    bench === undefined ||
    bench.recipe !== id ||
    now < bench.startedAt
  ) {
    return false;
  }
  return now < bench.startedAt + durationMs;
}

/**
 * How much more often a golden vein shows. 1 until a lamp is fitted.
 * A hot crystal flare multiplies that while `now` is inside its hour,
 * including the minutes the flare is still on the bench. Leave `now` out,
 * as away pay does, and the flare stays dark.
 */
export function veinOftenScale(
  mountain: Pick<Mountain, "crafted" | "clocks" | "bench">,
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
  const flareHot =
    (now !== undefined && hotAt(mountain.clocks["crystal-flare"], now)) ||
    benchWindow(
      mountain,
      "crystal-flare",
      Math.round(tuned(FLARE_MS, "crystal-flare")),
      now,
    );
  if (flareHot) {
    scale *= 1 + tuned(FLARE_OFTEN, "crystal-flare");
  }
  return scale;
}

/**
 * Great Machine multiplier while a heartstone ember is hot, including the
 * minutes it is still on the bench. 1 with no `now`, so away pay never sees
 * it. Crafting another ember refreshes this, and the crafted count does not
 * multiply it.
 */
export function emberMachineMultiplier(
  mountain: Pick<Mountain, "clocks" | "bench">,
  now?: number,
): number {
  const hot =
    (now !== undefined && hotAt(mountain.clocks["heartstone-ember"], now)) ||
    benchWindow(
      mountain,
      "heartstone-ember",
      Math.round(tuned(EMBER_MS, "heartstone-ember")),
      now,
    );
  if (!hot) {
    return 1;
  }
  return 1 + tuned(EMBER_BONUS, "heartstone-ember");
}

/**
 * Crew multiplier while axle grease is hot, including the minutes it is
 * still on the bench. 1 with no `now`, so away pay never sees it. Crafting
 * another one refreshes the clock, and the crafted count does not multiply
 * it. Overlapping a charge or Overtime does not multiply this; the strongest
 * crew timer wins in `effectiveRates`.
 */
export function axleCrewMultiplier(
  mountain: Pick<Mountain, "clocks" | "bench">,
  now?: number,
): number {
  const hot =
    (now !== undefined && hotAt(mountain.clocks["axle-grease"], now)) ||
    benchWindow(
      mountain,
      "axle-grease",
      Math.round(tuned(AXLE_MS, "axle-grease")),
      now,
    );
  if (!hot) {
    return 1;
  }
  return 1 + tuned(AXLE_BONUS, "axle-grease");
}

/** How much of the tunnel time is left. 1 without the engineer's kit. */
export function expeditionCraftScale(
  mountain: Pick<Mountain, "crafted">,
): number {
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
 * Crew multiplier while a blasting charge is still hot, including the
 * minutes it is still on the bench. Away pay passes no `now`, so a charge
 * never doubles stones earned while the app was closed. It does not multiply
 * with axle grease or Overtime.
 */
export function chargeCrewMultiplier(
  mountain: Mountain,
  now: number | undefined,
): number {
  const hot =
    (now !== undefined && hotAt(mountain.clocks["blasting-charge"], now)) ||
    benchWindow(mountain, "blasting-charge", CHARGE_MS, now);
  if (!hot) {
    return 1;
  }
  return 1 + (CHARGE_MULTIPLIER - 1) * strengthOf("blasting-charge");
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
  const parsed: Record<RecipeId, number> = { ...NOTHING_CRAFTED };
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
