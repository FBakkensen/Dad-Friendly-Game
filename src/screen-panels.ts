import { cardUp } from "./card-state";
import type { ScreenCtx } from "./screen-context";
import type { createRunningNow } from "./screen-running";
import { createBoardNote, type BoardNote } from "./board-note";
import type { KeyRail } from "./board-keys";
import { setAttr } from "./board-dom";
import { createBoostDial, createOdometer } from "./board-stock";
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
import type { ReadyPick } from "./ready-now";

/** The Buys drawer: the crew panel, lit by the Ready now pick last painted. */
export function createBuysPanel(
  ctx: ScreenCtx,
  deps: {
    readonly rail: KeyRail;
    readonly pick: () => ReadyPick;
    readonly overSave: () => boolean;
  },
): ReturnType<typeof createCrewPanel> {
  const { progress, dispatch, now, board, signal } = ctx;
  return createCrewPanel({
    progress,
    dispatch,
    getView: ctx.view,
    now,
    pick: deps.pick,
    board,
    overSave: deps.overSave,
    door: deps.rail.keys.buys,
    ...(signal === undefined ? {} : { signal }),
  });
}

/** The cards the first paint reaches for before the board is built: welcome, arrival, legacy. */
export function createEarlyCards(
  ctx: ScreenCtx,
  deps: {
    readonly onPassed: () => void;
    readonly closeMenu: () => void;
  },
): {
  welcome: ReturnType<typeof createWelcomePanel>["welcome"];
  arrival: ReturnType<typeof createArrivalPanel>;
  legacy: ReturnType<typeof createLegacyPanel>;
  paint(): void;
} {
  const { progress } = ctx;
  const { mountainUrl, stoneUrl, lanternUrl, tierArt } = ctx.art;
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
    onPassed: deps.onPassed,
    beforeOpen: deps.closeMenu,
    requestRender: ctx.paint,
  });
  return {
    welcome,
    arrival,
    legacy,
    paint: () => {
      welcomePanel.render();
      arrival.render();
    },
  };
}

/**
 * The board: the note, the save line, what puts them away, then the board's top. Built after
 * the Ready row, before the sheets that take the save line.
 */
export function createBoardFace(
  ctx: ScreenCtx,
  deps: {
    readonly runningNow: ReturnType<typeof createRunningNow>;
    readonly legacy: ReturnType<typeof createLegacyPanel>;
  },
): {
  boardNote: BoardNote;
  saveLine: ReturnType<typeof createSaveLine>;
  closeBoardPopups: () => void;
  top: ReturnType<typeof createBoardTop>;
} {
  const { root, progress, auth, now, signal } = ctx;
  const { runningNow, legacy } = deps;
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
  return { boardNote, saveLine, closeBoardPopups, top };
}

/** The relic shelf and cards, then the board's top: the relic plate, the odometer and the dial. */
function createBoardTop(
  ctx: ScreenCtx,
  deps: {
    readonly note: BoardNote;
    readonly runningNow: ReturnType<typeof createRunningNow>;
    readonly legacy: ReturnType<typeof createLegacyPanel>;
    readonly closeBoardPopups: () => void;
  },
): {
  relics: ReturnType<typeof createRelicPanels>;
  relicPlate: ReturnType<typeof createRelicPlate>;
  stock: {
    readonly odometer: ReturnType<typeof createOdometer>;
    readonly dial: ReturnType<typeof createBoostDial>;
    spend(stones: number): void;
  };
  paintRelics(): void;
  paintPlate(): void;
} {
  const { progress, now } = ctx;
  const { veinUrl, relicArt } = ctx.art;
  const { note, runningNow, legacy, closeBoardPopups } = deps;
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
  const relicPlate = createRelicPlate({
    getView: ctx.view,
    note,
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
      note.show(dial.root, runningNow.running, { ms: RUNNING_NOTE_MS });
    },
  });
  return {
    relics,
    relicPlate,
    stock: {
      odometer,
      dial,
      spend: (stones) => {
        odometer.spend(stones);
      },
    },
    paintRelics: () => {
      relics.render();
    },
    paintPlate: () => {
      relicPlate.render();
      // The odometer and the dial. A spend is shown by `dispatch`, from what the move took.
      odometer.set(ctx.view().mountain.pocket);
      dial.set(liveCrewBoost(ctx.view().mountain, now()));
    },
  };
}

