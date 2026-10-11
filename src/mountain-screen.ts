import {
  createUnconfiguredAuth,
  type AuthController,
  type AuthState,
} from "./auth";
import { formatCount, formatDuration } from "./format";
import {
  AWAY_CAP_MS,
  MOUNTAIN_STONES,
  helperCost,
  hireHelper,
  mineByHand,
  stonesPerSecond,
} from "./mountain";
import {
  createProgressStore,
  type ProgressSnapshot,
  type ProgressStore,
} from "./progress-store";

export function mountMountainScreen({
  root,
  lanternUrl,
  rockUrl,
  stoneUrl,
  auth = createUnconfiguredAuth(),
  progress: progressArg,
}: {
  root: HTMLElement;
  lanternUrl: string;
  /** Sprite sheet; the left half is the rock face. */
  rockUrl: string;
  stoneUrl: string;
  auth?: AuthController;
  progress?: ProgressStore;
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
  goal.textContent =
    "Six Legendary Relics of Fatherhood lie deep in this mountain. Tap to mine, one stone at a time.";

  const mountain = document.createElement("button");
  mountain.type = "button";
  mountain.className = "mountain";
  const rock = document.createElement("span");
  rock.className = "mountain-art";
  rock.style.backgroundImage = `url("${rockUrl}")`;
  mountain.append(rock);
  mountain.addEventListener("click", () => {
    if (!view.ready) {
      return;
    }
    progress.applyMutation(mineByHand);
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
  crew.setAttribute("aria-label", "Helper miners");
  const crewStatus = document.createElement("p");
  crewStatus.className = "crew-status";
  const hire = document.createElement("button");
  hire.type = "button";
  hire.className = "hire-helper";
  hire.addEventListener("click", () => {
    if (!view.ready) {
      return;
    }
    progress.applyMutation(hireHelper);
  });
  const hireNote = document.createElement("p");
  hireNote.className = "hire-note";
  hireNote.setAttribute("aria-live", "polite");
  crew.append(crewStatus, hire, hireNote);

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
    renderWelcome();
    renderSave();
  };

  const renderWelcome = (): void => {
    const report = view.away;
    const wasOpen = !welcome.hidden;
    welcome.hidden = report === undefined;
    if (report === undefined) {
      return;
    }
    welcomeMined.textContent = `+${formatCount(report.mined)} ${report.mined === 1 ? "stone" : "stones"}`;
    const helpers = view.mountain.helpers;
    const crewName =
      helpers === 1 ? "Your helper" : `Your ${formatCount(helpers)} helpers`;
    welcomeDetail.textContent = report.capped
      ? `You were gone ${formatDuration(report.awayMs)}. ${crewName} mined for the first ${formatDuration(AWAY_CAP_MS)}.`
      : `You were gone ${formatDuration(report.awayMs)}. ${crewName} mined the whole time.`;
    if (!wasOpen) {
      welcomeContinue.focus();
    }
  };

  const renderCrew = (): void => {
    const { helpers, pocket } = view.mountain;
    crewStatus.textContent =
      helpers === 0
        ? "No helpers yet. Hire one to mine while you rest."
        : `${formatCount(helpers)} ${helpers === 1 ? "helper" : "helpers"} mining ${perSecond(stonesPerSecond(view.mountain))}`;
    const cost = helperCost(helpers);
    hire.textContent = `Hire a helper: ${formatCount(cost)} stones`;
    const short = cost - pocket;
    hire.disabled = !view.ready || short > 0;
    hireNote.textContent =
      short > 0
        ? `Mine ${formatCount(short)} more ${short === 1 ? "stone" : "stones"} to hire`
        : "";
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      progress.flush();
    }
  });
  window.addEventListener("pagehide", () => {
    progress.flush();
  });

  root.replaceChildren(
    remaining,
    lantern,
    goal,
    mountain,
    pocket,
    crew,
    saveStatus,
    authStatus,
    authButton,
    welcome,
  );

  setInterval(progress.tick, 1000);

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
