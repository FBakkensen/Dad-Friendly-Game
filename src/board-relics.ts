import socketUrl from "./assets/board/relic-socket.png";
import lanternUrl from "./assets/board/relic-lantern.png";
import lanternDarkUrl from "./assets/board/relic-lantern-dark.png";
import shieldUrl from "./assets/board/relic-shield.png";
import shieldDarkUrl from "./assets/board/relic-shield-dark.png";
import hammerUrl from "./assets/board/relic-hammer.png";
import hammerDarkUrl from "./assets/board/relic-hammer-dark.png";
import heartUrl from "./assets/board/relic-heart.png";
import heartDarkUrl from "./assets/board/relic-heart-dark.png";
import crownUrl from "./assets/board/relic-crown.png";
import crownDarkUrl from "./assets/board/relic-crown-dark.png";
import mantleUrl from "./assets/board/relic-mantle.png";
import mantleDarkUrl from "./assets/board/relic-mantle-dark.png";
import { plateButton } from "./board-save";
import { skin } from "./board-skin";
import type { BoardNote } from "./board-note";
import type { ProgressSnapshot } from "./progress-store";
import { relicNote } from "./relic-panels";
import {
  RELICS,
  foundRelics,
  hasRelic,
  nextRelic,
  type RelicId,
} from "./relics";

const LIT: Readonly<Record<RelicId, string>> = {
  lantern: lanternUrl,
  shield: shieldUrl,
  hammer: hammerUrl,
  heart: heartUrl,
  crown: crownUrl,
  mantle: mantleUrl,
};
const DARK: Readonly<Record<RelicId, string>> = {
  lantern: lanternDarkUrl,
  shield: shieldDarkUrl,
  hammer: hammerDarkUrl,
  heart: heartDarkUrl,
  crown: crownDarkUrl,
  mantle: mantleDarkUrl,
};

/** Socket left edge in art px: 15 + 66i CSS px. board.css multiplies by --art. */
const socketAt = (i: number): number => 7.5 + 33 * i;

/**
 * The framed row of six relic sockets and the tag, a label. Each socket's
 * note ends in the Relic shelf key that opens the shelf (#370).
 */
export function createRelicPlate({
  getView,
  note,
  onShelf,
}: {
  getView: () => ProgressSnapshot;
  note: BoardNote;
  /** Opens the shelf; `from` is the socket whose note held the key. */
  onShelf: (from: HTMLElement) => void;
}): { root: HTMLElement; render(): void } {
  const root = document.createElement("section");
  root.className = "board-relics";
  skin(root, "frame");

  const sockets = RELICS.map((relic, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "board-socket";
    button.style.setProperty("--at", String(socketAt(i)));
    const base = document.createElement("img");
    base.className = "board-socket-base";
    base.src = socketUrl;
    base.alt = "";
    base.draggable = false;
    button.append(base);
    button.addEventListener("click", (event) => {
      const words = relicNote(getView().mountain, relic);
      const body = document.createDocumentFragment();
      const h = document.createElement("span");
      h.className = "board-note-h";
      h.textContent = words.title;
      body.append(h, document.createTextNode(words.line));
      if (words.hint !== undefined) {
        const q = document.createElement("span");
        q.className = "board-note-q";
        q.textContent = words.hint;
        body.append(q);
      }
      // The shelf's door: a 48px key in every socket's note (#370).
      const key = plateButton("Relic shelf");
      key.addEventListener("click", () => {
        onShelf(button);
      });
      body.append(key);
      // The note keeps its key until it is used or put away; a socket opened
      // from the keyboard (a click with no pointer: detail 0) hands it focus.
      note.show(button, body, { key, focus: event.detail === 0 });
    });
    const art = document.createElement("img");
    art.className = "board-relic";
    art.alt = "";
    art.draggable = false;
    root.append(button);
    return { button, art, shown: "" };
  });

  // The tag is a label: too small for a finger between the sockets and the
  // stock row, so the shelf opens from a socket note's key instead (#370).
  const tag = document.createElement("div");
  tag.className = "board-tag";
  skin(tag, "tag");
  const tagText = document.createElement("span");
  tagText.className = "board-lg";
  tag.append(tagText);
  root.append(tag);

  const render = (): void => {
    const mountain = getView().mountain;
    const found = foundRelics(mountain).length;
    const count = `${String(found)} of ${String(RELICS.length)} found`;
    const next = nextRelic(mountain);
    tagText.textContent = `Relics of Fatherhood · ${String(found)} of ${String(RELICS.length)}`;
    for (const [i, relic] of RELICS.entries()) {
      const socket = sockets[i];
      if (socket === undefined) continue;
      const { button, art } = socket;
      const has = hasRelic(mountain, relic.id);
      const isNext = relic === next;
      // The art changes only when the socket's state does (#370).
      const shown = has ? LIT[relic.id] : isNext ? DARK[relic.id] : "";
      if (shown !== socket.shown) {
        socket.shown = shown;
        if (shown === "") art.remove();
        else {
          art.src = shown;
          button.append(art);
        }
      }
      const state = has ? "found" : isNext ? "next relic" : "not found yet";
      button.setAttribute("aria-label", `${relic.name}, ${state}. ${count}`);
    }
  };

  return { root, render };
}
