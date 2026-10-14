import type { MaterialId, Materials } from "../../layers";
import { LAYERS } from "../../layers";
import type { RecipeId } from "../../workshop";
import { RECIPES, recipeCost } from "../../workshop";
import { defineMeasure, type DecisionSample } from "../measure";
import { DAY_MS } from "../targets";

const FULL_WORTH = fullWorth();

function fullWorth(): Readonly<Record<MaterialId, number>> {
  const worth = { clay: 0, iron: 0, crystal: 0, heartstone: 0 };
  for (const material of LAYERS) {
    let least = Number.POSITIVE_INFINITY;
    for (const recipe of RECIPES) {
      const cost = recipeCost(recipe.id).materials[material.material];
      if (cost > 0 && cost < least) {
        least = cost;
      }
    }
    worth[material.material] = least;
  }
  return worth;
}

function hasSink(open: readonly RecipeId[], material: MaterialId): boolean {
  for (const id of open) {
    if (recipeCost(id).materials[material] > 0) {
      return true;
    }
  }
  return false;
}

/**
 * True when some material is at least one full recipe and no open recipe
 * spends it. A busy bench still counts as a sink. The workshop has to be
 * open: clay in the topsoil is waiting for the shed, not stuck.
 */
export function materialIsIdle(sample: DecisionSample): boolean {
  if (sample.workshopOpen !== true) {
    return false;
  }
  const have = sample.materials;
  if (have === undefined) {
    return false;
  }
  const open = sample.openRecipes ?? [];
  for (const layer of LAYERS) {
    if (sittingOn(have, layer.material) && !hasSink(open, layer.material)) {
      return true;
    }
  }
  return false;
}

function sittingOn(have: Materials, material: MaterialId): boolean {
  const worth = FULL_WORTH[material];
  return Number.isFinite(worth) && have[material] >= worth;
}

/** Longest stretch a material sits with nothing to spend it on, in days. */
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
 * Longest stretch where a material sits above a full recipe and nothing
 * open spends it. Zero means every pile still has a sink. Catches a
 * material with nowhere to go.
 */
export default defineMeasure({
  id: "materialIdle",
  label: "Idle materials",
  unit: "days",
  why: "A material with no recipe to spend it on piles up, and the bench cannot help.",
  aggregate: (samples) => longestMaterialIdleDays(samples),
});
