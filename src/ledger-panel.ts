import stoneUrl from "./assets/board/res-stone.png";
import type { AuthController, AuthState } from "./auth";
import { hide, legend, setAttr } from "./board-dom";
import { createBoardSheet, type BoardSheet } from "./board-drawer";
import type { BoardHost } from "./board-host";
import type { Pointer } from "./board-interaction";
import { RELIC_DARK, RELIC_LIT } from "./board-relics";
import {
  createBoardRow,
  paintRowBar,
  rowBar,
  rowsOnBoard,
  type BoardRow,
  type RowsOnBoard,
} from "./board-row";
import { formatFieldLog } from "./field-log";
import {
  createFieldLogPage,
  createLedgerDoors,
  createStartOverPage,
  createTonightBox,
  writeClipboard,
  type LedgerDoors,
} from "./ledger-parts";
import {
  accountRowView,
  relicsRowView,
  stonesRowView,
  tonightLines,
} from "./ledger-rows";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  ACCOUNT,
  LEDGER_BACK,
  LEDGER_KICK,
  MINE_LEGEND,
  TONIGHT_LEGEND,
} from "./screen-words";

/*
 * The Ledger drawer (#375): Tonight's newest lines, the mine (stones left with the materials
 * met, then the relics with the goal, the next layer's hint and the guide bar), the account
 * row, and four plates: Saved copies, Copy field log, Start over and Pass the mine. Start over
 * asks on a page of the drawer, and where the browser refuses the clipboard the field log
 * shows on one. Its rows and lines come from ledger-rows.ts and its own controls from
 * ledger-parts.ts. Every press goes through the board's model, so the settle, the hold and the
 * blink are the board's. Nothing here saves: Start over, signing in and out, Saved copies and
 * Pass the mine are today's calls.
 */

/** The Ledger's parts, built once and placed in the list in this order. */
interface LedgerParts {
  readonly tonightSec: HTMLElement;
  readonly tonight: ReturnType<typeof createTonightBox>;
  readonly mineSec: HTMLElement;
  readonly stones: BoardRow;
  readonly relics: BoardRow;
  readonly bar: ReturnType<typeof rowBar>;
  readonly account: BoardRow;
  readonly doors: LedgerDoors;
}

/** The Ledger's rows: the stones row and the relics row take no tap; the account row does. */
function buildLedgerRows(): Pick<
  LedgerParts,
  "stones" | "relics" | "bar" | "account"
> {
  const stones = createBoardRow({
    tag: "div",
    className: "ledger-stones",
    data: { ledger: "stones" },
    name: "",
    icon: true,
    iconPx: 32,
  });
  stones.setIcon(stoneUrl);
  const relics = createBoardRow({
    tag: "div",
    className: "ledger-relics",
    data: { ledger: "relics" },
    name: "",
    icon: true,
    iconPx: 48,
  });
  const bar = rowBar();
  relics.root.append(bar.bar);
  const account = createBoardRow({
    tag: "button",
    className: "ledger-account",
    data: { ledger: "account" },
    name: ACCOUNT,
    icon: false,
  });
  // Signing in and out is told as it lands.
  account.root
    .querySelector(".board-row-info")
    ?.setAttribute("aria-live", "polite");
  return { stones, relics, bar, account };
}

/** Puts every part in the list, in its order: Tonight, the mine, the account and the doors. */
function buildLedgerList(sheet: BoardSheet, doors: LedgerDoors): LedgerParts {
  const parts: LedgerParts = {
    tonightSec: legend(TONIGHT_LEGEND, "tonight"),
    tonight: createTonightBox(),
    mineSec: legend(MINE_LEGEND, "mine"),
    ...buildLedgerRows(),
    doors,
  };
  // Tonight shows once it has a line.
  hide(parts.tonightSec, true);
  hide(parts.tonight.root, true);
  sheet.place([
    parts.tonightSec,
    parts.tonight.root,
    parts.mineSec,
    parts.stones.root,
    parts.relics.root,
    parts.account.root,
    doors.root,
  ]);
  return parts;
}

