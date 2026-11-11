import { showCard } from "./card-state";
import type { ArchivedCopy } from "./cloud-save";
import { runStartedAt } from "./mountain";
import type { ProgressStore } from "./progress-store";
import { keptUntilWords, saveCardLines } from "./save-sheet-copy";
import {
  SAVE_CONFLICT_ERROR,
  SAVE_CONFLICT_PLAY,
  SAVED_COPIES_TITLE,
  SAVED_COPY_EARLIER_RUN,
} from "./screen-words";

interface CopyRow {
  readonly copy: ArchivedCopy;
  readonly earlier: boolean;
  readonly texts: readonly string[];
}

/**
 * The list of archived copies, opened from the Ledger's Saved copies plate. Play one through the
 * same archive-then-switch path.
 */
export function createSavedCopiesPanel({
  progress,
  now,
  requestRender,
}: {
  progress: ProgressStore;
  now: () => number;
  requestRender: () => void;
}) {
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
  /** Opens the card and reads the copies again. */
  const openSheet = (): void => {
    open = true;
    note = "";
    void progress.savedCopies().then((next) => {
      copies = next;
      requestRender();
    });
    requestRender();
  };

  /** One row's words: an earlier run's copy cannot be played. */
  const rowLines = (copy: ArchivedCopy, clock: number): CopyRow => {
    const lines = saveCardLines(copy.mountain, copy.lastSeen, clock);
    const earlier =
      runStartedAt(copy.mountain) <
      runStartedAt(progress.getSnapshot().mountain);
    const texts = [
      copy.deviceLabel,
      lines.depth,
      lines.pocket,
      lines.machines,
      lines.crew,
      lines.played,
      keptUntilWords(copy.expiresAt),
    ];
    return { copy, earlier, texts };
  };

  const paintRow = ({ copy, earlier, texts }: CopyRow): HTMLElement => {
    const row = document.createElement("article");
    row.className = earlier
      ? "saved-copy card is-earlier-run"
      : "saved-copy card";
    for (const text of texts) {
      const line = document.createElement("p");
      line.className = "label";
      line.textContent = text;
      row.append(line);
    }
    if (earlier) {
      const blocked = document.createElement("p");
      blocked.className = "label earlier-run";
      blocked.textContent = SAVED_COPY_EARLIER_RUN;
      row.append(blocked);
      return row;
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
    return row;
  };

  /** What the open list last showed: a repaint with the same rows keeps them, and the focus. */
  let shownKey: string | undefined;
  const render = (): void => {
    showCard(root, open);
    if (!open) {
      shownKey = undefined;
      return;
    }
    empty.hidden = copies.length > 0;
    error.hidden = note === "";
    error.textContent = note;
    const clock = now();
    const rows = copies.map((copy) => rowLines(copy, clock));
    const key = JSON.stringify(
      rows.map(({ copy, earlier, texts }) => [copy.id, earlier, texts]),
    );
    if (key === shownKey) {
      return;
    }
    shownKey = key;
    list.replaceChildren(...rows.map(paintRow));
  };

  return { root, open: openSheet, render };
}
