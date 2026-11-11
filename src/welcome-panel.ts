import { cardArt, cardLine, createBoardCard } from "./board-card";
import { el, hide, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { welcomeView, type WelcomeAway, type WelcomeView } from "./card-views";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { AWAY_MATERIALS_USE, BACK_TO_THE_MOUNTAIN } from "./screen-words";
import { MATERIAL_ART } from "./workshop-parts";

/** The welcome card's lines, built once in today's order. */
interface WelcomeParts {
  readonly mined: HTMLElement;
  readonly minedCount: HTMLElement;
  readonly minedUnit: HTMLElement;
  readonly detail: HTMLElement;
  readonly ore: HTMLElement;
  readonly oreArt: HTMLImageElement;
  readonly oreLine: HTMLElement;
  readonly cheer: HTMLElement;
  readonly crew: HTMLElement;
  readonly engineer: HTMLElement;
  readonly returns: HTMLElement;
  readonly layers: HTMLElement;
  readonly crafts: HTMLElement;
}

function welcomeParts(): WelcomeParts {
  // Ore that came up while away (#247), and what it is for.
  const ore = el("div", "welcome-ore");
  const oreArt = cardArt(32);
  const oreText = el("span", "welcome-ore-text");
  const oreLine = el("span", "welcome-ore-line");
  oreText.append(
    oreLine,
    el("span", "welcome-ore-use is-quiet", AWAY_MATERIALS_USE),
  );
  ore.append(oreArt, oreText);
  // The haul: the number kept whole, then its unit, smaller, on the same line when it fits.
  const mined = el("p", "board-card-big welcome-mined");
  const minedCount = el("span", "welcome-mined-count");
  const minedUnit = el("span", "welcome-mined-unit");
  mined.append(minedCount, " ", minedUnit);
  return {
    mined,
    minedCount,
    minedUnit,
    detail: cardLine("welcome-detail"),
    ore,
    oreArt,
    oreLine,
    cheer: cardLine("welcome-cheer is-quiet"),
    // One-time note for saves from before machines needed helpers (#89).
    crew: cardLine("welcome-crew"),
    engineer: cardLine("welcome-engineer"),
    returns: el("div", "welcome-returns"),
    layers: el("div", "welcome-layers"),
    crafts: el("div", "welcome-crafts"),
  };
}

/** A line written, and shown only while it has words. */
function paintLine(line: HTMLElement, words: string | undefined): void {
  write(line, words ?? "");
  hide(line, words === undefined);
}

/** The away haul: the big number, how long, the ore line with its icon, and the cheer. */
function paintAway(parts: WelcomeParts, away: WelcomeAway | undefined): void {
  write(parts.minedCount, away?.mined.count ?? "");
  write(parts.minedUnit, away?.mined.unit ?? "");
  hide(parts.mined, away === undefined);
  paintLine(parts.detail, away?.gone);
  paintLine(parts.cheer, away?.cheer);
  const materials = away?.materials;
  hide(parts.ore, materials === undefined);
  write(parts.oreLine, materials?.words ?? "");
  if (materials !== undefined) {
    const src = MATERIAL_ART[materials.first];
    if (parts.oreArt.getAttribute("src") !== src) {
      parts.oreArt.src = src;
    }
  }
}

/** A box of lines, rebuilt only when its words change; hidden while it has none. */
function paintLines(
  box: HTMLElement,
  hook: string,
  lines: readonly string[],
): void {
  const now = [...box.children].map((line) => line.textContent);
  if (now.length !== lines.length || now.some((line, i) => line !== lines[i])) {
    box.replaceChildren(
      ...lines.map((line) => el("p", `board-card-line ${hook}`, line)),
    );
  }
  hide(box, lines.length === 0);
}

/** The crew, the engineer, who came home, the bands and the crafts. */
function paintNews(parts: WelcomeParts, view: WelcomeView): void {
  paintLine(parts.crew, view.crew);
  paintLine(parts.engineer, view.engineer);
  paintLines(parts.returns, "welcome-return", view.returns);
  paintLines(parts.layers, "welcome-layer", view.layers);
  paintLines(parts.crafts, "welcome-craft", view.crafts);
}

/** The welcome-back card: what the crew mined while you were away, and helpers who joined. */
export function createWelcomePanel({
  progress,
  getView,
  board,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  board: BoardHost;
}) {
  const card = createBoardCard({
    name: "welcome",
    hook: "welcome-back",
    titleId: "welcome-back-title",
    board,
  });
  const parts = welcomeParts();
  card.body.append(
    parts.mined,
    parts.detail,
    parts.ore,
    parts.cheer,
    parts.crew,
    parts.engineer,
    parts.returns,
    parts.layers,
    parts.crafts,
  );
  const plate = card.plate(
    BACK_TO_THE_MOUNTAIN,
    "go",
    "welcome-continue",
    () => {
      progress.dismissAway();
    },
  );

  const render = (): void => {
    const view = welcomeView(getView());
    if (view !== undefined) {
      write(card.title, view.title);
      paintAway(parts, view.away);
      paintNews(parts, view);
    }
    card.show(view !== undefined, plate);
  };

  return { welcome: card.root, render };
}
