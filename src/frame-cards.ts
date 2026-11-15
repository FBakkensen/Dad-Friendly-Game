import { el, write, writeFigures } from "./board-dom";
import { ROOF } from "./city";
import { END_CARD, type CardWords } from "./frame-cards-words";
import type { AwayReport } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { firstNotice } from "./session";
import {
  shiftReport,
  type NightAwayReport,
  type ShiftReport,
} from "./shift-report-view";

/**
 * The frame's cards (#663; spec, "The cards", "While a part is the end of
 * the game"): one card at a time over the frame, with a title, its words and
 * one green key. The shift report after a night (the session's `away`
 * notice, closed through the store as today's welcome card is), and the
 * end card when the Light Tower's roof goes on. The report comes first and
 * the end card waits behind it. The game runs on behind every card.
 */

export type FrameCard =
  | { readonly kind: "report"; readonly report: NightAwayReport }
  | { readonly kind: "end" };

function hasNight(report: AwayReport): report is NightAwayReport {
  return report.night !== undefined;
}

/** The fresh night the session greets, while its notice is open. */
export function nightReport(
  view: Pick<ProgressSnapshot, "notices">,
): NightAwayReport | undefined {
  const report = firstNotice(view, "away")?.report;
  return report !== undefined && hasNight(report) ? report : undefined;
}

/** True when the night put a roof on: the end card follows its report. */
export function roofWentOn(report: NightAwayReport): boolean {
  return report.night.steps.some((step) => step.step === ROOF);
}

/**
 * The card to show now: the report, else the end card while it waits (from
 * the roof going on until "Continue"; not a save fact).
 */
export function frameCard(
  view: Pick<ProgressSnapshot, "notices">,
  endWaits: boolean,
): FrameCard | undefined {
  const report = nightReport(view);
  if (report !== undefined) {
    return { kind: "report", report };
  }
  return endWaits ? { kind: "end" } : undefined;
}

const sameCard = (a: FrameCard | undefined, b: FrameCard | undefined) =>
  a?.kind === b?.kind &&
  (a?.kind !== "report" || b?.kind !== "report" || a.report === b.report);

type CardParts = {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly body: HTMLElement;
  readonly key: HTMLButtonElement;
};

function buildCard(): CardParts {
  const root = el("section", "frame-card");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-labelledby", "frame-card-title");
  root.hidden = true;
  const box = el("div", "frame-card-box");
  const title = el("h2", "frame-card-title");
  title.id = "frame-card-title";
  const body = el("div", "frame-card-body");
  const key = el("button", "frame-card-key");
  key.type = "button";
  box.append(title, body, key);
  root.append(box);
  return { root, title, body, key };
}

/** A paragraph, its figures bright; every one after the first is quieter. */
function paragraph(text: string, quiet: boolean): HTMLElement {
  const line = el("p", quiet ? "frame-card-line is-quiet" : "frame-card-line");
  writeFigures(line, text);
  return line;
}

/** The prototype's night: the amber share it produced on the moon-blue night, and its labels. */
function nightBar(report: ShiftReport): readonly HTMLElement[] {
  const bar = el("span", "frame-card-night");
  const produced = el("i", "frame-card-produced");
  produced.style.width = `${String(Math.round(report.bar.produced * 100))}%`;
  bar.append(produced);
  const labels = el("span", "frame-card-labels");
  labels.append(
    el("span", "frame-card-left", report.bar.left),
    el("span", "frame-card-right", report.bar.right),
  );
  return [bar, labels];
}

function paintReport(parts: CardParts, report: ShiftReport): void {
  write(parts.title, report.title);
  parts.body.replaceChildren(
    paragraph(report.head, false),
    ...nightBar(report),
    ...report.lines.map((line) => paragraph(line, true)),
  );
  write(parts.key, report.key);
}

function paintWords(parts: CardParts, words: CardWords): void {
  write(parts.title, words.title);
  parts.body.replaceChildren(
    ...words.paragraphs.map((text, index) => paragraph(text, index > 0)),
  );
  write(parts.key, words.key);
}

function paintCard(parts: CardParts, card: FrameCard | undefined): void {
  parts.root.hidden = card === undefined;
  parts.root.dataset["card"] = card?.kind ?? "";
  if (card?.kind === "report") {
    paintReport(parts, shiftReport(card.report));
  } else if (card !== undefined) {
    paintWords(parts, END_CARD);
  }
}

export type FrameCards = {
  readonly root: HTMLElement;
  /** Shows the card that is due now, from the store's latest view. */
  readonly paint: () => void;
};

/**
 * The frame's card overlay. It starts at the first view whose save has
 * loaded: a roof that is already on then is not news. `onShow` runs when a new card comes up (the frame closes
 * the workforce sheet).
 */
export function createFrameCards({
  progress,
  onShow,
}: {
  progress: ProgressStore;
  onShow: () => void;
}): FrameCards {
  const parts = buildCard();
  let endWaits = false;
  let lit: boolean | undefined;
  let shown: FrameCard | undefined;

  /** After the first loaded view, the Light Tower lit live is news. */
  const observe = (view: ProgressSnapshot): void => {
    const nowLit = view.mountain.operational.includes("lightTower");
    if (lit === false && nowLit) {
      endWaits = true;
    }
    lit = nowLit;
  };

  const paint = (): void => {
    const view = progress.getSnapshot();
    if (!view.ready) {
      return;
    }
    observe(view);
    const card = frameCard(view, endWaits);
    if (!sameCard(card, shown)) {
      paintCard(parts, card);
      if (card !== undefined) {
        onShow();
      }
    }
    shown = card;
  };

  parts.key.addEventListener("click", () => {
    if (shown?.kind === "report") {
      endWaits = endWaits || roofWentOn(shown.report);
      progress.dismiss("away");
    } else {
      endWaits = false;
    }
    paint();
  });

  return { root: parts.root, paint };
}
