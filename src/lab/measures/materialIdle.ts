import type { MaterialId, Materials } from "../../layers";
import { LAYERS } from "../../layers";
import type { CraftRule } from "../policy";
import type { Crafted, RecipeId } from "../../workshop";
import { recipeById, recipeCost } from "../../workshop";
import { defineMeasure, type DecisionSample } from "../measure";
import { DAY_MS } from "../targets";

/**
 * Repeatable sinks are unlimited only when this dad actually uses them:
 * the habit commits (always, or charges for a blasting charge), or a level
 * is already fitted. Otherwise the recipe does not eat the pile. Iron
 * temper is the repeatable iron sink: one craft opens it, and another
 * does not stack the lift.
 */
export function unlimitedSinks(
  craft: CraftRule | undefined,
  crafted: Crafted | undefined,
): readonly RecipeId[] {
  const ids: RecipeId[] = [];
  for (const id of [
    "blasting-charge",
    "iron-temper",
    "crystal-flare",
    "heartstone-ember",
  ] as const) {
    const used = (crafted?.[id] ?? 0) > 0;
    const commits =
      craft === "always" || (craft === "charges" && id === "blasting-charge");
    if (used || commits) {
      ids.push(id);
    }
  }
  return ids;
}

function levelsLeft(
  id: RecipeId,
  crafted: Crafted,
  unlimited: ReadonlySet<string>,
): number {
  const recipe = recipeById(id);
  if (recipe.maxLevel === undefined) {
    return unlimited.has(id) ? Number.POSITIVE_INFINITY : 0;
  }
  const done = crafted[id] ?? 0;
  return recipe.maxLevel > done ? recipe.maxLevel - done : 0;
}

/** Stones of this material every still-open recipe can still take. */
export function materialDemand(
  material: MaterialId,
  known: readonly RecipeId[],
  crafted: Crafted,
  unlimited: readonly RecipeId[],
): number {
  const open = new Set(unlimited);
  let total = 0;
  for (const id of known) {
    const cost = recipeCost(id).materials[material];
    if (!(cost > 0)) {
      continue;
    }
    const left = levelsLeft(id, crafted, open);
    if (!Number.isFinite(left)) {
      return Number.POSITIVE_INFINITY;
    }
    total += cost * left;
  }
  return total;
}

/**
 * True when a material in hand is more than every open recipe can still
 * use. An unfinished recipe counts for the levels left, not as a sink
 * that hides the whole pile. The workshop has to be open.
 */
export function materialIsIdle(sample: DecisionSample): boolean {
  if (sample.workshopOpen !== true) {
    return false;
  }
  const have = sample.materials;
  if (have === undefined) {
    return false;
  }
  const known = sample.knownRecipes ?? [];
  const crafted = sample.crafted ?? {};
  const unlimited = sample.unlimitedSinks ?? [];
  for (const layer of LAYERS) {
    if (overDemand(have, layer.material, known, crafted, unlimited)) {
      return true;
    }
  }
  return false;
}

function overDemand(
  have: Materials,
  material: MaterialId,
  known: readonly RecipeId[],
  crafted: Crafted,
  unlimited: readonly RecipeId[],
): boolean {
  return have[material] > materialDemand(material, known, crafted, unlimited);
}

/** Longest stretch a material sits above what the open recipes can use, in days. */
export function longestMaterialIdleDays(
  samples: readonly DecisionSample[],
): number {
  const ordered = [...samples].sort((left, right) => left.atMs - right.atMs);
  let start: number | undefined;
  let worst = 0;
  const close = (from: number, to: number) => {
    const days = (to - from) / DAY_MS;
    if (days > worst) {
      worst = days;
    }
  };
  for (const sample of ordered) {
    if (materialIsIdle(sample)) {
      if (start === undefined) {
        start = sample.atMs;
      }
      continue;
    }
    if (start !== undefined) {
      close(start, sample.atMs);
      start = undefined;
    }
  }
  const last = ordered[ordered.length - 1];
  if (start !== undefined && last !== undefined) {
    close(start, last.atMs);
  }
  return worst;
}

/**
 * Longest stretch where a material outgrows every recipe that can still
 * take it. Zero means the open recipes can absorb what is in hand.
 */
export default defineMeasure({
  id: "materialIdle",
  label: "Idle materials",
  unit: "days",
  why: "A pile bigger than the open recipes can use has nowhere to go.",
  aggregate: (samples) => longestMaterialIdleDays(samples),
});
