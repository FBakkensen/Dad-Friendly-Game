import { cardUp } from "./card-state";
import { createScreenCtx, type ScreenOptions } from "./screen-context";
import { createLedger } from "./screen-ledger";
import { createRunningNow } from "./screen-running";
import { createOtherTab, createUpdatePrompt } from "./screen-prompts";
import { stonesLeft } from "./scale";
import { coverFor, wantedSign, type Cover } from "./screen-cover";
import { drawerOpen } from "./board-interaction";
import { formatCount } from "./format";
import { stonesPerSecond } from "./mountain";
import { owned, tierById } from "./tiers";
import { hasRelic } from "./relics";
import { createBoardNote } from "./board-note";
import { DRAWER_SETTLE_MS, createSheetScrim } from "./board-drawer";
import { type BoardHost } from "./board-host";
import { keyViews, type KeyId } from "./key-rail";
import { createKeyRail } from "./board-keys";
import { createBoardSign } from "./board-sign";
import { setAttr } from "./board-dom";
import { bandWords, createMachineBays } from "./board-bays";
import { bayViews } from "./machine-bays";
import { readyNow, type ReadyPick } from "./ready-now";
import {
  createDigButton,
  createReadyPlate,
  type ReadyTap,
} from "./board-ready";
import { createCrewPlate, createOutputGauge } from "./board-gauge";
import { crewCounts } from "./crew-count";
import { createMineWindow, runBoardLoop } from "./board-window";
import { veinSpot, windowScene } from "./mine-window";
import { createBoostDial, createOdometer } from "./board-stock";
import { createRelicPlate } from "./board-relics";
import { createSaveLine } from "./board-save";
import { liveCrewBoost } from "./crew-boost";
import { effectiveRates } from "./rates";
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
import { workshopUnlocked } from "./workshop";
import { createWorkshopPanel } from "./workshop-panel";
import { tapWords, quietAwayWords } from "./screen-words";
import {
  veinGapScale,
  advanceVein,
  pauseVein,
  resumeVein,
  veinGlintMs,
  veinWaitLeft,
  waitForVein,
  type VeinState,
} from "./veins";
import { type ProgressSnapshot, type ProgressStore } from "./progress-store";

export { showAppUpdate } from "./screen-prompts";

