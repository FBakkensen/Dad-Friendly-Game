import { stretch } from "./scale";
import { tierLocked } from "./crew";
import type { Mountain } from "./mountain";
import { TIERS, owned, tierCost, tierShown } from "./tiers";
import { RECIPES, startCraft } from "./workshop";

/**
 * The gold glow on a bottom-bar button: its sheet holds something he can
 * buy right now. Separate from the red "new" dot; both can show. Only a
 * box-shadow, so turning it on or off never moves the bar. It names no
 * price and no wait.
 */
export function setAffordGlow(button: HTMLElement, on: boolean): void {
  button.classList.toggle("afford-glow", on);
}

/** Buys: a shown, unlocked tier the pocket covers. */
export function canBuyAnyTier(mountain: Mountain): boolean {
  return TIERS.some(
    (tier) =>
      tierShown(mountain, tier) &&
      !tierLocked(mountain, tier) &&
      mountain.pocket >= tierCost(tier, owned(mountain, tier), stretch(mountain)),
  );
}

/** Workshop: the bench is free and one craft could start now. */
export function canCraftNow(mountain: Mountain, now: number): boolean {
  return RECIPES.some(
    (recipe) => startCraft(mountain, recipe.id, now) !== mountain,
  );
}
