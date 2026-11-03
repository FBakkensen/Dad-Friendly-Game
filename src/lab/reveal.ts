import { BOOSTS } from "../boosts";
import { LAYERS, type MaterialId } from "../layers";
import type { Mountain } from "../mountain";
import { owned, tierShown, TIERS } from "../tiers";
import { UPGRADES, upgradeLevel } from "../upgrades";
import { boostShown, upgradeShown } from "../upgrade-reveal";
import {
  craftedLevel,
  recipeCost,
  recipeOpen,
  workshopUnlocked,
  type RecipeId,
} from "../workshop";
import { HOUR_MS, MS_PER_SECOND } from "./targets";

/**
 * When a thing first shows on screen and when the dad first uses it.
 * Ids read `kind:id`, e.g. `upgrade:boots` or `system:workshop`.
 * `liveSec` counts live play only, so a night away adds nothing.
 */
export type RevealEvent = {
  readonly kind: "appeared" | "firstUse";
  readonly id: string;
  readonly liveSec: number;
  /** Sittings started before this one. The tournament stamps it. */
  readonly sitting?: number;
  /** Stones mined at this moment. The tournament stamps it. */
  readonly mined?: number;
};

/** One thing's wait, from showing up to its first use, in live hours. */
export type RevealGap = {
  readonly id: string;
  readonly hours: number;
};

const SECONDS_PER_HOUR = HOUR_MS / MS_PER_SECOND;

function knownRecipes(mountain: Mountain): readonly RecipeId[] {
  return (mountain.recipes ?? []).filter((id) => recipeOpen(mountain, id));
}

/** The pocket and the materials cover one craft of this recipe. */
function recipeAffordable(mountain: Mountain, id: RecipeId): boolean {
  const cost = recipeCost(id);
  const have = mountain.materials;
  return (
    mountain.pocket >= cost.stones &&
    have !== undefined &&
    have.clay >= cost.materials.clay &&
    have.iron >= cost.materials.iron &&
    have.crystal >= cost.materials.crystal &&
    have.heartstone >= cost.materials.heartstone
  );
}

/** A known recipe that spends this material is affordable right now. */
function materialAffordable(mountain: Mountain, material: MaterialId): boolean {
  return knownRecipes(mountain).some(
    (id) =>
      recipeCost(id).materials[material] > 0 && recipeAffordable(mountain, id),
  );
}

function materialUsed(mountain: Mountain, material: MaterialId): boolean {
  const bench = mountain.bench?.recipe;
  return knownRecipes(mountain).some(
    (id) =>
      recipeCost(id).materials[material] > 0 &&
      (craftedLevel(mountain, id) > 0 || bench === id),
  );
}

function anyCraft(mountain: Mountain): boolean {
  return (
    mountain.bench !== undefined ||
    Object.values(mountain.crafted ?? {}).some((level) => level > 0)
  );
}

type Watch = {
  readonly id: string;
  /**
   * On screen for buys and systems. Recipes and materials count from the
   * moment one craft is affordable: a discovery or an honest material wait
   * is not a reveal the dad could act on.
   */
  readonly shown: (mountain: Mountain) => boolean;
  readonly used: (mountain: Mountain) => boolean;
};

