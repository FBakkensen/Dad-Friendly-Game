import { el, hide, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { controlKey, type ControlRef } from "./board-interaction";
import { plateButton } from "./board-save";
import { skin } from "./board-skin";
import { pressOnBoard } from "./card-tap";
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
  fieldLogCopied,
  fieldLogCopy,
  fieldLogFallback,
  fieldLogTitle,
} from "./screen-words";

/*
 * The Ledger drawer's own controls (#375): the Tonight box, the four plates, and the two pages
 * the drawer shows in its list's place (the Start over confirm and the field log's
 * copy-it-yourself box). Built on the shared plate button, skin and board presses; no other
 * drawer has a log box, a plate grid or a page that asks, so the shared row and shell stay
 * generic. Every press goes through the board's model, so a finger that lands while the drawer
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

/** A Ledger plate whose press, past the settle and any hold, runs `act` with the plate. */
function ledgerPlate(
  board: BoardHost,
  label: string,
  id: string,
  act: (plate: HTMLButtonElement) => void,
): HTMLButtonElement {
  const plate = plateButton(label);
  plate.classList.add(`ledger-${id}`);
  pressOnBoard(plate, board, { layer: "ledger", id }, (decision) => {
    if (decision === "act") {
      act(plate);
    }
  });
  return plate;
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

/** Where each plate leads; each gets the plate it was pressed on. */
export interface LedgerDoorsOn {
  savedCopies(from: HTMLButtonElement): void;
  fieldLog(from: HTMLButtonElement): void;
  startOver(from: HTMLButtonElement): void;
  pass(from: HTMLButtonElement): void;
}

export interface LedgerDoors {
  readonly root: HTMLElement;
  paint(view: DoorsView): void;
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
  const saved = ledgerPlate(board, SAVED_COPIES_TITLE, "saved-copies", (p) => {
    on.savedCopies(p);
  });
  const fieldLog = ledgerPlate(board, fieldLogCopy, FIELD_LOG.id, (p) => {
    on.fieldLog(p);
  });
  const startOver = ledgerPlate(board, START_OVER, "start-over", (p) => {
    on.startOver(p);
  });
  const pass = ledgerPlate(board, PASS_SHORT, "pass", (p) => {
    on.pass(p);
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

/** A drawer page's frame: its title and its one line. */
function pageFrame(
  className: string,
  title: string,
  line: string,
): HTMLElement {
  const root = el("div", `ledger-page ${className}`);
  root.append(
    el("h3", "ledger-page-title", title),
    el("p", "ledger-page-line", line),
  );
  return root;
}

/** Start over, asked on a page of the drawer: Keep first, so it takes the focus. */
export function createStartOverPage({
  board,
  onKeep,
  onYes,
}: {
  board: BoardHost;
  onKeep: (from: HTMLButtonElement) => void;
  onYes: (from: HTMLButtonElement) => void;
}): { readonly root: HTMLElement; paint(ready: boolean): void } {
  const root = pageFrame(
    "ledger-start-over-page",
    START_OVER_TITLE,
    START_OVER_DETAIL,
  );
  const keep = ledgerPlate(board, START_OVER_KEEP, "keep", onKeep);
  const yes = ledgerPlate(board, START_OVER_YES, "yes", onYes);
  const answers = el("div", "ledger-page-answers");
  answers.append(keep, yes);
  root.append(answers);
  skin(root, "frame");
  return {
    root,
    paint(ready) {
      yes.disabled = !ready;
    },
  };
}

/** Where the browser refuses the clipboard: the log in a read-only box, to copy by hand. */
export function createFieldLogPage(): {
  readonly root: HTMLElement;
  show(text: string): void;
} {
  const root = pageFrame(
    "ledger-field-log-page",
    fieldLogTitle,
    fieldLogFallback,
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
