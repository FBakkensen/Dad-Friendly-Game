import { createKeyRail, type KeyRail } from "./board-keys";
import type { KeyId } from "./key-rail";
import type { ScreenCtx } from "./screen-context";
import type { BoardSheet } from "./board-drawer";

/**
 * The key rail: Buys, Workshop, Upgrades, Engineers and the Ledger open their drawers from
 * here. Every key first puts the board's popups away.
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

/**
 * The drawers one at a time: the five the rail's keys open, and the relics drawer, which the
 * relic plate and a reveal open (#465).
 */
type KeyDrawers = Readonly<
  Record<
    "buys" | "upgrades" | "workshop" | "engineers" | "ledger" | "relics",
    KeyDrawer
  >
>;

/**
 * What the keys do: Buys, Workshop, Upgrades, Engineers and the Ledger open their drawers from
 * the rail,
 * and each first closes every other drawer in the record, so one drawer is up at a time.
 */
export function wireKeys(deps: {
  readonly drawers: KeyDrawers;
  readonly closeBoardPopups: () => void;
  readonly putSignAway: () => void;
}): {
  onKey(id: KeyId, key: HTMLButtonElement): void;
  openBuys(from?: HTMLElement): void;
  /** Shuts every drawer but `id`'s: the relics drawer opens itself (#465). */
  closeOthers(id: keyof KeyDrawers): void;
} {
  const { drawers, closeBoardPopups, putSignAway } = deps;
  const program = { restoreFocus: false, by: "program" } as const;
  const closeOthers = (id: keyof KeyDrawers): void => {
    for (const [each, drawer] of Object.entries(drawers)) {
      if (each !== id) {
        drawer.sheet.close(program);
      }
    }
  };
  /** Closes every drawer but `id`'s, then opens it. Only an opening starts the settle. */
  const openOnly = (id: keyof KeyDrawers, from?: HTMLElement): void => {
    closeOthers(id);
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
      openOnly(id, key);
    },
    openBuys,
    closeOthers,
  };
}
