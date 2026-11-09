import { oneOffStretch, stretch } from "./scale";
import { el, hide, legend, mark } from "./board-dom";
import { createBoardSheet, type BoardSheet } from "./board-drawer";
import type { BoardHost } from "./board-host";
import {
  createBoardRow,
  rowsOnBoard,
  type BoardRow,
  type RowsOnBoard,
} from "./board-row";
import { howItWorks } from "./how-it-works";
import { BOOSTS, boostLeft, type Boost, type BoostId } from "./boosts";
import type { Move } from "./economy/actions";
import { shortEffectName, writeChip } from "./effect-row";
import type { Mountain } from "./mountain";
import type {
  Dispatch,
  ProgressSnapshot,
  ProgressStore,
} from "./progress-store";
import type { RowView } from "./row-view";
import { LOST_TOOLS, type LostToolId } from "./lost-tools";
import {
  BROUGHT_HOME,
  UPGRADES_INTRO,
  UPGRADES_MORE,
  lostToolWords,
} from "./screen-words";
import { setHowSteps } from "./teach-ui";
import {
  boostRowView,
  newRowId,
  toolRowView,
  upgradeRowView,
} from "./upgrade-rows";
import {
  anyHiddenRow,
  boostRowId,
  shownRows,
  upgradeRowId,
  type RevealRowId,
} from "./upgrade-reveal";
import { UPGRADES, type Upgrade } from "./upgrades";

/*
 * The Upgrades drawer (#373): Quick boosts, Lasting upgrades and Brought home as board rows,
 * the "i" cards for upgrades and boosts, and the spare plate under a short list. It also keeps
 * the running-boost chips in Running now current. Its rows and words come from upgrade-rows.ts;
 * every buy is a move through the screen's dispatch, then marks seen the rows shown before it.
 */

/** The kick under the title when no row is new. */
const UPGRADES_KICK = "Boosts for tonight, gear for good";

interface BoostRow {
  readonly boost: Boost;
  readonly id: RevealRowId;
  readonly row: BoardRow;
}

interface UpgradeRow {
  readonly upgrade: Upgrade;
  readonly id: RevealRowId;
  readonly row: BoardRow;
}

interface ToolRow {
  readonly id: LostToolId;
  readonly row: BoardRow;
}

/** What a buy row's tap reads and moves. */
interface BuyTaps {
  readonly progress: ProgressStore;
  readonly dispatch: Dispatch;
  /** The game's clock: prices and timers. */
  readonly now: () => number;
  readonly onBoard: RowsOnBoard;
}

/**
 * A buy row's tap. A second sleepy tap inside the Done hold, or the tap that opened the
 * drawer, does nothing. The store is read again at the tap: a pocket that fell under the
 * price since the last paint blinks and buys nothing.
 */
function wireBuy(
  { progress, dispatch, now, onBoard }: BuyTaps,
  id: RevealRowId,
  row: BoardRow,
  viewOf: (mountain: Mountain, at: number) => RowView,
  move: Extract<Move, { kind: "buyUpgrade" | "buyBoost" }>,
): void {
  const root = row.root;
  if (!(root instanceof HTMLButtonElement)) {
    return;
  }
  onBoard.tap(root, (press, event) => {
    const snapshot = progress.getSnapshot();
    if (!snapshot.ready || onBoard.press(id, press, event, "act") !== "act") {
      return;
    }
    if (!viewOf(snapshot.mountain, now()).can) {
      onBoard.result(id, "refused");
      return;
    }
    // The rows he had in front of him when he tapped are seen, whatever the buy shows next.
    const shown = shownRows(snapshot.mountain);
    const bought = dispatch(move).kind === "applied";
    dispatch({ kind: "markAllSeen", ids: shown });
    if (bought) {
      onBoard.result(id, "applied");
    }
  });
}

/**
 * The Upgrades drawer. `open` marks every shown row seen, then opens the drawer; the opener
 * (the Upgrades key on the rail) owns its lit cap and dot.
 */
