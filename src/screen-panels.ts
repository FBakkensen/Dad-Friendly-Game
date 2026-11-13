import type { ScreenCtx } from "./screen-context";
import type { createRunningNow } from "./screen-running";
import { createBoardNote, type BoardNote } from "./board-note";
import type { KeyRail } from "./board-keys";
import { createBoostDial, createOdometer } from "./board-stock";
import { createRelicPlate } from "./board-relics";
import { createSaveLine } from "./board-save";
import { boostRanOut, liveCrewBoost, type SeenBoost } from "./crew-boost";
import { effectiveRates } from "./rates";
import { boostOverWords } from "./screen-words";
import { createRelicPanels } from "./relic-panels";
import { createArrivalPanel } from "./arrival-panel";
import { createWelcomePanel } from "./welcome-panel";
import { createLedgerPanel } from "./ledger-panel";
import { createSaveConflictPanel } from "./save-conflict-panel";
import { createSavedCopiesPanel } from "./saved-copies-panel";
import { createLegacyPanel } from "./legacy-panel";
import { createCrewPanel } from "./crew-panel";
import { createEngineersPanel } from "./engineers-panel";
import { createUpgradesPanel } from "./upgrades-panel";
import { soundSetting } from "./sound";
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
    storage: ctx.deviceStorage,
    ...(signal === undefined ? {} : { signal }),
  });
}

