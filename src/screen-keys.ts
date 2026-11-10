import { createKeyRail, type KeyRail } from "./board-keys";
import type { KeyId } from "./key-rail";
import type { ScreenCtx } from "./screen-context";
import type { createCrewPanel } from "./crew-panel";
import type { createUpgradesPanel } from "./upgrades-panel";
import { workshopUnlocked } from "./workshop";

/**
 * The key rail: Buys, Workshop and Upgrades open from here; Engineers and the Ledger key open
 * through their panels' own click listeners. Every key first puts the board's popups away.
 * `onKey` is late: what the keys do is wired once the drawers exist.
 */
export function createRail(
  ctx: ScreenCtx,
  onKey: (id: KeyId, key: HTMLButtonElement) => void,
): KeyRail {
  const { board } = ctx;
  return createKeyRail({
    board,
    onKey: (id, key) => {
      onKey(id, key);
    },
  });
}

/**
 * What the keys do: Buys, Workshop and Upgrades open from the rail, and the Workshop sheet
 * remembers the door it opened from. The Workshop button's click listener is registered here.
 */
export function wireKeys(
  ctx: ScreenCtx,
  deps: {
    readonly rail: KeyRail;
    readonly crewPanel: ReturnType<typeof createCrewPanel>;
    readonly upgrades: ReturnType<typeof createUpgradesPanel>;
    readonly workshop: { readonly openButton: HTMLButtonElement };
    readonly closeBoardPopups: () => void;
    readonly putSignAway: () => void;
  },
): {
  onKey(id: KeyId, key: HTMLButtonElement): void;
  openBuys(from?: HTMLElement): void;
  workshopClosed(): void;
} {
  const { dispatch } = ctx;
  const { rail, crewPanel, upgrades, closeBoardPopups, putSignAway } = deps;
  /**
   * Opens the Buys drawer: the Buys key, a bay and Saving for (#372, #373). Only an opening starts
   * the settle: a tap on an open drawer's door does not.
   */
  const openBuys = (from?: HTMLElement): void => {
    closeBoardPopups();
    upgrades.sheet.close({ restoreFocus: false, by: "program" });
    crewPanel.open(from);
  };

  const openWorkshop = deps.workshop.openButton;
  /** The id of the key `workshopDoor` is, so the rail can say whether it is locked. */
  let doorKey: KeyId = "workshop";
  /** The key the Workshop sheet opened from: its own, or the Ledger key that opened the menu. */
  let workshopDoor: HTMLButtonElement = rail.keys.workshop;
  let openingFromKey = false;
  // Opening the sheet by any door counts as seen: the sign goes, the dot stays.
  const openWorkshopSheet = (): void => {
    if (ctx.view().ready && workshopUnlocked(ctx.view().mountain)) {
      dispatch({ kind: "markSeen", id: "workshop" });
      workshopDoor = rail.keys.workshop;
      doorKey = "workshop";
      openingFromKey = true;
      try {
        openWorkshop.click();
      } finally {
        openingFromKey = false;
      }
    }
  };
  // The menu's own Workshop row also puts the board's popups away.
  openWorkshop.addEventListener("click", () => {
    closeBoardPopups();
    if (!openingFromKey) {
      workshopDoor = rail.keys.ledger;
      doorKey = "ledger";
    }
  });

  return {
    onKey: (id, key) => {
      closeBoardPopups();
      // A key pressed from the keyboard puts the New sign away too.
      putSignAway();
      switch (id) {
        case "buys":
          openBuys(key);
          return;
        case "workshop":
          openWorkshopSheet();
          return;
        case "upgrades":
          crewPanel.sheet.close({ restoreFocus: false, by: "program" });
          upgrades.open(key);
          return;
        case "engineers":
        case "ledger":
          return;
      }
    },
    openBuys,
    // Back to the door it opened from; the Ledger key while a re-load holds the Workshop's.
    workshopClosed: () => {
      (rail.locked(doorKey) ? rail.keys.ledger : workshopDoor).focus();
    },
  };
}
