import { stretch } from "./scale";
import { formatCompact, formatCount } from "./format";
import { HOW_IT_WORKS } from "./how-it-works";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { showsDot } from "./teach";
import type { WorkshopCard } from "./workshop-sheet";
import {
  chargeCrewMultiplier,
  recipeById,
  recipeCost,
  type RecipeId,
  withClock,
} from "./workshop";

/**
 * The Workshop's first visit (M11, #243), the hybrid pattern from #240.
 * Until the first craft: a one-line intro and the Blasting charge on top,
 * lit and tagged New, with one big button naming the real price. Once the
 * first charge is going, the same card shows what it earns right now.
 */

/** The first craft the Workshop teaches. A Topsoil recipe, so 10 clay pays it. */
export const FIRST_CRAFT: RecipeId = "blasting-charge";

/** When Overtime already doubles the crew, the charge adds nothing on top. */
const FIRST_PAYOFF_QUIET = "Your crew feels it now";

export type WorkshopTeach = {
  /** Shown under the title until the first craft. */
  readonly intro?: string;
  /** The New card, on top. */
  readonly newCard?: RecipeId;
  /** Its one big button. The sheet shows it only when the craft is ready. */
  readonly action?: string;
  /** The first charge is working: this card, this line. */
  readonly payoff?: { readonly id: RecipeId; readonly text: string };
};

/** "Craft Blasting charge · 4 clay · 100K", from the live price. */
export function firstCraftLabel(id: RecipeId, mountain: Mountain): string {
  const cost = recipeCost(id, stretch(mountain));
  const parts = Object.entries(cost.materials)
    .filter(([, count]) => count > 0)
    .map(([material, count]) => `${formatCount(count)} ${material}`);
  if (cost.stones > 0) {
    parts.push(formatCompact(cost.stones));
  }
  return [`Craft ${recipeById(id).name}`, ...parts].join(" · ");
}

function firstCharge(mountain: Mountain): boolean {
  const made = mountain.crafted[FIRST_CRAFT];
  return mountain.bench?.recipe === FIRST_CRAFT ? made === 0 : made === 1;
}

function withoutCharge(mountain: Mountain): Mountain {
  const cold = withClock(mountain, "blasting-charge", 0);
  return {
    ...cold,
    bench: cold.bench?.recipe === FIRST_CRAFT ? undefined : cold.bench,
  };
}

export function workshopTeach(mountain: Mountain, now: number): WorkshopTeach {
  if (showsDot(mountain, "workshop")) {
    return {
      intro: HOW_IT_WORKS.workshop.reveal,
      newCard: FIRST_CRAFT,
      action: firstCraftLabel(FIRST_CRAFT, mountain),
    };
  }
  const multiplier = chargeCrewMultiplier(mountain, now);
  if (!firstCharge(mountain) || multiplier <= 1) {
    return {};
  }
  const gain =
    effectiveRates(mountain, now).crewPerSecond -
    effectiveRates(withoutCharge(mountain), now).crewPerSecond;
  return {
    payoff: {
      id: FIRST_CRAFT,
      text: gain > 0 ? `+${formatCount(gain)}/s now` : FIRST_PAYOFF_QUIET,
    },
  };
}

/** The taught card goes first; the dark sketch keeps its slot on page one. */
export function teachFirst(
  cards: readonly WorkshopCard[],
  teach: WorkshopTeach,
): readonly WorkshopCard[] {
  const id = teach.newCard ?? teach.payoff?.id;
  const picked = cards.find((card) => card.kind !== "hidden" && card.id === id);
  if (picked === undefined || cards[0] === picked) {
    return cards;
  }
  const hiddenAt = cards.findIndex((card) => card.kind === "hidden");
  const rest = cards.filter(
    (card) => card !== picked && card.kind !== "hidden",
  );
  const ordered: WorkshopCard[] = [picked, ...rest];
  const hidden = cards[hiddenAt];
  if (hidden !== undefined) {
    ordered.splice(hiddenAt, 0, hidden);
  }
  return ordered;
}
