import { factor } from "./economy/factors";
import { TUNNELS } from "./expeditions";
import { formatCompact } from "./format";
import { LAYERS, EMPTY_MATERIALS, type MaterialId } from "./layers";
import { expeditionAwayMs } from "./lost-tools";
import type { Mountain } from "./mountain";
import { minedOut } from "./scale";
import { effectiveRates } from "./rates";
import {
  BENCH_BUSY_ASIDE,
  BENCH_FREE,
  CRAFT_WORD,
  UNFOUND_DEEPER,
  UNFOUND_HINT,
  WORKSHOP_FREE_ASIDE,
  benchBusyWords,
  craftPriceWords,
  craftTimeWords,
  formatCraftSpeed,
  materialCostWords,
  materialCountWords,
  needMoreWords,
  percent,
  refundBackWords,
  timerLeftWords,
} from "./screen-words";
import {
  MAX_CRAFTED_LEVEL,
  RECIPES,
  RECIPE_IDS,
  axleCrewMultiplier,
  cancelRefund,
  chargeCrewMultiplier,
  craftedLevel,
  hotTimers,
  recipeById,
  recipeCost,
  recipeStrengthId,
  recipeWindowMs,
  reinforceTier,
  troubleGapScale,
  veinOftenScale,
  type Recipe,
  type RecipeId,
} from "./workshop";

/**
 * What the Workshop sheet says. Pure: the panel paints it. Costs, times,
 * and effects are the live numbers. An unfound recipe is one dark card.
 */

const MATERIAL_ORDER = [
  "clay",
  "iron",
  "crystal",
  "heartstone",
] as const satisfies readonly MaterialId[];

/** Four cards, two columns, the shape that fits a short phone. */
const WORKSHOP_PAGE = 4;

export type MaterialChip = {
  readonly id: MaterialId;
  readonly text: string;
};

export type CostChip = {
  readonly id: MaterialId;
  readonly text: string;
};

type CraftAction =
  | { readonly kind: "craft"; readonly label: string }
  | { readonly kind: "short"; readonly label: string }
  | { readonly kind: "waiting" }
  | { readonly kind: "on-bench" };

export type RecipeCard = {
  readonly kind: "recipe";
  readonly id: RecipeId;
  readonly name: string;
  readonly effect: string;
  readonly costs: readonly CostChip[];
  readonly time: string;
  readonly action: CraftAction;
};

type HiddenCard = {
  readonly kind: "hidden";
  readonly hint: string;
};

export type WorkshopCard = RecipeCard | HiddenCard;

export type BenchView =
  | { readonly kind: "free"; readonly title: string; readonly aside: string }
  | {
      readonly kind: "busy";
      readonly title: string;
      readonly aside: string;
      readonly progress: number;
      readonly cancel: string;
      readonly recipe: RecipeId;
    };

const TIER_WORD: Readonly<
  Record<"cart" | "drill" | "borer" | "machine", string>
> = {
  cart: "Carts",
  drill: "Drills",
  borer: "Borers",
  machine: "Great Machine",
};

/** Layers already reached. A later material stays off the line. */
export function metMaterialChips(mountain: Mountain): readonly MaterialChip[] {
  const mined = minedOut(mountain);
  const have = mountain.materials ?? EMPTY_MATERIALS;
  return LAYERS.filter((layer) => mined >= layer.from).map((layer) => ({
    id: layer.material,
    text: materialCountWords(layer.material, have[layer.material]),
  }));
}

/** The first thing the pocket is short, materials before stones. */
export function craftShortfall(
  mountain: Mountain,
  id: RecipeId,
): { readonly missing: number; readonly material: string } | undefined {
  const cost = recipeCost(id);
  const have = mountain.materials ?? EMPTY_MATERIALS;
  for (const material of MATERIAL_ORDER) {
    const need = cost.materials[material];
    if (have[material] < need) {
      return { missing: need - have[material], material };
    }
  }
  if (mountain.pocket < cost.stones) {
    return { missing: cost.stones - mountain.pocket, material: "stones" };
  }
  return undefined;
}

