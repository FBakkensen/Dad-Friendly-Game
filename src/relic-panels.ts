import { createBoardSheet, type BoardSheet } from "./board-drawer";
import type { BoardHost } from "./board-host";
import type { CloseBy, Pointer } from "./board-interaction";
import { RELIC_DARK, RELIC_LIT } from "./board-relics";
import { createBoardRow, rowsOnBoard, type BoardRow } from "./board-row";
import {
  SHELF_BACK,
  createDetailPage,
  createLegendPage,
  createRevealPage,
} from "./relic-pages";
import {
  legendStats,
  relicsKick,
  shelfKeepsakes,
  shelfRowView,
} from "./relic-rows";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { RELICS, hasRelic, type Relic } from "./relics";

/*
 * The relics drawer (#465): the relic shelf, a found relic's detail with its keepsakes, the
 * reveal of a relic just found and the Legend finale, in one board drawer with no key of its
 * own. The shelf opens from the Relic shelf key in a socket's note; the reveal and the Legend
 * open the drawer themselves once no card that opens itself is up. Any close of the reveal by
 * the player carries the relic, as its plate does; a program close (a card came up over it)
 * does not, so it comes back once the card goes. The rows and words come from relic-rows.ts and
 * the pages from relic-pages.ts.
 */

export const RELICS_TITLE = "Relics of Fatherhood";

/** What the drawer shows in its list's place: the shelf itself, or one of its pages. */
type Screen =
  | { readonly kind: "shelf" }
  | { readonly kind: "detail"; readonly relic: Relic }
  | { readonly kind: "reveal"; readonly relic: Relic }
  | { readonly kind: "legend" };

const SHELF: Screen = { kind: "shelf" };

/** The six shelf rows, in the relics' order: each a button, its relic's art at 24 art px. */
function buildShelf(sheet: BoardSheet): readonly BoardRow[] {
  const rows = RELICS.map((relic) =>
    createBoardRow({
      tag: "button",
      className: "relic-row",
      data: { relic: relic.id },
      name: relic.name,
      icon: true,
      iconPx: 48,
    }),
  );
  sheet.place(rows.map((row) => row.root));
  return rows;
}

/** What the relics drawer is built from. */
interface RelicPanelDeps {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  /** The board's tap rules, shared by every drawer and the board. */
  board: BoardHost;
  /** The save drawer is open over the board: its Escape is its own. */
  overSave: () => boolean;
  /** A card that opens itself is up: the reveal and the Legend wait for it. */
  cardUp: () => boolean;
  /** Puts the board's popups and every other drawer away before this one opens. */
  beforeOpen: () => void;
  /** Today's Pass the mine card, offered from the Legend. */
  legacy: { open(from: HTMLElement | undefined): void };
  signal?: AbortSignal | undefined;
}

/**
 * The relics drawer. `open(from)` shows the shelf, and a close gives focus back to `from`;
 * `render` paints the rows and opens the reveal or the Legend when they are due.
 */
