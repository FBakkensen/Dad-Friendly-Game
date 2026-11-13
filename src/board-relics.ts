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
import goldCrownUrl from "./assets/relics/crown.png";
import goldHammerUrl from "./assets/relics/hammer.png";
import goldHeartUrl from "./assets/relics/heart.png";
import goldLanternUrl from "./assets/relics/lantern.png";
import goldMantleUrl from "./assets/relics/mantle.png";
import goldShieldUrl from "./assets/relics/shield.png";
import { plateButton } from "./board-save";
import { skin } from "./board-skin";
import type { BoardNote } from "./board-note";
import type { ProgressSnapshot } from "./progress-store";
import { relicNote } from "./relic-rows";
import {
  RELICS,
  foundRelics,
  hasRelic,
  nextRelic,
  type Relic,
  type RelicId,
} from "./relics";

/** Each relic's 24 art px icon, lit: found. */
export const RELIC_LIT: Readonly<Record<RelicId, string>> = {
  lantern: lanternUrl,
  shield: shieldUrl,
  hammer: hammerUrl,
  heart: heartUrl,
  crown: crownUrl,
  mantle: mantleUrl,
};
/** Each relic's gold sprite, 52 to 62 art px: the reveal of a relic just found shows it at 2× (#523). */
export const RELIC_GOLD: Readonly<Record<RelicId, string>> = {
  lantern: goldLanternUrl,
  shield: goldShieldUrl,
  hammer: goldHammerUrl,
  heart: goldHeartUrl,
  crown: goldCrownUrl,
  mantle: goldMantleUrl,
};
/** Each relic's icon, dark: the next to find (the Ledger's relics row shows it too, #375). */
export const RELIC_DARK: Readonly<Record<RelicId, string>> = {
  lantern: lanternDarkUrl,
  shield: shieldDarkUrl,
  hammer: hammerDarkUrl,
  heart: heartDarkUrl,
  crown: crownDarkUrl,
  mantle: mantleDarkUrl,
};

/** Socket left edge in art px: 15 + 66i CSS px. board.css multiplies by --art. */
const socketAt = (i: number): number => 7.5 + 33 * i;

/** A socket's button, its relic art, and the art it shows now ("" for none). */
interface Socket {
  readonly button: HTMLButtonElement;
  readonly art: HTMLImageElement;
  shown: string;
}

/** Where a relic stands on the plate. */
interface SocketState {
  readonly has: boolean;
  readonly isNext: boolean;
  /** "N of 6 found", read after every socket's name. */
  readonly count: string;
}

/** Lit once found, dark while it is the next relic, else empty. */
const socketArt = (id: RelicId, { has, isNext }: SocketState): string => {
  if (has) return RELIC_LIT[id];
  return isNext ? RELIC_DARK[id] : "";
};

const socketWords = ({ has, isNext }: SocketState): string => {
  if (has) return "found";
  return isNext ? "next relic" : "not found yet";
};

/** One socket's art and label. The art changes only when the socket's state does (#370). */
function paintSocket(socket: Socket, relic: Relic, state: SocketState): void {
  const { button, art } = socket;
  const shown = socketArt(relic.id, state);
  if (shown !== socket.shown) {
    socket.shown = shown;
    if (shown === "") art.remove();
    else {
      art.src = shown;
      button.append(art);
    }
  }
  button.setAttribute(
    "aria-label",
    `${relic.name}, ${socketWords(state)}. ${state.count}`,
  );
}

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
    const socket: Socket = { button, art, shown: "" };
    return socket;
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
      paintSocket(socket, relic, {
        has: hasRelic(mountain, relic.id),
        isNext: relic === next,
        count,
      });
    }
  };

  return { root, render };
}
