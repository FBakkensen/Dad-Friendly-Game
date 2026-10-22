import type { ArchivedCopy } from "./cloud-save";
import type { ProgressStore } from "./progress-store";
import { keptUntilWords, saveCardLines } from "./save-sheet-copy";
import {
  SAVE_CONFLICT_ERROR,
  SAVE_CONFLICT_PLAY,
  SAVED_COPIES_TITLE,
} from "./screen-words";

/** Menu list of archived copies. Play one through the same archive-then-switch path. */
export function createSavedCopiesPanel({
  progress,
  now,
  onOpen,
  requestRender,
}: {
  progress: ProgressStore;
  now: () => number;
  onOpen: () => void;
  requestRender: () => void;
}) {
  const entry = document.createElement("button");
  entry.type = "button";
  entry.className = "saved-copies-link";
  entry.textContent = SAVED_COPIES_TITLE;

  const root = document.createElement("div");
  root.className = "saved-copies";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "saved-copies-title");
  const card = document.createElement("div");
  card.className = "menu-card saved-copies-card";
  const title = document.createElement("h2");
  title.id = "saved-copies-title";
  title.textContent = SAVED_COPIES_TITLE;
  const empty = document.createElement("p");
  empty.className = "label";
  empty.textContent = "No saved copies yet.";
  const list = document.createElement("div");
  list.className = "saved-copies-list";
  const error = document.createElement("p");
  error.className = "label save-conflict-error";
  error.hidden = true;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "menu-close";
  close.textContent = "Back to the mountain";
  card.append(title, empty, list, error, close);
  root.append(card);

  let open = false;
  let copies: readonly ArchivedCopy[] = [];
  let note = "";

  const closeSheet = (): void => {
    open = false;
    note = "";
    requestRender();
  };
  close.addEventListener("click", closeSheet);
  entry.addEventListener("click", () => {
    onOpen();
    open = true;
    note = "";
    void progress.savedCopies().then((next) => {
      copies = next;
      requestRender();
    });
    requestRender();
  });

  const render = (): void => {
    root.hidden = !open;
    empty.hidden = copies.length > 0;
    error.hidden = note === "";
    error.textContent = note;
    list.replaceChildren();
    const clock = now();
    for (const copy of copies) {
      const row = document.createElement("article");
      row.className = "saved-copy card";
      const lines = saveCardLines(copy.mountain, copy.lastSeen, clock);
      for (const text of [
        copy.deviceLabel,
        lines.depth,
        lines.pocket,
        lines.machines,
        lines.crew,
        lines.played,
        keptUntilWords(copy.expiresAt),
      ]) {
        const line = document.createElement("p");
        line.className = "label";
        line.textContent = text;
        row.append(line);
      }
      const play = document.createElement("button");
      play.type = "button";
      play.className = "go save-conflict-play";
      play.textContent = SAVE_CONFLICT_PLAY;
      play.addEventListener("click", () => {
        void progress.restoreCopy(copy.id).then((result) => {
          if (result === "saved") {
            closeSheet();
            return;
          }
          note =
            result === "missing"
              ? "That copy is no longer here."
              : SAVE_CONFLICT_ERROR;
          requestRender();
        });
      });
      row.append(play);
      list.append(row);
    }
  };

  return { entry, root, render };
}
