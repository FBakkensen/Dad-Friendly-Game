import { shownStones, stonesLeft } from "./scale";
import pickUrl from "./assets/pick.png";
import { noteFor } from "./teach";
import { THANKS_MS } from "./board-interaction";
import { createUnconfiguredAuth, type AuthController } from "./auth";
import { formatCount } from "./format";
import { MOUNTAIN_STONES, stonesPerSecond, type Mountain } from "./mountain";
import { owned, tierById, type TierId } from "./tiers";
import type { TroubleTier } from "./hazards";
import { hasRelic, relicGoal, type RelicId } from "./relics";
import { BOOSTS } from "./boosts";
import { createEffectChip, shortEffectName, writeChip } from "./effect-row";
import { createBoardNote } from "./board-note";
import { DRAWER_SETTLE_MS, createSheetScrim } from "./board-drawer";
import { createBoardHost } from "./board-host";
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
import { nextLayer } from "./layers";
import { createWelcomePanel } from "./welcome-panel";
import { createMenuPanel } from "./menu-panel";
import { createSaveConflictPanel } from "./save-conflict-panel";
import { createSavedCopiesPanel } from "./saved-copies-panel";
import { createLegacyPanel, legacyWords } from "./legacy-panel";
import { legacyBonus } from "./legacy";
import { createCrewPanel } from "./crew-panel";
import { createEngineersPanel } from "./engineers-panel";
import { createUpgradesPanel } from "./upgrades-panel";
import {
  axleCrewMultiplier,
  chargeCrewMultiplier,
  emberMachineMultiplier,
  hotTimers,
  isRecipeId,
  recipeById,
} from "./workshop";
import { createWorkshopPanel } from "./workshop-panel";
import {
  OTHER_TAB_BODY,
  OTHER_TAB_PLAY,
  OTHER_TAB_TITLE,
  TROUBLE_FIXED,
  nextLayerHint,
  tapWords,
  WORKSHOP_NOTE,
  engineersNote,
  quietAwayWords,
} from "./screen-words";
import { metMaterialChips } from "./workshop-sheet";
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
import {
  createProgressStore,
  type Dispatch,
  type ProgressSnapshot,
  type ProgressStore,
} from "./progress-store";

function craftMultiplier(
  mountain: Mountain,
  id: "blasting-charge" | "axle-grease" | "crystal-flare" | "heartstone-ember",
  now: number,
): number {
  switch (id) {
    case "blasting-charge":
      return chargeCrewMultiplier(mountain, now);
    case "axle-grease":
      return axleCrewMultiplier(mountain, now);
    case "heartstone-ember":
      return emberMachineMultiplier(mountain, now);
    case "crystal-flare": {
      const effect = recipeById(id).effect;
      return effect.kind === "flare" ? 1 + effect.often : 1;
    }
  }
}

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

/** The update prompt tells its screen it is up, so an open drawer closes at once. */
const UPDATE_SHOWN = "update-shown";

