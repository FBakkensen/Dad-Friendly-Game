import { tapFloatSpot } from "./tap-float";
import {
  createUnconfiguredAuth,
  type AuthController,
  type AuthState,
} from "./auth";
import { formatCompact, formatCount, formatDuration } from "./format";
import { MOUNTAIN_STONES, mineByHand, stonesPerSecond } from "./mountain";
import { TIERS, owned, tierCost, tierShown, type TierId } from "./tiers";
import {
  foundRelics,
  hasRelic,
  type Relic,
  nextRelic,
  RELICS,
  type RelicId,
  depthHint,
} from "./relics";
import { buyCrew, tierLocked } from "./crew";
import { BOOSTS } from "./boosts";
import { effectiveRates } from "./rates";
import { createUpgradesPanel } from "./upgrades-panel";
import {
  capWords,
  formatSpeed,
  percent,
  restingPace,
  tapWords,
} from "./screen-words";
import { tierSynergy } from "./upgrades";
import {
  LANTERN_VEIN_GAP_SCALE,
  advanceVein,
  mineVein,
  pauseVein,
  resumeVein,
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

/** From this many tiers on screen, cards go three to a row. */
const COMPACT_TIER_COUNT = 4;

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
  guide.append(goal, guideBar);

  const veinGapScale = (): number =>
    hasRelic(view.mountain, "lantern") ? LANTERN_VEIN_GAP_SCALE : 1;

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
    progress.applyMutation((current) => mineByHand(current, now()));
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

  // Running boosts, counting down in the mountain's corner (no layout cost).
  const boostChips = document.createElement("div");
  boostChips.className = "boost-chips";
  const chipFor = new Map(
    BOOSTS.map((boost) => {
      const chip = document.createElement("p");
      chip.className = "boost-chip";
      chip.dataset["boost"] = boost.id;
      chip.hidden = true;
      boostChips.append(chip);
      return [boost.id, chip] as const;
    }),
  );
  mountainWrap.append(boostChips);

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
    gapScale: veinGapScale(),
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
      gapScale: veinGapScale(),
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
    });
    veinState = waitForVein({ now: now(), random, gapScale: veinGapScale() });
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

  const crew = document.createElement("section");
  crew.className = "crew";
  crew.setAttribute("aria-label", "Your crew");
  const crewStatus = document.createElement("p");
  crewStatus.className = "crew-status";
  crewStatus.setAttribute("aria-live", "polite");
  const tierGrid = document.createElement("div");
  tierGrid.className = "tier-grid";
  const tierCards = TIERS.map((tier) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "tier";
    card.dataset["tier"] = tier.id;
    const art = document.createElement("img");
    art.className = "tier-art";
    art.src = tierArt[tier.id];
    art.alt = "";
    art.width = 32;
    art.height = 32;
    art.draggable = false;
    const words = document.createElement("span");
    words.className = "tier-words";
    const name = document.createElement("span");
    name.className = "tier-name";
    const cost = document.createElement("span");
    cost.className = "tier-cost";
    const costIcon = document.createElement("img");
    costIcon.className = "tier-cost-icon";
    costIcon.src = stoneUrl;
    costIcon.alt = "";
    costIcon.width = 14;
    costIcon.height = 14;
    const costText = document.createElement("span");
    cost.append(costIcon, costText);
    // The count is a corner badge so a growing number never wraps the card.
    const countBadge = document.createElement("span");
    countBadge.className = "tier-count";
    countBadge.setAttribute("aria-hidden", "true");
    const rate = document.createElement("span");
    rate.className = "tier-rate";
    words.append(name, cost, rate);
    card.append(art, words, countBadge);
    card.addEventListener("click", () => {
      if (!view.ready) {
        return;
      }
      const before = owned(view.mountain, tier);
      const rateBefore = stonesPerSecond(view.mountain, now());
      progress.applyMutation((mountain) => buyCrew(mountain, tier.id));
      if (owned(view.mountain, tier) > before) {
        const after = effectiveRates(view.mountain);
        // A new machine nobody can run says so, instead of promising speed.
        floatText(
          card,
          after.running[tier.id] > before
            ? `+${formatSpeed(after.tierSpeed[tier.id])}/s`
            : "Needs helpers",
          "float-gain",
        );
        countCrewRate(rateBefore, stonesPerSecond(view.mountain, now()));
      }
    });
    tierGrid.append(card);
    return { tier, card, name, costText, countBadge, rate, costIcon };
  });
  crew.append(crewStatus, tierGrid);

  /** No matchMedia (very old browsers, tests) counts as reduced motion. */
  const reducedMotion = (): boolean =>
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** A short-lived number that drifts up and fades; skipped for reduced motion. */
  const floatText = (
    parent: HTMLElement,
    text: string,
    className: string,
    leftPercent?: number,
    topPercent?: number,
  ): void => {
    if (reducedMotion()) {
      return;
    }
    const float = document.createElement("span");
    float.className = className;
    float.textContent = text;
    float.setAttribute("aria-hidden", "true");
    if (leftPercent !== undefined) {
      float.style.left = `${String(leftPercent)}%`;
    }
    if (topPercent !== undefined) {
      float.style.top = `${String(topPercent)}%`;
    }
    parent.append(float);
    setTimeout(() => {
      float.remove();
    }, FLOAT_MS);
  };

  /** The crew line counts up to the new rate after a purchase. */
  let rateShown: number | undefined;
  let countTimer: ReturnType<typeof setInterval> | undefined;
  const countCrewRate = (from: number, to: number): void => {
    if (countTimer !== undefined) {
      clearInterval(countTimer);
      countTimer = undefined;
    }
    if (reducedMotion() || to <= from) {
      rateShown = undefined;
      renderCrew();
      return;
    }
    let step = 0;
    rateShown = from;
    renderCrew();
    countTimer = setInterval(() => {
      step += 1;
      rateShown =
        step >= COUNT_STEPS
          ? undefined
          : Math.round(from + ((to - from) * step) / COUNT_STEPS);
      if (rateShown === undefined) {
        clearInterval(countTimer);
        countTimer = undefined;
      }
      renderCrew();
    }, COUNT_STEP_MS);
  };

  const welcome = document.createElement("div");
  welcome.className = "welcome-back";
  welcome.setAttribute("role", "dialog");
  welcome.setAttribute("aria-modal", "true");
  welcome.setAttribute("aria-labelledby", "welcome-back-title");
  welcome.hidden = true;
  const welcomeCard = document.createElement("div");
  welcomeCard.className = "welcome-card";
  const welcomeTitle = document.createElement("h2");
  welcomeTitle.id = "welcome-back-title";
  welcomeTitle.textContent = "While you were away";
  const welcomeMined = document.createElement("p");
  welcomeMined.className = "welcome-mined";
  const welcomeDetail = document.createElement("p");
  welcomeDetail.className = "welcome-detail";
  const welcomeCheer = document.createElement("p");
  welcomeCheer.className = "welcome-cheer";
  welcomeCheer.textContent =
    "Time with the people who matter is never wasted. Your crew kept the mountain moving.";
  // One-time note for saves from before machines needed helpers (#89).
  const welcomeCrew = document.createElement("p");
  welcomeCrew.className = "welcome-crew";
  const welcomeContinue = document.createElement("button");
  welcomeContinue.type = "button";
  welcomeContinue.className = "welcome-continue";
  welcomeContinue.textContent = "Back to the mountain";
  welcomeContinue.addEventListener("click", () => {
    progress.dismissAway();
  });
  welcomeCard.append(
    welcomeTitle,
    welcomeMined,
    welcomeDetail,
    welcomeCheer,
    welcomeCrew,
    welcomeContinue,
  );
  welcome.append(welcomeCard);

  const shelfButton = document.createElement("button");
  shelfButton.type = "button";
  shelfButton.className = "relic-shelf";
  const shelfSlots = RELICS.map((relic) => {
    const slot = document.createElement("img");
    slot.className = "shelf-slot";
    slot.src = relicArt[relic.id];
    slot.alt = "";
    slot.width = 32;
    slot.height = 32;
    slot.draggable = false;
    shelfButton.append(slot);
    return slot;
  });
  shelfButton.addEventListener("click", () => {
    shelfOpen = true;
    render();
  });

  const shelf = document.createElement("div");
  shelf.className = "shelf-dialog";
  shelf.setAttribute("role", "dialog");
  shelf.setAttribute("aria-modal", "true");
  shelf.setAttribute("aria-labelledby", "shelf-title");
  shelf.hidden = true;
  const shelfCard = document.createElement("div");
  shelfCard.className = "shelf-card";
  const shelfTitle = document.createElement("h2");
  shelfTitle.id = "shelf-title";
  shelfTitle.textContent = "Legendary Relics of Fatherhood";
  const shelfList = document.createElement("ul");
  shelfList.className = "shelf-list";
  const shelfRows = RELICS.map(() => {
    const row = document.createElement("li");
    const art = document.createElement("img");
    art.alt = "";
    art.width = 48;
    art.height = 48;
    art.draggable = false;
    const words = document.createElement("div");
    const name = document.createElement("p");
    name.className = "shelf-name";
    const detail = document.createElement("p");
    detail.className = "shelf-detail";
    const hint = document.createElement("p");
    hint.className = "shelf-hint";
    words.append(name, detail, hint);
    row.append(art, words);
    shelfList.append(row);
    return { row, art, name, detail, hint };
  });
  // Found relics open a detail card with their power.
  for (const [index, { row }] of shelfRows.entries()) {
    const open = (): void => {
      const relic = RELICS[index];
      if (relic !== undefined && hasRelic(view.mountain, relic.id)) {
        detailRelic = relic;
        render();
      }
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }
  let detailRelic: Relic | undefined;
  const detail = document.createElement("div");
  detail.className = "relic-reveal relic-detail";
  detail.setAttribute("role", "dialog");
  detail.setAttribute("aria-modal", "true");
  detail.setAttribute("aria-labelledby", "relic-detail-title");
  detail.hidden = true;
  const detailCard = document.createElement("div");
  detailCard.className = "reveal-card";
  const detailKicker = document.createElement("p");
  detailKicker.className = "reveal-kicker";
  detailKicker.textContent = "A Legendary Relic of Fatherhood";
  const detailArt = document.createElement("img");
  detailArt.className = "reveal-art";
  detailArt.alt = "";
  detailArt.width = 64;
  detailArt.height = 64;
  detailArt.draggable = false;
  const detailTitle = document.createElement("h2");
  detailTitle.id = "relic-detail-title";
  const detailVirtue = document.createElement("p");
  detailVirtue.className = "reveal-virtue";
  const detailBoost = document.createElement("p");
  detailBoost.className = "relic-boost";
  const detailBack = document.createElement("button");
  detailBack.type = "button";
  detailBack.className = "reveal-continue";
  detailBack.textContent = "Back to the shelf";
  detailBack.addEventListener("click", () => {
    detailRelic = undefined;
    render();
  });
  detailCard.append(
    detailKicker,
    detailArt,
    detailTitle,
    detailVirtue,
    detailBoost,
    detailBack,
  );
  detail.append(detailCard);
  const shelfClose = document.createElement("button");
  shelfClose.type = "button";
  shelfClose.className = "shelf-close";
  shelfClose.textContent = "Back to the mountain";
  shelfClose.addEventListener("click", () => {
    shelfOpen = false;
    render();
    shelfButton.focus();
  });
  shelfCard.append(shelfTitle, shelfList, shelfClose);
  shelf.append(shelfCard);
  let shelfOpen = false;

  const startOverLink = document.createElement("button");
  startOverLink.type = "button";
  startOverLink.className = "start-over-link";
  startOverLink.textContent = "Start over";
  let confirmingStartOver = false;
  startOverLink.addEventListener("click", () => {
    menuOpen = false;
    confirmingStartOver = true;
    render();
  });

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

  // Account and Start over live in a tucked-away menu so the main screen fits a phone.
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "menu-button";
  menuButton.setAttribute("aria-label", "Menu");
  menuButton.setAttribute("aria-haspopup", "dialog");
  menuButton.textContent = "☰";
  let menuOpen = false;
  menuButton.addEventListener("click", () => {
    menuOpen = true;
    render();
  });
  const menu = document.createElement("div");
  menu.className = "game-menu";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-modal", "true");
  menu.setAttribute("aria-labelledby", "game-menu-title");
  menu.hidden = true;
  const menuCard = document.createElement("div");
  menuCard.className = "menu-card";
  const menuTitle = document.createElement("h2");
  menuTitle.id = "game-menu-title";
  menuTitle.textContent = "Menu";
  const menuClose = document.createElement("button");
  menuClose.type = "button";
  menuClose.className = "menu-close";
  menuClose.textContent = "Back to the mountain";
  const closeMenu = (): void => {
    menuOpen = false;
    render();
    menuButton.focus();
  };
  menuClose.addEventListener("click", closeMenu);
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
  menu.append(menuCard);

  const confirm = document.createElement("div");
  confirm.className = "start-over";
  confirm.setAttribute("role", "alertdialog");
  confirm.setAttribute("aria-modal", "true");
  confirm.setAttribute("aria-labelledby", "start-over-title");
  confirm.setAttribute("aria-describedby", "start-over-detail");
  confirm.hidden = true;
  const confirmCard = document.createElement("div");
  confirmCard.className = "start-over-card";
  const confirmTitle = document.createElement("h2");
  confirmTitle.id = "start-over-title";
  confirmTitle.textContent = "Start over?";
  const confirmDetail = document.createElement("p");
  confirmDetail.id = "start-over-detail";
  confirmDetail.textContent =
    "You will lose all your progress: every stone mined, your whole crew, and every relic you found. The mountain fills back up. This can't be undone.";
  const confirmCancel = document.createElement("button");
  confirmCancel.type = "button";
  confirmCancel.className = "start-over-cancel";
  confirmCancel.textContent = "Keep my mountain";
  const confirmYes = document.createElement("button");
  confirmYes.type = "button";
  confirmYes.className = "start-over-confirm";
  confirmYes.textContent = "Yes, start over";
  const closeConfirm = (): void => {
    confirmingStartOver = false;
    render();
    menuButton.focus();
  };
  confirmCancel.addEventListener("click", closeConfirm);
  confirmYes.addEventListener("click", () => {
    confirmingStartOver = false;
    progress.startOver();
    veinState = waitForVein({ now: now(), random, gapScale: veinGapScale() });
    renderVein();
    render();
  });
  confirm.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeConfirm();
    }
  });
  const confirmActions = document.createElement("div");
  confirmActions.className = "start-over-actions";
  confirmActions.append(confirmCancel, confirmYes);
  confirmCard.append(confirmTitle, confirmDetail, confirmActions);
  confirm.append(confirmCard);

  const reveal = document.createElement("div");
  reveal.className = "relic-reveal";
  reveal.setAttribute("role", "dialog");
  reveal.setAttribute("aria-modal", "true");
  reveal.setAttribute("aria-labelledby", "relic-reveal-title");
  reveal.hidden = true;
  const revealCard = document.createElement("div");
  revealCard.className = "reveal-card";
  const revealKicker = document.createElement("p");
  revealKicker.className = "reveal-kicker";
  revealKicker.textContent = "A Legendary Relic of Fatherhood";
  const revealArt = document.createElement("img");
  revealArt.className = "reveal-art";
  revealArt.alt = "";
  revealArt.width = 64;
  revealArt.height = 64;
  revealArt.draggable = false;
  const revealTitle = document.createElement("h2");
  revealTitle.id = "relic-reveal-title";
  const revealVirtue = document.createElement("p");
  revealVirtue.className = "reveal-virtue";
  const revealPower = document.createElement("p");
  revealPower.className = "reveal-power";
  const revealBoost = document.createElement("p");
  revealBoost.className = "relic-boost";
  const revealContinue = document.createElement("button");
  revealContinue.type = "button";
  revealContinue.className = "reveal-continue";
  revealContinue.textContent = "Carry it with pride";
  revealContinue.addEventListener("click", () => {
    // Closing the Mantle's card opens the finale, once per run.
    legendOpen = view.revealed?.id === "mantle";
    progress.dismissReveal();
  });
  revealCard.append(
    revealKicker,
    revealArt,
    revealTitle,
    revealVirtue,
    revealPower,
    revealBoost,
    revealContinue,
  );
  reveal.append(revealCard);

  // Mantle of the Hero: the finale, shown after its reveal (#103).
  let legendOpen = false;
  const legend = document.createElement("div");
  legend.className = "relic-reveal legend";
  legend.setAttribute("role", "dialog");
  legend.setAttribute("aria-modal", "true");
  legend.setAttribute("aria-labelledby", "legend-title");
  legend.hidden = true;
  const legendCard = document.createElement("div");
  legendCard.className = "reveal-card legend-card";
  const legendKicker = document.createElement("p");
  legendKicker.className = "reveal-kicker";
  legendKicker.textContent = "The bottom of the mountain";
  const legendTitle = document.createElement("h2");
  legendTitle.id = "legend-title";
  legendTitle.textContent = "You became a Legend";
  const legendShelf = document.createElement("div");
  legendShelf.className = "legend-shelf";
  for (const relic of RELICS) {
    const art = document.createElement("img");
    art.src = relicArt[relic.id];
    art.alt = relic.name;
    art.width = 40;
    art.height = 40;
    art.draggable = false;
    legendShelf.append(art);
  }
  const legendStats = document.createElement("p");
  legendStats.className = "legend-stats";
  const legendCheer = document.createElement("p");
  legendCheer.className = "reveal-power";
  legendCheer.textContent =
    "Guidance, Protection, Building, Patience, Wisdom and Heroism: every relic of fatherhood is yours. One day you'll pass the mine to your kid.";
  const legendContinue = document.createElement("button");
  legendContinue.type = "button";
  legendContinue.className = "reveal-continue";
  legendContinue.textContent = "Stand proud on the mountain";
  legendContinue.addEventListener("click", () => {
    legendOpen = false;
    renderLegend();
  });
  legendCard.append(
    legendKicker,
    legendTitle,
    legendShelf,
    legendStats,
    legendCheer,
    legendContinue,
  );
  legend.append(legendCard);

  const saveStatus = document.createElement("p");
  saveStatus.className = "save-status";
  saveStatus.setAttribute("aria-live", "polite");

  const authStatus = document.createElement("p");
  authStatus.className = "auth-status";
  authStatus.setAttribute("aria-live", "polite");

  const authButton = document.createElement("button");
  authButton.type = "button";
  authButton.className = "auth-action";
  authButton.addEventListener("click", () => {
    const state = auth.getState();
    switch (state.kind) {
      case "signed-out":
        void auth.signIn();
        return;
      case "signing-in":
        return;
      case "signed-in":
        void auth.signOut();
        return;
      default: {
        const _exhaustive: never = state;
        return _exhaustive;
      }
    }
  });

  const renderAuth = (state: AuthState): void => {
    switch (state.kind) {
      case "signed-out":
        authButton.textContent = "Sign in with Google";
        authButton.disabled = false;
        authStatus.textContent = "";
        return;
      case "signing-in":
        authButton.textContent = "Signing in...";
        authButton.disabled = true;
        authStatus.textContent = "";
        return;
      case "signed-in":
        authButton.textContent = "Sign out";
        authButton.disabled = false;
        authStatus.textContent = `Signed in as ${state.user.label}`;
        return;
      default: {
        const _exhaustive: never = state;
        return _exhaustive;
      }
    }
  };

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
    pocketText.textContent =
      held === 1 ? "1 stone" : `${formatCount(held)} stones`;
    mountain.disabled = !view.ready || left === 0;
    mountain.setAttribute(
      "aria-label",
      left === 0
        ? "The mountain is mined out"
        : `Mountain, tap to mine ${tapWords(effectiveRates(view.mountain, now()).tapYield)}`,
    );
    renderCrew();
    renderVein();
    renderGuide();
    renderWelcome();
    renderReveal();
    renderLegend();
    renderShelf();
    renderConfirm();
    renderMenu();
    upgrades.render();
    renderSave();
  };

  const renderMenu = (): void => {
    const wasOpen = !menu.hidden;
    menu.hidden = !menuOpen;
    if (menuOpen && !wasOpen) {
      menuClose.focus();
    }
  };

  const renderConfirm = (): void => {
    startOverLink.disabled = !view.ready;
    const wasOpen = !confirm.hidden;
    confirm.hidden = !confirmingStartOver;
    if (confirmingStartOver && !wasOpen) {
      confirmCancel.focus();
    }
  };

  const renderShelf = (): void => {
    const found = foundRelics(view.mountain).length;
    shelfButton.setAttribute(
      "aria-label",
      `Relic shelf, ${String(found)} of ${String(RELICS.length)} found`,
    );
    const guided = hasRelic(view.mountain, "lantern");
    const next = nextRelic(view.mountain);
    const hint = depthHint(view.mountain);
    for (const [index, relic] of RELICS.entries()) {
      const has = hasRelic(view.mountain, relic.id);
      const slot = shelfSlots[index];
      const row = shelfRows[index];
      if (slot === undefined || row === undefined) {
        continue;
      }
      slot.dataset["found"] = String(has);
      row.row.dataset["found"] = String(has);
      row.art.src = relicArt[relic.id];
      row.name.textContent = relic.name;
      row.detail.textContent = has
        ? `The virtue of ${relic.virtue}. Your power: ${relic.boost}`
        : relic.tease;
      if (has) {
        row.row.tabIndex = 0;
        row.row.setAttribute("role", "button");
        row.row.setAttribute("aria-label", `${relic.name}: see your power`);
      } else {
        row.row.removeAttribute("tabindex");
        row.row.removeAttribute("role");
        row.row.removeAttribute("aria-label");
      }
      const isNext = guided && relic === next && hint !== undefined;
      row.hint.hidden = !isNext;
      row.hint.textContent = isNext ? `Next · ${hint}` : "";
    }
    const detailWasOpen = !detail.hidden;
    detail.hidden = !shelfOpen || detailRelic === undefined;
    if (detailRelic !== undefined && !detail.hidden) {
      detailArt.src = relicArt[detailRelic.id];
      detailTitle.textContent = detailRelic.name;
      detailVirtue.textContent = `The virtue of ${detailRelic.virtue}.`;
      detailBoost.textContent = `Your power: ${detailRelic.boost}`;
      if (!detailWasOpen) {
        detailBack.focus();
      }
    }
    const wasOpen = !shelf.hidden;
    shelf.hidden = !shelfOpen;
    if (shelfOpen && !wasOpen) {
      shelfClose.focus();
    }
  };

  const renderGuide = (): void => {
    const next = nextRelic(view.mountain);
    const guided = hasRelic(view.mountain, "lantern");
    guideBar.hidden = !guided || next === undefined;
    if (!guided) {
      goal.textContent =
        "Six Legendary Relics of Fatherhood lie deep inside. Tap to mine.";
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
    guideBar.setAttribute("aria-label", `Progress to the ${next.name}`);
  };

  const renderReveal = (): void => {
    const relic = view.away === undefined ? view.revealed : undefined;
    const wasOpen = !reveal.hidden;
    reveal.hidden = relic === undefined;
    if (relic === undefined) {
      return;
    }
    revealArt.src = relicArt[relic.id];
    revealTitle.textContent = `You found the ${relic.name}`;
    revealVirtue.textContent = `The virtue of ${relic.virtue}.`;
    revealPower.textContent = relic.power;
    revealBoost.textContent = `Your power: ${relic.boost}`;
    if (!wasOpen) {
      revealContinue.focus();
    }
  };

  const renderLegend = (): void => {
    const wasOpen = !legend.hidden;
    legend.hidden = !legendOpen || view.revealed !== undefined;
    if (legend.hidden) {
      return;
    }
    const crewSize = TIERS.reduce(
      (total, tier) => total + owned(view.mountain, tier),
      0,
    );
    legendStats.textContent = `${formatCount(MOUNTAIN_STONES)} stones moved. Six relics found. A crew of ${formatCount(crewSize)} beside you.`;
    if (!wasOpen) {
      legendContinue.focus();
    }
  };

  const renderWelcome = (): void => {
    const report = view.away;
    const joined = view.crewJoined;
    const wasOpen = !welcome.hidden;
    welcome.hidden = report === undefined && joined === undefined;
    welcomeCrew.hidden = joined === undefined;
    welcomeCrew.textContent =
      joined === undefined
        ? ""
        : // Alone, the title already says "Your crew grew".
          `${report === undefined ? "" : "Your crew grew: "}${formatCount(joined)} ${joined === 1 ? "helper" : "helpers"} joined to run your machines.`;
    welcomeTitle.textContent =
      report === undefined ? "Your crew grew" : "While you were away";
    welcomeMined.hidden = report === undefined;
    welcomeDetail.hidden = report === undefined;
    welcomeCheer.hidden = report === undefined;
    if (report === undefined) {
      if (joined !== undefined && !wasOpen) {
        welcomeContinue.focus();
      }
      return;
    }
    welcomeMined.textContent = `+${formatCount(report.mined)} ${report.mined === 1 ? "stone" : "stones"}`;
    const { helpers } = view.mountain;
    const onlyHelpers = stonesPerSecond(view.mountain) === helpers;
    const crewName = !onlyHelpers
      ? "Your crew"
      : helpers === 1
        ? "Your helper"
        : `Your ${formatCount(helpers)} helpers`;
    welcomeDetail.textContent = report.capped
      ? `You were gone ${formatDuration(report.awayMs)}. ${crewName} mined for ${capWords(effectiveRates(view.mountain).awayCapMs)}, ${restingPace(view.mountain)}.`
      : `You were gone ${formatDuration(report.awayMs)}. ${crewName} mined the whole time, ${restingPace(view.mountain)}.`;
    welcomeDetail.textContent +=
      report.heart > 1
        ? ` The Heart of Patience made it ×${report.heart.toFixed(2).replace(/0$/, "")}.`
        : "";
    if (!wasOpen) {
      welcomeContinue.focus();
    }
  };

  const renderCrew = (): void => {
    const { mountain: current } = view;
    const rate = rateShown ?? stonesPerSecond(current, now());
    const rates = effectiveRates(current);
    const idle = TIERS.reduce(
      (total, tier) => total + owned(current, tier) - rates.running[tier.id],
      0,
    );
    crewStatus.classList.toggle("crew-short", rates.helpersShort > 0);
    crewStatus.textContent =
      rates.helpersShort > 0
        ? `${formatCompact(rate)}/s · ${formatCompact(idle)} idle, need ${formatCompact(rates.helpersShort)} ${rates.helpersShort === 1 ? "helper" : "helpers"}`
        : rate === 0
          ? "No crew yet. Hire a helper to mine while you rest."
          : rate >= 1_000
            ? // Compact once it's big, so the line never wraps on a phone.
              `Your crew mines ${formatCompact(rate)} stones/s`
            : `Your crew mines ${perSecond(rate)}`;
    const shownCount = TIERS.filter((tier) => tierShown(current, tier)).length;
    tierGrid.dataset["shown"] = String(shownCount);
    // Three to a row once there are four or more, so every tier fits in two rows.
    const compact = shownCount >= COMPACT_TIER_COUNT;
    tierGrid.classList.toggle("tier-grid-compact", compact);
    for (const {
      tier,
      card,
      name,
      costText,
      countBadge,
      rate: tierRate,
      costIcon,
    } of tierCards) {
      const count = owned(current, tier);
      const price = tierCost(tier, count);
      card.hidden = !tierShown(current, tier);
      const locked = tierLocked(current, tier);
      const needed = RELICS.find((relic) => relic.id === tier.needs);
      card.disabled = !view.ready || locked || current.pocket < price;
      card.classList.toggle("tier-locked", locked);
      costIcon.hidden = locked;
      name.textContent = compact ? tier.shortName : tier.name;
      countBadge.textContent = `×${formatCompact(count)}`;
      countBadge.hidden = count === 0;
      costText.textContent = locked ? "Locked" : formatCompact(price);
      const speed = rates.tierSpeed[tier.id];
      // Only staffed machines count; the rest show as idle.
      const running = rates.running[tier.id];
      const idleHere = count - running;
      card.classList.toggle("tier-idle", !locked && idleHere > 0);
      // A bought crew synergy shows as "↑12%" in the rate line (just "↑" on tight cards).
      const synergy = tierSynergy(current, tier.id);
      const lift = `\u2191${String(Math.round(synergy * 100))}%`;
      tierRate.textContent = locked
        ? `${needed?.name.split(" ")[0] ?? "Relic"} · ${formatCompact(needed?.depth ?? 0)}`
        : idleHere > 0
          ? compact
            ? // Tight cards: the idle count is the news; the crew line has the speed.
              `${formatCompact(idleHere)} idle`
            : `${formatCompact(idleHere)} idle\u2009·\u2009${formatCompact(running * speed)}/s`
          : synergy > 0
            ? compact
              ? // Tight cards keep just the arrow; the sheet and label say how much.
                `\u2191\u2009${formatCompact(running * speed)}/s`
              : `+${formatSpeed(speed)} ${lift} · ${formatCompact(running * speed)}/s`
            : compact
              ? count === 0
                ? `+${formatSpeed(speed)}/s`
                : `+${formatSpeed(speed)}\u2009·\u2009${formatCompact(running * speed)}/s`
              : count === 0
                ? `+${formatSpeed(speed)}/s each`
                : // "each" drops out once the total needs four digits, so the line fits.
                  `+${formatSpeed(speed)}${running * speed < 1_000 ? " each" : ""} · ${formatCompact(running * speed)}/s`;
      card.setAttribute(
        "aria-label",
        locked
          ? `${tier.name}, locked. Needs the ${needed?.name ?? "next relic"}, found ${formatCount(needed?.depth ?? 0)} stones down. Mines ${perSecond(speed)} each.`
          : `Buy a ${tier.name.toLowerCase()} for ${formatCount(price)} stones, mines ${perSecond(speed)}${synergy > 0 ? `, ${percent(synergy)} faster from crew synergy` : ""}. You have ${formatCount(count)}${idleHere > 0 ? `, ${formatCount(idleHere)} idle: each needs ${String(tier.staff)} ${tier.staff === 1 ? "helper" : "helpers"} to run` : ""}.`,
      );
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      progress.flush();
    }
  });
  window.addEventListener("pagehide", () => {
    progress.flush();
  });

  menuCard.append(menuTitle, authStatus, authButton, startOverLink, menuClose);

  const pocketRow = document.createElement("div");
  pocketRow.className = "pocket-row";
  pocketRow.append(pocket, upgradesButton);

  const header = document.createElement("header");
  header.className = "top-bar";
  header.append(lantern, remaining, menuButton);

  root.replaceChildren(
    header,
    guide,
    shelfButton,
    mountainWrap,
    pocketRow,
    crew,
    saveStatus,
    welcome,
    reveal,
    legend,
    shelf,
    detail,
    confirm,
    menu,
    upgradesSheet,
  );

  setInterval(() => {
    progress.tick();
    stepVein();
    const crewRate = stonesPerSecond(view.mountain, now());
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
  auth.subscribe(renderAuth);
}

const FLOAT_MS = 1200;
const COUNT_STEPS = 8;
const COUNT_STEP_MS = 60;

function perSecond(rate: number): string {
  return rate === 1
    ? "1 stone a second"
    : `${formatCount(rate)} stones a second`;
}
