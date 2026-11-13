import type { Mountain } from "./mountain";
import { GOLD_RUSH_NAME } from "./crew-boost";
import { rushLeft } from "./gold-rush";
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

type CraftId = (typeof CRAFT_IDS)[number];

const INACTIVE_CHIP: EffectLabel = {
  short: "",
  full: "",
  leftMs: 0,
  active: false,
};

/** The flare recipe's effect is always a flare, so it is narrowed once here. */
function flareOften(): number {
  const effect = recipeById("crystal-flare").effect;
  return (effect as Extract<typeof effect, { kind: "flare" }>).often;
}

function craftMultiplier(mountain: Mountain, id: CraftId, at: number): number {
  switch (id) {
    case "blasting-charge":
      return chargeCrewMultiplier(mountain, at);
    case "axle-grease":
      return axleCrewMultiplier(mountain, at);
    case "heartstone-ember":
      return emberMachineMultiplier(mountain, at);
    case "crystal-flare":
      return 1 + flareOften();
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
  readonly crafts: Readonly<Record<CraftId, EffectLabel>>;
  readonly bench: EffectLabel;
} {
  const hot = hotTimers(mountain, at);
  const craftLabel = (id: CraftId): EffectLabel => {
    const timer = hot.find((item) => item.id === id);
    if (timer === undefined) {
      return INACTIVE_CHIP;
    }
    const recipe = recipeById(id);
    return {
      short: shortEffectName(recipe.name),
      full: recipe.name,
      multiplier: craftMultiplier(mountain, id, at),
      leftMs: timer.until - at,
      active: true,
    };
  };
  const crafts = {
    "blasting-charge": craftLabel("blasting-charge"),
    "axle-grease": craftLabel("axle-grease"),
    "crystal-flare": craftLabel("crystal-flare"),
    "heartstone-ember": craftLabel("heartstone-ember"),
  };
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

/** The Gold rush's chip in Running now (#468): its clock. It pays held stones, so no × (#525). */
export function rushLabel(mountain: Mountain, at: number): EffectLabel {
  const left = rushLeft(mountain, at);
  return left === 0
    ? INACTIVE_CHIP
    : {
        short: GOLD_RUSH_NAME,
        full: GOLD_RUSH_NAME,
        leftMs: left,
        active: true,
      };
}
