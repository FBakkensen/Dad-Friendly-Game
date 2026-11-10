import { cardUp } from "./card-state";
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
import { createBoardNote } from "./board-note";
import { DRAWER_SETTLE_MS, createSheetScrim } from "./board-drawer";
import { type BoardHost } from "./board-host";
import { createKeyRail } from "./board-keys";
import { setAttr } from "./board-dom";
import { readyNow, type ReadyPick } from "./ready-now";
import { runBoardLoop } from "./board-window";
import { createBoostDial, createOdometer } from "./board-stock";
import { quietAwayWords } from "./screen-words";
import { createRelicPlate } from "./board-relics";
import { createSaveLine } from "./board-save";
import { liveCrewBoost } from "./crew-boost";
import { createRelicPanels } from "./relic-panels";
import { createArrivalPanel } from "./arrival-panel";
import { createWelcomePanel } from "./welcome-panel";
import { createMenuPanel } from "./menu-panel";
import { createSaveConflictPanel } from "./save-conflict-panel";
import { createSavedCopiesPanel } from "./saved-copies-panel";
import { createLegacyPanel } from "./legacy-panel";
import { createCrewPanel } from "./crew-panel";
import { createEngineersPanel } from "./engineers-panel";
import { createUpgradesPanel } from "./upgrades-panel";
import { createWorkshopPanel } from "./workshop-panel";
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
      odometer.spend(stones);
      gaugeRow.kick(SPEND_KICK);
    },
  });
  const { root, progress, auth, dispatch, now, board, signal, listening } = ctx;
  const { lanternUrl, mountainUrl, stoneUrl, veinUrl, tierArt, relicArt } =
    ctx.art;

  const ledger = createLedger(ctx);
  const runningNow = createRunningNow(ctx);
  const { veinNote, effectRow, chipFor } = runningNow;

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
  const crewPanel = createCrewPanel({
    progress,
    dispatch,
    getView: ctx.view,
    now,
    pick: () => shownPick,
    board,
    overSave: () => saveLine.isOpen(),
    door: rail.keys.buys,
    ...(signal === undefined ? {} : { signal }),
  });

  const welcomePanel = createWelcomePanel({ progress, getView: ctx.view });
  const { welcome } = welcomePanel;
  const arrival = createArrivalPanel({
    progress,
    getView: ctx.view,
    mountainUrl,
    oreUrl: stoneUrl,
    lanternUrl,
    tierArt,
  });

  // A panel's own change repaints the whole screen: its `requestRender` is `ctx.paint`, which
  // reads `paint` (set up below) when called.
  // Pass the mine to your kid (M6): offered from the Legend card and the menu.
  const legacy = createLegacyPanel({
    progress,
    getView: ctx.view,
    onPassed: vein.reset,
    beforeOpen: () => {
      menuPanel.close();
    },
    requestRender: ctx.paint,
  });

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

  /** The socket whose note opened the shelf: focus goes back there. */
  let shelfDoor: HTMLElement | undefined;
  const relics = createRelicPanels({
    progress,
    getView: ctx.view,
    relicArt,
    keepsakeUrl: veinUrl,
    onPassTheMine: () => {
      legacy.open(undefined);
    },
    onShelfClosed: () => {
      shelfDoor?.focus();
    },
    requestRender: ctx.paint,
  });
  const { shelf, detail, reveal, legend } = relics;

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
  const relicPlate = createRelicPlate({
    getView: ctx.view,
    note: boardNote,
    onShelf: (from) => {
      shelfDoor = from;
      closeBoardPopups();
      relics.openShelf();
    },
  });
  /** The Running now note stays a little longer than a relic's: it is a list. */
  const RUNNING_NOTE_MS = 6000;
  const odometer = createOdometer();
  const dial = createBoostDial({
    onOpen: () => {
      boardNote.show(dial.root, runningNow.running, { ms: RUNNING_NOTE_MS });
    },
  });
  /** The odometer and the dial. A spend is shown by `dispatch`, from what the move took. */
  const renderStock = (): void => {
    odometer.set(ctx.view().mountain.pocket);
    dial.set(liveCrewBoost(ctx.view().mountain, now()));
  };

  const closeMenu = (): void => {
    menuPanel.close();
  };
  const workshop = createWorkshopPanel({
    dispatch,
    getView: ctx.view,
    now,
    stoneUrl,
    hammerUrl: relicArt.hammer,
    onOpen: closeMenu,
    onClose: () => {
      keys.workshopClosed();
    },
    requestRender: ctx.paint,
  });

  const savedCopies = createSavedCopiesPanel({
    progress,
    now,
    onOpen: closeMenu,
    requestRender: ctx.paint,
  });
  const conflictSheet = createSaveConflictPanel({
    progress,
    now,
    requestRender: ctx.paint,
  });
  const menuPanel = createMenuPanel({
    progress,
    getView: ctx.view,
    auth,
    onStartOver: vein.reset,
    extras: [
      ledger.root,
      workshop.menuEntry,
      legacy.menuPass,
      savedCopies.entry,
    ],
    door: rail.keys.ledger,
    requestRender: ctx.paint,
    signal,
  });
  const { menu, confirm, fieldLogSheet } = menuPanel;

  const upgrades = createUpgradesPanel({
    progress,
    dispatch,
    getView: ctx.view,
    now,
    chipFor,
    board,
    overSave: () => saveLine.isOpen(),
    door: rail.keys.upgrades,
    ...(signal === undefined ? {} : { signal }),
  });

  const engineers = createEngineersPanel({
    dispatch,
    getView: ctx.view,
    iconUrl: tierArt.helper,
    badgeUrl: {
      cart: tierArt.cart,
      drill: tierArt.drill,
      borer: tierArt.borer,
      machine: tierArt.machine,
    },
    chipHost: effectRow,
    door: rail.keys.engineers,
    fallbackDoor: rail.keys.ledger,
    now,
    requestRender: ctx.paint,
  });

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
  const paintPanels = (): void => {
    welcomePanel.render();
    arrival.render();
    relics.render();
    menuPanel.render();
    legacy.render();
    upgrades.render();
    engineers.render();
    workshop.render();
    // Today's Workshop sheet knows no key: the screen says whether it is open (#373).
    setAttr(
      rail.keys.workshop,
      "aria-expanded",
      cardUp(workshop.sheet) ? "true" : "false",
    );
  };
  const paintRest = (): void => {
    relicPlate.render();
    renderStock();
    savedCopies.render();
    conflictSheet.render(ctx.view().saveConflict, ctx.view().elsewhere);
    saveLine.render();
  };
  /**
   * The screen's one repaint: the store's updates, a panel's own change and
   * the 1s tick all come here, so every clock on the board moves each second.
   */
  const paint = (): void => {
    paintBoard();
    paintPanels();
    runningNow.paint();
    paintRest();
    overlays.paint();
  };

  /** The cards, in the order they stand in the root. */
  const cards = [
    welcome,
    arrival.layer,
    arrival.notice,
    reveal,
    legend,
    shelf,
    detail,
    confirm,
    legacy.dialog,
    menu,
    fieldLogSheet,
    engineers.sheet,
    workshop.sheet,
    updatePrompt,
    otherTab.root,
    savedCopies.root,
    conflictSheet.root,
  ];
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
  const stock = document.createElement("div");
  stock.className = "board-stock";
  stock.append(odometer.root, dial.root);
  const boardTop = document.createElement("div");
  boardTop.className = "board-top";
  boardTop.append(relicPlate.root, stock);
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
