import { formatCompact } from "./format";
import { EMPTY_MATERIALS, type MaterialId } from "./layers";
import type { Mountain } from "./mountain";
import type { RowView } from "./row-view";
import {
  BENCH_FREE,
  BENCH_UNKNOWN,
  CRAFT_WORD,
  RECIPE_ON_BENCH,
  SKETCH_NAME,
  WORKSHOP_BENCH_BUSY,
  WORKSHOP_CANCEL_CONFIRM,
} from "./screen-words";
import { recipeById, type RecipeId } from "./workshop";
import {
  metMaterialChips,
  type BenchView,
  type HiddenCard,
  type RecipeCard,
  type WorkshopCard,
} from "./workshop-sheet";
import type { WorkshopTeach } from "./workshop-teach";

/*
 * The Workshop drawer's rows and plates (#374), as pure views: `workshop-sheet.ts` stays the
 * rules (cards, bench, timers, pages), and this turns them into `RowView`s, as `buys-rows.ts`
 * and `upgrade-rows.ts` do for Buys and Upgrades. Display only, and no art.
 */

/** A part of the drawer's recipe list: a recipe's row, or the one dark sketch. */
export type WorkshopPartId = `recipe:${RecipeId}` | "sketch";

// Three recipe rows a page: the rules keep the size, the drawer pages by it.
export { RECIPES_A_PAGE } from "./workshop-sheet";

/** The bench row: its bar's share done, and whether a tap may arm the cancel. */
export interface BenchRowView extends RowView {
  readonly progress: number | undefined;
  readonly canCancel: boolean;
}

/** A recipe's row, and whether it is the craft the first visit teaches (its row glows). */
export interface RecipeRowView extends RowView {
  readonly isNew: boolean;
}

/** One material's plate in the drawer's head row. */
export interface MaterialPlate {
  readonly id: MaterialId;
  readonly count: string;
  /** The material's own word, "clay"; it hides on packed plates and stays in `aria`. */
  readonly word: string;
  /** The pocket chip's words and what a tap opens, "Clay 10. How materials work". */
  readonly aria: string;
}

const NEW_FLAG: readonly string[] = ["New"];
/** A plate's tap opens the "i" cards: screen-reader words only. */
const PLATE_HINT = "How materials work";
const NO_FLAG: readonly string[] = [];

/** What a row says when it says nothing more: no badge, need, why, flag, gain, tag or verb. */
const QUIET_ROW = {
  badge: "",
  need: "",
  why: "",
  flag: NO_FLAG,
  gain: "",
  price: "",
  dimTag: false,
  verb: "",
  pick: false,
  can: false,
} as const satisfies Partial<RowView>;

export function partIdOf(card: WorkshopCard): WorkshopPartId {
  return card.kind === "hidden" ? "sketch" : `recipe:${card.id}`;
}

/** The list's order: the cards as the panel ranks them (`teachFirst(workshopCards(…))`). */
export function workshopOrder(
  cards: readonly WorkshopCard[],
): readonly WorkshopPartId[] {
  return cards.map(partIdOf);
}

/** A line that ends a sentence: the effect lines do not all end in a full stop. */
function sentence(line: string): string {
  return line.endsWith(".") ? line : `${line}.`;
}

type RecipeFace = Pick<
  RowView,
  "lamp" | "state" | "verb" | "need" | "why" | "price" | "dimTag" | "can"
>;

/** The lamp, words and tag of a recipe row, by what a tap would do now. */
function recipeFace(card: RecipeCard): RecipeFace {
  const materials = card.costs.map((cost) => cost.text).join(" · ");
  const tag = card.stonesTag ?? "";
  const dark = { lamp: "off", need: "", why: materials, can: false } as const;
  switch (card.action.kind) {
    case "craft":
      return {
        ...dark,
        lamp: "green",
        state: "ready",
        verb: CRAFT_WORD,
        price: tag,
        dimTag: false,
        can: true,
      };
    case "short":
      return {
        ...dark,
        state: "short",
        verb: CRAFT_WORD,
        need: card.action.label,
        why: "",
        price: tag,
        dimTag: true,
      };
    case "waiting":
      return {
        ...dark,
        state: "dear",
        verb: WORKSHOP_BENCH_BUSY,
        price: tag,
        dimTag: true,
      };
    case "on-bench":
      return {
        ...dark,
        lamp: "amber",
        state: "running",
        verb: RECIPE_ON_BENCH,
        price: "",
        dimTag: false,
      };
  }
}

