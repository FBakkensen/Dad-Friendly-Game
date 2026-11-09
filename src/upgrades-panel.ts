import { oneOffStretch, stretch } from "./scale";
import { el, hide, legend, mark } from "./board-dom";
import { createBoardSheet, type BoardSheet } from "./board-drawer";
import type { BoardHost } from "./board-host";
import type { Layout } from "./board-interaction";
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
  type UpgradeRowView,
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

/** The Upgrades list's parts that are not rows, by their ids in the board's layout. */
const SEC_BOOSTS = "sec:boosts";
const SEC_LASTING = "sec:lasting";
const SEC_FOUND = "sec:found";
const FOOT = "foot";

const BOOST_IDS: readonly RevealRowId[] = BOOSTS.map(boostRowId);
const UPGRADE_IDS: readonly RevealRowId[] = UPGRADES.map(upgradeRowId);
const toolPartId = (id: LostToolId): string => `tool:${id}`;

/** The ids with the New row first, when it is one of them. */
function led(
  ids: readonly RevealRowId[],
  newId: RevealRowId | undefined,
): readonly RevealRowId[] {
  return newId !== undefined && ids.includes(newId)
    ? [newId, ...ids.filter((id) => id !== newId)]
    : ids;
}

/**
 * The Upgrades list's order, every part in it, shown or not: the New row first in its
 * section, and its section first. Brought home and the footnote stay last.
 */
export function upgradesOrder(
  newId: RevealRowId | undefined,
): readonly string[] {
  const boosts = [SEC_BOOSTS, ...led(BOOST_IDS, newId)];
  const lasting = [SEC_LASTING, ...led(UPGRADE_IDS, newId)];
  const upgradeLeads = newId !== undefined && UPGRADE_IDS.includes(newId);
  return [
    ...(upgradeLeads ? [...lasting, ...boosts] : [...boosts, ...lasting]),
    SEC_FOUND,
    ...LOST_TOOLS.map(toolPartId),
    FOOT,
  ];
}

/** The drawer's rows, built once and wired to buy. */
interface UpgradesRows {
  readonly boosts: readonly BoostRow[];
  readonly upgrades: readonly UpgradeRow[];
  readonly tools: readonly ToolRow[];
}

