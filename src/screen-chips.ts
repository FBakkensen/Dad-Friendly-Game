import type { Mountain } from "./mountain";
import { shortEffectName, type EffectLabel } from "./effect-row";
import {
  axleCrewMultiplier,
  chargeCrewMultiplier,
  emberMachineMultiplier,
  hotTimers,
  isRecipeId,
  recipeById,
  type RecipeId,
} from "./workshop";

/** The crafts that get a chip of their own, in the order the row shows them. */
export const CRAFT_IDS = [
  "blasting-charge",
  "axle-grease",
  "crystal-flare",
  "heartstone-ember",
] as const satisfies readonly RecipeId[];

export type CraftId = (typeof CRAFT_IDS)[number];

export const INACTIVE_CHIP: EffectLabel = {
  short: "",
  full: "",
  leftMs: 0,
  active: false,
};

function craftMultiplier(mountain: Mountain, id: CraftId, at: number): number {
  switch (id) {
    case "blasting-charge":
      return chargeCrewMultiplier(mountain, at);
    case "axle-grease":
      return axleCrewMultiplier(mountain, at);
    case "heartstone-ember":
      return emberMachineMultiplier(mountain, at);
    case "crystal-flare": {
      const effect = recipeById(id).effect;
      return effect.kind === "flare" ? 1 + effect.often : 1;
    }
  }
}

/**
 * What each craft chip and the bench chip say at `at`. Decided from the
 * mountain, so the Running list never has to read the chips back from the page.
 */
export function runningLabels(
  mountain: Mountain,
  at: number,
): {
  readonly crafts: ReadonlyMap<RecipeId, EffectLabel>;
  readonly bench: EffectLabel;
} {
  const hot = hotTimers(mountain, at);
  const crafts = new Map<RecipeId, EffectLabel>();
  for (const id of CRAFT_IDS) {
    const timer = hot.find((item) => item.id === id);
    if (timer === undefined) {
      crafts.set(id, INACTIVE_CHIP);
      continue;
    }
    const recipe = recipeById(id);
    crafts.set(id, {
      short: shortEffectName(recipe.name),
      full: recipe.name,
      multiplier: craftMultiplier(mountain, id, at),
      leftMs: timer.until - at,
      active: true,
    });
  }
  const bench = mountain.bench;
  // A bench that is also a hot timer already shows as that craft's chip.
  const benchIsTimer =
    bench !== undefined && hot.some((item) => item.id === bench.recipe);
  if (
    bench === undefined ||
    !isRecipeId(bench.recipe) ||
    at >= bench.endsAt ||
    benchIsTimer
  ) {
    return { crafts, bench: INACTIVE_CHIP };
  }
  const recipe = recipeById(bench.recipe);
  return {
    crafts,
    bench: {
      short: shortEffectName(recipe.name),
      full: recipe.name,
      leftMs: bench.endsAt - at,
      active: true,
    },
  };
}