/** The cards the first paint reaches for before the board is built: welcome, arrival, legacy. */
export function createEarlyCards(
  ctx: ScreenCtx,
  deps: {
    readonly onPassed: () => void;
    readonly closeLedger: () => void;
  },
): {
  welcome: ReturnType<typeof createWelcomePanel>["welcome"];
  arrival: ReturnType<typeof createArrivalPanel>;
  legacy: ReturnType<typeof createLegacyPanel>;
  paint(): void;
} {
  const { progress, board } = ctx;
  const welcomePanel = createWelcomePanel({
    progress,
    getView: ctx.view,
    board,
  });
  const { welcome } = welcomePanel;
  const arrival = createArrivalPanel({ progress, getView: ctx.view, board });

  // A panel's own change repaints the whole screen: its `requestRender` is `ctx.paint`, which
  // reads `paint` (set up below) when called.
  // Pass the mine to your kid (M6): offered from the Legend card and the Ledger.
  const legacy = createLegacyPanel({
    progress,
    getView: ctx.view,
    board,
    onPassed: deps.onPassed,
    beforeOpen: deps.closeLedger,
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
    /** A card that opens itself is up: the relic reveal waits for it (#465). */
    readonly cardUp: () => boolean;
    /** Shuts every drawer but the relics drawer, as a key does (#465). */
    readonly closeOtherDrawers: () => void;
    /** A card or a drawer is over the board, so the board note would be put away. */
    readonly covered: () => boolean;
  },
): {
  boardNote: BoardNote;
  saveLine: ReturnType<typeof createSaveLine>;
  closeBoardPopups: () => void;
  top: ReturnType<typeof createBoardTop>;
} {
  const { root, progress, auth, now, signal } = ctx;
  const { runningNow, legacy, cardUp, closeOtherDrawers } = deps;
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
  // Opening a sheet or the shelf puts the board's popups away.
  const closeBoardPopups = (): void => {
    saveLine.close();
    boardNote.hide();
  };
  const top = createBoardTop(ctx, {
    note: boardNote,
    runningNow,
    legacy,
    overSave: () => saveLine.isOpen(),
    cardUp,
    covered: deps.covered,
    beforeOpen: () => {
      closeBoardPopups();
      closeOtherDrawers();
    },
  });
  return { boardNote, saveLine, closeBoardPopups, top };
}

/** The relics drawer, then the board's top: the relic plate, the odometer and the dial. */
function createBoardTop(
  ctx: ScreenCtx,
  deps: {
    readonly note: BoardNote;
    readonly runningNow: ReturnType<typeof createRunningNow>;
    readonly legacy: ReturnType<typeof createLegacyPanel>;
    readonly overSave: () => boolean;
    readonly cardUp: () => boolean;
    /** A card or a drawer is over the board: the board note waits (#525). */
    readonly covered: () => boolean;
    readonly beforeOpen: () => void;
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
  const { progress, board, signal } = ctx;
  const { note, runningNow, legacy } = deps;
  const relics = createRelicPanels({
    progress,
    getView: ctx.view,
    board,
    overSave: deps.overSave,
    cardUp: deps.cardUp,
    beforeOpen: deps.beforeOpen,
    legacy,
    signal,
  });
  // A close gives focus back to the socket whose note held the Relic shelf key.
  const relicPlate = createRelicPlate({
    getView: ctx.view,
    note,
    onShelf: (from) => {
      relics.open(from);
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
  const paintDial = createDialPaint(ctx, {
    dial,
    note,
    covered: deps.covered,
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
      paintDial();
    },
  };
}

/** The Workshop, the saved copies, the conflict sheet, the Ledger, Upgrades and Engineers. */
export function createSheetPanels(
  ctx: ScreenCtx,
  deps: {
    readonly rail: KeyRail;
    readonly legacy: ReturnType<typeof createLegacyPanel>;
    readonly runningNow: ReturnType<typeof createRunningNow>;
    readonly saveLine: ReturnType<typeof createSaveLine>;
    readonly onStartOver: () => void;
  },
): {
  workshop: ReturnType<typeof createWorkshopPanel>;
  savedCopies: ReturnType<typeof createSavedCopiesPanel>;
  conflictSheet: ReturnType<typeof createSaveConflictPanel>;
  ledger: ReturnType<typeof createLedgerPanel>;
  upgrades: ReturnType<typeof createUpgradesPanel>;
  engineers: ReturnType<typeof createEngineersPanel>;
  /** The drawers the rail's keys open after Buys, in the drawers' order. */
  keyed: {
    readonly upgrades: ReturnType<typeof createUpgradesPanel>;
    readonly workshop: ReturnType<typeof createWorkshopPanel>;
    readonly engineers: ReturnType<typeof createEngineersPanel>;
    readonly ledger: ReturnType<typeof createLedgerPanel>;
  };
  paintLedger(): void;
  paintLater(): void;
  paintCopies(): void;
} {
  const { progress, dispatch, auth, now, board, signal } = ctx;
  const { tierArt } = ctx.art;
  const { rail, legacy, runningNow, saveLine } = deps;
  const overSave = (): boolean => saveLine.isOpen();
  // One sound for the whole game (#491): the Ledger turns it, the Workshop's knock reads it.
  const sound = soundSetting(ctx.deviceStorage);
  const workshop = createWorkshopPanel({
    dispatch,
    getView: ctx.view,
    now,
    board,
    overSave,
    door: rail.keys.workshop,
    fallbackDoor: rail.keys.ledger,
    sound,
    ...(signal === undefined ? {} : { signal }),
  });

  const savedCopies = createSavedCopiesPanel({
    progress,
    now,
    board,
    requestRender: ctx.paint,
  });
  const conflictSheet = createSaveConflictPanel({
    progress,
    now,
    board,
    requestRender: ctx.paint,
  });
  const ledger = createLedgerPanel({
    progress,
    getView: ctx.view,
    auth,
    board,
    overSave,
    door: rail.keys.ledger,
    legacy,
    savedCopies,
    onStartOver: deps.onStartOver,
    sound,
    signal,
  });

  const upgrades = createUpgradesPanel({
    progress,
    dispatch,
    getView: ctx.view,
    now,
    chipFor: runningNow.chipFor,
    board,
    overSave,
    door: rail.keys.upgrades,
    ...(signal === undefined ? {} : { signal }),
  });

  const engineers = createEngineersPanel({
    dispatch,
    getView: ctx.view,
    now,
    board,
    overSave,
    door: rail.keys.engineers,
    fallbackFocus: rail.keys.ledger,
    chipHost: runningNow.effectRow,
    chipIconUrl: tierArt.helper,
    signal,
  });
  return {
    workshop,
    savedCopies,
    conflictSheet,
    ledger,
    upgrades,
    engineers,
    keyed: { upgrades, workshop, engineers, ledger },
    paintLedger: () => {
      ledger.render();
    },
    paintLater: () => {
      upgrades.render();
      engineers.render();
      workshop.render();
    },
    paintCopies: () => {
      savedCopies.render();
      conflictSheet.render(ctx.view().saveConflict, ctx.view().elsewhere);
    },
  };
}

/**
 * The cards, in the order they stand in the root: at one z-index, a later one paints over an
 * earlier one, and only the save conflict stands higher.
 */
export function cardsFrom(
  early: ReturnType<typeof createEarlyCards>,
  sheets: ReturnType<typeof createSheetPanels>,
  extra: { readonly updatePrompt: HTMLElement; readonly otherTab: HTMLElement },
): HTMLElement[] {
  const { arrival, legacy } = early;
  return [
    early.welcome,
    arrival.layer,
    arrival.notice,
    legacy.dialog,
    extra.updatePrompt,
    extra.otherTab,
    sheets.savedCopies.root,
    sheets.conflictSheet.root,
  ];
}

/** A boost's end note stays as long as the Running now note: two short lines, read once. */
const BOOST_OVER_NOTE_MS = 6000;
/**
 * A boost that ran out under a drawer or a card is said when the board shows
 * again, if that is this soon: later, the drop is old news (#525).
 */
const BOOST_OVER_HOLD_MS = 60_000;

/**
 * The Pace dial's paint. When the boost it showed runs out while he plays,
 * the board note on the dial says so and what the crew mines now, so a
 * sudden drop has its reason (#525). Under a drawer or a card it waits.
 */
function createDialPaint(
  ctx: ScreenCtx,
  deps: {
    readonly dial: ReturnType<typeof createBoostDial>;
    readonly note: BoardNote;
    readonly covered: () => boolean;
  },
): () => void {
  const { dial, note, covered } = deps;
  /** The boost on the dial at the last paint. */
  let seen: SeenBoost | undefined;
  /** A boost that ran out and has not been said yet, and when it did. */
  let owed: { readonly name: string; readonly at: number } | undefined;
  const words = document.createElement("p");
  words.className = "boost-over-note";
  return () => {
    const { mountain, trouble, ready } = ctx.view();
    const at = ctx.now();
    const boost = liveCrewBoost(mountain, at);
    const ended = boostRanOut(seen, mountain, at);
    seen = { boost, at };
    dial.set(boost);
    if (ended !== undefined) {
      owed = { name: ended.name, at };
    }
    if (owed === undefined || !ready || covered()) {
      if (owed !== undefined && at - owed.at > BOOST_OVER_HOLD_MS) {
        owed = undefined;
      }
      return;
    }
    words.textContent = boostOverWords(
      owed.name,
      effectiveRates(mountain, at, trouble).crewPerSecond,
    );
    owed = undefined;
    note.show(dial.root, words, { ms: BOOST_OVER_NOTE_MS });
  };
}
