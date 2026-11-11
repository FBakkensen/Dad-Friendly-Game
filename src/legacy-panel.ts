import { cardLine, cardLines, createBoardCard } from "./board-card";
import { el, hide, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { kidStretch, stretch } from "./scale";
import { formatCount } from "./format";
import { legacyBonus, passTheMine } from "./legacy";
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import {
  PASS_IT_ON,
  PASS_NOT_YET,
  PASS_TITLE,
  formatCraftSpeed as speed,
} from "./screen-words";
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
  const legacy = mountain.legacy;
  const now = effectiveRates({ ...createMountain(), legacy });
  const kid = effectiveRates({ ...createMountain(), legacy: legacy + 1 });
  const before = legacyWords(legacyBonus(mountain));
  const after = legacyWords(legacyBonus({ ...mountain, legacy: legacy + 1 }));
  const recipes = mountain.recipes.length;
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

/** The confirm card's lines, in today's order: the lead, the rates, then what carries over. */
function legacyLines() {
  const rates = el("ul", "legacy-rates");
  return {
    lead: cardLine("legacy-lead"),
    rates,
    keeps: cardLine("legacy-keeps"),
    fresh: cardLine("legacy-fresh"),
    legend: cardLine("legacy-legend"),
  };
}

/**
 * Pass the mine to your kid (M6): whether it is offered (the Ledger's Pass plate shows then), the
 * confirm card on the board card shell (#466), and the Legacy badge, which sits on the mine
 * window's brass plate (#371). Offered only once the mountain is finished. Not yet and Escape
 * give focus back to what opened it; Pass it on presses through the board, so the second tap of
 * the tap that opened the card never passes the mine.
 */
export function createLegacyPanel({
  progress,
  getView,
  board,
  onPassed,
  beforeOpen,
  requestRender,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  board: BoardHost;
  /** After a new run starts (the screen resets its vein wait). */
  onPassed: () => void;
  /** Closes whatever offered it (the Ledger or the Legend card). */
  beforeOpen: () => void;
  requestRender: () => void;
}) {
  let open = false;

  const badge = el("span", "legacy-badge");
  badge.setAttribute("role", "img");
  badge.hidden = true;

  const card = createBoardCard({
    name: "legacy",
    hook: "legacy-dialog",
    titleId: "legacy-title",
    board,
    dismiss: () => {
      close();
    },
  });
  const dialog = card.root;
  // A confirm that ends the run: an alert dialog, described by what passing does.
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-describedby", "legacy-detail");
  write(card.title, PASS_TITLE);
  const lines = legacyLines();
  card.body.id = "legacy-detail";
  card.body.classList.add("legacy-detail");
  card.body.append(
    lines.lead,
    lines.rates,
    lines.keeps,
    lines.fresh,
    lines.legend,
  );

  /** Not yet, or Escape: the card's close gives the focus back to what opened it. */
  const close = (): void => {
    open = false;
    requestRender();
  };
  const answers = el("div", "board-card-pair legacy-answers");
  card.foot.append(answers);
  const cancel = card.plate(
    PASS_NOT_YET,
    "cancel",
    "legacy-cancel",
    close,
    answers,
  );
  card.plate(
    PASS_IT_ON,
    "confirm",
    "legacy-confirm",
    () => {
      open = false;
      if (progress.passTheMine()) {
        onPassed();
      }
      requestRender();
    },
    answers,
  );
  /** Whether passing the mine is offered now: the save is in and the mountain is finished. */
  const offered = (): boolean => {
    const { mountain, ready } = getView();
    return ready && canPass(mountain);
  };

  const render = (): void => {
    const { mountain } = getView();
    const bonus = legacyBonus(mountain);
    const legacy = mountain.legacy;
    hide(badge, legacy === 0);
    write(badge, `Legacy ${legacyWords(bonus)}`);
    setAttr(
      badge,
      "aria-label",
      `Legacy ${formatCount(legacy)}: your crew and taps are ${legacyWords(bonus)}`,
    );
    paintLines(lines, legacyCardWords(mountain));
    card.show(open && offered(), cancel);
  };

  return {
    badge,
    dialog,
    open: (from: HTMLElement | undefined): void => {
      beforeOpen();
      card.from(from);
      open = true;
      requestRender();
    },
    offered,
    render,
  };
}

/** The card's words, each written only on a change. */
function paintLines(
  lines: ReturnType<typeof legacyLines>,
  words: LegacyCardWords,
): void {
  write(lines.lead, words.lead);
  cardLines(lines.rates, "legacy-rate", words.rates, "li");
  write(lines.keeps, words.keeps);
  write(lines.fresh, words.fresh);
  write(lines.legend, words.legend);
}
