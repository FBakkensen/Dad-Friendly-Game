import { el, hide, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { controlKey, type ControlRef, type Pointer } from "./board-interaction";
import {
  createAskPage,
  pageFrame,
  type PageFrame,
  type PlateAct,
} from "./board-page";
import { drawerPlate } from "./board-save";
import { skin } from "./board-skin";
import { forgetAll, type PressTracker } from "./card-tap";
import { TONIGHT_LINES, type TonightLine } from "./ledger-rows";
import {
  PASS_FULL,
  PASS_SHORT,
  SAVED_COPIES_TITLE,
  START_OVER,
  START_OVER_DETAIL,
  START_OVER_KEEP,
  START_OVER_TITLE,
  START_OVER_YES,
  SAVE_CONFLICT_ERROR,
  fieldLogCopied,
  fieldLogCopy,
  fieldLogFallback,
  fieldLogTitle,
} from "./screen-words";

/*
 * The Ledger drawer's own controls (#375): the Tonight box, the four plates, and the two pages
 * the drawer shows in its list's place (the Start over confirm and the field log's
 * copy-it-yourself box). Built on the shared plate button, skin, board presses and drawer page
 * (board-page.ts); no other drawer has a log box or a plate grid, so the shared row and shell
 * stay generic. Every press goes through the board's model, so a finger that lands while the drawer
 * or its page settles is the second tap of the one that opened it.
 */

/** Copies the field log; false when the browser has no clipboard or refuses it. */
export async function writeClipboard(text: string): Promise<boolean> {
  const clipboard = Reflect.get(navigator, "clipboard") as
    { readonly writeText?: (value: string) => Promise<void> } | undefined;
  if (clipboard === undefined || typeof clipboard.writeText !== "function") {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * A Ledger plate whose press, past the settle and any hold, runs `act` with the plate. Its
 * tracker goes in `trackers`, so the drawer can drop a finger-down time left over.
 */
function ledgerPlate(
  board: BoardHost,
  trackers: PressTracker[],
  [label, id]: readonly [label: string, id: string],
  act: PlateAct,
): HTMLButtonElement {
  return drawerPlate(
    board,
    trackers,
    { label, className: `ledger-${id}`, control: { layer: "ledger", id } },
    act,
  );
}

/** Tonight: this run's newest lines, each with its time, in an inset box. */
export function createTonightBox(): {
  readonly root: HTMLElement;
  paint(lines: readonly TonightLine[]): void;
} {
  const root = el("div", "ledger-log");
  const slots = Array.from({ length: TONIGHT_LINES }, () => {
    const line = el("p", "ledger-log-line");
    const time = el("time", "ledger-log-time board-num");
    const text = el("span", "ledger-log-text");
    line.append(time, text);
    line.hidden = true;
    root.append(line);
    return { line, time, text };
  });
  skin(root, "inset");
  let key: string | undefined;
  return {
    root,
    paint(lines) {
      const next = lines.map((each) => `${each.time}|${each.text}`).join("\n");
      if (next === key) {
        return;
      }
      key = next;
      slots.forEach((slot, index) => {
        const shown = lines[index];
        write(slot.time, shown?.time ?? "");
        write(slot.text, shown?.text ?? "");
        hide(slot.line, shown === undefined);
      });
    },
  };
}

/** What the plates show: whether the save is in, and whether passing the mine is offered. */
interface DoorsView {
  readonly ready: boolean;
  readonly passOffered: boolean;
}

/** Where each plate leads; each gets the plate it was pressed on, and how. */
export interface LedgerDoorsOn {
  savedCopies(from: HTMLButtonElement, by: Pointer): void;
  fieldLog(from: HTMLButtonElement, by: Pointer): void;
  startOver(from: HTMLButtonElement, by: Pointer): void;
  pass(from: HTMLButtonElement, by: Pointer): void;
}

export interface LedgerDoors {
  readonly root: HTMLElement;
  paint(view: DoorsView): void;
  /** The drawer moved on: no plate's finger-down time carries over. */
  forget(): void;
  /** The field log went to the clipboard: its plate holds Copied, as a row holds Done. */
  copied(): void;
}

const FIELD_LOG: ControlRef = { layer: "ledger", id: "field-log" };

/** The four plates, two by two: Saved copies and Copy field log, Start over and Pass the mine. */
export function createLedgerDoors({
  board,
  on,
}: {
  board: BoardHost;
  on: LedgerDoorsOn;
}): LedgerDoors {
  const root = el("div", "ledger-doors");
  const trackers: PressTracker[] = [];
  const saved = ledgerPlate(
    board,
    trackers,
    [SAVED_COPIES_TITLE, "saved-copies"],
    (p, by) => {
      on.savedCopies(p, by);
    },
  );
  const fieldLog = ledgerPlate(
    board,
    trackers,
    [fieldLogCopy, FIELD_LOG.id],
    (p, by) => {
      on.fieldLog(p, by);
    },
  );
  const startOver = ledgerPlate(
    board,
    trackers,
    [START_OVER, "start-over"],
    (p, by) => {
      on.startOver(p, by);
    },
  );
  const pass = ledgerPlate(board, trackers, [PASS_SHORT, "pass"], (p, by) => {
    on.pass(p, by);
  });
  pass.setAttribute("aria-label", PASS_FULL);
  root.append(saved, fieldLog, startOver, pass);

  const fieldLogText =
    fieldLog.querySelector<HTMLElement>(".board-platebtn-text") ?? fieldLog;
  const paintHeld = (): void => {
    const held = board.view().held.has(controlKey(FIELD_LOG));
    write(fieldLogText, held ? fieldLogCopied : fieldLogCopy);
  };
  board.subscribe(paintHeld);

  return {
    root,
    paint({ ready, passOffered }) {
      fieldLog.disabled = !ready;
      startOver.disabled = !ready;
      hide(pass, !passOffered);
    },
    forget: forgetAll(trackers),
    copied() {
      board.send({
        kind: "result",
        control: FIELD_LOG,
        at: board.clock(),
        outcome: "applied",
      });
    },
  };
}

/**
 * A Ledger page's frame on the drawer's page: its title and line keep the Ledger's hook classes,
 * which the checks find them by.
 */
function ledgerFrame(frame: PageFrame): PageFrame {
  frame.heading.classList.add("ledger-page-title");
  frame.said.classList.add("ledger-page-line");
  return frame;
}

/** Start over, asked on a page of the drawer: Keep first, so it takes the focus. */
export function createStartOverPage({
  board,
  onKeep,
  onYes,
}: {
  board: BoardHost;
  onKeep: PlateAct;
  onYes: PlateAct;
}): {
  readonly root: HTMLElement;
  paint(ready: boolean): void;
  /** The drawer moved on: no answer's finger-down time carries over. */
  forget(): void;
  /** The question again, or (#480) that the mountain could not be kept first. */
  say(kept: boolean): void;
} {
  const page = createAskPage({
    board,
    layer: "ledger",
    className: "ledger-page ledger-start-over-page",
    title: START_OVER_TITLE,
    line: START_OVER_DETAIL,
    answers: [
      {
        label: START_OVER_KEEP,
        id: "keep",
        className: "ledger-keep",
        act: onKeep,
      },
      {
        label: START_OVER_YES,
        id: "yes",
        className: "ledger-yes",
        act: onYes,
        holdsReady: true,
      },
    ],
  });
  ledgerFrame(page);
  return {
    ...page,
    say(kept) {
      page.write(
        START_OVER_TITLE,
        kept ? START_OVER_DETAIL : SAVE_CONFLICT_ERROR,
      );
    },
  };
}

/** Where the browser refuses the clipboard: the log in a read-only box, to copy by hand. */
export function createFieldLogPage(): {
  readonly root: HTMLElement;
  show(text: string): void;
} {
  const { root } = ledgerFrame(
    pageFrame({
      className: "ledger-page ledger-field-log-page",
      title: fieldLogTitle,
      line: fieldLogFallback,
    }),
  );
  // The inset skin's canvas needs a box to sit in: a textarea holds only text.
  const well = el("div", "ledger-field-log-well");
  const box = el("textarea", "ledger-field-log-text board-num");
  box.readOnly = true;
  box.spellcheck = false;
  setAttr(box, "aria-label", fieldLogTitle);
  well.append(box);
  skin(well, "inset");
  root.append(well);
  return {
    root,
    show(text) {
      box.value = text;
      box.select();
    },
  };
}