export function mountMountainScreen({
  root,
  lanternUrl,
  mountainUrl,
  stoneUrl,
  veinUrl,
  tierArt,
  relicArt,
  auth = createUnconfiguredAuth(),
  progress: progressArg,
  now = Date.now,
  tapClock = () => performance.now(),
  pressAge,
  random = Math.random,
  veinStorage,
  signal,
}: {
  root: HTMLElement;
  lanternUrl: string;
  mountainUrl: string;
  stoneUrl: string;
  veinUrl: string;
  tierArt: Readonly<Record<TierId, string>>;
  relicArt: Readonly<Record<RelicId, string>>;
  auth?: AuthController;
  progress?: ProgressStore;
  now?: () => number;
  /**
   * Milliseconds for timing taps against each other. Not `now`: that is the
   * game's clock, which a gate run may stop.
   */
  tapClock?: () => number;
  /** How long a press waited before its handler ran; a test on its own tap clock passes 0. */
  pressAge?: (event: Event) => number;
  random?: () => number;
  /** Where the vein wait is carried between sessions; localStorage by default. */
  veinStorage?: Pick<Storage, "getItem" | "setItem">;
  /** Stops the screen's tick and page listeners. The app never unmounts; tests do. */
  signal?: AbortSignal;
}): void {
  const progress = progressArg ?? createProgressStore({ auth });
  /**
   * Every change the player makes (#409): a move that took stones rolls the odometer's spend
   * and kicks the needle (made further down; no panel dispatches while it is built). A cloud
   * copy, a restored copy, Start over or Pass the mine never comes here: no spend (#370).
   */
  const dispatch: Dispatch = (move) => {
    const result = progress.dispatch(move);
    if (result.kind === "applied" && result.spent >= 1) {
      odometer.spend(result.spent);
      gauge.kick(SPEND_KICK);
    }
    return result;
  };
  let view: ProgressSnapshot = progress.getSnapshot();

  const lantern = document.createElement("img");
  lantern.className = "lantern";
  lantern.src = lanternUrl;
  lantern.alt = "Lantern";
  lantern.width = 32;
  lantern.height = 32;
  lantern.draggable = false;

  const remaining = document.createElement("p");
  remaining.className = "stones-left";
  remaining.setAttribute("role", "status");

  const goal = document.createElement("p");
  goal.className = "goal";
  const guide = document.createElement("div");
  guide.className = "guide";
  const guideBar = document.createElement("div");
  guideBar.className = "guide-bar";
  guideBar.setAttribute("role", "progressbar");
  guideBar.setAttribute("aria-valuemin", "0");
  guideBar.setAttribute("aria-valuemax", "100");
  const guideFill = document.createElement("span");
  guideBar.append(guideFill);
  const layerHint = document.createElement("p");
  layerHint.className = "layer-hint";
  layerHint.hidden = true;
  guide.append(goal, layerHint, guideBar);
  const materialLine = document.createElement("p");
  materialLine.className = "material-line";
  const ledger = document.createElement("div");
  ledger.className = "ledger";
  ledger.append(lantern, remaining, materialLine, guide);

  const gapForVeins = (): number =>
    veinGapScale(view.mountain, hasRelic(view.mountain, "lantern"), now());

  // The vein's note and the quiet away line show in the board note under the
  // window (#371); between shows the note waits in the hidden park below. The
  // board note's status announces them, so the words carry no live region of
  // their own and are read once.
  const veinNote = document.createElement("p");
  veinNote.className = "vein-note";

  // The countdowns running now, one per line: the body of the Running now
  // note the boost dial opens (#370). The engineers' trips land here too.
  const effectRow = document.createElement("div");
  effectRow.className = "effect-row";
  effectRow.setAttribute("aria-label", "Active effects");
  effectRow.hidden = true;
  const runningHead = document.createElement("span");
  runningHead.className = "board-note-h";
  runningHead.textContent = "Running now";
  const runningNone = document.createElement("span");
  runningNone.className = "board-running-none";
  const running = document.createElement("div");
  running.className = "board-running";
  running.append(runningHead, effectRow, runningNone);
  // A bay's fix thanks the crew in the board note (#372).
  const bayThanks = document.createElement("p");
  bayThanks.className = "board-thanks";
  bayThanks.textContent = TROUBLE_FIXED;
  // The New sign stands in the band over its key (#373): a sign, not a button.
  const sign = createBoardSign();
  // While another note shows, the list, the vein's note and the bay thanks
  // wait here, so the chips and the live words stay in the page.
  const runningPark = document.createElement("div");
  runningPark.className = "board-running-park";
  runningPark.hidden = true;
  runningPark.append(running, veinNote, bayThanks);
  const chipFor = new Map(
    BOOSTS.map((boost) => {
      const chip = createEffectChip(
        "boost-chip",
        boost.id === "sharper" ? pickUrl : tierArt.helper,
      );
      chip.dataset["boost"] = boost.id;
      effectRow.append(chip);
      return [boost.id, chip] as const;
    }),
  );
  const craftIds = [
    "blasting-charge",
    "axle-grease",
    "crystal-flare",
    "heartstone-ember",
  ] as const;
  const craftChips = new Map(
    craftIds.map((id) => {
      const chip = createEffectChip("craft-chip", relicArt.hammer);
      chip.dataset["craft"] = id;
      effectRow.append(chip);
      return [id, chip] as const;
    }),
  );
  const benchChip = createEffectChip("craft-chip", relicArt.hammer);
  benchChip.dataset["craft"] = "bench";
  effectRow.append(benchChip);

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
      veinState.kind === "glinting" && view.ready && view.mountain.remaining > 0
        ? veinSpot(veinState.x, veinState.y)
        : undefined,
    );
    if (now() >= veinNoteUntil) {
      veinNote.textContent = "";
    }
  };

  const stepVein = (): void => {
    if (!view.ready || view.mountain.remaining === 0) {
      return;
    }
    veinState = advanceVein({
      vein: veinState,
      now: now(),
      random,
      gapScale: gapForVeins(),
      glintMs: veinGlintMs(view.mountain),
    });
    renderVein();
  };

  /**
   * A tap on the window: today's rock handler. Returns the stones the tap
   * itself dug: the store settles the crew before the tap, and the crew's
   * stones are the gauge's to show, not the dig's "+N" (#371).
   */
  const dig = (): number => {
    if (!view.ready) {
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
    if (veinState.kind !== "glinting" || !view.ready) {
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
   * The key rail (#373): five keys under the Ready row. Buys and Upgrades open their drawers
   * from here; Engineers and the Ledger key (today's menu, until B7) are their panels' doors,
   * whose own click handlers open them. Every key first puts the board's popups away.
   */
  const rail = createKeyRail({
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
  let shownPick: ReadyPick = readyNow(view.mountain, now(), view.trouble);
  const board = createBoardHost({ clock: tapClock, pressAge, signal });
  const crewPanel = createCrewPanel({
    progress,
    dispatch,
    getView: () => view,
    now,
    pick: () => shownPick,
    board,
    overSave: () => saveLine.isOpen(),
    door: rail.keys.buys,
    ...(signal === undefined ? {} : { signal }),
  });

  const welcomePanel = createWelcomePanel({ progress, getView: () => view });
  const { welcome } = welcomePanel;
  const arrival = createArrivalPanel({
    progress,
    getView: () => view,
    mountainUrl,
    oreUrl: stoneUrl,
    lanternUrl,
    tierArt,
  });

  const resetVein = (): void => {
    veinState = waitForVein({ now: now(), random, gapScale: gapForVeins() });
    renderVein();
  };

  // Pass the mine to your kid (M6): offered from the Legend card and the menu.
  const legacy = createLegacyPanel({
    progress,
    getView: () => view,
    onPassed: resetVein,
    beforeOpen: () => {
      menuPanel.close();
    },
    requestRender: () => {
      render();
    },
  });

  // The gauge row (#371): the output gauge, the mine window down No. 2
  // Shaft with the vein and the Legacy plate on it, and the crew plate.
  const gauge = createOutputGauge();
  const crewPlate = createCrewPlate();
  /** The gauge shows what is earned: nothing once the mountain is mined out. */
  const renderGaugeRow = (): void => {
    const { mountain, trouble } = view;
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
  const readyPlate = createReadyPlate({ onTap: tapReady });
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
      view.ready ? pick : undefined,
      view.playing && view.ready,
    );
    // A sign-in or another account loads a save again: back to loading.
    if (!view.ready) {
      digButton.loading();
      return;
    }
    const tapYield = effectiveRates(view.mountain, now()).tapYield;
    if (view.mountain.remaining === 0) {
      digButton.set(undefined, false, MINED_OUT);
      return;
    }
    digButton.set(
      tapYield,
      !mine.dig.disabled,
      `Dig: tap to mine ${tapWords(tapYield)}`,
    );
  };

  /** The socket whose note opened the shelf: focus goes back there. */
  let shelfDoor: HTMLElement | undefined;
  const relics = createRelicPanels({
    progress,
    getView: () => view,
    relicArt,
    keepsakeUrl: veinUrl,
    onPassTheMine: () => {
      legacy.open(undefined);
    },
    onShelfClosed: () => {
      shelfDoor?.focus();
    },
    requestRender: () => {
      render();
    },
  });
  const { shelf, detail, reveal, legend } = relics;

  // The board (#370): the note, the relic plate, the odometer, the boost dial
  // and the save line. The note is placed in board coordinates inside root.
  const boardNote = createBoardNote(root);
  /** The vein's payout or the quiet away line, in the board note under the window. */
  const showVeinNote = (words: string, ms: number): void => {
    veinNote.textContent = words;
    veinNoteUntil = now() + ms;
    boardNote.show(mine.root, veinNote, { ms });
  };
  const saveLine = createSaveLine({
    progress,
    auth,
    getView: () => view,
    now,
  });
  // Opening a sheet, the shelf or the menu puts the board's popups away.
  const closeBoardPopups = (): void => {
    saveLine.close();
    boardNote.hide();
  };
  const relicPlate = createRelicPlate({
    getView: () => view,
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
      boardNote.show(dial.root, running, { ms: RUNNING_NOTE_MS });
    },
  });
  /** The odometer and the dial. A spend is shown by `dispatch`, from what the move took. */
  const renderStock = (): void => {
    odometer.set(view.mountain.pocket);
    dial.set(liveCrewBoost(view.mountain, now()));
  };

  const closeMenu = (): void => {
    menuPanel.close();
  };
  const workshop = createWorkshopPanel({
    dispatch,
    getView: () => view,
    now,
    stoneUrl,
    hammerUrl: relicArt.hammer,
    onOpen: closeMenu,
    // Back to the door it opened from; the Ledger key while a re-load holds the Workshop's.
    onClose: () => {
      (workshopDoor.disabled ? rail.keys.ledger : workshopDoor).focus();
    },
    requestRender: () => {
      render();
    },
  });

  const savedCopies = createSavedCopiesPanel({
    progress,
    now,
    onOpen: closeMenu,
    requestRender: () => {
      render();
    },
  });
  const conflictSheet = createSaveConflictPanel({
    progress,
    now,
    requestRender: () => {
      render();
    },
  });
  const menuPanel = createMenuPanel({
    progress,
    getView: () => view,
    auth,
    onStartOver: resetVein,
    extras: [ledger, workshop.menuEntry, legacy.menuPass, savedCopies.entry],
    door: rail.keys.ledger,
    requestRender: () => {
      render();
    },
  });
  const { menu, confirm, fieldLogSheet } = menuPanel;

  const upgrades = createUpgradesPanel({
    progress,
    dispatch,
    getView: () => view,
    now,
    chipFor,
    board,
    overSave: () => saveLine.isOpen(),
    door: rail.keys.upgrades,
    ...(signal === undefined ? {} : { signal }),
  });

  const engineers = createEngineersPanel({
    dispatch,
    getView: () => view,
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
    requestRender: () => {
      render();
    },
  });

  const updatePrompt = document.createElement("div");
  updatePrompt.className = "update-prompt";
  updatePrompt.hidden = true;
  // showAppUpdate opens the prompt from outside the screen: it covers the drawers at once.
  updatePrompt.addEventListener(UPDATE_SHOWN, () => {
    coverDrawers();
  });
  updatePrompt.setAttribute("role", "dialog");
  updatePrompt.setAttribute("aria-modal", "true");
  updatePrompt.setAttribute("aria-labelledby", "update-prompt-title");
  const updateCard = document.createElement("div");
  updateCard.className = "update-card";
  const updateTitle = document.createElement("h2");
  updateTitle.id = "update-prompt-title";
  updateTitle.textContent = "Update available";
  const updateReload = document.createElement("button");
  updateReload.type = "button";
  updateReload.className = "update-reload";
  updateReload.textContent = "Reload";
  updateReload.addEventListener("click", () => {
    globalThis.location.reload();
  });
  updateCard.append(updateTitle, updateReload);
  updatePrompt.append(updateCard);

  const otherTab = document.createElement("div");
  otherTab.className = "other-tab";
  otherTab.hidden = true;
  otherTab.setAttribute("role", "dialog");
  otherTab.setAttribute("aria-modal", "true");
  otherTab.setAttribute("aria-labelledby", "other-tab-title");
  const otherCard = document.createElement("div");
  otherCard.className = "other-tab-card";
  const otherTitle = document.createElement("h2");
  otherTitle.id = "other-tab-title";
  otherTitle.textContent = OTHER_TAB_TITLE;
  const otherBody = document.createElement("p");
  otherBody.className = "other-tab-body";
  otherBody.textContent = OTHER_TAB_BODY;
  const playHere = document.createElement("button");
  playHere.type = "button";
  playHere.className = "other-tab-play";
  playHere.textContent = OTHER_TAB_PLAY;
  playHere.addEventListener("click", () => {
    void progress.playHere();
  });
  otherCard.append(otherTitle, otherBody, playHere);
  otherTab.append(otherCard);

  /** Whether the window shows a save, so a second load clears it once. */
  let windowDrawn = false;
  const render = (): void => {
    // A short absence pays with a small note, not the welcome card (#334).
    if (view.quietAway !== undefined) {
      showVeinNote(quietAwayWords(view.quietAway), QUIET_NOTE_MS);
      queueMicrotask(() => {
        progress.dismissQuietAway();
      });
    }
    const left = Math.ceil(stonesLeft(view.mountain));
    const total = shownStones(view.mountain, MOUNTAIN_STONES);
    remaining.textContent = `${formatCount(left)} stones left`;
    remaining.title = `${left.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
    mine.dig.disabled = !view.playing || left === 0;
    const showElsewhere = view.elsewhere;
    otherTab.hidden = !showElsewhere;
    if (showElsewhere && otherTab.dataset["shown"] !== "1") {
      otherTab.dataset["shown"] = "1";
      playHere.focus();
    } else if (!showElsewhere) {
      delete otherTab.dataset["shown"];
    }
    mine.dig.setAttribute(
      "aria-label",
      left === 0
        ? MINED_OUT
        : `Mine window: tap to mine ${tapWords(effectiveRates(view.mountain, now()).tapYield)}`,
    );
    // The window draws the save once it has loaded, so the first scene it
    // sees is the save itself and nothing beats for it (#371). A save that
    // loads again (a sign-in, another account) puts it back to its frame.
    if (view.ready) {
      mine.render(windowScene(view.mountain, view.trouble));
      windowDrawn = true;
    } else if (windowDrawn) {
      mine.loading();
      windowDrawn = false;
    }
    renderGaugeRow();
    // The Ready now pick, once per render: the bays light theirs (#372).
    const pick = readyNow(view.mountain, now(), view.trouble);
    shownPick = pick;
    renderBays(pick);
    renderReadyRow(pick);
    crewPanel.render();
    renderVein();
    renderGuide();
    renderMaterials();
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
      workshop.sheet.hidden ? "false" : "true",
    );
    renderTeach();
    const at = now();
    const hot = hotTimers(view.mountain, at);
    for (const [id, chip] of craftChips) {
      const timer = hot.find((item) => item.id === id);
      if (timer === undefined) {
        writeChip(chip, { short: "", full: "", leftMs: 0, active: false });
        continue;
      }
      const left = timer.until - at;
      const recipe = recipeById(id);
      writeChip(chip, {
        short: shortEffectName(recipe.name),
        full: recipe.name,
        multiplier: craftMultiplier(view.mountain, id, at),
        leftMs: left,
        active: true,
      });
    }
    const bench = view.mountain.bench;
    const benchIsTimer =
      bench !== undefined && hot.some((item) => item.id === bench.recipe);
    if (
      bench !== undefined &&
      isRecipeId(bench.recipe) &&
      at < bench.endsAt &&
      !benchIsTimer
    ) {
      const left = bench.endsAt - at;
      const recipe = recipeById(bench.recipe);
      writeChip(benchChip, {
        short: shortEffectName(recipe.name),
        full: recipe.name,
        leftMs: left,
        active: true,
      });
    } else {
      writeChip(benchChip, { short: "", full: "", leftMs: 0, active: false });
    }
    // After every chip above and the engineers' trips have been written.
    const anyRunning =
      effectRow.querySelector(".effect-chip:not([hidden])") !== null;
    effectRow.hidden = !anyRunning;
    runningNone.hidden = anyRunning;
    runningNone.textContent = anyRunning ? "" : "Nothing running";
    if (running.parentNode === null) {
      runningPark.append(running);
    }
    // Back to the park whenever another note has taken their place.
    for (const parked of [veinNote, bayThanks]) {
      if (parked.parentNode === null) {
        runningPark.append(parked);
      }
    }
    relicPlate.render();
    renderStock();
    savedCopies.render();
    conflictSheet.render(view.saveConflict, view.elsewhere);
    saveLine.render();
    coverDrawers();
    coverNote();
    // Locks, lit caps, red dot lamps and timers, by the key rail's rules (#373),
    // with the New sign's words on its key's label.
    renderRail();
  };

  /** A card open over the board: today's sheets and the cards that open by themselves. */
  const OPEN_CARD =
    ":scope > [role='dialog']:not([hidden]), :scope > [role='alertdialog']:not([hidden])";
  /**
   * A sheet or card open over the board. A drawer is never hidden: it is open
   * while it has .is-open, inside the sheet clip (#373).
   */
  const OPEN_SHEET = `${OPEN_CARD}, :scope > .board-sheet-clip > .board-sheet.is-open`;
  /**
   * A card that opens by itself (a relic, a layer, a craft done, a save
   * conflict, an update) stands under the drawers' clip. It closes an open
   * drawer, so it is never covered, and keeps the focus it took: the key
   * the drawer opened from is under the card.
   */
  const coverDrawers = (): void => {
    if (root.querySelector(OPEN_CARD) === null) {
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
    if (root.querySelector(OPEN_SHEET) === null) {
      return;
    }
    if (sign.shown() !== undefined) {
      teachShown = undefined;
      sign.hide();
    }
    if (boardNote.note.classList.contains("on")) {
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
    const noteId = view.ready ? noteFor(view.mountain) : undefined;
    const firstEngineer = view.mountain.engineers?.[0]?.name;
    let want: { readonly key: KeyId; readonly words: string } | undefined;
    if (noteId === "workshop") {
      want = { key: "workshop", words: WORKSHOP_NOTE };
    } else if (noteId === "engineers" && firstEngineer !== undefined) {
      want = { key: "engineers", words: engineersNote(firstEngineer) };
    }
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
    const busy =
      boardNote.note.classList.contains("on") ||
      root.querySelector(OPEN_SHEET) !== null;
    if (noteId === teachShown || busy) {
      return;
    }
    teachShown = noteId;
    sign.show(want.key, want.words);
  };

  /** The keys read the save once it is in; before, only their caps and icons show (#373). */
  const renderRail = (): void => {
    if (!view.ready) {
      rail.render(undefined);
      return;
    }
    const views = keyViews(view.mountain, now(), view.trouble);
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
      view.ready
        ? bayViews(view.mountain, now(), view.trouble, pick)
        : undefined,
      view.ready ? bandWords(view.mountain) : "",
    );
  };

  const renderMaterials = (): void => {
    const chips = metMaterialChips(view.mountain);
    materialLine.replaceChildren();
    chips.forEach((chip, index) => {
      if (index > 0) {
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.textContent = "·";
        materialLine.append(dot);
      }
      const bit = document.createElement("span");
      bit.className = "material-bit";
      const icon = document.createElement("img");
      icon.className = `mat mat-${chip.id}`;
      icon.src = stoneUrl;
      icon.alt = "";
      icon.width = 16;
      icon.height = 16;
      icon.draggable = false;
      bit.append(icon, document.createTextNode(chip.text));
      materialLine.append(bit);
    });
  };

  const renderGuide = (): void => {
    const hint = nextLayerHint(nextLayer(view.mountain)?.id);
    layerHint.hidden = hint === undefined;
    layerHint.textContent = hint ?? "";
    const goalNow = relicGoal(view.mountain);
    guideBar.hidden = goalNow.kind !== "next";
    if (goalNow.kind === "unguided") {
      goal.textContent =
        (view.mountain.legacy ?? 0) > 0
          ? `Your kid's mine: six relics wait inside. Legacy ${legacyWords(legacyBonus(view.mountain))}.`
          : "Six Legendary Relics of Fatherhood lie deep inside. Tap to mine.";
      return;
    }
    if (goalNow.kind === "done") {
      goal.textContent = "Every relic is yours. You are a legend.";
      return;
    }
    const { name, percent } = goalNow;
    const words = `Next: ${name} · ${goalNow.hint}`;
    const label =
      hint === undefined
        ? `Progress to the ${name}`
        : `Progress to the ${name}. ${hint}`;
    goal.textContent = words;
    guideFill.style.width = `${String(percent)}%`;
    guideBar.setAttribute("aria-valuenow", String(percent));
    guideBar.setAttribute("aria-label", label);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      progress.flush();
      return;
    }
    // A return settles after the server has been read, so a tap cannot
    // land on top of another device's save. Guests settle immediately.
    const resume = progress.resume();
    if (resume.kind === "reading") {
      void resume.done.then(() => {
        progress.tick();
      });
      return;
    }
    progress.tick();
  });
  window.addEventListener("pagehide", () => {
    progress.flush();
  });

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
   * holds the fix through the store, as a Buys card does, and thanks the crew
   * once the trouble is gone.
   */
  const thankFix = (tier: TroubleTier, bay: HTMLElement, fix: () => void) => {
    const before = progress.getSnapshot().trouble;
    fix();
    if (before?.tier === tier && progress.getSnapshot().trouble === undefined) {
      boardNote.show(bay, bayThanks, { ms: THANKS_MS });
    }
  };
  const bays = createMachineBays({
    onOpen: openBuys,
    onPress: (tier, bay) => {
      thankFix(tier, bay, () => {
        progress.pressTrouble(tier);
      });
    },
    onFix: (tier, bay) => {
      thankFix(tier, bay, () => {
        progress.fixTrouble(tier);
      });
    },
  });

  const openWorkshop = workshop.menuEntry.querySelector(".workshop-open");
  /** The key the Workshop sheet opened from: its own, or the Ledger key that opened the menu. */
  let workshopDoor: HTMLButtonElement = rail.keys.workshop;
  let openingFromKey = false;
  // Opening the sheet by any door counts as seen: the sign goes, the dot stays.
  const openWorkshopSheet = (): void => {
    if (openWorkshop instanceof HTMLButtonElement && !openWorkshop.hidden) {
      dispatch({ kind: "markSeen", id: "workshop" });
      workshopDoor = rail.keys.workshop;
      openingFromKey = true;
      try {
        openWorkshop.click();
      } finally {
        openingFromKey = false;
      }
    }
  };
  // The menu's own Workshop row also puts the board's popups away.
  openWorkshop?.addEventListener("click", () => {
    closeBoardPopups();
    if (!openingFromKey) {
      workshopDoor = rail.keys.ledger;
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
    runningPark,
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
    otherTab,
    savedCopies.root,
    conflictSheet.root,
  );

  const ticking = setInterval(() => {
    progress.tick();
    workshop.render();
    renderStock();
    stepVein();
    renderGaugeRow();
    const pick = readyNow(view.mountain, now(), view.trouble);
    shownPick = pick;
    renderBays(pick);
    renderReadyRow(pick);
    // The open drawer's rows follow the clock: a pocket that grows, a boost that ends.
    if (crewPanel.sheet.isOpen()) {
      crewPanel.render();
    }
    renderTeach();
    coverDrawers();
    coverNote();
    renderRail();
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
  const listening = signal === undefined ? {} : { signal };
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
    view = next;
    render();
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

/** Shows the reload prompt. A newer service worker calls this. */
export function showAppUpdate(root: ParentNode): void {
  const prompt = root.querySelector<HTMLElement>(".update-prompt");
  if (prompt === null) {
    return;
  }
  prompt.hidden = false;
  prompt.dispatchEvent(new Event(UPDATE_SHOWN));
}
