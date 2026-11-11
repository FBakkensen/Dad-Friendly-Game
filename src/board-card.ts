import { el } from "./board-dom";
import type { BoardHost } from "./board-host";
import type { CardId } from "./board-interaction";
import { plateButton } from "./board-save";
import { skin } from "./board-skin";
import { cardUp, showCard } from "./card-state";
import { forgetAll, pressOnBoard, type PressTracker } from "./card-tap";

/*
 * The board cards' one shell (#464): a shaded dialog over the board with a riveted frame face
 * that rises from the save line into the drawer's box. A card is not a drawer: it has no rail
 * key, no "i", no list and no Back, it opens by itself from the store's view, it sits on top of
 * whatever is open, and it takes its height from its content. Its plates press through the
 * board's model, so the second tap of a tap meant for the board, landing as a card opens under
 * the finger, does nothing.
 */

export interface BoardCardOptions {
  readonly name: CardId;
  /** Today's root class, kept as the card's hook: "welcome-back", "layer-arrival", … */
  readonly hook: string;
  /** Today's title id, kept: "welcome-back-title", "craft-notice-line", … */
  readonly titleId: string;
  readonly board: BoardHost;
}

export interface BoardCard {
  /** div.board-card.<hook>[data-card=name]: the shade over the board, role dialog, aria-modal. */
  readonly root: HTMLElement;
  /** section.board-card-face, frame skin: the title, the body, then the foot. */
  readonly face: HTMLElement;
  readonly title: HTMLElement;
  readonly body: HTMLElement;
  readonly foot: HTMLElement;
  /** A big plate in the foot (or `into`), pressed through the board on this card's layer. */
  plate(
    label: string,
    id: string,
    hook: string,
    act: () => void,
    into?: HTMLElement,
  ): HTMLButtonElement;
  /** Shows or hides: showCard, the model's open/close, and focus on `focus` once as it opens. */
  show(on: boolean, focus?: HTMLElement): void;
  /** A new screen on the card (the conflict's confirm): forgets presses, settles again. */
  page(): void;
  isUp(): boolean;
}

export function createBoardCard({
  name,
  hook,
  titleId,
  board,
}: BoardCardOptions): BoardCard {
  const root = el("div", `board-card ${hook}`);
  root.dataset["card"] = name;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", titleId);
  root.hidden = true;
  const face = el("section", "board-card-face");
  const title = el("h2", "board-card-title");
  title.id = titleId;
  const body = el("div", "board-card-body");
  const foot = el("div", "board-card-foot");
  face.append(title, body, foot);
  skin(face, "frame");
  root.append(face);

  const trackers: PressTracker[] = [];
  const forget = forgetAll(trackers);

  return {
    root,
    face,
    title,
    body,
    foot,
    plate(label, id, plateHook, act, into = foot) {
      const button = plateButton(label);
      button.classList.add("board-card-plate", plateHook);
      trackers.push(
        pressOnBoard(button, board, { layer: name, id }, (decision) => {
          if (decision === "act") {
            act();
          }
        }),
      );
      into.append(button);
      return button;
    },
    show(on, focus) {
      if (on === cardUp(root)) {
        return;
      }
      showCard(root, on);
      forget();
      if (on) {
        board.send({ kind: "open", overlay: name, at: board.clock() });
        focus?.focus({ preventScroll: true });
        return;
      }
      board.send({
        kind: "close",
        overlay: name,
        at: board.clock(),
        by: "program",
      });
    },
    page() {
      forget();
      board.send({ kind: "page", overlay: name, at: board.clock() });
    },
    isUp: () => cardUp(root),
  };
}

/** A line on a card: p.board-card-line.<hook>. Write it with `board-dom#write`, only on a change. */
export function cardLine(hook: string): HTMLElement {
  return el("p", `board-card-line ${hook}`);
}

/** Art on a card at exactly 2x: img.board-card-art, alt "", not draggable. */
export function cardArt(width: number, height = width): HTMLImageElement {
  const art = el("img", "board-card-art");
  art.width = width;
  art.height = height;
  art.alt = "";
  art.draggable = false;
  return art;
}
