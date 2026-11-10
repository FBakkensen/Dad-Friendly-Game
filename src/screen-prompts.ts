import { showCard } from "./card-state";
import type { ProgressStore } from "./progress-store";
import {
  OTHER_TAB_BODY,
  OTHER_TAB_PLAY,
  OTHER_TAB_TITLE,
} from "./screen-words";

/** The update prompt tells its screen it is up, so an open drawer closes at once. */
const UPDATE_SHOWN = "update-shown";

/** The reload prompt, hidden until `showAppUpdate` opens it. `onShown` repaints the screen. */
export function createUpdatePrompt(onShown: () => void): HTMLElement {
  const updatePrompt = document.createElement("div");
  updatePrompt.className = "update-prompt";
  updatePrompt.hidden = true;
  // showAppUpdate opens the prompt from outside the screen: it covers the drawers at once.
  updatePrompt.addEventListener(UPDATE_SHOWN, onShown);
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
  return updatePrompt;
}

/** The card that says the game is open in another tab, with the button that plays here. */
export function createOtherTab(progress: ProgressStore): {
  root: HTMLElement;
  paint(elsewhere: boolean): void;
} {
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

  /** Whether the other-tab card is up, so it takes the focus once. */
  let otherShown = false;
  return {
    root: otherTab,
    paint: (elsewhere) => {
      showCard(otherTab, elsewhere);
      if (elsewhere && !otherShown) {
        playHere.focus();
      }
      otherShown = elsewhere;
    },
  };
}

/** Shows the reload prompt. A newer service worker calls this. */
export function showAppUpdate(root: ParentNode): void {
  const prompt = root.querySelector<HTMLElement>(".update-prompt");
  if (prompt === null) {
    return;
  }
  showCard(prompt, true);
  prompt.dispatchEvent(new Event(UPDATE_SHOWN));
}