function finished(recipe: Recipe, mountain: Mountain): boolean {
  const level = craftedLevel(mountain, recipe.id);
  if (level >= MAX_CRAFTED_LEVEL) {
    return true;
  }
  return recipe.maxLevel !== undefined && level >= recipe.maxLevel;
}

function nameLine(recipe: Recipe, level: number): string {
  if (recipe.maxLevel === undefined || recipe.maxLevel <= 1) {
    return recipe.name;
  }
  return `${recipe.name} · ${String(level + 1)} of ${String(recipe.maxLevel)}`;
}

function tierShift(
  mountain: Mountain,
  now: number,
  id: RecipeId,
  tier: "cart" | "drill" | "machine",
  next: number,
): string {
  const before = effectiveRates(mountain, now).tierSpeed[tier];
  const after = effectiveRates(
    {
      ...mountain,
      crafted: { ...mountain.crafted, [id]: next },
    },
    now,
  ).tierSpeed[tier];
  return `${TIER_WORD[tier]} ${formatCraftSpeed(before)}/s to ${formatCraftSpeed(after)}/s`;
}

function troubleLine(mountain: Mountain): string {
  const before = troubleGapScale(mountain);
  const next = craftedLevel(mountain, "sturdy-props") + 1;
  const after = troubleGapScale({
    ...mountain,
    crafted: { ...mountain.crafted, "sturdy-props": next },
  });
  if (after <= before) {
    return "Trouble stays a little further off.";
  }
  return `Trouble comes ${percent(1 - before / after)} less often.`;
}

function lampLine(mountain: Mountain, now: number, next: number): string {
  const before = veinOftenScale(mountain, now);
  const after = veinOftenScale(
    {
      ...mountain,
      crafted: { ...mountain.crafted, "crystal-lamp": next },
    },
    now,
  );
  if (after <= before) {
    return "Golden veins keep coming.";
  }
  return `Golden veins ${percent(after / before - 1)} more often.`;
}

function kitLine(mountain: Mountain): string {
  const deep = TUNNELS.find((tunnel) => tunnel.id === "deep-dark");
  const away = deep?.awayMs ?? 0;
  const next = craftedLevel(mountain, "engineers-kit") + 1;
  const before = expeditionAwayMs(away, mountain);
  const after = expeditionAwayMs(away, {
    ...mountain,
    crafted: { ...mountain.crafted, "engineers-kit": next },
  });
  return `Long trips ${craftTimeWords(before)} to ${craftTimeWords(after)}.`;
}

function crewBuffLine(
  mountain: Mountain,
  now: number,
  kind: "charge" | "axle",
  durationMs: number,
): string {
  const time = craftTimeWords(durationMs);
  const before = effectiveRates(mountain, now).exactCrewPerSecond;
  const afterMountain =
    kind === "charge"
      ? { ...mountain, chargeUntil: now + durationMs }
      : { ...mountain, axleUntil: now + durationMs };
  const after = effectiveRates(afterMountain, now).exactCrewPerSecond;
  if (after > before + 1e-9) {
    return `Crew ${formatCraftSpeed(before)}/s to ${formatCraftSpeed(after)}/s for ${time}.`;
  }
  const scale =
    kind === "charge"
      ? chargeCrewMultiplier(afterMountain, now)
      : axleCrewMultiplier(afterMountain, now);
  const mark = formatCraftSpeed(scale);
  if (before <= 0) {
    return `The crew digs at ${mark}× for ${time}.`;
  }
  return `The crew keeps digging at ${mark}× for ${time} more.`;
}

function flareLine(mountain: Mountain, now: number): string {
  const duration = recipeWindowMs("crystal-flare") ?? 0;
  const time = craftTimeWords(duration);
  const before = veinOftenScale(mountain, now);
  const after = veinOftenScale(
    { ...mountain, flareUntil: now + duration },
    now,
  );
  if (after <= before) {
    return `Veins stay lively for another ${time}.`;
  }
  return `Veins ${percent(after / before - 1)} more often for ${time}.`;
}