/** The stones and relics rows from a ready save. */
function paintReady(
  parts: LedgerParts,
  onBoard: RowsOnBoard,
  view: ProgressSnapshot,
): void {
  const stones = stonesRowView(view.mountain);
  onBoard.paint("stones", parts.stones, stones);
  setAttr(parts.stones.root, "title", stones.title);
  const relics = relicsRowView(view.mountain);
  onBoard.paint("relics", parts.relics, relics);
  parts.relics.setIcon((relics.lit ? RELIC_LIT : RELIC_DARK)[relics.icon]);
  paintRowBar(parts.bar.bar, parts.bar.fill, relics.progress, relics.barLabel);
}

/** Until the save is in, the stones and relics rows go dark and blank, with no bar. */
function paintLoading(parts: LedgerParts, onBoard: RowsOnBoard): void {
  onBoard.paint("stones", parts.stones, undefined);
  setAttr(parts.stones.root, "title", undefined);
  onBoard.paint("relics", parts.relics, undefined);
  paintRowBar(parts.bar.bar, parts.bar.fill, undefined, "");
}

/**
 * The account row's tap: signed out signs in, signed in signs out. While signing in a tap does
 * nothing, and does not blink.
 */
function wireAccount(
  onBoard: RowsOnBoard,
  account: BoardRow,
  auth: AuthController,
): void {
  onBoard.tap(account.root as HTMLButtonElement, (press, event) => {
    const state = auth.getState();
    if (state.kind === "signing-in") {
      return;
    }
    if (onBoard.press("account", press, event, "act") !== "act") {
      return;
    }
    if (state.kind === "signed-out") {
      void auth.signIn();
      return;
    }
    void auth.signOut();
  });
}

/** Whose save it is: the signed-in account, or none. */
function accountOf(state: AuthState): string | undefined {
  return state.kind === "signed-in" ? state.user.uid : undefined;
}

/** What the plates and the two pages lead to. */
interface LedgerDoorDeps {
  readonly board: BoardHost;
  readonly progress: ProgressStore;
  readonly sheet: () => BoardSheet;
  readonly door: HTMLButtonElement;
  readonly legacy: { open(from: HTMLElement | undefined): void };
  readonly savedCopies: { open(from?: HTMLElement): void };
  readonly onStartOver: () => void;
}

/** The two pages and the four plates, each wired to where it leads. */
function wireDoors(deps: LedgerDoorDeps): {
  readonly doors: LedgerDoors;
  readonly startOverPage: ReturnType<typeof createStartOverPage>;
} {
  const { board, progress, sheet, door } = deps;
  /** A card takes over from the drawer: it shuts without moving focus. */
  const handOff = (): void => {
    sheet().close({ restoreFocus: false, by: "program" });
  };
  const fieldLogPage = createFieldLogPage();
  const startOverPage = createStartOverPage({
    board,
    onKeep: () => {
      sheet().showPage(undefined);
    },
    onYes: (_from, by: Pointer) => {
      progress.startOver();
      deps.onStartOver();
      // Back on the Ledger key, as Back would leave it.
      sheet().close({ by });
    },
  });
  const doors = createLedgerDoors({
    board,
    on: {
      savedCopies: () => {
        handOff();
        // The card's Back to the mountain gives focus back to the Ledger key.
        deps.savedCopies.open(door);
      },
      fieldLog: () => {
        const text = formatFieldLog(progress.fieldLog());
        void writeClipboard(text).then((copied) => {
          // The drawer shut while the browser answered: nothing shows in a shut drawer.
          if (!sheet().isOpen()) {
            return;
          }
          if (copied) {
            doors.copied();
            return;
          }
          fieldLogPage.show(text);
          sheet().showPage(fieldLogPage.root);
        });
      },
      startOver: () => {
        sheet().showPage(startOverPage.root);
      },
      pass: () => {
        handOff();
        // The card's Not yet gives focus back to the Ledger key.
        deps.legacy.open(door);
      },
    },
  });
  return { doors, startOverPage };
}

