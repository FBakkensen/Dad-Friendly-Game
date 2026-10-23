import pickUrl from "./assets/pick.png";
import { tapFloatSpot } from "./tap-float";
import { createUnconfiguredAuth, type AuthController } from "./auth";
import { formatCompact, formatCount } from "./format";
import {
  MOUNTAIN_STONES,
  mineByHand,
  stonesPerSecond,
  type Mountain,
} from "./mountain";
import { type TierId } from "./tiers";
import { hasRelic, nextRelic, RELICS, type RelicId, depthHint } from "./relics";
import { BOOSTS } from "./boosts";
import {
  EFFECT_COLUMNS,
  MAX_EFFECTS,
  createEffectChip,
  shortEffectName,
  writeChip,
} from "./effect-row";
import { effectiveRates } from "./rates";
import { createRelicPanels } from "./relic-panels";
import { createArrivalPanel } from "./arrival-panel";
import { layerOf, nextLayer } from "./layers";
import { createWelcomePanel } from "./welcome-panel";
import { createMenuPanel } from "./menu-panel";
import { createSaveConflictPanel } from "./save-conflict-panel";
import { createSavedCopiesPanel } from "./saved-copies-panel";
import { createLegacyPanel, legacyWords } from "./legacy-panel";
import { legacyBonus } from "./legacy";
import { createCrewPanel } from "./crew-panel";
import { SHEET_HOST } from "./sheet-card";
import { createEngineersPanel } from "./engineers-panel";
import { floatText } from "./float-text";
import { createUpgradesPanel } from "./upgrades-panel";
import {
  axleCrewMultiplier,
  chargeCrewMultiplier,
  emberMachineMultiplier,
  hotTimers,
  isRecipeId,
  recipeById,
  workshopUnlocked,
} from "./workshop";
import { createWorkshopPanel } from "./workshop-panel";
import {
  OTHER_TAB_BODY,
  OTHER_TAB_PLAY,
  OTHER_TAB_TITLE,
  layerCardWords,
  nextLayerHint,
  tapWords,
} from "./screen-words";
import { metMaterialChips } from "./workshop-sheet";
import {
  veinGapScale,
  advanceVein,
  mineVein,
  pauseVein,
  resumeVein,
  veinGlintMs,
  veinWaitLeft,
  veinReward,
  waitForVein,
  type VeinState,
} from "./veins";
import {
  createProgressStore,
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

export function mountMountainScreen({
  root,
  lanternUrl,
  mountainUrl,
  stoneUrl,
  veinUrl,
  tierArt,
  relicArt,
  upgradesUrl,
  auth = createUnconfiguredAuth(),
  progress: progressArg,
  now = Date.now,
  random = Math.random,
  veinStorage,
}: {
  root: HTMLElement;
  lanternUrl: string;
  mountainUrl: string;
  stoneUrl: string;
  veinUrl: string;
  tierArt: Readonly<Record<TierId, string>>;
  relicArt: Readonly<Record<RelicId, string>>;
  upgradesUrl: string;
  auth?: AuthController;
  progress?: ProgressStore;
  now?: () => number;
  random?: () => number;
  /** Where the vein wait is carried between sessions; localStorage by default. */
  veinStorage?: Pick<Storage, "getItem" | "setItem">;
}): void {
  const progress = progressArg ?? createProgressStore({ auth });
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
  const layerLine = document.createElement("p");
  layerLine.className = "layer-line";
  const layerName = document.createElement("span");
  layerName.className = "layer-name";
  const layerAdvice = document.createElement("span");
  layerLine.append(layerName, layerAdvice);

  const gapForVeins = (): number =>
    veinGapScale(view.mountain, hasRelic(view.mountain, "lantern"), now());

  const mountain = document.createElement("button");
  mountain.type = "button";
  mountain.className = "mountain";
  const peak = document.createElement("img");
  peak.className = "mountain-art";
  peak.src = mountainUrl;
  peak.alt = "";
  peak.width = 114;
  peak.height = 114;
  peak.draggable = false;
  mountain.append(peak);
  mountain.addEventListener("click", (event) => {
    if (!view.ready) {
      return;
    }
    const before = view.mountain.remaining;
    progress.applyMutation((current) =>
      mineByHand(current, now(), progress.getSnapshot().trouble),
    );
    const mined = before - view.mountain.remaining;
    if (mined > 0) {
      // Above the finger so a thumb doesn't hide it; keyboard "clicks" have no point.
      const spot = tapFloatSpot(
        mountain.getBoundingClientRect(),
        event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined,
      );
      floatText(
        mountainStage,
        `+${formatCount(mined)}`,
        "tap-float",
        spot.x,
        spot.y,
      );
    }
  });

  const vein = document.createElement("button");
  vein.type = "button";
  vein.className = "golden-vein";
  vein.hidden = true;
  vein.setAttribute("aria-label", "Golden vein, tap for a burst of stones");
  const veinArt = document.createElement("img");
  veinArt.src = veinUrl;
  veinArt.alt = "";
  veinArt.width = 32;
  veinArt.height = 32;
  veinArt.draggable = false;
  vein.append(veinArt);

  // The stage is exactly the mountain's box, so vein positions land on the art.
  const mountainStage = document.createElement("div");
  mountainStage.className = "mountain-stage";
  mountainStage.append(mountain, vein);
  const mountainWrap = document.createElement("div");
  mountainWrap.className = "mountain-wrap";
  mountainWrap.append(mountainStage);

  const veinNote = document.createElement("p");
  veinNote.className = "vein-note";
  veinNote.setAttribute("aria-live", "polite");

  mountainWrap.append(veinNote);

  // Two rows, wide enough for every countdown that can run at once.
  const effectRow = document.createElement("div");
  effectRow.className = "effect-row";
  effectRow.setAttribute("aria-label", "Active effects");
  effectRow.style.setProperty("--effect-cols", String(EFFECT_COLUMNS));
  effectRow.dataset["max"] = String(MAX_EFFECTS);
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

  const renderVein = (): void => {
    const glinting =
      veinState.kind === "glinting" &&
      view.ready &&
      view.mountain.remaining > 0;
    vein.hidden = !glinting;
    if (veinState.kind === "glinting") {
      vein.style.left = `${String(veinState.x * 100)}%`;
      vein.style.top = `${String(veinState.y * 100)}%`;
    }
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

  vein.addEventListener("click", () => {
    if (veinState.kind !== "glinting" || !view.ready) {
      return;
    }
    let reward = 0;
    progress.applyMutation((latest) => {
      reward = veinReward(latest);
      return mineVein(latest);
    }, "vein.tap");
    veinState = waitForVein({ now: now(), random, gapScale: gapForVeins() });
    veinNote.textContent = `Golden vein! +${formatCount(reward)} ${reward === 1 ? "stone" : "stones"}`;
    veinNoteUntil = now() + 4000;
    renderVein();
  });

  const pocket = document.createElement("p");
  pocket.className = "pocket";
  const pocketIcon = document.createElement("img");
  pocketIcon.src = stoneUrl;
  pocketIcon.alt = "";
  pocketIcon.width = 32;
  pocketIcon.height = 32;
  pocketIcon.draggable = false;
  const pocketText = document.createElement("span");
  pocket.append(pocketIcon, pocketText);
  const pocketRate = document.createElement("p");
  pocketRate.className = "pocket-rate";

  const crewPanel = createCrewPanel({
    progress,
    getView: () => view,
    now,
    tierArt,
    stoneUrl,
  });
  const { crew, tierGrid, thanks } = crewPanel;

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

  const relics = createRelicPanels({
    progress,
    getView: () => view,
    relicArt,
    keepsakeUrl: veinUrl,
    onPassTheMine: () => {
      legacy.open(undefined);
    },
    requestRender: () => {
      render();
    },
  });
  const { shelfButton, shelf, detail, reveal, legend } = relics;

  const closeMenu = (): void => {
    menuPanel.close();
  };
  const focusMenu = (): void => {
    menuButton.focus();
  };
  const workshop = createWorkshopPanel({
    progress,
    getView: () => view,
    now,
    stoneUrl,
    hammerUrl: relicArt.hammer,
    onOpen: closeMenu,
    onClose: focusMenu,
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
    requestRender: () => {
      render();
    },
  });
  const { menuButton, menu, confirm, fieldLogSheet } = menuPanel;

  const upgrades = createUpgradesPanel({
    progress,
    getView: () => view,
    now,
    upgradesUrl,
    chipFor,
    requestRender: () => {
      render();
    },
  });
  const upgradesButton = upgrades.button;
  const upgradesSheet = upgrades.sheet;

  const engineers = createEngineersPanel({
    progress,
    getView: () => view,
    iconUrl: tierArt.helper,
    badgeUrl: {
      cart: tierArt.cart,
      drill: tierArt.drill,
      borer: tierArt.borer,
      machine: tierArt.machine,
    },
    chipHost: effectRow,
    now,
    requestRender: () => {
      render();
    },
  });

  const saveStatus = document.createElement("p");
  saveStatus.className = "save-status";
  saveStatus.setAttribute("aria-live", "polite");

  const updatePrompt = document.createElement("div");
  updatePrompt.className = "update-prompt";
  updatePrompt.hidden = true;
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

  const renderSave = (): void => {
    switch (view.saveKind) {
      case "unsigned":
        saveStatus.textContent = "Sign in to save";
        saveStatus.dataset["kind"] = "unsigned";
        break;
      case "session":
        saveStatus.textContent = "Saved on this device";
        saveStatus.dataset["kind"] = "session";
        break;
      case "loading":
        saveStatus.textContent = "Loading your save...";
        saveStatus.dataset["kind"] = "loading";
        break;
      case "account":
        saveStatus.textContent = "Saved to your account";
        saveStatus.dataset["kind"] = "account";
        break;
      case "error":
        saveStatus.textContent = "Couldn't reach your save";
        saveStatus.dataset["kind"] = "error";
        break;
      /* v8 ignore next 4 -- exhaustiveness guard, unreachable */
      default: {
        const _exhaustive: never = view.saveKind;
        return _exhaustive;
      }
    }
    if (view.log === undefined) {
      delete saveStatus.dataset["log"];
      return;
    }
    saveStatus.dataset["log"] = view.log;
  };

  const render = (): void => {
    const left = view.mountain.remaining;
    remaining.textContent = `${formatCount(left)} stones left`;
    remaining.title = `${left.toLocaleString("en-US")} of ${MOUNTAIN_STONES.toLocaleString("en-US")}`;
    const held = view.mountain.pocket;
    const compactCount =
      held === 1 ? "1 stone" : `${formatCompact(held)} stones`;
    pocketText.textContent = compactCount;
    mountain.disabled = !view.playing || left === 0;
    const showElsewhere = view.elsewhere;
    otherTab.hidden = !showElsewhere;
    if (showElsewhere && otherTab.dataset["shown"] !== "1") {
      otherTab.dataset["shown"] = "1";
      playHere.focus();
    } else if (!showElsewhere) {
      delete otherTab.dataset["shown"];
    }
    mountain.setAttribute(
      "aria-label",
      left === 0
        ? "The mountain is mined out"
        : `Mountain, tap to mine ${tapWords(effectiveRates(view.mountain, now()).tapYield)}`,
    );
    const perSecond = effectiveRates(
      view.mountain,
      now(),
      view.trouble,
    ).crewPerSecond;
    pocketRate.textContent = `${formatCompact(perSecond)} stones/s`;
    pocketRow.classList.remove("is-tight");
    if (pocketRow.isConnected && pocketRow.clientWidth > 0) {
      const lineOverflows = (node: HTMLElement): boolean =>
        node.scrollWidth > node.clientWidth + 1;
      if (lineOverflows(pocket) || lineOverflows(pocketRate)) {
        pocketRow.classList.add("is-tight");
      }
    }
    const layer = layerOf(view.mountain);
    const layerWords = layerCardWords(layer.id);
    layerName.textContent = layer.name;
    layerAdvice.textContent =
      layerWords === undefined ? "" : ` · ${layerWords.advice}`;
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
    // The menu row hides Workshop until the Granite. The thumb uses that same gate.
    workshopThumb.disabled = !workshopUnlocked(view.mountain);
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
    savedCopies.render();
    conflictSheet.render(view.saveConflict, view.elsewhere);
    renderSave();
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
    const next = nextRelic(view.mountain);
    const guided = hasRelic(view.mountain, "lantern");
    guideBar.hidden = !guided || next === undefined;
    if (!guided) {
      goal.textContent =
        (view.mountain.legacy ?? 0) > 0
          ? `Your kid's mine: six relics wait inside. Legacy ${legacyWords(legacyBonus(view.mountain))}.`
          : "Six Legendary Relics of Fatherhood lie deep inside. Tap to mine.";
      return;
    }
    if (next === undefined) {
      goal.textContent = "Every relic is yours. You are a legend.";
      return;
    }
    const mined = MOUNTAIN_STONES - view.mountain.remaining;
    const previous = RELICS.filter((relic) => relic.depth <= mined).at(-1);
    const from = previous?.depth ?? 0;
    const percent = Math.floor(((mined - from) / (next.depth - from)) * 100);
    goal.textContent = `Next: ${next.name} · ${depthHint(view.mountain) ?? ""}`;
    guideFill.style.width = `${String(percent)}%`;
    guideBar.setAttribute("aria-valuenow", String(percent));
    guideBar.setAttribute(
      "aria-label",
      hint === undefined
        ? `Progress to the ${next.name}`
        : `Progress to the ${next.name}. ${hint}`,
    );
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

  const buysDialog = document.createElement("div");
  buysDialog.className = "buys-dialog";
  buysDialog.hidden = true;
  buysDialog.setAttribute("role", "dialog");
  buysDialog.setAttribute("aria-label", "Buys");
  const buysCard = document.createElement("div");
  buysCard.className = "buys-card";
  const buysTitle = document.createElement("h2");
  buysTitle.className = "sheet-kicker";
  buysTitle.textContent = "Buys";
  const buysClose = document.createElement("button");
  buysClose.type = "button";
  buysClose.className = "buys-close";
  buysClose.textContent = "Back to the mountain";
  const buysHost = document.createElement("div");
  buysHost.className = SHEET_HOST;
  buysHost.append(tierGrid);
  buysCard.append(buysTitle, buysHost, thanks, buysClose);
  buysDialog.append(buysCard);
  const buysButton = document.createElement("button");
  buysButton.type = "button";
  buysButton.className = "buys-button";
  const thumbIcon = (src: string): HTMLImageElement => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.width = 24;
    img.height = 24;
    img.draggable = false;
    return img;
  };
  const thumbLabel = (text: string): HTMLSpanElement => {
    const span = document.createElement("span");
    span.className = "thumb-label";
    span.textContent = text;
    return span;
  };
  buysButton.append(thumbIcon(tierArt.cart), thumbLabel("Buys"));
  buysButton.addEventListener("click", () => {
    buysDialog.hidden = false;
  });
  buysClose.addEventListener("click", () => {
    buysDialog.hidden = true;
  });

  const pocketRow = document.createElement("div");
  pocketRow.className = "pocket-row";
  pocketRow.append(pocket, pocketRate);
  const thumbBar = document.createElement("nav");
  thumbBar.className = "thumb-bar";
  const workshopThumb = document.createElement("button");
  workshopThumb.type = "button";
  workshopThumb.className = "thumb-workshop";
  workshopThumb.append(thumbIcon(relicArt.hammer), thumbLabel("Workshop"));
  const openWorkshop = workshop.menuEntry.querySelector(".workshop-open");
  workshopThumb.addEventListener("click", () => {
    if (openWorkshop instanceof HTMLButtonElement && !openWorkshop.hidden) {
      openWorkshop.click();
    }
  });
  thumbBar.append(buysButton, workshopThumb, engineers.button, upgradesButton);
  const pocketStack = document.createElement("div");
  pocketStack.className = "pocket-stack";
  pocketStack.append(pocketRow);

  const header = document.createElement("header");
  header.className = "top-bar";
  header.append(menuButton);
  // The Legacy sits in the mountain's other corner: no layout cost.
  mountainStage.append(legacy.badge);

  mountainWrap.append(shelfButton);
  root.replaceChildren(
    header,
    pocketStack,
    layerLine,
    crew,
    effectRow,
    mountainWrap,
    thumbBar,
    saveStatus,
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
    upgradesSheet,
    engineers.sheet,
    workshop.sheet,
    buysDialog,
    updatePrompt,
    otherTab,
    savedCopies.root,
    conflictSheet.root,
  );

  setInterval(() => {
    progress.tick();
    workshop.render();
    stepVein();
    const crewRate = stonesPerSecond(view.mountain, now(), view.trouble);
    if (
      crewRate > 0 &&
      view.mountain.remaining > 0 &&
      document.visibilityState !== "hidden"
    ) {
      // Rises from the mine door, away from where taps land, and says whose it is.
      floatText(
        mountainStage,
        `+${formatCount(crewRate)} crew`,
        "crew-float",
        44 + random() * 12,
      );
    }
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt ??= now();
      storeWait();
    } else if (hiddenAt !== undefined) {
      // Veins are for active play: time away is skipped, time played is kept.
      veinState = pauseVein(veinState, now() - hiddenAt);
      hiddenAt = undefined;
      renderVein();
    }
  });
  window.addEventListener("pagehide", storeWait);

  progress.subscribe((next) => {
    view = next;
    render();
  });
}

/** Shows the reload prompt. A newer service worker calls this. */
export function showAppUpdate(root: ParentNode): void {
  const prompt = root.querySelector<HTMLElement>(".update-prompt");
  if (prompt === null) {
    return;
  }
  prompt.hidden = false;
}