export function createUpgradesPanel({
  progress,
  dispatch,
  getView,
  now,
  chipFor,
  board,
  overSave,
  door,
  signal,
}: {
  progress: ProgressStore;
  dispatch: Dispatch;
  getView: () => ProgressSnapshot;
  /** The game's clock: prices, timers and the New row. */
  now: () => number;
  /** Countdown chips in Running now, one per boost. */
  chipFor: ReadonlyMap<BoostId, HTMLElement>;
  /** The board's tap rules, shared by every drawer and the board. */
  board: BoardHost;
  /** The save drawer is open over the board: its Escape is its own. */
  overSave: () => boolean;
  /** The drawer's key on the rail: the shell writes its aria-expanded (#373). */
  door?: HTMLElement;
  /** Aborting it removes the drawer's document listeners. */
  signal?: AbortSignal;
}): {
  sheet: BoardSheet;
  render: () => void;
  open: (from?: HTMLElement) => void;
} {
  const onBoard = rowsOnBoard(board, "upgrades");
  const sheet = createBoardSheet({
    name: "upgrades",
    title: "Upgrades",
    infoLabel: "Upgrades and boosts",
    how: {
      systems: ["upgrades", "boosts"],
      backLabel: "Back to Upgrades",
    },
    board,
    overSave,
    onForget: () => {
      onBoard.forget();
    },
    ...(door === undefined ? {} : { door }),
    ...(signal === undefined ? {} : { signal }),
  });
  sheet.kick(UPGRADES_KICK);

  let howPriced = "1:1";

  const taps: BuyTaps = { progress, dispatch, now, onBoard };

  const boostRows: readonly BoostRow[] = BOOSTS.map((boost) => {
    const row = createBoardRow({
      tag: "button",
      className: "upgrade boost",
      data: { boost: boost.id },
      name: boost.name,
      icon: false,
    });
    const id = boostRowId(boost);
    wireBuy(
      taps,
      id,
      row,
      (mountain, at) => boostRowView(mountain, at, boost, false),
      {
        kind: "buyBoost",
        id: boost.id,
      },
    );
    return { boost, id, row };
  });

  const upgradeRows: readonly UpgradeRow[] = UPGRADES.map((upgrade) => {
    const row = createBoardRow({
      tag: "button",
      className: "upgrade",
      data: { upgrade: upgrade.id },
      name: upgrade.name,
      icon: false,
    });
    const id = upgradeRowId(upgrade);
    wireBuy(
      taps,
      id,
      row,
      (mountain, at) => upgradeRowView(mountain, at, upgrade, false),
      { kind: "buyUpgrade", id: upgrade.id },
    );
    return { upgrade, id, row };
  });

  const toolRows: readonly ToolRow[] = LOST_TOOLS.map((id) => {
    const row = createBoardRow({
      tag: "div",
      className: "found-tool",
      data: { tool: id },
      name: lostToolWords(id).name,
      icon: false,
    });
    return { id, row };
  });

  const boostSec = legend("Quick boosts", "boosts");
  const lastingSec = legend("Lasting upgrades", "lasting");
  const foundSec = legend(BROUGHT_HOME, "found");
  const foot = el("p", "board-sheet-foot", UPGRADES_MORE);
  // Until the save is in, nothing from it shows: no row, legend or footnote.
  for (const part of [
    boostSec,
    lastingSec,
    foundSec,
    foot,
    ...boostRows.map(({ row }) => row.root),
    ...upgradeRows.map(({ row }) => row.root),
    ...toolRows.map(({ row }) => row.root),
  ]) {
    part.hidden = true;
  }

  /** The New row the list was last ordered for; null before the first order. */
  let orderedFor: RevealRowId | undefined | null = null;
  /**
   * Today's order: the New row first in its section, and its section first. Only while the
   * drawer is shut, and as it opens.
   */
  const order = (newId: RevealRowId | undefined): void => {
    if (newId === orderedFor) {
      return;
    }
    orderedFor = newId;
    const lead = (
      rows: readonly { readonly id: RevealRowId; readonly row: BoardRow }[],
    ): HTMLElement[] => {
      const fresh = rows.find((item) => item.id === newId);
      return [
        ...(fresh === undefined ? [] : [fresh.row.root]),
        ...rows.filter((item) => item !== fresh).map((item) => item.row.root),
      ];
    };
    const boosts = [boostSec, ...lead(boostRows)];
    const lasting = [lastingSec, ...lead(upgradeRows)];
    const upgradeLeads = upgradeRows.some((item) => item.id === newId);
    const parts = [
      ...(upgradeLeads ? [...lasting, ...boosts] : [...boosts, ...lasting]),
      foundSec,
      ...toolRows.map(({ row }) => row.root),
      foot,
    ];
    sheet.place(parts);
  };
  order(undefined);

  /** The boost chips in Running now: as today, from the save whatever its state. */
  const renderChips = (current: Mountain, at: number): void => {
    for (const { boost } of boostRows) {
      const chip = chipFor.get(boost.id);
      if (chip === undefined) {
        continue;
      }
      const left = boostLeft(current, boost.id, at);
      writeChip(chip, {
        short: shortEffectName(boost.name),
        full: boost.name,
        multiplier: boost.multiplier,
        leftMs: left,
        active: left > 0,
      });
    }
  };

  const renderHow = (current: Mountain): void => {
    const key = `${String(stretch(current))}:${String(oneOffStretch(current))}`;
    if (key === howPriced) {
      return;
    }
    howPriced = key;
    const copy = howItWorks(stretch(current), oneOffStretch(current));
    for (const card of sheet.how.querySelectorAll<HTMLElement>("[data-how]")) {
      const system = card.dataset["how"];
      if (system === "upgrades" || system === "boosts") {
        setHowSteps(card, copy[system].steps);
      }
    }
  };

  const render = (): void => {
    const view = getView();
    const current = view.mountain;
    const at = now();
    renderHow(current);
    renderChips(current, at);
    if (!view.ready) {
      // The rows go dark and keep their places: names only, disabled, no numbers.
      for (const { id, row } of [...boostRows, ...upgradeRows]) {
        onBoard.paint(id, row, undefined);
        mark(row.root, "teach-new", false);
      }
      for (const { id, row } of toolRows) {
        onBoard.paint(`tool:${id}`, row, undefined);
      }
      sheet.kick(UPGRADES_KICK);
      if (sheet.isOpen()) {
        sheet.fitSpare();
      }
      return;
    }
    const newId = newRowId(current, at);
    let boostsShowing = false;
    for (const { boost, id, row } of boostRows) {
      const rowView = boostRowView(current, at, boost, id === newId);
      hide(row.root, !rowView.shown);
      boostsShowing ||= rowView.shown;
      onBoard.paint(id, row, rowView);
      mark(row.root, "teach-new", id === newId);
    }
    let upgradesShowing = false;
    for (const { upgrade, id, row } of upgradeRows) {
      const rowView = upgradeRowView(current, at, upgrade, id === newId);
      hide(row.root, !rowView.shown);
      upgradesShowing ||= rowView.shown;
      onBoard.paint(id, row, rowView);
      mark(row.root, "teach-new", id === newId);
    }
    let anyFound = false;
    for (const { id, row } of toolRows) {
      const rowView = toolRowView(current, id);
      hide(row.root, !rowView.shown);
      anyFound ||= rowView.shown;
      onBoard.paint(`tool:${id}`, row, rowView);
    }
    hide(boostSec, !boostsShowing);
    hide(lastingSec, !upgradesShowing);
    hide(foundSec, !anyFound);
    hide(foot, !anyHiddenRow(current));
    // Rows never move under a finger: the order is set as the drawer opens and holds while it
    // is open. A buy or the tick may pass the New flag to another row, in its place.
    if (!sheet.isOpen()) {
      order(newId);
    }
    // "Right on top" only while the New row is the one the list was ordered for: that row leads
    // the first section.
    sheet.kick(
      newId !== undefined && newId === orderedFor
        ? UPGRADES_INTRO
        : UPGRADES_KICK,
    );
    if (sheet.isOpen()) {
      sheet.fitSpare();
    }
  };

  const open = (from?: HTMLElement): void => {
    // Rows he has had in front of him stay, even after the pocket dips.
    if (!sheet.isOpen()) {
      dispatch({
        kind: "markAllSeen",
        ids: shownRows(progress.getSnapshot().mountain),
      });
    }
    const view = getView();
    if (view.ready && !sheet.isOpen()) {
      order(newRowId(view.mountain, now()));
    }
    sheet.open(from);
  };

  return { sheet, render, open };
}
