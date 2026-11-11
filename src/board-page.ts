import { el, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import type { DrawerId, Pointer } from "./board-interaction";
import { drawerPlate } from "./board-save";
import { skin } from "./board-skin";
import { forgetAll, type PressTracker } from "./card-tap";

/*
 * A drawer's page that asks (#455): a titled page with one line and two plates, shown in the
 * list's place (BoardSheet.showPage). The Ledger's Start over and the Engineers' Call her back
 * and Promote ask on it. Its plates press through the board's model, so a finger that lands
 * while the page settles is the second tap of the one that opened it.
 */

/** What a plate's press runs: the plate, and how the press came (a finger's close settles). */
export type PlateAct = (plate: HTMLButtonElement, by: Pointer) => void;

/** One answer on a page that asks. */
export interface Answer {
  readonly label: string;
  /** Its control id on the drawer's layer. */
  readonly id: string;
  /** The plate's own class, the hook the checks find it by. */
  readonly className: string;
  readonly act: PlateAct;
  /** Disabled until the save is in: the answer that changes the save. */
  readonly holdsReady?: boolean;
}

/** A page's frame, its title and its line. */
export interface PageFrame {
  readonly root: HTMLElement;
  readonly heading: HTMLElement;
  readonly said: HTMLElement;
}

/**
 * A drawer page's frame: `div.board-page` with `className`, and its title and one line, which
 * name and describe it. Their ids come from the last class.
 */
export function pageFrame({
  className,
  title,
  line,
}: {
  className: string;
  title: string;
  line: string;
}): PageFrame {
  const root = el("div", `board-page ${className}`);
  const heading = el("h3", "board-page-title", title);
  const said = el("p", "board-page-line", line);
  const name = className.slice(className.lastIndexOf(" ") + 1);
  heading.id = `${name}-title`;
  said.id = `${name}-line`;
  setAttr(root, "role", "group");
  setAttr(root, "aria-labelledby", heading.id);
  setAttr(root, "aria-describedby", said.id);
  root.append(heading, said);
  return { root, heading, said };
}

export interface AskPage extends PageFrame {
  /** Until the save is in, the answers that hold for it are disabled. */
  paint(ready: boolean): void;
  write(title: string, line: string): void;
  /** The drawer moved on: no answer's finger-down time carries over. */
  forget(): void;
}

/** A page that asks, its safe answer first so it takes the focus. */
export function createAskPage({
  board,
  layer,
  className,
  title,
  line,
  answers,
}: {
  board: BoardHost;
  layer: DrawerId;
  className: string;
  title: string;
  line: string;
  answers: readonly [Answer, Answer];
}): AskPage {
  const frame = pageFrame({ className, title, line });
  const trackers: PressTracker[] = [];
  const plates = answers.map((answer) => ({
    answer,
    plate: drawerPlate(
      board,
      trackers,
      {
        label: answer.label,
        className: answer.className,
        control: { layer, id: answer.id },
      },
      answer.act,
    ),
  }));
  const row = el("div", "board-page-answers");
  row.append(...plates.map(({ plate }) => plate));
  frame.root.append(row);
  skin(frame.root, "frame");
  return {
    ...frame,
    paint(ready) {
      for (const { answer, plate } of plates) {
        plate.disabled = answer.holdsReady === true && !ready;
      }
    },
    write(newTitle, newLine) {
      write(frame.heading, newTitle);
      write(frame.said, newLine);
    },
    forget: forgetAll(trackers),
  };
}