export function createRelicPanels(deps: RelicPanelDeps): {
  sheet: BoardSheet;
  open(from?: HTMLElement): void;
  render(): void;
} {
  const { progress, getView, board } = deps;
  let screen: Screen = SHELF;
  /** The Legend is due: the Mantle's reveal was carried, and it has not been closed. */
  let legendDue = false;

  const onBoard = rowsOnBoard(board, "relics");
  const show = (next: Screen, page: HTMLElement | undefined): void => {
    screen = next;
    sheet.showPage(page);
  };
  const detail = createDetailPage({
    board,
    onBack: () => {
      show(SHELF, undefined);
    },
  });
  const showLegend = (): void => {
    legend.paint(legendStats(getView().mountain));
    show({ kind: "legend" }, legend.root);
  };
  /** Carries the relic: the Mantle's leads to the Legend, any other shuts a still open drawer. */
  const carry = (by: Pointer | "tap-through", stillOpen: boolean): void => {
    legendDue ||= getView().revealed?.id === "mantle";
    if (stillOpen && legendDue) {
      showLegend();
    } else if (stillOpen) {
      screen = SHELF;
      sheet.close({ by });
    }
    progress.dismissReveal();
  };
  const reveal = createRevealPage({
    board,
    onCarry: (by) => {
      carry(by, true);
    },
  });
  /** The Legend's plates: either way it is done for this run. */
  const leaveLegend = (by: Pointer, restoreFocus: boolean): void => {
    legendDue = false;
    screen = SHELF;
    sheet.close({ restoreFocus, by });
  };
  const legend = createLegendPage({
    board,
    onStand: (by) => {
      leaveLegend(by, true);
    },
    onPass: (by) => {
      leaveLegend(by, false);
      deps.legacy.open(undefined);
    },
  });

  /** A player's close of the reveal carries it, and of the Legend ends it; a program's waits. */
  const closed = (by: CloseBy): void => {
    const was = screen;
    screen = SHELF;
    if (by === "program") {
      return;
    }
    if (was.kind === "reveal") {
      carry(by, false);
    } else if (was.kind === "legend") {
      legendDue = false;
    }
  };

  const sheet: BoardSheet = createBoardSheet({
    name: "relics",
    title: RELICS_TITLE,
    infoLabel: "Relics",
    how: { systems: ["relics"], backLabel: SHELF_BACK },
    board,
    overSave: deps.overSave,
    onClose: closed,
    onForget: () => {
      onBoard.forget();
      detail.forget();
      reveal.forget();
      legend.forget();
    },
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  const rows = buildShelf(sheet);
  wireShelf(rows, onBoard, {
    found: (relic) => hasRelic(getView().mountain, relic.id),
    showDetail: (relic) => {
      detail.paint(relic, shelfKeepsakes(getView().mountain));
      show({ kind: "detail", relic }, detail.root);
    },
  });

  /** Opens the drawer, the board's popups and the other drawers put away first. */
  const openDrawer = (from?: HTMLElement): void => {
    if (!sheet.isOpen()) {
      deps.beforeOpen();
      sheet.open(from);
    }
  };

  /** The reveal, then the Legend, open themselves once the save is in and no card is up. */
  const openDue = (view: ProgressSnapshot): void => {
    if (!view.ready || deps.cardUp()) {
      return;
    }
    const found = view.away === undefined ? view.revealed : undefined;
    if (found !== undefined) {
      if (screen.kind !== "reveal" || screen.relic.id !== found.id) {
        openDrawer();
        reveal.paint(found);
        show({ kind: "reveal", relic: found }, reveal.root);
      }
      return;
    }
    if (legendDue && view.revealed === undefined && screen.kind !== "legend") {
      openDrawer();
      showLegend();
      return;
    }
    // Carried somewhere else (another tab): the reveal goes with it.
    if (screen.kind === "reveal") {
      screen = SHELF;
      sheet.close({ restoreFocus: false, by: "program" });
    }
  };

  const render = (): void => {
    const view = getView();
    paintShelf(rows, onBoard, view);
    sheet.kick(view.ready ? relicsKick(view.mountain) : "");
    if (screen.kind === "detail") {
      detail.paint(screen.relic, shelfKeepsakes(view.mountain));
    }
    openDue(view);
  };

  return {
    sheet,
    open: (from) => {
      if (sheet.isOpen()) {
        show(SHELF, undefined);
      }
      screen = SHELF;
      openDrawer(from);
      render();
    },
    render,
  };
}

/** Each shelf row's tap: a found relic opens its detail; one not found yet blinks. */
function wireShelf(
  rows: readonly BoardRow[],
  onBoard: ReturnType<typeof rowsOnBoard>,
  on: {
    found(relic: Relic): boolean;
    showDetail(relic: Relic): void;
  },
): void {
  for (const [index, row] of rows.entries()) {
    const relic = RELICS[index];
    if (relic === undefined || !(row.root instanceof HTMLButtonElement)) {
      continue;
    }
    onBoard.tap(row.root, (press, event) => {
      if (onBoard.press(relic.id, press, event, "act") !== "act") {
        return;
      }
      if (!on.found(relic)) {
        onBoard.result(relic.id, "refused");
        return;
      }
      on.showDetail(relic);
    });
  }
}

/** The rows from a ready save, lit once found and dark until then; dark and blank before. */
function paintShelf(
  rows: readonly BoardRow[],
  onBoard: ReturnType<typeof rowsOnBoard>,
  view: ProgressSnapshot,
): void {
  for (const [index, row] of rows.entries()) {
    const relic = RELICS[index];
    if (relic === undefined) {
      continue;
    }
    if (!view.ready) {
      onBoard.paint(relic.id, row, undefined);
      row.setIcon(RELIC_DARK[relic.id]);
      continue;
    }
    const found = hasRelic(view.mountain, relic.id);
    onBoard.paint(relic.id, row, shelfRowView(view.mountain, relic));
    row.setIcon((found ? RELIC_LIT : RELIC_DARK)[relic.id]);
  }
}