/** The Workshop, the saved copies, the conflict sheet, the menu, Upgrades and Engineers. */
export function createSheetPanels(
  ctx: ScreenCtx,
  deps: {
    readonly rail: KeyRail;
    readonly ledgerRoot: HTMLElement;
    readonly legacy: ReturnType<typeof createLegacyPanel>;
    readonly runningNow: ReturnType<typeof createRunningNow>;
    readonly saveLine: ReturnType<typeof createSaveLine>;
    readonly onStartOver: () => void;
    readonly closeMenu: () => void;
    readonly workshopClosed: () => void;
  },
): {
  workshop: ReturnType<typeof createWorkshopPanel>;
  savedCopies: ReturnType<typeof createSavedCopiesPanel>;
  conflictSheet: ReturnType<typeof createSaveConflictPanel>;
  menuPanel: ReturnType<typeof createMenuPanel>;
  upgrades: ReturnType<typeof createUpgradesPanel>;
  engineers: ReturnType<typeof createEngineersPanel>;
  paintMenu(): void;
  paintLater(): void;
  paintCopies(): void;
} {
  const { progress, dispatch, auth, now, board, signal } = ctx;
  const { stoneUrl, tierArt, relicArt } = ctx.art;
  const { rail, legacy, runningNow, saveLine, closeMenu } = deps;
  const workshop = createWorkshopPanel({
    dispatch,
    getView: ctx.view,
    now,
    stoneUrl,
    hammerUrl: relicArt.hammer,
    onOpen: closeMenu,
    onClose: deps.workshopClosed,
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
    onStartOver: deps.onStartOver,
    extras: [
      deps.ledgerRoot,
      workshop.menuEntry,
      legacy.menuPass,
      savedCopies.entry,
    ],
    door: rail.keys.ledger,
    requestRender: ctx.paint,
    signal,
  });

  const upgrades = createUpgradesPanel({
    progress,
    dispatch,
    getView: ctx.view,
    now,
    chipFor: runningNow.chipFor,
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
    chipHost: runningNow.effectRow,
    door: rail.keys.engineers,
    fallbackDoor: rail.keys.ledger,
    now,
    requestRender: ctx.paint,
  });
  return {
    workshop,
    savedCopies,
    conflictSheet,
    menuPanel,
    upgrades,
    engineers,
    paintMenu: () => {
      menuPanel.render();
    },
    paintLater: () => {
      upgrades.render();
      engineers.render();
      workshop.render();
      // Today's Workshop sheet knows no key: the screen says whether it is open (#373).
      setAttr(
        rail.keys.workshop,
        "aria-expanded",
        cardUp(workshop.sheet) ? "true" : "false",
      );
    },
    paintCopies: () => {
      savedCopies.render();
      conflictSheet.render(ctx.view().saveConflict, ctx.view().elsewhere);
    },
  };
}

/** The cards, in the order they stand in the root. */
export function cardsFrom(
  early: ReturnType<typeof createEarlyCards>,
  top: ReturnType<typeof createBoardTop>,
  sheets: ReturnType<typeof createSheetPanels>,
  extra: { readonly updatePrompt: HTMLElement; readonly otherTab: HTMLElement },
): HTMLElement[] {
  const { arrival, legacy } = early;
  const { reveal, legend, shelf, detail } = top.relics;
  const { menu, confirm, fieldLogSheet } = sheets.menuPanel;
  return [
    early.welcome,
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
    sheets.engineers.sheet,
    sheets.workshop.sheet,
    extra.updatePrompt,
    extra.otherTab,
    sheets.savedCopies.root,
    sheets.conflictSheet.root,
  ];
}