const MINED_OUT = "The mountain is mined out";

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
      gauge.kick(SPEND_KICK);
    },
  });
  const {
    root,
    progress,
    auth,
    dispatch,
    now,
    random,
    board,
    signal,
    listening,
  } = ctx;
  const { lanternUrl, mountainUrl, stoneUrl, veinUrl, tierArt, relicArt } =
    ctx.art;
  const { veinStorage } = ctx;

  const ledger = createLedger(ctx);
  const runningNow = createRunningNow(ctx);
  const { veinNote, effectRow, chipFor } = runningNow;

  const gapForVeins = (): number =>
    veinGapScale(
      ctx.view().mountain,
      hasRelic(ctx.view().mountain, "lantern"),
      now(),
    );

  // The New sign stands in the band over its key (#373): a sign, not a button.
  const sign = createBoardSign();

  // The wait for the next vein counts play time only, and survives the phone
  // locking or the PWA being closed, so short sessions still add up to a vein.
  const VEIN_WAIT_KEY = "dad-friendly-vein-wait";
  const storedWait = (): unknown => {
    try {
      const raw = (veinStorage ?? localStorage).getItem(VEIN_WAIT_KEY);
      return raw === null ? undefined : Number(raw);
    } catch {
      return undefined;
    }
  };
  const storeWait = (): void => {
    try {
      (veinStorage ?? localStorage).setItem(
        VEIN_WAIT_KEY,
        String(Math.round(veinWaitLeft(veinState, now()))),
      );
    } catch {
      // Private mode or full storage: the next session just starts a fresh wait.
    }
  };
  let veinState: VeinState = resumeVein({
    waitLeft: storedWait(),
    now: now(),
    random,
    gapScale: gapForVeins(),
  });
  let hiddenAt: number | undefined;
  let veinNoteUntil = 0;
  /** How long the short-absence note stays (#334). */
  const QUIET_NOTE_MS = 6000;
  /** How long the vein's payout note stays. */
  const VEIN_NOTE_MS = 4000;
  /** How far a dig and a local spend kick the output needle, in degrees (#371). */
  const DIG_KICK = 150;
  const SPEND_KICK = 120;

  const renderVein = (): void => {
    mine.showVein(
      veinState.kind === "glinting" &&
        ctx.view().ready &&
        ctx.view().mountain.remaining > 0
        ? veinSpot(veinState.x, veinState.y)
        : undefined,
    );
    if (now() >= veinNoteUntil) {
      veinNote.textContent = "";
    }
  };

  const stepVein = (): void => {
    if (!ctx.view().ready || ctx.view().mountain.remaining === 0) {
      return;
    }
    veinState = advanceVein({
      vein: veinState,
      now: now(),
      random,
      gapScale: gapForVeins(),
      glintMs: veinGlintMs(ctx.view().mountain),
    });
    renderVein();
  };

  /**
   * A tap on the window: today's rock handler. Returns the stones the tap
   * itself dug: the store settles the crew before the tap, and the crew's
   * stones are the gauge's to show, not the dig's "+N" (#371).
   */
  const dig = (): number => {
    if (!ctx.view().ready) {
      return 0;
    }
    const result = dispatch({ kind: "dig" });
    const mined = result.kind === "applied" ? result.gained : 0;
    if (mined > 0) {
      gauge.kick(DIG_KICK);
    }
    return mined;
  };

  const tapVein = (): void => {
    if (veinState.kind !== "glinting" || !ctx.view().ready) {
      return;
    }
    const result = dispatch({ kind: "tapVein" });
    const reward = result.kind === "applied" ? result.gained : 0;
    veinState = waitForVein({ now: now(), random, gapScale: gapForVeins() });
    showVeinNote(
      `Golden vein! +${formatCount(reward)} ${reward === 1 ? "stone" : "stones"}`,
      VEIN_NOTE_MS,
    );
    renderVein();
  };

  /**
   * The key rail: Buys, Workshop and Upgrades open from here; Engineers and the Ledger key open
   * through their panels' own click listeners. Every key first puts the board's popups away.
   */
  const rail = createKeyRail({
    board,
    onKey: (id, key) => {
      closeBoardPopups();
      // A key pressed from the keyboard puts the New sign away too.
      putSignAway();
      switch (id) {
        case "buys":
          openBuys(key);
          return;
        case "workshop":
          openWorkshopSheet();
          return;
        case "upgrades":
          crewPanel.sheet.close({ restoreFocus: false, by: "program" });
          upgrades.open(key);
          return;
        case "engineers":
        case "ledger":
          return;
      }
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

  const resetVein = (): void => {
    veinState = waitForVein({ now: now(), random, gapScale: gapForVeins() });
    renderVein();
  };

  // A panel's own change repaints the whole screen: its `requestRender` is `ctx.paint`, which
  // reads `paint` (set up below) when called.
  // Pass the mine to your kid (M6): offered from the Legend card and the menu.
  const legacy = createLegacyPanel({
    progress,
    getView: ctx.view,
    onPassed: resetVein,
    beforeOpen: () => {
      menuPanel.close();
    },
    requestRender: ctx.paint,
  });

  // The gauge row (#371): the output gauge, the mine window down No. 2
  // Shaft with the vein and the Legacy plate on it, and the crew plate.
  const gauge = createOutputGauge();
  const crewPlate = createCrewPlate();
  /** The gauge shows what is earned: nothing once the mountain is mined out. */
  const renderGaugeRow = (): void => {
    const { mountain, trouble } = ctx.view();
    gauge.set(
      mountain.remaining > 0 ? stonesPerSecond(mountain, now(), trouble) : 0,
    );
    crewPlate.set(crewCounts(mountain, now(), trouble));
  };
  const mine = createMineWindow({
    // A window tap counts by hand on the red button, which echoes the press.
    onDig: () => {
      const mined = dig();
      if (mined > 0) {
        digButton.dug(mined);
        digButton.echo();
      }
      return mined;
    },
    onVein: tapVein,
    legacyBadge: legacy.badge,
    random,
  });
  const gaugeRow = document.createElement("div");
  gaugeRow.className = "board-gauge-row";
  gaugeRow.append(gauge.root, mine.root, crewPlate.root);

  // The Ready row (#372): the Ready now plate and the red DIG button.
  /**
   * A tap on the plate reads the rule again from the store, never the painted
   * pick: a pocket that fell since the last frame buys nothing. A ready pick
   * buys exactly one through the store; a pick being saved for opens Buys.
   */
  const tapReady = (): ReadyTap => {
    const latest = progress.getSnapshot();
    if (!latest.ready || !latest.playing) {
      return { kind: "nothing" };
    }
    const pick = readyNow(latest.mountain, now(), latest.trouble);
    if (pick.kind === "saving") {
      openBuys(readyPlate.button);
      return { kind: "opened" };
    }
    if (pick.kind !== "ready") {
      return { kind: "nothing" };
    }
    if (dispatch({ kind: "buyTier", id: pick.tier }).kind !== "applied") {
      return { kind: "nothing" };
    }
    const count = owned(progress.getSnapshot().mountain, tierById(pick.tier));
    return { kind: "bought", tier: pick.tier, count, gain: pick.gain };
  };
  const readyPlate = createReadyPlate({ board, onTap: tapReady });
  // The red button digs exactly as a window tap does, and the window shows it.
  const digButton = createDigButton({
    onPress: () => {
      const mined = dig();
      if (mined > 0) {
        mine.dug(mined);
        digButton.dug(mined);
      }
    },
  });
  readyPlate.root.append(digButton.root);
  /** Until the save is in, nothing from it shows on the plate or the button. */
  const renderReadyRow = (pick: ReadyPick): void => {
    readyPlate.render(
      ctx.view().ready ? pick : undefined,
      ctx.view().playing && ctx.view().ready,
    );
    // A sign-in or another account loads a save again: back to loading.
    if (!ctx.view().ready) {
      digButton.loading();
      return;
    }
    const tapYield = effectiveRates(ctx.view().mountain, now()).tapYield;
    if (ctx.view().mountain.remaining === 0) {
      digButton.set(undefined, false, MINED_OUT);
      return;
    }
    digButton.set(
      tapYield,
      ctx.view().playing,
      `Dig: tap to mine ${tapWords(tapYield)}`,
    );
  };

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
  /** The vein's payout or the quiet away line, in the board note under the window. */
  const showVeinNote = (words: string, ms: number): void => {
    veinNote.textContent = words;
    veinNoteUntil = now() + ms;
    boardNote.show(mine.root, veinNote, { ms });
  };
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
    // Back to the door it opened from; the Ledger key while a re-load holds the Workshop's.
    onClose: () => {
      (rail.locked(doorKey) ? rail.keys.ledger : workshopDoor).focus();
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
    onStartOver: resetVein,
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

  /** Whether the window shows a save, so a second load clears it once. */
  let windowDrawn = false;
  /** The board under the cards: stones, window, gauges, bays, Ready row and guide. */
  const paintBoard = (): void => {
    ledger.paintStones();
    const left = Math.ceil(stonesLeft(ctx.view().mountain));
    otherTab.paint(ctx.view().elsewhere);
    mine.dig.disabled = !ctx.view().playing || left === 0;
    mine.dig.setAttribute(
      "aria-label",
      left === 0
        ? MINED_OUT
        : `Mine window: tap to mine ${tapWords(effectiveRates(ctx.view().mountain, now()).tapYield)}`,
    );
    // The window draws the save once it has loaded, so the first scene it
    // sees is the save itself and nothing beats for it (#371). A save that
    // loads again (a sign-in, another account) puts it back to its frame.
    if (ctx.view().ready) {
      mine.render(windowScene(ctx.view().mountain, ctx.view().trouble));
      windowDrawn = true;
    } else if (windowDrawn) {
      mine.loading();
      windowDrawn = false;
    }
    renderGaugeRow();
    // The Ready now pick, once per paint: the bays light theirs (#372).
    const pick = readyNow(ctx.view().mountain, now(), ctx.view().trouble);
    shownPick = pick;
    renderBays(pick);
    renderReadyRow(pick);
    crewPanel.render();
    renderVein();
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
  /** The panels painted first, so a card opened in this paint holds the sign back. */
  const paintOverlays = (): void => {
    renderTeach();
    coverDrawers();
    coverNote();
    // Locks, lit caps, red dot lamps and timers, by the key rail's rules (#373),
    // with the New sign's words on its key's label.
    renderRail();
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
    paintOverlays();
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
  /** Read fresh at each use: closing the drawers changes the stack. */
  const cover = (): Cover =>
    coverFor({
      cardUp: cards.some(cardUp),
      drawerOpen: drawerOpen(board.view()),
      noteOn: boardNote.isOn(),
    });
  /**
   * A card that opens by itself (a relic, a layer, a craft done, a save
   * conflict, an update) stands under the drawers' clip. It closes an open
   * drawer, so it is never covered, and keeps the focus it took: the key
   * the drawer opened from is under the card.
   */
  const coverDrawers = (): void => {
    if (!cover().closeDrawers) {
      return;
    }
    for (const sheet of [crewPanel.sheet, upgrades.sheet]) {
      sheet.close({ restoreFocus: false, by: "program" });
    }
  };
  /** The New sign last shown: each shows once a launch. */
  let teachShown: string | undefined;
  /**
   * A card that opens by itself (a relic, a layer, a craft done, a save
   * conflict, an update) never closes the board's popups, and the board note
   * stands above it. So any note goes once such a card is up, and so does the
   * New sign. A sign it covered was never really seen: it shows once more after
   * the card.
   */
  const coverNote = (): void => {
    if (!cover().putAway) {
      return;
    }
    if (sign.shown() !== undefined) {
      teachShown = undefined;
      sign.hide();
    }
    if (boardNote.isOn()) {
      boardNote.hide();
    }
  };
  /** Any tap or Escape puts the New sign away; it never comes back this launch. */
  const putSignAway = (): void => {
    if (sign.shown() !== undefined) {
      sign.hide();
      renderRail();
    }
  };
  /**
   * One New sign at a time, in the order teach.ts lists them (#372, #373). It
   * stands in the band over its key until any tap or Escape puts it away. A
   * note or sheet already up waits it out, and a sign put away never comes back
   * this launch; the dot stays. Opening the sheet by its key counts as seen.
   */
  const renderTeach = (): void => {
    const want = wantedSign(ctx.view());
    const up = sign.shown();
    if (want === undefined || (up !== undefined && up.key !== want.key)) {
      sign.hide();
    }
    if (want === undefined) {
      return;
    }
    if (sign.shown() !== undefined) {
      sign.show(want.key, want.words);
      return;
    }
    // Another note, or a sheet over the board, holds it back until a later
    // render or tick: the sign would stand under the sheet.
    if (want.id === teachShown || cover().holdSign) {
      return;
    }
    teachShown = want.id;
    sign.show(want.key, want.words);
  };

  /** The keys read the save once it is in; before, only their caps and icons show (#373). */
  const renderRail = (): void => {
    if (!ctx.view().ready) {
      rail.render(undefined);
      return;
    }
    const views = keyViews(ctx.view().mountain, now(), ctx.view().trouble);
    // The New sign is quiet for readers: its words join its key's label.
    const up = sign.shown();
    rail.render(
      up === undefined
        ? views
        : {
            ...views,
            [up.key]: {
              ...views[up.key],
              aria: `${views[up.key].aria}. ${up.words}`,
            },
          },
    );
  };

  /** The bays read the save once it is in; before, only their art shows (#372). */
  const renderBays = (pick: ReadyPick): void => {
    bays.render(
      ctx.view().ready
        ? bayViews(ctx.view().mountain, now(), ctx.view().trouble, pick)
        : undefined,
      ctx.view().ready ? bandWords(ctx.view().mountain) : "",
    );
  };

  saveOnLeave(progress, listening);

  /**
   * Opens the Buys drawer: the Buys key, a bay and Saving for (#372, #373). Only an opening starts
   * the settle: a tap on an open drawer's door does not.
   */
  const openBuys = (from?: HTMLElement): void => {
    closeBoardPopups();
    upgrades.sheet.close({ restoreFocus: false, by: "program" });
    crewPanel.open(from);
  };

  /**
   * The machine bays (#372). A tap opens Buys; on a troubled bay it presses or
   * holds the fix through the store, as a Buys card does, and the bay thanks
   * the crew once the trouble is gone.
   */
  const bays = createMachineBays({
    board,
    note: boardNote,
    onOpen: openBuys,
    onTrouble: (tier, how) => {
      (how === "hold" ? progress.fixTrouble : progress.pressTrouble)(tier);
      return progress.getSnapshot().trouble === undefined;
    },
  });

  const openWorkshop = workshop.openButton;
  /** The id of the key `workshopDoor` is, so the rail can say whether it is locked. */
  let doorKey: KeyId = "workshop";
  /** The key the Workshop sheet opened from: its own, or the Ledger key that opened the menu. */
  let workshopDoor: HTMLButtonElement = rail.keys.workshop;
  let openingFromKey = false;
  // Opening the sheet by any door counts as seen: the sign goes, the dot stays.
  const openWorkshopSheet = (): void => {
    if (ctx.view().ready && workshopUnlocked(ctx.view().mountain)) {
      dispatch({ kind: "markSeen", id: "workshop" });
      workshopDoor = rail.keys.workshop;
      doorKey = "workshop";
      openingFromKey = true;
      try {
        openWorkshop.click();
      } finally {
        openingFromKey = false;
      }
    }
  };
  // The menu's own Workshop row also puts the board's popups away.
  openWorkshop.addEventListener("click", () => {
    closeBoardPopups();
    if (!openingFromKey) {
      workshopDoor = rail.keys.ledger;
      doorKey = "ledger";
    }
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
    gaugeRow,
    bays.root,
    readyPlate.root,
    rail.root,
    sign.root,
    sheetClip,
    drawerClip,
    saveLine.line,
    boardNote.note,
    runningNow.parkRoot,
    ...cards,
  );

  const ticking = setInterval(() => {
    progress.tick();
    stepVein();
    paint();
  }, 1000);
  signal?.addEventListener("abort", () => {
    clearInterval(ticking);
  });
  // The window's machines and the needle move on hard steps, once a frame.
  runBoardLoop((dt) => {
    mine.tick(dt);
    gauge.tick(dt);
    bays.tick(dt);
  }, signal);
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        hiddenAt ??= now();
        storeWait();
      } else if (hiddenAt !== undefined) {
        // Veins are for active play: time away is skipped, time played is kept.
        veinState = pauseVein(veinState, now() - hiddenAt);
        hiddenAt = undefined;
        renderVein();
      }
    },
    listening,
  );
  window.addEventListener("pagehide", storeWait, listening);
  // Any tap or Escape puts the New sign away (#373).
  document.addEventListener("pointerdown", putSignAway, listening);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        putSignAway();
      }
    },
    listening,
  );

  const unsubscribe = progress.subscribe((next) => {
    setView(nextView(board, ctx.view(), next));
    // A short absence pays with a small note, not the welcome card (#334).
    const { quietAway } = ctx.view();
    if (quietAway !== undefined) {
      showVeinNote(quietAwayWords(quietAway), QUIET_NOTE_MS);
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
