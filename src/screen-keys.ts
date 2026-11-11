import { createKeyRail, type KeyRail } from "./board-keys";
import type { KeyId } from "./key-rail";
import type { ScreenCtx } from "./screen-context";
import type { createCrewPanel } from "./crew-panel";
import type { createUpgradesPanel } from "./upgrades-panel";
import type { BoardSheet } from "./board-drawer";

/**
 * The key rail: Buys, Workshop and Upgrades open their drawers from here; Engineers and the
 * Ledger key open through their panels' own click listeners. Every key first puts the board's popups away.
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
 * What the keys do: Buys, Workshop and Upgrades open their drawers from the rail, and each
 * closes the other two, so one drawer is up at a time.
 */
export function wireKeys(deps: {
  readonly crewPanel: ReturnType<typeof createCrewPanel>;
  readonly upgrades: ReturnType<typeof createUpgradesPanel>;
  readonly workshop: {
    open(from?: HTMLElement): void;
    readonly sheet: BoardSheet;
  };
  readonly closeBoardPopups: () => void;
  readonly putSignAway: () => void;
}): {
  onKey(id: KeyId, key: HTMLButtonElement): void;
  openBuys(from?: HTMLElement): void;
} {
  const { crewPanel, upgrades, workshop, closeBoardPopups, putSignAway } = deps;
  const program = { restoreFocus: false, by: "program" } as const;
  /**
   * Opens the Buys drawer: the Buys key, a bay and Saving for (#372, #373). Only an opening starts
   * the settle: a tap on an open drawer's door does not.
   */
  const openBuys = (from?: HTMLElement): void => {
    closeBoardPopups();
    upgrades.sheet.close(program);
    workshop.sheet.close(program);
    crewPanel.open(from);
  };

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
          crewPanel.sheet.close(program);
          upgrades.sheet.close(program);
          workshop.open(key);
          return;
        case "upgrades":
          crewPanel.sheet.close(program);
          workshop.sheet.close(program);
          upgrades.open(key);
          return;
        case "engineers":
        case "ledger":
          return;
      }
    },
    openBuys,
  };
}