/** Everything the lab watches: buys, boosts, recipes, materials, systems. */
const WATCHES: readonly Watch[] = [
  ...TIERS.map((tier) => ({
    id: `tier:${tier.id}`,
    shown: (mountain: Mountain) => tierShown(mountain, tier),
    used: (mountain: Mountain) => owned(mountain, tier) > 0,
  })),
  ...UPGRADES.map((upgrade) => ({
    id: `upgrade:${upgrade.id}`,
    // The row shows once nearly affordable (#245).
    shown: (mountain: Mountain) => upgradeShown(mountain, upgrade),
    used: (mountain: Mountain) => upgradeLevel(mountain, upgrade.id) > 0,
  })),
  ...BOOSTS.map((boost) => ({
    id: `boost:${boost.id}`,
    shown: (mountain: Mountain) => boostShown(mountain, boost),
    used: (mountain: Mountain) => mountain.boosts?.[boost.id] !== undefined,
  })),
  ...LAYERS.map((layer) => ({
    id: `material:${layer.material}`,
    shown: (mountain: Mountain) => materialAffordable(mountain, layer.material),
    used: (mountain: Mountain) => materialUsed(mountain, layer.material),
  })),
  {
    id: "system:workshop",
    shown: (mountain: Mountain) => workshopUnlocked(mountain),
    used: anyCraft,
  },
  {
    id: "system:expeditions",
    shown: (mountain: Mountain) => (mountain.engineers?.length ?? 0) > 0,
    used: (mountain: Mountain) =>
      (mountain.expeditions?.length ?? 0) > 0 ||
      (mountain.engineers ?? []).some((engineer) => engineer.trips > 0),
  },
  {
    id: "system:tending",
    shown: (mountain: Mountain) => (mountain.engineers?.length ?? 0) > 0,
    used: (mountain: Mountain) =>
      (mountain.engineers ?? []).some(
        (engineer) => engineer.post !== "camp" && engineer.post !== "tunnel",
      ),
  },
  {
    id: "system:promote",
    shown: (mountain: Mountain) => (mountain.engineers?.length ?? 0) > 0,
    used: (mountain: Mountain) => (mountain.engineers?.length ?? 0) > 1,
  },
];

function recipeWatch(id: RecipeId): Watch {
  return {
    id: `recipe:${id}`,
    shown: (mountain) =>
      knownRecipes(mountain).includes(id) && recipeAffordable(mountain, id),
    used: (mountain) =>
      craftedLevel(mountain, id) > 0 || mountain.bench?.recipe === id,
  };
}

/**
 * Remembers what already appeared and what was already used, and returns
 * the new events each time it looks at the mountain. A first use with no
 * appearance before it logs both in that second, so every use has a start.
 */
export function createRevealLog(): (
  mountain: Mountain,
  liveSec: number,
) => readonly RevealEvent[] {
  const appeared = new Set<string>();
  const used = new Set<string>();
  const recipes = new Map<RecipeId, Watch>();
  return (mountain, liveSec) => {
    const events: RevealEvent[] = [];
    for (const id of knownRecipes(mountain)) {
      if (!recipes.has(id)) {
        recipes.set(id, recipeWatch(id));
      }
    }
    for (const watch of [...WATCHES, ...recipes.values()]) {
      const isUsed = !used.has(watch.id) && watch.used(mountain);
      if (!appeared.has(watch.id) && (isUsed || watch.shown(mountain))) {
        appeared.add(watch.id);
        events.push({ kind: "appeared", id: watch.id, liveSec });
      }
      if (isUsed) {
        used.add(watch.id);
        events.push({ kind: "firstUse", id: watch.id, liveSec });
      }
    }
    return events;
  };
}

/**
 * Pairs each first use with its appearance. Events from several runs can
 * be read in one list: a second appearance of an id starts a new run's wait.
 * Things that appeared and were never used are left out.
 */
export function revealGaps(
  events: readonly RevealEvent[],
): readonly RevealGap[] {
  const start = new Map<string, number>();
  const gaps: RevealGap[] = [];
  for (const event of events) {
    if (event.kind === "appeared") {
      start.set(event.id, event.liveSec);
      continue;
    }
    const from = start.get(event.id);
    if (from !== undefined) {
      gaps.push({
        id: event.id,
        hours: (event.liveSec - from) / SECONDS_PER_HOUR,
      });
      start.delete(event.id);
    }
  }
  return gaps;
}

/** Ids that appeared and were never used, in the order they appeared. */
export function neverUsed(events: readonly RevealEvent[]): readonly string[] {
  const used = new Set(
    events
      .filter((event) => event.kind === "firstUse")
      .map((event) => event.id),
  );
  const ids: string[] = [];
  for (const event of events) {
    if (
      event.kind === "appeared" &&
      !used.has(event.id) &&
      !ids.includes(event.id)
    ) {
      ids.push(event.id);
    }
  }
  return ids;
}
