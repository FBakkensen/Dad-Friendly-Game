import type { BoardHost } from "./board-host";
import type { ProgressStore } from "./progress-store";
import { createSaveConflictPanel } from "./save-conflict-panel";
import {
  createOtherTab,
  createUpdatePrompt,
  showAppUpdate,
} from "./screen-prompts";

/**
 * The cards that keep the save safe, on slice 1's frame (#707): the update
 * card (a new build, or a save from a later build), "Two saves found", and
 * the card for a game open in another tab. They are today's board's panels
 * on the board card shell, over the frame's board host (shared with the
 * Ledger, #708), so their
 * presses keep the settle against a sleepy double tap. They sit over the
 * rest of the frame, the shift report included, in the board's order: the
 * split on top, then the other tab, then the update. A card coming up
 * closes the frame's sheets, as the board's cards close its drawers.
 */
export type FrameSaveCards = {
  /** The cards, each laid over the frame on its own. */
  readonly roots: readonly HTMLElement[];
  readonly paint: () => void;
};

export function createFrameSaveCards({
  progress,
  board,
  now,
  requestPaint,
  onShow,
}: {
  progress: ProgressStore;
  board: BoardHost;
  now: () => number;
  /** Repaints the frame: a card's own change (a side picked, the confirm). */
  requestPaint: () => void;
  /** A card comes up: the frame closes its sheets. */
  onShow: () => void;
}): FrameSaveCards {
  const update = createUpdatePrompt(board, () => {
    onShow();
    requestPaint();
  });
  const otherTab = createOtherTab(progress, board);
  const conflict = createSaveConflictPanel({
    progress,
    now,
    board,
    requestRender: requestPaint,
  });
  let updateAsked = false;
  let covered = false;
  return {
    roots: [update, otherTab.root, conflict.root],
    paint: () => {
      const view = progress.getSnapshot();
      const covering = view.elsewhere || view.saveConflict !== undefined;
      if (covering && !covered) {
        onShow();
      }
      covered = covering;
      otherTab.paint(view.elsewhere);
      conflict.render(view.saveConflict, view.elsewhere);
      // A save from a later build (#558): the update card, once.
      if (view.newer && !updateAsked) {
        updateAsked = true;
        showAppUpdate(update);
      }
    },
  };
}