function emberLine(mountain: Mountain, now: number): string {
  const duration = recipeWindowMs("heartstone-ember") ?? 0;
  const time = craftTimeWords(duration);
  const before = effectiveRates(mountain, now).tierSpeed.machine;
  const after = effectiveRates({ ...mountain, emberUntil: now + duration }, now)
    .tierSpeed.machine;
  if (after <= before) {
    return `The Great Machine keeps this lift for another ${time}.`;
  }
  return `Great Machine ${formatCraftSpeed(before)}/s to ${formatCraftSpeed(after)}/s for ${time}.`;
}

function reinforceLine(mountain: Mountain, now: number): string {
  const tier = reinforceTier(mountain);
  const next = craftedLevel(mountain, "reinforce") + 1;
  if (tier !== "drill" && tier !== "borer" && tier !== "machine") {
    const effect = recipeById("reinforce").effect;
    /* v8 ignore next -- Reinforce is the reinforce effect */
    const per = effect.kind === "reinforce" ? effect.perLevel : 0;
    const lift = percent(per * factor(recipeStrengthId("reinforce")));
    return `The next machine digs ${lift} faster.`;
  }
  const word = TIER_WORD[tier];
  const before = effectiveRates(mountain, now).tierSpeed[tier];
  const after = effectiveRates(
    {
      ...mountain,
      crafted: { ...mountain.crafted, reinforce: next },
    },
    now,
  ).tierSpeed[tier];
  return `${word} ${formatCraftSpeed(before)}/s to ${formatCraftSpeed(after)}/s`;
}

function craftEffect(recipe: Recipe, mountain: Mountain, now: number): string {
  const next = craftedLevel(mountain, recipe.id) + 1;
  const effect = recipe.effect;
  switch (effect.kind) {
    case "tier":
      return tierShift(mountain, now, recipe.id, effect.tier, next);
    case "trouble":
      return troubleLine(mountain);
    case "veins":
      return lampLine(mountain, now, next);
    case "trip":
      return kitLine(mountain);
    case "charge":
      return crewBuffLine(mountain, now, "charge", effect.durationMs);
    case "axle":
      return crewBuffLine(
        mountain,
        now,
        "axle",
        recipeWindowMs("axle-grease") ?? effect.durationMs,
      );
    case "flare":
      return flareLine(mountain, now);
    case "ember":
      return emberLine(mountain, now);
    case "reinforce":
      return reinforceLine(mountain, now);
    /* v8 ignore next 3 -- effect kinds are the closed recipe list */
    default: {
      const never: never = effect;
      return never;
    }
  }
}

function refundParts(mountain: Mountain, now: number): readonly string[] {
  const refund = cancelRefund(mountain, now);
  if (refund === undefined) {
    return [];
  }
  const parts: string[] = [];
  if (refund.stones > 0) {
    parts.push(`${formatCompact(refund.stones)} stones`);
  }
  for (const material of MATERIAL_ORDER) {
    const count = refund.materials[material];
    if (count > 0) {
      parts.push(materialCostWords(count, material));
    }
  }
  return parts;
}

/** Bench line, the bar, and the cancel that names the refund. */
export function benchView(mountain: Mountain, now: number): BenchView {
  const bench = mountain.bench;
  if (bench === undefined) {
    return {
      kind: "free",
      title: BENCH_FREE,
      aside: WORKSHOP_FREE_ASIDE,
    };
  }
  const name = recipeById(bench.recipe).name;
  const span = bench.endsAt - bench.startedAt;
  const left = bench.endsAt - now;
  const progress =
    span <= 0 ? 1 : Math.min(1, Math.max(0, (now - bench.startedAt) / span));
  return {
    kind: "busy",
    title: benchBusyWords(name, left),
    aside: BENCH_BUSY_ASIDE,
    progress,
    cancel: left <= 0 ? "" : refundBackWords(refundParts(mountain, now)),
    recipe: bench.recipe,
  };
}

