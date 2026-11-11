import { cardUp } from "./card-state";
import { coverFor, wantedSign, type Cover } from "./screen-cover";
import { drawerOpen } from "./board-interaction";
import { keyViews } from "./key-rail";
import { createBoardSign, type BoardSign } from "./board-sign";
import type { BoardNote } from "./board-note";
import type { KeyRail } from "./board-keys";
import type { ScreenCtx } from "./screen-context";

/**
 * The New sign, what a card does to the drawers and the note, and the key rail's paint. The
 * root hands in the board note, the rail, the cards and the drawers.
 */
export function createOverlays(
  ctx: ScreenCtx,
  deps: {
    readonly note: BoardNote;
    readonly rail: KeyRail;
    readonly cards: readonly HTMLElement[];
    readonly drawers: readonly {
      close(options: { restoreFocus: false; by: "program" }): void;
    }[];
  },
): {
  readonly sign: BoardSign;
  readonly paint: () => void;
  readonly putSignAway: () => void;
  /** A card or a drawer is over the board, so the mine window is out of sight. */
  readonly boardCovered: () => boolean;
  readonly listen: () => void;
} {
  const { board, now, listening } = ctx;
  const { note: boardNote, rail, cards, drawers } = deps;
  // The New sign stands in the band over its key (#373): a sign, not a button.
  const sign = createBoardSign();

  /** Read fresh at each use: closing the drawers changes the stack. */
  const cover = (): Cover =>
    coverFor({
      cardUp: cards.some(cardUp),
      drawerOpen: drawerOpen(board.view()),
      noteOn: boardNote.isOn(),
    });
  /**
   * A card that opens by itself (a relic, a layer, a craft done, a save
   * conflict, an update) stands under the drawers' clip. It closes an open
   * drawer, so it is never covered, and keeps the focus it took: the key
   * the drawer opened from is under the card.
   */
  const coverDrawers = (): void => {
    if (!cover().closeDrawers) {
      return;
    }
    for (const sheet of drawers) {
      sheet.close({ restoreFocus: false, by: "program" });
    }
  };
  /** The New sign last shown: each shows once a launch. */
  let teachShown: string | undefined;
  /**
   * A card that opens by itself (a relic, a layer, a craft done, a save
   * conflict, an update) never closes the board's popups, and the board note
   * stands above it. So any note goes once such a card is up, and so does the
   * New sign. A sign it covered was never really seen: it shows once more after
   * the card.
   */
  const coverNote = (): void => {
    if (!cover().putAway) {
      return;
    }
    if (sign.shown() !== undefined) {
      teachShown = undefined;
      sign.hide();
    }
    if (boardNote.isOn()) {
      boardNote.hide();
    }
  };
  /** Any tap or Escape puts the New sign away; it never comes back this launch. */
  const putSignAway = (): void => {
    if (sign.shown() !== undefined) {
      sign.hide();
      renderRail();
    }
  };
  /**
   * One New sign at a time, in the order teach.ts lists them (#372, #373). It
   * stands in the band over its key until any tap or Escape puts it away. A
   * note or sheet already up waits it out, and a sign put away never comes back
   * this launch; the dot stays. Opening the sheet by its key counts as seen.
   */
  const renderTeach = (): void => {
    const want = wantedSign(ctx.view());
    const up = sign.shown();
    if (want === undefined || (up !== undefined && up.key !== want.key)) {
      sign.hide();
    }
    if (want === undefined) {
      return;
    }
    if (sign.shown() !== undefined) {
      sign.show(want.key, want.words);
      return;
    }
    // Another note, or a sheet over the board, holds it back until a later
    // render or tick: the sign would stand under the sheet.
    if (want.id === teachShown || cover().holdSign) {
      return;
    }
    teachShown = want.id;
    sign.show(want.key, want.words);
  };

  /** The keys read the save once it is in; before, only their caps and icons show (#373). */
  const renderRail = (): void => {
    if (!ctx.view().ready) {
      rail.render(undefined);
      return;
    }
    const views = keyViews(ctx.view().mountain, now(), ctx.view().trouble);
    // The New sign is quiet for readers: its words join its key's label.
    const up = sign.shown();
    rail.render(
      up === undefined
        ? views
        : {
            ...views,
            [up.key]: {
              ...views[up.key],
              aria: `${views[up.key].aria}. ${up.words}`,
            },
          },
    );
  };

  return {
    sign,
    /** The panels painted first, so a card opened in this paint holds the sign back. */
    paint: () => {
      renderTeach();
      coverDrawers();
      coverNote();
      // Locks, lit caps, red dot lamps and timers, by the key rail's rules (#373),
      // with the New sign's words on its key's label.
      renderRail();
    },
    putSignAway,
    boardCovered: () => cover().putAway,
    listen: () => {
      // Any tap or Escape puts the New sign away (#373).
      document.addEventListener("pointerdown", putSignAway, listening);
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") {
            putSignAway();
          }
        },
        listening,
      );
    },
  };
}
