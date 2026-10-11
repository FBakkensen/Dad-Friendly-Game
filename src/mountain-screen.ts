import {
  createUnconfiguredAuth,
  type AuthController,
  type AuthState,
} from "./auth";
import { formatCount, formatDuration } from "./format";
import {
  AWAY_CAP_MS,
  MOUNTAIN_STONES,
  mineByHand,
  stonesPerSecond,
} from "./mountain";
import {
  TIERS,
  buyTier,
  owned,
  tierCost,
  tierShown,
  type TierId,
} from "./tiers";
import {
  foundRelics,
  hasRelic,
  nextRelic,
  RELICS,
  type RelicId,
} from "./relics";
import {
  LANTERN_VEIN_GAP_SCALE,
  advanceVein,
  mineVein,
  veinReward,
  waitForVein,
  type VeinState,
} from "./veins";
import {
  createProgressStore,
  type ProgressSnapshot,
  type ProgressStore,
} from "./progress-store";

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
  random = Math.random,
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
  random?: () => number;
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
  mountain.addEventListener("click", () => {
    if (!view.ready) {
      return;
    }
    progress.applyMutation(mineByHand);
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

  const mountainWrap = document.createElement("div");
  mountainWrap.className = "mountain-wrap";
  mountainWrap.append(mountain, vein);

  const veinNote = document.createElement("p");
  veinNote.className = "vein-note";
  veinNote.setAttribute("aria-live", "polite");

  mountainWrap.append(veinNote);

  let veinState: VeinState = waitForVein({
    now: now(),
    random,
    gapScale: veinGapScale(),
  });
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
    words.append(name, cost);
    card.append(art, words);
    card.addEventListener("click", () => {
      if (!view.ready) {
        return;
      }
      progress.applyMutation((mountain) => buyTier(mountain, tier.id));
    });
    tierGrid.append(card);
    return { tier, card, name, cost };
  });
  crew.append(crewStatus, tierGrid);

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
    words.append(name, detail);
    row.append(art, words);
    shelfList.append(row);
    return { row, art, name, detail };
  });
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
  const revealContinue = document.createElement("button");
  revealContinue.type = "button";
  revealContinue.className = "reveal-continue";
  revealContinue.textContent = "Carry it with pride";
  revealContinue.addEventListener("click", () => {
    progress.dismissReveal();
  });
  revealCard.append(
    revealKicker,
    revealArt,
    revealTitle,
    revealVirtue,
    revealPower,
    revealContinue,
  );
  reveal.append(revealCard);

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
        : "Mountain, tap to mine one stone",
    );
    renderCrew();
    renderVein();
    renderGuide();
    renderWelcome();
    renderReveal();
    renderShelf();
    renderSave();
  };

  const renderShelf = (): void => {
    const found = foundRelics(view.mountain).length;
    shelfButton.setAttribute(
      "aria-label",
      `Relic shelf, ${String(found)} of ${String(RELICS.length)} found`,
    );
    const guided = hasRelic(view.mountain, "lantern");
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
      row.name.textContent = has ? relic.name : "???";
      row.detail.textContent = has
        ? `The virtue of ${relic.virtue}. ${relic.power}`
        : guided
          ? `Lies ${formatCount(relic.depth)} stones deep.`
          : "Still buried deep in the mountain.";
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
    goal.textContent = `Next: ${next.name}, ${formatCount(next.depth - mined)} stones deeper`;
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
    if (!wasOpen) {
      revealContinue.focus();
    }
  };

  const renderWelcome = (): void => {
    const report = view.away;
    const wasOpen = !welcome.hidden;
    welcome.hidden = report === undefined;
    if (report === undefined) {
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
      ? `You were gone ${formatDuration(report.awayMs)}. ${crewName} mined for the first ${formatDuration(AWAY_CAP_MS)}.`
      : `You were gone ${formatDuration(report.awayMs)}. ${crewName} mined the whole time.`;
    if (!wasOpen) {
      welcomeContinue.focus();
    }
  };

  const renderCrew = (): void => {
    const { mountain: current } = view;
    const rate = stonesPerSecond(current);
    crewStatus.textContent =
      rate === 0
        ? "No crew yet. Hire a helper to mine while you rest."
        : `Your crew mines ${perSecond(rate)}`;
    tierGrid.dataset["shown"] = String(
      TIERS.filter((tier) => tierShown(current, tier)).length,
    );
    for (const { tier, card, name, cost } of tierCards) {
      const count = owned(current, tier);
      const price = tierCost(tier, count);
      card.hidden = !tierShown(current, tier);
      card.disabled = !view.ready || current.pocket < price;
      name.textContent =
        count === 0 ? tier.name : `${tier.name} ×${formatCount(count)}`;
      cost.textContent = `${formatCount(price)} stones`;
      card.setAttribute(
        "aria-label",
        `Buy a ${tier.name.toLowerCase()} for ${formatCount(price)} stones, mines ${perSecond(tier.perSecond)}. You have ${formatCount(count)}.`,
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

  const header = document.createElement("header");
  header.className = "top-bar";
  header.append(lantern, remaining);

  root.replaceChildren(
    header,
    guide,
    shelfButton,
    mountainWrap,
    pocket,
    crew,
    saveStatus,
    authStatus,
    authButton,
    welcome,
    reveal,
    shelf,
  );

  setInterval(() => {
    progress.tick();
    stepVein();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // Veins are for active play only: a fresh wait starts on every return.
      veinState = waitForVein({ now: now(), random, gapScale: veinGapScale() });
      renderVein();
    }
  });

  progress.subscribe((next) => {
    view = next;
    render();
  });
  auth.subscribe(renderAuth);
}

function perSecond(rate: number): string {
  return rate === 1
    ? "1 stone a second"
    : `${formatCount(rate)} stones a second`;
}