/** Hot buffs, longest first so the one still working leads. */
export function timerLines(mountain: Mountain, now: number): readonly string[] {
  return hotTimers(mountain, now)
    .slice()
    .sort((left, right) => right.until - left.until)
    .map((timer) =>
      timerLeftWords(recipeById(timer.id).name, timer.until - now),
    );
}

/** Milliseconds left on the bench, for the menu while the sheet is shut. */
export function benchLeftMs(
  mountain: Mountain,
  now: number,
): number | undefined {
  const bench = mountain.bench;
  if (bench === undefined || now >= bench.endsAt) {
    return undefined;
  }
  return bench.endsAt - now;
}

function hiddenHint(mountain: Mountain): string | undefined {
  const known = new Set(mountain.recipes ?? []);
  const unknown = RECIPES.filter((recipe) => !known.has(recipe.id));
  if (unknown.length === 0) {
    return undefined;
  }
  return unknown.some((recipe) => recipe.unlock === "found")
    ? UNFOUND_HINT
    : UNFOUND_DEEPER;
}

function actionFor(
  mountain: Mountain,
  id: RecipeId,
  stones: number,
): CraftAction {
  if (mountain.bench?.recipe === id) {
    return { kind: "on-bench" };
  }
  if (mountain.bench !== undefined) {
    return { kind: "waiting" };
  }
  const gap = craftShortfall(mountain, id);
  if (gap !== undefined) {
    return { kind: "short", label: needMoreWords(gap.missing, gap.material) };
  }
  return {
    kind: "craft",
    label: stones > 0 ? craftPriceWords(stones) : CRAFT_WORD,
  };
}

function recipeCard(
  recipe: Recipe,
  mountain: Mountain,
  now: number,
): RecipeCard {
  const cost = recipeCost(recipe.id);
  const level = craftedLevel(mountain, recipe.id);
  const costs = MATERIAL_ORDER.filter(
    (material) => cost.materials[material] > 0,
  ).map((material) => ({
    id: material,
    text: materialCostWords(cost.materials[material], material),
  }));
  return {
    kind: "recipe",
    id: recipe.id,
    name: nameLine(recipe, level),
    effect: craftEffect(recipe, mountain, now),
    costs,
    time: craftTimeWords(recipe.craftMs),
    action: actionFor(mountain, recipe.id, cost.stones),
  };
}

/**
 * Known crafts that are not finished, bench and affordable ones first,
 * then one silhouette if anything is still unfound. The silhouette sits
 * in the fourth slot so the first page still shows it.
 */
export function workshopCards(
  mountain: Mountain,
  now: number,
): readonly WorkshopCard[] {
  const known = new Set(mountain.recipes ?? []);
  const open = RECIPES.filter(
    (recipe) => known.has(recipe.id) && !finished(recipe, mountain),
  );
  const bench = mountain.bench?.recipe;
  open.sort((left, right) => {
    const rank = (id: RecipeId): number => {
      if (id === bench) {
        return 0;
      }
      return craftShortfall(mountain, id) === undefined ? 1 : 2;
    };
    const byRank = rank(left.id) - rank(right.id);
    if (byRank !== 0) {
      return byRank;
    }
    return RECIPE_IDS.indexOf(left.id) - RECIPE_IDS.indexOf(right.id);
  });
  const cards: WorkshopCard[] = open.map((recipe) =>
    recipeCard(recipe, mountain, now),
  );
  const hint = hiddenHint(mountain);
  if (hint !== undefined) {
    cards.splice(Math.min(3, cards.length), 0, { kind: "hidden", hint });
  }
  return cards;
}

/** Pages of four. One page when the shed is still small. */
export function workshopPages(
  cards: readonly WorkshopCard[],
): readonly (readonly WorkshopCard[])[] {
  if (cards.length === 0) {
    return [[]];
  }
  const pages: WorkshopCard[][] = [];
  for (let index = 0; index < cards.length; index += WORKSHOP_PAGE) {
    pages.push(cards.slice(index, index + WORKSHOP_PAGE));
  }
  return pages;
}
