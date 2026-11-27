import { el, hide, mark, setAttr, write } from "./board-dom";
import type { FrameState } from "./frame-state";
import type { Mountain } from "./mountain";
import { priceIcon } from "./price-icons";
import { RESEARCH_PROJECTS, researchOpen, type ResearchId } from "./research";
import {
  researchSheetView,
  type ResearchCardView,
  type ResearchGoodProgress,
} from "./research-view";

/**
 * The Research Lab sheet (Slice 2 Part 2, #779; spec rule 4.3 & "What he
 * sees"): dialog over the frame above the save line, opened from the City's
 * Research Lab door. Shows every project card, Start / Cancel (100% lossless
 * refund) / Install actions, and per-good delivery progress bars for the
 * active project. The game runs on behind it.
 */

export type ResearchSheet = {
  readonly root: HTMLElement;
  readonly open: () => void;
  readonly close: () => void;
  readonly paint: (mountain: Mountain) => void;
};

type CardParts = {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly summary: HTMLElement;
  readonly installed: HTMLElement;
  readonly action: HTMLButtonElement;
  readonly cost: HTMLElement;
  readonly progress: HTMLElement;
  shown: ResearchCardView | undefined;
};

function renderCostLine(
  target: HTMLElement,
  card: Extract<ResearchCardView, { status: "available" }>,
): void {
  const key = card.price.map((part) => `${part.good}:${part.text}`).join(" ");
  if (target.dataset["cost"] === key) {
    return;
  }
  target.dataset["cost"] = key;
  target.replaceChildren(
    el("span", "research-cost-head", "Requires "),
    ...card.price.flatMap((part, index) => {
      const item = el("span", "research-cost-part");
      const img = el("img", "mine-key-icon");
      img.src = priceIcon(part.good) ?? "";
      img.alt = "";
      item.append(el("span", "board-num", part.text), img);
      return index === 0 ? [item] : [el("span", "", " + "), item];
    }),
  );
}

function renderProgress(
  target: HTMLElement,
  goods: readonly ResearchGoodProgress[],
): void {
  if (target.childElementCount !== goods.length) {
    target.replaceChildren(
      ...goods.map((good) => {
        const row = el("div", "research-good");
        row.dataset["good"] = good.good;
        const top = el("div", "research-good-top");
        const img = el("img", "mine-key-icon");
        img.src = priceIcon(good.good) ?? "";
        img.alt = "";
        const name = el("span", "research-good-name", good.name);
        const text = el("span", "research-good-text board-num");
        top.append(img, name, text);
        const track = el("span", "research-good-track");
        track.append(el("i", "research-good-fill"));
        row.append(top, track);
        return row;
      }),
    );
  }
  goods.forEach((good, index) => {
    const row = target.children[index];
    const text = row?.querySelector<HTMLElement>(".research-good-text");
    const fill = row?.querySelector<HTMLElement>(".research-good-fill");
    if (text != null) {
      write(text, good.text);
    }
    if (fill != null) {
      fill.style.width = `${String(Math.round(good.fill * 1000) / 10)}%`;
    }
  });
}

function buildCard(state: FrameState, id: ResearchId): CardParts {
  const root = el("div", "research-card");
  root.dataset["research"] = id;
  const top = el("div", "research-card-top");
  const text = el("div", "research-card-text");
  const name = el("b", "research-card-name");
  const summary = el("span", "research-card-summary");
  text.append(name, summary);
  const installed = el("span", "research-installed", "Installed");
  const action = el("button", "research-action");
  action.type = "button";
  top.append(text, installed, action);
  const cost = el("div", "research-cost");
  const progress = el("div", "research-progress");
  root.append(top, cost, progress);

  const parts: CardParts = {
    root,
    name,
    summary,
    installed,
    action,
    cost,
    progress,
    shown: undefined,
  };
  action.addEventListener("click", () => {
    const card = parts.shown;
    if (card === undefined || card.status === "done") {
      return;
    }
    if (card.status === "available" && card.canStart) {
      void state.progress.dispatch({ kind: "startResearch", id: card.id });
    } else if (card.status === "delivering") {
      void state.progress.dispatch({ kind: "cancelResearch" });
    } else if (card.status === "ready") {
      void state.progress.dispatch({ kind: "installResearch" });
    }
  });
  return parts;
}

function paintCard(parts: CardParts, card: ResearchCardView): void {
  parts.shown = card;
  setAttr(parts.root, "data-status", card.status);
  write(parts.name, card.name);
  write(parts.summary, card.summary);
  const done = card.status === "done";
  hide(parts.installed, !done);
  hide(parts.action, done);
  hide(parts.cost, card.status !== "available");
  hide(parts.progress, card.status !== "delivering" && card.status !== "ready");
  if (card.status === "available") {
    write(parts.action, "Start");
    mark(parts.action, "can", card.canStart);
    mark(parts.action, "cancel", false);
    setAttr(parts.action, "aria-label", card.actionLabel);
    renderCostLine(parts.cost, card);
  } else if (card.status === "delivering") {
    write(parts.action, "Cancel");
    mark(parts.action, "can", false);
    mark(parts.action, "cancel", true);
    setAttr(parts.action, "aria-label", card.actionLabel);
    renderProgress(parts.progress, card.goods);
  } else if (card.status === "ready") {
    write(parts.action, "Install");
    mark(parts.action, "can", true);
    mark(parts.action, "cancel", false);
    setAttr(parts.action, "aria-label", card.actionLabel);
    renderProgress(parts.progress, card.goods);
  }
}

export function createResearchSheet(state: FrameState): ResearchSheet {
  const root = el("section", "frame-sheet research-sheet");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Research Lab");
  root.hidden = true;
  const box = el("div", "frame-sheet-box research-sheet-box");
  const head = el("div", "research-sheet-head");
  const title = el("h2", "frame-sheet-title", "Research Lab");
  const counts = el("span", "research-sheet-counts board-num");
  head.append(title, counts);
  const subtitle = el("p", "research-sheet-sub");
  const list = el("div", "research-cards");
  const cards = new Map<ResearchId, CardParts>(
    RESEARCH_PROJECTS.map((project) => [
      project.id,
      buildCard(state, project.id),
    ]),
  );
  list.append(...[...cards.values()].map((each) => each.root));
  const close = el("button", "frame-sheet-close", "Close");
  close.type = "button";
  box.append(head, subtitle, list, close);
  root.append(box);

  const shut = (): void => {
    hide(root, true);
  };
  close.addEventListener("click", shut);

  return {
    root,
    open: () => {
      if (researchOpen(state.mountain())) {
        hide(root, false);
      }
    },
    close: shut,
    paint: (mountain) => {
      if (!researchOpen(mountain)) {
        shut();
        return;
      }
      const view = researchSheetView(mountain);
      write(counts, `${String(view.doneCount)}/${String(view.totalCount)}`);
      write(subtitle, view.subtitle);
      const ordered: HTMLElement[] = [];
      for (const card of view.cards) {
        const parts = cards.get(card.id);
        if (parts !== undefined) {
          paintCard(parts, card);
          ordered.push(parts.root);
        }
      }
      if (ordered.some((node, index) => list.children[index] !== node)) {
        list.replaceChildren(...ordered);
      }
    },
  };
}
