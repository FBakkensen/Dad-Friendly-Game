import { cardLine, createBoardCard } from "./board-card";
import { write } from "./board-dom";
import type { BoardHost } from "./board-host";
import type { ProgressStore } from "./progress-store";
import {
  OTHER_TAB_BODY,
  OTHER_TAB_PLAY,
  OTHER_TAB_TITLE,
  UPDATE_RELOAD,
  UPDATE_TITLE,
} from "./screen-words";

/** The update card tells its screen it is up, so an open drawer closes at once. */
const UPDATE_SHOWN = "update-shown";

/**
 * The update card (#464), on the board card shell, hidden until `showAppUpdate` opens it.
 * `onShown` repaints the screen.
 */
export function createUpdatePrompt(
  board: BoardHost,
  onShown: () => void,
): HTMLElement {
  const card = createBoardCard({
    name: "update",
    hook: "update-prompt",
    titleId: "update-prompt-title",
    board,
  });
  write(card.title, UPDATE_TITLE);
  const reload = card.plate(UPDATE_RELOAD, "reload", "update-reload", () => {
    globalThis.location.reload();
  });
  // showAppUpdate opens the card from outside the screen: it covers the drawers at once.
  card.root.addEventListener(UPDATE_SHOWN, () => {
    card.show(true, reload);
    onShown();
  });
  return card.root;
}

/** The card that says the game is open in another tab, with the plate that plays here. */
export function createOtherTab(
  progress: ProgressStore,
  board: BoardHost,
): {
  root: HTMLElement;
  paint(elsewhere: boolean): void;
} {
  const card = createBoardCard({
    name: "other-tab",
    hook: "other-tab",
    titleId: "other-tab-title",
    board,
  });
  write(card.title, OTHER_TAB_TITLE);
  const body = cardLine("other-tab-body");
  write(body, OTHER_TAB_BODY);
  card.body.append(body);
  const play = card.plate(OTHER_TAB_PLAY, "play", "other-tab-play", () => {
    void progress.playHere();
  });
  return {
    root: card.root,
    paint: (elsewhere) => {
      card.show(elsewhere, play);
    },
  };
}

/** Shows the update card. A newer service worker calls this. */
export function showAppUpdate(root: ParentNode): void {
  root.querySelector(".update-prompt")?.dispatchEvent(new Event(UPDATE_SHOWN));
}