/** The craft the first visit teaches, while he can make it and its payoff is not showing. */
function isNewCraft(card: RecipeCard, teach: WorkshopTeach): boolean {
  return (
    teach.payoff?.id !== card.id &&
    teach.newCard === card.id &&
    card.action.kind === "craft"
  );
}

/** The New flag on the taught craft while he can make it, or the first charge's payoff. */
function recipeFlag(card: RecipeCard, teach: WorkshopTeach): readonly string[] {
  if (teach.payoff?.id === card.id) {
    return [teach.payoff.text];
  }
  return isNewCraft(card, teach) ? NEW_FLAG : NO_FLAG;
}

/** A recipe's row: its name, level, effect and time, and the face its action gives it. */
export function recipeRowView(
  card: RecipeCard,
  teach: WorkshopTeach,
): RecipeRowView {
  const face = recipeFace(card);
  const costs = [
    ...(card.stones === undefined ? [] : [card.stones]),
    ...card.costs.map((cost) => cost.text),
  ];
  const tail =
    face.need === "" ? `${face.verb}: ${costs.join(", ")}.` : `${face.need}.`;
  return {
    ...face,
    name: card.name,
    badge: card.level ?? "",
    info: [card.effect],
    flag: recipeFlag(card, teach),
    gain: card.time,
    pick: false,
    aria: `${card.name}. ${sentence(card.effect)} ${tail}`,
    isNew: isNewCraft(card, teach),
  };
}

/** The one dark row for what is not found yet, with today's hint. */
export function sketchRowView(card: HiddenCard): RowView {
  return {
    ...QUIET_ROW,
    name: SKETCH_NAME,
    info: [card.hint],
    lamp: "off",
    state: "locked",
    aria: `${SKETCH_NAME}. ${card.hint}`,
  };
}

/** The busy bench: the recipe, the refund then the aside, the clock, and the confirm when armed. */
function busyBenchRow(
  bench: Extract<BenchView, { readonly kind: "busy" }>,
  armed: boolean,
): BenchRowView {
  const canCancel = bench.cancel !== "";
  const why = armed && canCancel ? WORKSHOP_CANCEL_CONFIRM : "";
  const said = why === "" ? bench.cancel : why;
  return {
    ...QUIET_ROW,
    name: recipeById(bench.recipe).name,
    info: canCancel ? [bench.cancel, bench.aside] : [bench.aside],
    gain: bench.clock,
    why,
    lamp: "amber",
    state: "running",
    can: canCancel,
    aria: said === "" ? bench.title : `${bench.title}. ${said}`,
    progress: bench.progress,
    canCancel,
  };
}

/**
 * The bench as a drawer row, which is also the cancel plate. Free, it is green and takes no
 * tap. Busy, a tap arms the cancel and `armed` asks for the second. A bench this build cannot
 * name keeps its clock and bar, and cannot be cancelled.
 */
export function benchRowView(bench: BenchView, armed: boolean): BenchRowView {
  switch (bench.kind) {
    case "busy":
      return busyBenchRow(bench, armed);
    case "free":
      return {
        ...QUIET_ROW,
        name: BENCH_FREE,
        info: [bench.aside],
        lamp: "green",
        state: "ready",
        aria: `${BENCH_FREE}. ${bench.aside}`,
        progress: undefined,
        canCancel: false,
      };
    case "unknown":
      return {
        ...QUIET_ROW,
        name: BENCH_UNKNOWN,
        info: [bench.aside],
        gain: bench.clock,
        lamp: "amber",
        state: "running",
        aria: `${bench.title}. ${bench.aside}`,
        progress: bench.progress,
        canCancel: false,
      };
  }
}

/** A plate for each material met, in the pocket line's order (`metMaterialChips`). */
export function materialPlates(mountain: Mountain): readonly MaterialPlate[] {
  const have = mountain.materials ?? EMPTY_MATERIALS;
  return metMaterialChips(mountain).map((chip) => ({
    id: chip.id,
    count: formatCompact(have[chip.id]),
    word: chip.id,
    aria: `${chip.text}. ${PLATE_HINT}`,
  }));
}
