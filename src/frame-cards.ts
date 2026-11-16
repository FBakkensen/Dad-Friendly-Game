import { el, write, writeFigures } from "./board-dom";
import type { BuildingId } from "./city";
import {
  FIRST_EVENING,
  refineryOpens,
  endCard,
  type CardWords,
} from "./frame-cards-words";
import { makersOpen } from "./makers";
import { FRESH_START_JOBS, type AwayReport, type Mountain } from "./mountain";
import { partTwoOn } from "./part-switch";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { firstNotice } from "./session";
import { JOB_IDS, workersOnJobs } from "./workforce";
import {
  shiftReport,
  TO_STOCKYARD,
  type ShiftReport,
} from "./shift-report-view";

/**
 * The frame's cards (#663; spec, "The cards", "While a part is the end of
 * the game"): one card at a time over the frame, with a title, its words and
 * one green key. The shift report after a night (the session's `away`
 * notice, closed through the store as today's welcome card is), and the
 * end card when a part's last roof goes on (its `operational` notice,
 * closed the same way; in part 2 the Light Tower's roof brings the card that
 * opens the refinery, and the Warehouse's the end card, #671). The report
 * comes first and the end card waits
 * behind it. The first evening's card (#703) greets a session that opens
 * with nothing ordered and nothing operational, once, until its key is
 * pressed; it is not a save fact. A save from part 1 whose Light Tower was
 * already up when part 2 was switched on (#672) never saw the refinery's
 * card, so a session that opens on the refinery untouched greets with it the
 * same way. The game runs on behind every card.
 */

type FrameCard =
  | { readonly kind: "report"; readonly report: AwayReport }
  | { readonly kind: "end"; readonly building: BuildingId }
  | { readonly kind: "opens" }
  | { readonly kind: "first" };

type CardView = Pick<ProgressSnapshot, "notices" | "mountain">;

/**
 * The mine as it started: nothing ordered, nothing operational, and one
 * worker, on drilling (#715). The first evening's card says just that.
 */
const nothingYet = (mountain: Mountain): boolean =>
  mountain.project.kind === "unordered" &&
  mountain.operational.length === 0 &&
  mountain.owned.helper === workersOnJobs({ jobs: FRESH_START_JOBS }) &&
  JOB_IDS.every((job) => mountain.jobs[job] === FRESH_START_JOBS[job]);

/**
 * The refinery open and untouched since the Light Tower's roof: no kiln, the
 * stockyard as it opened, and nothing more ordered (#672).
 */
const refineryUntouched = (mountain: Mountain): boolean =>
  makersOpen(mountain) &&
  mountain.makers.kiln === 0 &&
  mountain.stockyard === 0 &&
  mountain.project.kind === "unordered" &&
  mountain.operational.length === 1;

/** The card a session greets with on its first ready view, until its key. */
type Greeting = "first" | "opens" | "none";

const GREETINGS: readonly {
  readonly kind: Exclude<Greeting, "none">;
  readonly holds: (mountain: Mountain) => boolean;
}[] = [
  { kind: "first", holds: nothingYet },
  { kind: "opens", holds: refineryUntouched },
];

/**
 * What the session greets with, decided on its first ready view. A session
 * that opens on a night is not a first evening; the refinery's card waits
 * behind the night's report, as the end card does.
 */
function greets(view: CardView): Greeting {
  const night = nightReport(view) !== undefined;
  return (
    GREETINGS.find(
      (each) => (!night || each.kind !== "first") && each.holds(view.mountain),
    )?.kind ?? "none"
  );
}

/** The fresh night the session greets, while its notice is open. */
export function nightReport(
  view: Pick<ProgressSnapshot, "notices">,
): AwayReport | undefined {
  return firstNotice(view, "away")?.report;
}

/**
 * The card to show now: the report, else the end card while its notice is
 * open, else the first evening's while the session greets it and nothing
 * is ordered or operational.
 */
function frameCard(view: CardView, greet: Greeting): FrameCard | undefined {
  const report = nightReport(view);
  if (report !== undefined) {
    return { kind: "report", report };
  }
  const building = firstNotice(view, "operational")?.building;
  if (building !== undefined) {
    // In part 2 the Light Tower opens the refinery; the Warehouse ends it (#671).
    return building === "lightTower" && partTwoOn()
      ? { kind: "opens" }
      : { kind: "end", building };
  }
  const greeting = GREETINGS.find((each) => each.kind === greet);
  return greeting?.holds(view.mountain) === true
    ? { kind: greeting.kind }
    : undefined;
}