/**
 * The Ledger drawer, behind the Ledger key. `render` paints the rows from the save and the
 * account; Tonight reads the field log only while the drawer is open. A save that loads
 * under the open drawer (another account's) leaves it open, its mine rows dark and its Copy
 * field log, Start over and Yes disabled. The account row stays live.
 */
export function createLedgerPanel({
  progress,
  getView,
  auth,
  board,
  overSave,
  door,
  legacy,
  savedCopies,
  onStartOver,
  signal,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  auth: AuthController;
  /** The board's tap rules, shared by every drawer and the board. */
  board: BoardHost;
  /** The save drawer is open over the board: its Escape is its own. */
  overSave: () => boolean;
  /** The Ledger key on the rail: the shell writes its aria-expanded. */
  door: HTMLButtonElement;
  /** Pass the mine: offered on a finished mountain, and today's card. */
  legacy: { offered(): boolean; open(from: HTMLElement | undefined): void };
  /** Today's Saved copies card. */
  savedCopies: { open(from?: HTMLElement): void };
  /** After a Start over (the screen resets its vein wait). */
  onStartOver: () => void;
  /** Stops the drawer watching the account, and its document listeners. */
  signal?: AbortSignal | undefined;
}): {
  sheet: BoardSheet;
  render(): void;
  open(from?: HTMLElement): void;
} {
  const onBoard = rowsOnBoard(board, "ledger");
  const wired = wireDoors({
    board,
    progress,
    sheet: () => sheet,
    door,
    legacy,
    savedCopies,
    onStartOver,
  });
  const sheet = createBoardSheet({
    name: "ledger",
    title: "Ledger",
    infoLabel: "Tonight and the mine",
    how: { systems: ["away", "relics"], backLabel: LEDGER_BACK },
    board,
    overSave,
    door,
    onForget: () => {
      onBoard.forget();
      wired.doors.forget();
      wired.startOverPage.forget();
    },
    ...(signal === undefined ? {} : { signal }),
  });
  sheet.kick(LEDGER_KICK);
  const parts = buildLedgerList(sheet, wired.doors);
  wireAccount(onBoard, parts.account, auth);

  const paintTonight = (): void => {
    if (!sheet.isOpen()) {
      return;
    }
    const lines = tonightLines(progress.tonightEvents());
    parts.tonight.paint(lines);
    const empty = lines.length === 0;
    if (parts.tonight.root.hidden !== empty) {
      hide(parts.tonightSec, empty);
      hide(parts.tonight.root, empty);
      // The spare plate under the list grows or shrinks with Tonight.
      sheet.fitSpare();
    }
  };

  /** Whose save the Start over page asked about. */
  let asked = accountOf(auth.getState());
  /**
   * Another account's save puts the list back: the Start over page asked about another save.
   * The same account reported again changes nothing (#481).
   */
  const leaveStaleAsk = (): void => {
    const now = accountOf(auth.getState());
    const stale = now !== asked;
    asked = now;
    if (stale && wired.startOverPage.root.parentElement !== null) {
      sheet.showPage(undefined);
    }
  };

  const render = (): void => {
    const view = getView();
    leaveStaleAsk();
    if (view.ready) {
      paintReady(parts, onBoard, view);
    } else {
      paintLoading(parts, onBoard);
    }
    onBoard.paint("account", parts.account, accountRowView(auth.getState()));
    wired.doors.paint({ ready: view.ready, passOffered: legacy.offered() });
    wired.startOverPage.paint(view.ready);
    paintTonight();
  };

  const unwatchAuth = auth.subscribe(() => {
    render();
  });
  signal?.addEventListener("abort", unwatchAuth);

  const open = (from?: HTMLElement): void => {
    sheet.open(from);
    render();
  };

  return { sheet, render, open };
}
