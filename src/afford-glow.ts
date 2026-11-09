import type { Mountain } from "./mountain";
import { RECIPES, startCraft } from "./workshop";

/** Workshop: the bench is free and one craft could start now. The key rail lights its cap. */
export function canCraftNow(mountain: Mountain, now: number): boolean {
  return RECIPES.some(
    (recipe) => startCraft(mountain, recipe.id, now) !== mountain,
  );
}
