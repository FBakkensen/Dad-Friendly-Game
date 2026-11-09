import buysUrl from "./assets/board/icon-buys.png";
import engineersDimUrl from "./assets/board/icon-engineers-dim.png";
import engineersUrl from "./assets/board/icon-engineers.png";
import ledgerUrl from "./assets/board/icon-ledger.png";
import upgradesUrl from "./assets/board/icon-upgrades.png";
import workshopDimUrl from "./assets/board/icon-workshop-dim.png";
import workshopUrl from "./assets/board/icon-workshop.png";
import dotUrl from "./assets/board/key-dot.png";
import { el, frameX, hide, mark, setAttr, write } from "./board-dom";
import { KEY_IDS, type KeyCap, type KeyId, type KeyView } from "./key-rail";

/*
 * The key rail (#373): five steel keys under the Ready row, each the door to its drawer or
 * sheet. key-rail.ts decides what each key shows; this draws it and passes the click on. The
 * cap is key.png's 64px cells (rest, down, off, lit), changed whole frames at a time. Places
 * and sizes are in board.css; every render writes only what changed.
 */

export interface KeyRail {
  readonly root: HTMLElement;
  readonly keys: Readonly<Record<KeyId, HTMLButtonElement>>;
  /** Undefined until the save is in: rest caps, bright icons, nothing from the save. */
  render(views: Readonly<Record<KeyId, KeyView>> | undefined): void;
}

const NAME: Readonly<Record<KeyId, string>> = {
  buys: "Buys",
  workshop: "Workshop",
  engineers: "Engineers",
  upgrades: "Upgrades",
  ledger: "Ledger",
};

/** Bright and locked icons. Buys and Upgrades are never locked; the Ledger has no dim. */
const ICON: Readonly<Record<KeyId, { bright: string; dim: string }>> = {
  buys: { bright: buysUrl, dim: buysUrl },
  workshop: { bright: workshopUrl, dim: workshopDimUrl },
  engineers: { bright: engineersUrl, dim: engineersDimUrl },
  upgrades: { bright: upgradesUrl, dim: upgradesUrl },
  ledger: { bright: ledgerUrl, dim: ledgerUrl },
};

/** key.png's cells: the press is frame 1. */
const FRAME: Readonly<Record<KeyCap, number>> = { rest: 0, locked: 2, lit: 3 };
const DOWN = 1;
/** One cell, 32 art px, in CSS px. */
const CELL_PX = 64;

/** Held until a view opens them: their doors need the save. */
const HELD_UNTIL_READY: ReadonlySet<KeyId> = new Set(["workshop", "engineers"]);

/** formatClock's shape: m:ss or h:mm:ss. */
const CLOCK = /^\d+(?::\d\d)+$/;

function image(className: string, src: string, px: number): HTMLImageElement {
  const made = el("img", className);
  made.src = src;
  made.alt = "";
  made.width = px;
  made.height = px;
  made.draggable = false;
  return made;
}

export function createKeyRail({
  onKey,
}: {
  onKey: (id: KeyId, key: HTMLButtonElement) => void;
}): KeyRail {
  const root = el("nav", "board-rail");
  root.setAttribute("aria-label", "Actions");

  const built = KEY_IDS.map((id) => {
    const key = el("button", "board-key");
    key.type = "button";
    key.dataset["key"] = id;
    key.setAttribute("aria-haspopup", "dialog");
    key.setAttribute("aria-label", NAME[id]);
    key.disabled = HELD_UNTIL_READY.has(id);
    const cap = el("i", "board-key-cap");
    cap.setAttribute("aria-hidden", "true");
    frameX(cap, FRAME.rest, CELL_PX);
    const icon = image("board-key-icon", ICON[id].bright, 32);
    const dot = image("board-key-dot", dotUrl, 20);
    dot.hidden = true;
    cap.append(icon, dot);
    const name = el("span", "board-key-name board-lg", NAME[id]);
    const sub = el("span", "board-key-sub");
    sub.hidden = true;
    key.append(cap, name, sub);

    /** The cap's frame when not held down: the last view's. */
    let base = FRAME.rest;
    let down = false;
    let disabled = key.disabled;
    const up = (): void => {
      if (!down) {
        return;
      }
      down = false;
      key.classList.remove("is-down");
      frameX(cap, base, CELL_PX);
    };
    key.addEventListener("pointerdown", () => {
      if (disabled) {
        return;
      }
      down = true;
      key.classList.add("is-down");
      frameX(cap, DOWN, CELL_PX);
    });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
      key.addEventListener(type, up);
    }
    key.addEventListener("click", () => {
      up();
      onKey(id, key);
    });

    const render = (view: KeyView | undefined): void => {
      const locked = view?.cap === "locked";
      const lit = view?.cap === "lit";
      base = FRAME[view?.cap ?? "rest"];
      if (!down) {
        frameX(cap, base, CELL_PX);
      }
      setAttr(icon, "src", locked ? ICON[id].dim : ICON[id].bright);
      disabled = view === undefined ? HELD_UNTIL_READY.has(id) : locked;
      if (key.disabled !== disabled) {
        key.disabled = disabled;
      }
      if (disabled) {
        up();
      }
      mark(key, "is-locked", locked);
      mark(key, "is-lit", lit);
      hide(dot, view?.dot !== true);
      const words = view?.sub ?? "";
      write(sub, words);
      hide(sub, words === "");
      mark(sub, "board-num", CLOCK.test(words));
      mark(key, "has-sub", words !== "");
      setAttr(key, "aria-label", view?.aria ?? NAME[id]);
    };
    return [id, key, render] as const;
  });

  const keys = Object.fromEntries(
    built.map(([id, key]) => [id, key]),
  ) as Record<KeyId, HTMLButtonElement>;
  root.append(...built.map(([, key]) => key));

  return {
    root,
    keys,
    render(views) {
      for (const [id, , render] of built) {
        render(views?.[id]);
      }
    },
  };
}
