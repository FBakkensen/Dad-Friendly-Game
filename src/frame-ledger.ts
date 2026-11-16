import ledgerUrl from "./assets/board/icon-ledger.png";
import type { AuthController } from "./auth";
import { el } from "./board-dom";
import { createSheetScrim } from "./board-drawer";
import type { BoardHost } from "./board-host";
import type { DeviceStorage } from "./buys-amount";
import { pressOnBoard } from "./card-tap";
import { createLedgerPanel } from "./ledger-panel";
import type { ProgressStore } from "./progress-store";
import { createSavedCopiesPanel } from "./saved-copies-panel";
import { soundSetting } from "./sound";

/**
 * The order strip's key on slice 1's frame (#708): today's Ledger drawer,
 * with the sound switch in its head, Saved copies and Start over. They are
 * today's panels on a board host the frame shares with the save's cards, so
 * every press keeps the settle. The Ledger slides up in today's sheet clip,
 * with today's scrim over the frame above it; Saved copies is a board card
 * over the frame. Passing the mine is not live in a fresh mine.
 */
export type FrameLedger = {
  /** The key at the order strip's end. */
  readonly key: HTMLButtonElement;
  /** The Ledger's clip, then Saved copies, each laid over the frame. */
  readonly roots: readonly HTMLElement[];
  readonly paint: () => void;
  /** A card came up over it: it shuts, and focus stays where it is. */
  readonly close: () => void;
};

/** Passing the mine waits for its step on the road (#642). */
const NO_PASS = {
  offered: () => false,
  open: () => undefined,
} as const;

export function createFrameLedger({
  progress,
  auth,
  board,
  storage,
  now,
  overSave,
  onOpen,
  requestPaint,
  signal,
}: {
  progress: ProgressStore;
  auth: AuthController;
  /** The frame's board host, shared with the save's cards. */
  board: BoardHost;
  /** Where the sound's choice is kept; localStorage when undefined. */
  storage: DeviceStorage | undefined;
  now: () => number;
  /** The save drawer is open over the frame: its Escape is its own. */
  overSave: () => boolean;
  /** The Ledger opens: the frame closes its own sheets. */
  onOpen: () => void;
  /** Repaints the frame: a card's own change, or a Start over. */
  requestPaint: () => void;
  signal?: AbortSignal | undefined;
}): FrameLedger {
  const key = el("button", "frame-key");
  key.type = "button";
  key.setAttribute("aria-label", "Ledger");
  key.setAttribute("aria-haspopup", "dialog");
  const icon = el("img", "frame-key-icon");
  icon.src = ledgerUrl;
  icon.alt = "";
  icon.width = 32;
  icon.height = 32;
  icon.draggable = false;
  key.append(icon);

  const savedCopies = createSavedCopiesPanel({
    progress,
    now,
    board,
    requestRender: requestPaint,
  });
  const ledger = createLedgerPanel({
    progress,
    getView: () => progress.getSnapshot(),
    auth,
    board,
    overSave,
    door: key,
    legacy: NO_PASS,
    savedCopies,
    onStartOver: requestPaint,
    sound: soundSetting(storage),
    signal,
  });
  pressOnBoard(key, board, { layer: "board", id: "key:ledger" }, (decision) => {
    if (decision === "act") {
      onOpen();
      ledger.open(key);
    }
  });

  const clip = el("div", "board-sheet-clip");
  clip.append(
    ledger.sheet.root,
    createSheetScrim({ board, sheets: [ledger.sheet] }),
  );
  return {
    key,
    roots: [clip, savedCopies.root],
    paint: () => {
      ledger.render();
      savedCopies.render();
    },
    close: () => {
      ledger.sheet.close({ restoreFocus: false, by: "program" });
    },
  };
}
