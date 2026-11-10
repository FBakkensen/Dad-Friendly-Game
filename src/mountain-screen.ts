import { createScreenCtx, type ScreenOptions } from "./screen-context";
import { createLedger } from "./screen-ledger";
import { createRunningNow } from "./screen-running";
import { QUIET_NOTE_MS, createVein } from "./screen-vein";
import {
  SPEND_KICK,
  createBays,
  createGaugeRow,
  createReadyRow,
} from "./screen-dig";
import { createOtherTab, createUpdatePrompt } from "./screen-prompts";
import { createOverlays } from "./screen-overlays";
import { wireKeys } from "./screen-keys";
import {
  cardsFrom,
  createBoardTop,
  createBuysPanel,
  createEarlyCards,
  createSheetPanels,
} from "./screen-panels";
import { createBoardNote } from "./board-note";
import { DRAWER_SETTLE_MS, createSheetScrim } from "./board-drawer";
import { type BoardHost } from "./board-host";
import { createKeyRail } from "./board-keys";
import { readyNow, type ReadyPick } from "./ready-now";
import { runBoardLoop } from "./board-window";
import { quietAwayWords } from "./screen-words";
import { createSaveLine } from "./board-save";
import { type ProgressSnapshot, type ProgressStore } from "./progress-store";

export { showAppUpdate } from "./screen-prompts";

/**
 * A tap on Saving for or on a bay opens Buys over the board, so the second tap
 * of a sleepy double tap lands on whichever Buys card is now under the finger,
 * and a card buys on one tap (#372). A card pressed this soon after Buys opened
 * buys nothing. Two taps of a double tap land about 100–300ms apart; a dad who
 * opened Buys on purpose reads the card first, which takes longer than 400ms.
 * Only buying waits: Back to the mountain and the other sheet controls work at
 * once, and the sheet is not `inert`, which would let the tap fall through to
 * the plate beneath and buy there. The value is the drawer shell's settle
 * (board-drawer.ts), which the B5 drawers and their Back plates share.
 */
export const BUYS_SETTLE_MS = DRAWER_SETTLE_MS;

/**
 * The screen's next view. A save that loads again (ready, then not) tells the board's model,
 * whose holds and blinks spoke of the old save.
 */
function nextView(
  board: BoardHost,
  view: ProgressSnapshot,
  next: ProgressSnapshot,
): ProgressSnapshot {
  if (view.ready && !next.ready) {
    board.send({ kind: "unloaded" });
  }
  return next;
}

