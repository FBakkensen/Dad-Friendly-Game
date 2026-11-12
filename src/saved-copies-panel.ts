import { cardLine, createBoardCard, type BoardCard } from "./board-card";
import { el, hide, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { skin } from "./board-skin";
import type { ArchivedCopy } from "./cloud-save";
import type { ProgressStore } from "./progress-store";
import { keptUntilWords, saveCardLines } from "./save-sheet-copy";
import {
  BACK_TO_THE_MOUNTAIN,
  SAVE_CONFLICT_ERROR,
  SAVE_CONFLICT_PLAY,
  SAVED_COPIES_EMPTY,
  SAVED_COPIES_TITLE,
  SAVED_COPY_GONE,
} from "./screen-words";

/** One copy's words. */
interface CopyRow {
  readonly copy: ArchivedCopy;
  readonly texts: readonly string[];
}

/** A copy's inset on the card: its lines, then Play this one. */
interface CopyParts {
  readonly root: HTMLElement;
  readonly lines: readonly HTMLElement[];
}

/**
 * The archived copies (#466), on the board card shell, opened from the Ledger's Saved copies
 * plate. Each copy is an inset with its lines and Play this one, which plays it through the same
 * archive-then-switch path. A copy from an earlier run, such as the mountain a Start over or a
 * pass left (#480), comes back as a new run. Back to the mountain and
 * Escape close it. A copy's inset is built once, and a repaint writes only the lines that
 * changed, so its plate and the keyboard's focus stay put.
 */
export function createSavedCopiesPanel({
  progress,
  now,
  board,
  requestRender,
}: {
  progress: ProgressStore;
  now: () => number;
  board: BoardHost;
  requestRender: () => void;
}) {
  const card = createBoardCard({
    name: "copies",
    hook: "saved-copies",
    titleId: "saved-copies-title",
    board,
    dismiss: () => {
      close();
    },
  });
  write(card.title, SAVED_COPIES_TITLE);
  const empty = cardLine("saved-copies-empty is-quiet");
  write(empty, SAVED_COPIES_EMPTY);
  const list = el("div", "saved-copies-list");
  const error = cardLine("save-conflict-error");
  error.hidden = true;
  card.body.append(empty, list, error);

  let open = false;
  let copies: readonly ArchivedCopy[] = [];
  let note = "";

  /** Back to the mountain, Escape, or a copy now in play: the focus goes back to the opener. */
  const close = (): void => {
    open = false;
    note = "";
    requestRender();
  };
  const back = card.plate(
    BACK_TO_THE_MOUNTAIN,
    "close",
    "saved-copies-close",
    close,
  );

  // One copy at a time: a second press while the first restores never switches again.
  let restoring = false;
  const play = (copy: ArchivedCopy): void => {
    if (restoring) {
      return;
    }
    restoring = true;
    void progress
      .restoreCopy(copy.id)
      .then((result) => {
        if (result === "saved") {
          close();
          return;
        }
        note = result === "missing" ? SAVED_COPY_GONE : SAVE_CONFLICT_ERROR;
        requestRender();
      })
      .finally(() => {
        restoring = false;
      });
  };

  /** Each copy's inset by its id: built once each. */
  const built = new Map<string, CopyParts>();
  const keyOf = (row: CopyRow): string => row.copy.id;
  /** An inset whose copy left the list (played, expired) is not kept. */
  const forgetGone = (rows: readonly CopyRow[]): void => {
    const keep = new Set(rows.map(keyOf));
    for (const key of [...built.keys()]) {
      if (!keep.has(key)) {
        built.delete(key);
      }
    }
  };
  const partsFor = (row: CopyRow): CopyParts => {
    const key = keyOf(row);
    const known = built.get(key);
    if (known !== undefined) {
      return known;
    }
    const parts = copyParts(card, row, () => {
      play(row.copy);
    });
    built.set(key, parts);
    return parts;
  };

  const rowOf = (copy: ArchivedCopy, clock: number): CopyRow => {
    const lines = saveCardLines(copy.mountain, copy.lastSeen, clock);
    const texts = [
      copy.deviceLabel,
      lines.depth,
      lines.pocket,
      lines.machines,
      lines.crew,
      lines.played,
      keptUntilWords(copy.expiresAt),
    ];
    return { copy, texts };
  };

  const render = (): void => {
    if (open) {
      hide(empty, copies.length > 0);
      hide(error, note === "");
      write(error, note);
      const clock = now();
      const rows = copies.map((copy) => rowOf(copy, clock));
      forgetGone(rows);
      const shown = rows.map((row) => {
        const parts = partsFor(row);
        paintCopy(parts, row);
        return parts.root;
      });
      if (!sameChildren(list, shown)) {
        list.replaceChildren(...shown);
      }
    }
    card.show(open, back);
  };

  return {
    root: card.root,
    /** Opens the card and reads the copies again; a close gives focus back to `from`. */
    open: (from?: HTMLElement): void => {
      open = true;
      note = "";
      card.from(from);
      void progress.savedCopies().then((next) => {
        copies = next;
        requestRender();
      });
      requestRender();
    },
    render,
  };
}

/** A copy's inset: seven lines, then Play this one. */
function copyParts(card: BoardCard, row: CopyRow, play: () => void): CopyParts {
  const root = el("article", "saved-copy");
  const lines = row.texts.map((_text, index) =>
    cardLine(index === 0 ? "saved-copy-device" : "saved-copy-line"),
  );
  root.append(...lines);
  card.plate(
    SAVE_CONFLICT_PLAY,
    `play-${row.copy.id}`,
    "save-conflict-play",
    play,
    root,
  );
  skin(root, "inset");
  return { root, lines };
}

function paintCopy(parts: CopyParts, row: CopyRow): void {
  for (const [index, line] of parts.lines.entries()) {
    write(line, row.texts[index] ?? "");
  }
}

/** Whether `host` already holds exactly `children`, in order. */
function sameChildren(
  host: HTMLElement,
  children: readonly HTMLElement[],
): boolean {
  return (
    host.children.length === children.length &&
    children.every((child, index) => host.children[index] === child)
  );
}
