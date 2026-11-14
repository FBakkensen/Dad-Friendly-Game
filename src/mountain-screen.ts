import { createScreenCtx, type ScreenOptions } from "./screen-context";
import { createRunningNow } from "./screen-running";
import { createVein } from "./screen-vein";
import { SPEND_KICK, createBays, createDigRows, readyPick } from "./screen-dig";
import {
  createOtherTab,
  createUpdatePrompt,
  showAppUpdate,
} from "./screen-prompts";
import { createOverlays } from "./screen-overlays";
import { createRail, wireKeys } from "./screen-keys";
import {
  cardsFrom,
  createBoardFace,
  createBuysPanel,
  createEarlyCards,
  createSheetPanels,
} from "./screen-panels";
import { DRAWER_SETTLE_MS } from "./board-drawer";
import { cardUp } from "./card-state";
import { layOutBoard } from "./screen-layout";
import { runScreen } from "./screen-run";
import { type ReadyPick } from "./ready-now";
import { type ProgressStore } from "./progress-store";

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
  const { root, progress, board, listening } = ctx;

  const runningNow = createRunningNow(ctx);

  const vein = createVein(ctx, {
    veinNote: runningNow.veinNote,
    showVein: (spot) => {
      gaugeRow.mine.showVein(spot);
    },
    showIn: (body, ms) => {
      boardNote.show(gaugeRow.mine.root, body, { ms });
    },
    covered: () => overlays.boardCovered(),
  });

  const rail = createRail(ctx, (id, key) => {
    keys.onKey(id, key);
  });
  /** The Ready now pick last painted on the plate: the Buys rows light the same one. */
  let shownPick: ReadyPick = readyPick(ctx);
  const crewPanel = createBuysPanel(ctx, {
    rail,
    pick: () => shownPick,
    overSave: () => saveLine.isOpen(),
  });
  const closeLedger = (): void => {
    sheets.ledger.sheet.close({ restoreFocus: false, by: "program" });
  };
  const early = createEarlyCards(ctx, { onPassed: vein.reset, closeLedger });
  const { legacy } = early;

  const { gaugeRow, readyRow } = createDigRows(ctx, {
    vein,
    legacyBadge: legacy.badge,
    openBuys: (from) => {
      keys.openBuys(from);
    },
  });
  const { boardNote, saveLine, closeBoardPopups, top } = createBoardFace(ctx, {
    runningNow,
    legacy,
    cardUp: () => cards.some(cardUp),
    closeOtherDrawers: () => {
      keys.closeOthers("relics");
    },
    covered: () => overlays.boardBusy(),
  });
  const sheets = createSheetPanels(ctx, {
    rail,
    legacy,
    runningNow,
    saveLine,
    onStartOver: vein.reset,
  });

  const updatePrompt = createUpdatePrompt(board, ctx.paint);
  const otherTab = createOtherTab(progress, board);

  /** The board under the cards: window, gauges, bays and Ready row. */
  const paintBoard = (): void => {
    otherTab.paint(ctx.view().elsewhere);
    gaugeRow.paint();
    // The Ready now pick, once per paint: the bays light theirs (#372).
    const pick = readyPick(ctx);
    shownPick = pick;
    bays.paint(pick);
    readyRow.paint(pick);
    crewPanel.render();
    vein.render();
  };
  /**
   * The screen's one repaint: the store's updates, a panel's own change and
   * the 1s tick all come here, so every clock on the board moves each second.
   */
  const paint = (): void => {
    paintBoard();
    early.paint();
    top.paintRelics();
    sheets.paintLedger();
    legacy.render();
    sheets.paintLater();
    runningNow.paint();
    top.paintPlate();
    sheets.paintCopies();
    saveLine.render();
    overlays.paint();
    // Last, so this paint's cards and drawers are settled (#527).
    top.sayTimerOver();
    // A save from a later build (#558): the update card, once.
    if (ctx.view().newer && !updateAsked) {
      updateAsked = true;
      showAppUpdate(root);
    }
  };
  let updateAsked = false;

  const cards = cardsFrom(early, sheets, {
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
  // One drawer at a time, in this order: the keys' five, then the relics drawer.
  const byKey = { buys: crewPanel, ...sheets.keyed, relics: top.relics };
  const drawers = Object.values(byKey).map((drawer) => drawer.sheet);
  const overlays = createOverlays(ctx, {
    note: boardNote,
    rail,
    cards,
    drawers,
  });
  const keys = wireKeys({
    drawers: byKey,
    closeBoardPopups,
    putSignAway: overlays.putSignAway,
  });

  layOutBoard(root, {
    board,
    top,
    gaugeRow,
    bays,
    readyRow,
    rail,
    sign: overlays.sign,
    drawers,
    saveLine,
    note: boardNote.note,
    park: runningNow.parkRoot,
    cards,
  });

  runScreen(ctx, { paint, setView, vein, gaugeRow, bays, overlays, saveLine });
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