export function mountMountainScreen(options: ScreenOptions): void {
  const { ctx, setView } = createScreenCtx(options, {
    paint: () => {
      paint();
    },
    spent: (stones) => {
      top.stock.spend(stones);
      gaugeRow.kick(SPEND_KICK);
    },
  });
  const { root, progress, auth, now, board, signal, listening } = ctx;

  const ledger = createLedger(ctx);
  const runningNow = createRunningNow(ctx);
  const { veinNote } = runningNow;

  const vein = createVein(ctx, {
    veinNote,
    showVein: (spot) => {
      gaugeRow.mine.showVein(spot);
    },
    showIn: (body, ms) => {
      boardNote.show(gaugeRow.mine.root, body, { ms });
    },
  });

  /**
   * The key rail: Buys, Workshop and Upgrades open from here; Engineers and the Ledger key open
   * through their panels' own click listeners. Every key first puts the board's popups away.
   */
  const rail = createKeyRail({
    board,
    onKey: (id, key) => {
      keys.onKey(id, key);
    },
  });
  /** The Ready now pick last painted on the plate: the Buys rows light the same one. */
  let shownPick: ReadyPick = readyNow(
    ctx.view().mountain,
    now(),
    ctx.view().trouble,
  );
  const crewPanel = createBuysPanel(ctx, {
    rail,
    pick: () => shownPick,
    overSave: () => saveLine.isOpen(),
  });
  const closeMenu = (): void => {
    sheets.menuPanel.close();
  };
  const early = createEarlyCards(ctx, { onPassed: vein.reset, closeMenu });
  const { legacy } = early;

  const gaugeRow = createGaugeRow(ctx, {
    vein,
    legacyBadge: legacy.badge,
    onDug: (mined) => {
      readyRow.digButton.dug(mined);
      readyRow.digButton.echo();
    },
  });
  const readyRow = createReadyRow(ctx, {
    dig: gaugeRow.dig,
    mine: gaugeRow.mine,
    openBuys: (from) => {
      keys.openBuys(from);
    },
  });

  // The board (#370): the note, the relic plate, the odometer, the boost dial
  // and the save line. The note is placed in board coordinates inside root.
  const boardNote = createBoardNote(root, signal, runningNow.park);
  const saveLine = createSaveLine({
    progress,
    auth,
    getView: ctx.view,
    now,
    signal,
  });
  // Opening a sheet, the shelf or the menu puts the board's popups away.
  const closeBoardPopups = (): void => {
    saveLine.close();
    boardNote.hide();
  };
  const top = createBoardTop(ctx, {
    note: boardNote,
    runningNow,
    legacy,
    closeBoardPopups,
  });
  const { relicPlate } = top;
  const sheets = createSheetPanels(ctx, {
    rail,
    ledgerRoot: ledger.root,
    legacy,
    runningNow,
    saveLine,
    onStartOver: vein.reset,
    closeMenu,
    workshopClosed: () => {
      keys.workshopClosed();
    },
  });
  const { upgrades, workshop } = sheets;

  const updatePrompt = createUpdatePrompt(() => {
    paint();
  });
  const otherTab = createOtherTab(progress);

  /** The board under the cards: stones, window, gauges, bays, Ready row and guide. */
  const paintBoard = (): void => {
    ledger.paintStones();
    otherTab.paint(ctx.view().elsewhere);
    gaugeRow.paint();
    // The Ready now pick, once per paint: the bays light theirs (#372).
    const pick = readyNow(ctx.view().mountain, now(), ctx.view().trouble);
    shownPick = pick;
    bays.paint(pick);
    readyRow.paint(pick);
    crewPanel.render();
    vein.render();
    ledger.paintGuide();
  };
  /**
   * The screen's one repaint: the store's updates, a panel's own change and
   * the 1s tick all come here, so every clock on the board moves each second.
   */
  const paint = (): void => {
    paintBoard();
    early.paint();
    top.paintRelics();
    sheets.paintMenu();
    legacy.render();
    sheets.paintLater();
    runningNow.paint();
    top.paintPlate();
    sheets.paintCopies();
    saveLine.render();
    overlays.paint();
  };

  const cards = cardsFrom(early, top, sheets, {
    updatePrompt,
    otherTab: otherTab.root,
  });
  saveOnLeave(progress, listening);

  const bays = createBays(ctx, {
    note: boardNote,
    openBuys: (from) => {
      keys.openBuys(from);
    },
  });
  const overlays = createOverlays(ctx, {
    note: boardNote,
    rail,
    cards,
    drawers: [crewPanel.sheet, upgrades.sheet],
  });
  const keys = wireKeys(ctx, {
    rail,
    crewPanel,
    upgrades,
    workshop,
    closeBoardPopups,
    putSignAway: overlays.putSignAway,
  });

  // The board's top: the relic plate and the stock row (#370).
  const stockRow = document.createElement("div");
  stockRow.className = "board-stock";
  stockRow.append(top.stock.odometer.root, top.stock.dial.root);
  const boardTop = document.createElement("div");
  boardTop.className = "board-top";
  boardTop.append(relicPlate.root, stockRow);
  // The closed drawer waits below the save line. This box clips it there, so
  // the board never gains scroll height from it.
  const drawerClip = document.createElement("div");
  drawerClip.className = "board-drawer-clip";
  drawerClip.append(saveLine.drawer);
  // The drawers slide up inside the board above the save line; the scrim over
  // the board's top closes them, and hands a tap on a relic to its socket (#373).
  const sheetClip = document.createElement("div");
  sheetClip.className = "board-sheet-clip";
  sheetClip.append(
    crewPanel.sheet.root,
    upgrades.sheet.root,
    createSheetScrim({
      board,
      sheets: [crewPanel.sheet, upgrades.sheet],
      sockets: () => [
        ...relicPlate.root.querySelectorAll<HTMLElement>(".board-socket"),
      ],
    }),
  );

  root.replaceChildren(
    boardTop,
    gaugeRow.root,
    bays.root,
    readyRow.root,
    rail.root,
    overlays.sign.root,
    sheetClip,
    drawerClip,
    saveLine.line,
    boardNote.note,
    runningNow.parkRoot,
    ...cards,
  );

  const ticking = setInterval(() => {
    progress.tick();
    vein.step();
    paint();
  }, 1000);
  signal?.addEventListener("abort", () => {
    clearInterval(ticking);
  });
  // The window's machines and the needle move on hard steps, once a frame.
  runBoardLoop((dt) => {
    gaugeRow.tick(dt);
    bays.tick(dt);
  }, signal);
  vein.listen();
  overlays.listen();

  const unsubscribe = progress.subscribe((next) => {
    setView(nextView(board, ctx.view(), next));
    // A short absence pays with a small note, not the welcome card (#334).
    const { quietAway } = ctx.view();
    if (quietAway !== undefined) {
      vein.showNote(quietAwayWords(quietAway), QUIET_NOTE_MS);
      queueMicrotask(() => {
        progress.dismissQuietAway();
      });
    }
    paint();
  });
  signal?.addEventListener("abort", unsubscribe);
  // The save line fits its words by measuring; measure again once the board's
  // fonts have loaded (happy-dom has no FontFaceSet).
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  void fonts?.ready.then(() => {
    if (signal?.aborted !== true) {
      saveLine.render();
    }
  });
}

/**
 * A hidden or closed page saves at once. A return settles after the server has been read, so a
 * tap cannot land on top of another device's save; guests settle at once.
 */
function saveOnLeave(
  progress: ProgressStore,
  listening: { readonly signal?: AbortSignal },
): void {
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        progress.flush();
        return;
      }
      const resume = progress.resume();
      if (resume.kind === "reading") {
        void resume.done.then(() => {
          progress.tick();
        });
        return;
      }
      progress.tick();
    },
    listening,
  );
  window.addEventListener(
    "pagehide",
    () => {
      progress.flush();
    },
    listening,
  );
}