function buildRows(taps: BuyTaps): UpgradesRows {
  const buyRow = (
    className: string,
    data: Readonly<Record<string, string>>,
    name: string,
  ): BoardRow =>
    createBoardRow({ tag: "button", className, data, name, icon: false });
  const boosts = BOOSTS.map((boost) => {
    const row = buyRow("upgrade boost", { boost: boost.id }, boost.name);
    const id = boostRowId(boost);
    wireBuy(
      taps,
      id,
      row,
      (mountain, at) => boostRowView(mountain, at, boost, false),
      { kind: "buyBoost", id: boost.id },
    );
    return { boost, id, row };
  });
  const upgrades = UPGRADES.map((upgrade) => {
    const row = buyRow("upgrade", { upgrade: upgrade.id }, upgrade.name);
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
  const tools = LOST_TOOLS.map((id) => ({
    id,
    row: createBoardRow({
      tag: "div",
      className: "found-tool",
      data: { tool: id },
      name: lostToolWords(id).name,
      icon: false,
    }),
  }));
  return { boosts, upgrades, tools };
}

/** The legends and the footnote, built once. */
interface UpgradesParts {
  readonly boostSec: HTMLElement;
  readonly lastingSec: HTMLElement;
  readonly foundSec: HTMLElement;
  readonly foot: HTMLElement;
}

/**
 * Builds the legends and the footnote, puts every part in the drawer in the order with no New
 * row, and returns them by their layout ids. Until the save is in, nothing from it shows: no
 * row, legend or footnote.
 */
function placeParts(
  sheet: BoardSheet,
  rows: UpgradesRows,
): {
  readonly parts: UpgradesParts;
  readonly byId: ReadonlyMap<string, HTMLElement>;
} {
  const parts: UpgradesParts = {
    boostSec: legend("Quick boosts", "boosts"),
    lastingSec: legend("Lasting upgrades", "lasting"),
    foundSec: legend(BROUGHT_HOME, "found"),
    foot: el("p", "board-sheet-foot", UPGRADES_MORE),
  };
  const byId = new Map<string, HTMLElement>([
    [SEC_BOOSTS, parts.boostSec],
    [SEC_LASTING, parts.lastingSec],
    [SEC_FOUND, parts.foundSec],
    [FOOT, parts.foot],
    ...[...rows.boosts, ...rows.upgrades].map(
      ({ id, row }) => [id, row.root] as const,
    ),
    ...rows.tools.map(({ id, row }) => [toolPartId(id), row.root] as const),
  ]);
  for (const part of byId.values()) {
    part.hidden = true;
  }
  sheet.place(upgradesOrder(undefined).flatMap((id) => byId.get(id) ?? []));
  return { parts, byId };
}

/** The Upgrades list's order on the board's model. */
interface UpgradesLayout {
  /**
   * The order for the New row `newId`, from a ready render or as the drawer opens: shut, the
   * list takes it, and an opening freezes it; open, the list keeps the order it froze. Returns
   * the New row the order the list shows was made for.
   */
  paint(newId: RevealRowId | undefined): RevealRowId | undefined;
  /** Opened while the save loads: the open freezes the order the list shows. */
  keep(): void;
}

/**
 * Rows never move under a finger: the order is set while the drawer is shut and as it opens,
 * and holds while it is open. The board's model holds that order; this arranges the list by
 * it. Which rows show stays the render's, live, so a buy or the tick may pass the New flag to
 * another row, in its place.
 */
function createUpgradesLayout(
  board: BoardHost,
  sheet: BoardSheet,
  byId: ReadonlyMap<string, HTMLElement>,
): UpgradesLayout {
  /** The New row each order this drawer sent was made for. */
  const madeFor = new WeakMap<Layout, RevealRowId | undefined>();
  let arranged = upgradesOrder(undefined);
  let arrangedFor: RevealRowId | undefined;
  const send = (
    parts: readonly string[],
    newId: RevealRowId | undefined,
  ): void => {
    const layout: Layout = { parts, chipRows: 0 };
    madeFor.set(layout, newId);
    board.send({ kind: "layout", overlay: "upgrades", layout });
  };
  // The model keeps a layout as it was given, so the one it shows finds its note.
  const arrange = (): void => {
    const layout = board.view().layouts.get("upgrades");
    if (layout === undefined) {
      return;
    }
    arrangedFor = madeFor.get(layout);
    if (!sameParts(layout.parts, arranged)) {
      arranged = layout.parts;
      sheet.place(arranged.flatMap((id) => byId.get(id) ?? []));
    }
  };
  return {
    paint(newId) {
      send(upgradesOrder(newId), newId);
      arrange();
      return arrangedFor;
    },
    keep() {
      send(arranged, arrangedFor);
      arrange();
    },
  };
}

function sameParts(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** The boost chips in Running now: as today, from the save whatever its state. */
function renderChips(
  chipFor: ReadonlyMap<BoostId, HTMLElement>,
  current: Mountain,
  at: number,
): void {
  for (const boost of BOOSTS) {
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
}

/** The "i" cards' steps, priced for the save's stretch: written again only when it changes. */
function createHowPricer(how: HTMLElement): (current: Mountain) => void {
  let priced = "1:1";
  return (current) => {
    const key = `${String(stretch(current))}:${String(oneOffStretch(current))}`;
    if (key === priced) {
      return;
    }
    priced = key;
    const copy = howItWorks(stretch(current), oneOffStretch(current));
    for (const card of how.querySelectorAll<HTMLElement>("[data-how]")) {
      const system = card.dataset["how"];
      if (system === "upgrades" || system === "boosts") {
        setHowSteps(card, copy[system].steps);
      }
    }
  };
}

/** Paints a section's buy rows, the New row marked. Returns whether any row shows. */
function paintBuyRows<
  Row extends { readonly id: RevealRowId; readonly row: BoardRow },
>(
  rows: readonly Row[],
  viewOf: (item: Row, fresh: boolean) => UpgradeRowView,
  newId: RevealRowId | undefined,
  onBoard: RowsOnBoard,
): boolean {
  let showing = false;
  for (const item of rows) {
    const rowView = viewOf(item, item.id === newId);
    hide(item.row.root, !rowView.shown);
    showing ||= rowView.shown;
    onBoard.paint(item.id, item.row, rowView);
    mark(item.row.root, "teach-new", item.id === newId);
  }
  return showing;
}

/** Paints the rows, legends and footnote from a ready save. */
function paintReady(
  { boosts, upgrades, tools }: UpgradesRows,
  parts: UpgradesParts,
  {
    current,
    at,
    newId,
    onBoard,
  }: {
    current: Mountain;
    at: number;
    newId: RevealRowId | undefined;
    onBoard: RowsOnBoard;
  },
): void {
  const boostsShowing = paintBuyRows(
    boosts,
    ({ boost }, fresh) => boostRowView(current, at, boost, fresh),
    newId,
    onBoard,
  );
  const upgradesShowing = paintBuyRows(
    upgrades,
    ({ upgrade }, fresh) => upgradeRowView(current, at, upgrade, fresh),
    newId,
    onBoard,
  );
  let anyFound = false;
  for (const { id, row } of tools) {
    const rowView = toolRowView(current, id);
    hide(row.root, !rowView.shown);
    anyFound ||= rowView.shown;
    onBoard.paint(toolPartId(id), row, rowView);
  }
  hide(parts.boostSec, !boostsShowing);
  hide(parts.lastingSec, !upgradesShowing);
  hide(parts.foundSec, !anyFound);
  hide(parts.foot, !anyHiddenRow(current));
}

/**
 * Until the save is in, the rows go dark and keep their places: names only, disabled, no
 * numbers.
 */
function paintLoading(
  { boosts, upgrades, tools }: UpgradesRows,
  onBoard: RowsOnBoard,
): void {
  for (const { id, row } of [...boosts, ...upgrades]) {
    onBoard.paint(id, row, undefined);
    mark(row.root, "teach-new", false);
  }
  for (const { id, row } of tools) {
    onBoard.paint(toolPartId(id), row, undefined);
  }
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
    // The order the open freezes. Opened while the save loads, the list keeps its order.
    onOpen: () => {
      const view = getView();
      if (view.ready) {
        layout.paint(newRowId(view.mountain, now()));
      } else {
        layout.keep();
      }
    },
    onForget: () => {
      onBoard.forget();
    },
    ...(door === undefined ? {} : { door }),
    ...(signal === undefined ? {} : { signal }),
  });
  sheet.kick(UPGRADES_KICK);

  const rows = buildRows({ progress, dispatch, now, onBoard });
  const { parts, byId } = placeParts(sheet, rows);
  const layout = createUpgradesLayout(board, sheet, byId);
  const priceHow = createHowPricer(sheet.how);

  const render = (): void => {
    const view = getView();
    const current = view.mountain;
    const at = now();
    priceHow(current);
    renderChips(chipFor, current, at);
    if (view.ready) {
      const newId = newRowId(current, at);
      paintReady(rows, parts, { current, at, newId, onBoard });
      // "Right on top" only while the New row is the one the list was ordered for: that row
      // leads the first section.
      const orderedFor = layout.paint(newId);
      sheet.kick(
        newId !== undefined && newId === orderedFor
          ? UPGRADES_INTRO
          : UPGRADES_KICK,
      );
    } else {
      paintLoading(rows, onBoard);
      sheet.kick(UPGRADES_KICK);
    }
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
    sheet.open(from);
  };

  return { sheet, render, open };
}