const sameCard = (a: FrameCard | undefined, b: FrameCard | undefined) =>
  a?.kind === b?.kind &&
  (a?.kind !== "report" || b?.kind !== "report" || a.report === b.report) &&
  (a?.kind !== "end" || b?.kind !== "end" || a.building === b.building);

type CardParts = {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly body: HTMLElement;
  readonly key: HTMLButtonElement;
  /** The report's second key, after a night the stockyard stopped (#671). */
  readonly yard: HTMLButtonElement;
};

function buildCard(): CardParts {
  const root = el("section", "frame-card");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "frame-card-title");
  root.hidden = true;
  const box = el("div", "frame-card-box");
  const title = el("h2", "frame-card-title");
  title.id = "frame-card-title";
  const body = el("div", "frame-card-body");
  const key = el("button", "frame-card-key");
  key.type = "button";
  const yard = el("button", "frame-card-yard", TO_STOCKYARD);
  yard.type = "button";
  yard.hidden = true;
  box.append(title, body, key, yard);
  root.append(box);
  return { root, title, body, key, yard };
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
    ...fullMarks(report.marks),
  );
  write(parts.key, report.key);
  parts.yard.hidden = !report.toStockyard;
}

/** When each stockpile filled in the night, one mark a line (#671). */
function fullMarks(marks: readonly string[]): readonly HTMLElement[] {
  if (marks.length === 0) {
    return [];
  }
  const list = el("p", "frame-card-marks");
  list.append(...marks.map((mark) => el("span", "frame-card-mark", mark)));
  return [list];
}

function paintWords(parts: CardParts, words: CardWords): void {
  write(parts.title, words.title);
  parts.body.replaceChildren(
    ...words.paragraphs.map((text, index) => paragraph(text, index > 0)),
  );
  write(parts.key, words.key);
  parts.yard.hidden = true;
}

function cardWords(card: Exclude<FrameCard, { kind: "report" }>): CardWords {
  if (card.kind === "first") {
    return FIRST_EVENING;
  }
  return card.kind === "opens" ? refineryOpens() : endCard(card.building);
}

function paintCard(parts: CardParts, card: FrameCard | undefined): void {
  parts.root.hidden = card === undefined;
  parts.root.dataset["card"] = card?.kind ?? "";
  if (card?.kind === "report") {
    paintReport(parts, shiftReport(card.report));
  } else if (card !== undefined) {
    paintWords(parts, cardWords(card));
  }
}

export type FrameCards = {
  readonly root: HTMLElement;
  /** Shows the card that is due now, from the store's latest view. */
  readonly paint: () => void;
};

/**
 * The frame's card overlay, painted from views whose save has loaded.
 * `onShow` runs when a new card comes up (the frame closes the workforce
 * sheet). `onStockyard` runs when the report's "To the stockyard" closes
 * the night (the frame goes to the refinery).
 */
export function createFrameCards({
  progress,
  onShow,
  onStockyard,
}: {
  progress: ProgressStore;
  onShow: () => void;
  onStockyard: () => void;
}): FrameCards {
  const parts = buildCard();
  let shown: FrameCard | undefined;
  let greet: Greeting | undefined;

  const paint = (): void => {
    const view = progress.getSnapshot();
    if (!view.ready) {
      return;
    }
    greet ??= greets(view);
    const card = frameCard(view, greet);
    if (!sameCard(card, shown)) {
      paintCard(parts, card);
      if (card !== undefined) {
        onShow();
        // A sheet it closed may have held the focus: the card's key takes it (#708).
        parts.key.focus({ preventScroll: true });
      }
    }
    shown = card;
  };

  parts.key.addEventListener("click", () => {
    if (shown?.kind === "first" || shown?.kind === "opens") {
      greet = "none";
    }
    if (shown !== undefined && shown.kind !== "first") {
      progress.dismiss(shown.kind === "report" ? "away" : "operational");
    }
    paint();
  });

  parts.yard.addEventListener("click", () => {
    if (shown?.kind === "report") {
      progress.dismiss("away");
      onStockyard();
    }
    paint();
  });

  return { root: parts.root, paint };
}
