import { cardUp, showCard } from "./card-state";
import { kidStretch, stretch } from "./scale";
import { formatCount } from "./format";
import { legacyBonus, passTheMine } from "./legacy";
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { formatCraftSpeed as speed } from "./screen-words";
import { recipesForMined } from "./workshop";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";

/** "×1.5", "×2": the Legacy bonus as people read it. */
export const legacyWords = (bonus: number): string =>
  `×${String(Number(bonus.toFixed(2)))}`;

export type LegacyCardWords = {
  readonly lead: string;
  readonly rates: readonly string[];
  readonly keeps: string;
  readonly fresh: string;
  readonly legend: string;
};

/**
 * The pass-to-kid card (#247): the Legacy step, what it does to a fresh
 * crew in real numbers from effectiveRates, and what carries over
 * (exactly what passTheMine keeps).
 */
export function legacyCardWords(mountain: Mountain): LegacyCardWords {
  const legacy = mountain.legacy ?? 0;
  const now = effectiveRates({ ...createMountain(), legacy });
  const kid = effectiveRates({ ...createMountain(), legacy: legacy + 1 });
  const before = legacyWords(legacyBonus(mountain));
  const after = legacyWords(legacyBonus({ ...mountain, legacy: legacy + 1 }));
  const recipes = (mountain.recipes ?? recipesForMined(0)).length;
  return {
    lead:
      legacy === 0
        ? `Legacy ${after}, for good`
        : `Legacy ${before} to ${after}, for good`,
    rates: [
      `Workers ${speed(now.tierSpeed.helper)}/s to ${speed(kid.tierSpeed.helper)}/s`,
      `Carts ${speed(now.tierSpeed.cart)}/s to ${speed(kid.tierSpeed.cart)}/s`,
      // A tap counts whole stones, so a step that rounds away is not promised.
      ...(kid.tapYield > now.tapYield
        ? [`Taps ${speed(now.tapYield)} to ${speed(kid.tapYield)} stones`]
        : []),
    ],
    keeps:
      kidStretch(legacy + 1) > stretch(mountain)
        ? `A bigger mountain for your kid, with the Legacy and ${formatCount(recipes)} recipes.`
        : `Your kid keeps the Legacy and ${formatCount(recipes)} recipes.`,
    fresh:
      "Stones, crew, engineers, upgrades and ore start fresh. The relics wait to be found again.",
    // #338: the old dad stays on as Grandpa.
    legend:
      "You'll always be the Legend who began it. Grandpa stays on to tend the machines.",
  };
}

const canPass = (mountain: Mountain): boolean =>
  passTheMine(mountain, 0) !== undefined;

/**
 * Pass the mine to your kid (M6): the menu entry, the confirm card, and the
 * Legacy badge, which sits on the mine window's brass plate (#371). Offered
 * only once the mountain is finished.
 */
export function createLegacyPanel({
  progress,
  getView,
  onPassed,
  beforeOpen,
  requestRender,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  /** After a new run starts (the screen resets its vein wait). */
  onPassed: () => void;
  /** Closes whatever offered it (the menu or the Legend card). */
  beforeOpen: () => void;
  requestRender: () => void;
}) {
  let open = false;
  let returnFocus: HTMLElement | undefined;

  const badge = document.createElement("span");
  badge.className = "legacy-badge";
  badge.setAttribute("role", "img");
  badge.hidden = true;

  const menuPass = document.createElement("button");
  menuPass.type = "button";
  menuPass.className = "menu-pass";
  menuPass.textContent = "Pass the mine to your kid";

  const dialog = document.createElement("div");
  dialog.className = "start-over legacy-dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "legacy-title");
  dialog.setAttribute("aria-describedby", "legacy-detail");
  dialog.hidden = true;
  const card = document.createElement("div");
  card.className = "start-over-card legacy-card";
  const title = document.createElement("h2");
  title.id = "legacy-title";
  title.textContent = "Pass the mine to your kid.";
  const detail = document.createElement("div");
  detail.id = "legacy-detail";
  detail.className = "legacy-detail";
  const line = (className: string): HTMLParagraphElement => {
    const paragraph = document.createElement("p");
    paragraph.className = className;
    return paragraph;
  };
  const lead = line("legacy-lead");
  const rates = document.createElement("ul");
  rates.className = "legacy-rates";
  const keeps = line("legacy-keeps");
  const fresh = line("legacy-fresh");
  const legend = line("legacy-legend");
  detail.append(lead, rates, keeps, fresh, legend);
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "start-over-cancel legacy-cancel";
  cancel.textContent = "Not yet";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "legacy-confirm";
  yes.textContent = "Pass it on";
  const actions = document.createElement("div");
  actions.className = "start-over-actions";
  actions.append(cancel, yes);
  card.append(title, detail, actions);
  dialog.append(card);

  const show = (from: HTMLElement | undefined): void => {
    beforeOpen();
    returnFocus = from;
    open = true;
    requestRender();
  };
  const close = (): void => {
    open = false;
    requestRender();
    returnFocus?.focus();
  };
  menuPass.addEventListener("click", () => {
    show(undefined);
  });
  cancel.addEventListener("click", close);
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });
  yes.addEventListener("click", () => {
    open = false;
    if (progress.passTheMine()) {
      onPassed();
    }
    requestRender();
  });

  const render = (): void => {
    const { mountain, ready } = getView();
    const bonus = legacyBonus(mountain);
    const legacy = mountain.legacy ?? 0;
    badge.hidden = legacy === 0;
    badge.textContent = `Legacy ${legacyWords(bonus)}`;
    badge.setAttribute(
      "aria-label",
      `Legacy ${formatCount(legacy)}: your crew and taps are ${legacyWords(bonus)}`,
    );
    const offered = ready && canPass(mountain);
    menuPass.hidden = !offered;
    const words = legacyCardWords(mountain);
    lead.textContent = words.lead;
    rates.replaceChildren(
      ...words.rates.map((rate) => {
        const item = document.createElement("li");
        item.textContent = rate;
        return item;
      }),
    );
    keeps.textContent = words.keeps;
    fresh.textContent = words.fresh;
    legend.textContent = words.legend;
    const wasOpen = cardUp(dialog);
    showCard(dialog, open && offered);
    if (cardUp(dialog) && !wasOpen) {
      cancel.focus();
    }
  };

  return { badge, menuPass, dialog, open: show, render };
}
