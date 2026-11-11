import { createKeyRail, type KeyRail } from "./board-keys";
import type { KeyId } from "./key-rail";
import type { ScreenCtx } from "./screen-context";
import type { BoardSheet } from "./board-drawer";

/**
 * The key rail: Buys, Workshop, Upgrades and the Ledger open their drawers from here; Engineers
 * opens through its panel's own click listener. Every key first puts the board's popups away.
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

/** A drawer a rail key opens: its panel's open, and its shell. */
interface KeyDrawer {
  open(from?: HTMLElement): void;
  readonly sheet: BoardSheet;
}

/** The drawers the rail's keys open, by key. Engineers opens through its own panel until B6b. */
type KeyDrawers = Readonly<
  Record<"buys" | "upgrades" | "workshop" | "ledger", KeyDrawer>
>;

/**
 * What the keys do: Buys, Workshop, Upgrades and the Ledger open their drawers from the rail,
 * and each first closes every other drawer in the record, so one drawer is up at a time.
 */
export function wireKeys(deps: {
  readonly drawers: KeyDrawers;
  readonly closeBoardPopups: () => void;
  readonly putSignAway: () => void;
}): {
  onKey(id: KeyId, key: HTMLButtonElement): void;
  openBuys(from?: HTMLElement): void;
} {
  const { drawers, closeBoardPopups, putSignAway } = deps;
  const program = { restoreFocus: false, by: "program" } as const;
  /** Closes every drawer but `id`'s, then opens it. Only an opening starts the settle. */
  const openOnly = (id: keyof KeyDrawers, from?: HTMLElement): void => {
    for (const [each, drawer] of Object.entries(drawers)) {
      if (each !== id) {
        drawer.sheet.close(program);
      }
    }
    drawers[id].open(from);
  };
  /**
   * Opens the Buys drawer: the Buys key, a bay and Saving for (#372, #373). A tap on an open
   * drawer's door does not start the settle again.
   */
  const openBuys = (from?: HTMLElement): void => {
    closeBoardPopups();
    openOnly("buys", from);
  };

  return {
    onKey: (id, key) => {
      closeBoardPopups();
      // A key pressed from the keyboard puts the New sign away too.
      putSignAway();
      if (id === "engineers") {
        // Its panel listens to its key itself until B6b.
        return;
      }
      openOnly(id, key);
    },
    openBuys,
  };
}
