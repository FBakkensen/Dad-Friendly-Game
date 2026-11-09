import { oneOffStretch, stretch } from "./scale";
import { el } from "./board-dom";
import { createBoardSheet, type BoardSheet } from "./board-drawer";
import { boardHowCard } from "./board-how-art";
import { createBoardRow, type BoardRow } from "./board-row";
import { howItWorks } from "./how-it-works";
import {
  BOOSTS,
  boostLeft,
  buyBoost,
  type Boost,
  type BoostId,
} from "./boosts";
import { buyOnTap } from "./card-tap";
import { shortEffectName, writeChip } from "./effect-row";
import type { Mountain } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { effectiveRates } from "./rates";
import type { RowView } from "./row-view";
import { LOST_TOOLS, type LostToolId } from "./lost-tools";
import {
  BROUGHT_HOME,
  UPGRADES_INTRO,
  UPGRADES_MORE,
  lostToolWords,
} from "./screen-words";
import { markAllSeen } from "./teach";
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
import { UPGRADES, buyUpgrade, upgradeLevel, type Upgrade } from "./upgrades";

/*
 * The Upgrades drawer (#373): Quick boosts, Lasting upgrades and Brought home as board rows,
 * the "i" cards for upgrades and boosts, and the spare plate under a short list. It also keeps
 * the running-boost chips in Running now current. Its rows and words come from upgrade-rows.ts;
 * every buy goes through today's mutations, wrapped in markAllSeen.
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

function hide(target: HTMLElement, hidden: boolean): void {
  if (target.hidden !== hidden) {
    target.hidden = hidden;
  }
}

function mark(target: HTMLElement, name: string, on: boolean): void {
  if (target.classList.contains(name) !== on) {
    target.classList.toggle(name, on);
  }
}

/** A section's legend: its name, engraved. */
function legend(name: string, key: string): HTMLElement {
  const sec = el("div", "board-sec");
  sec.dataset["sec"] = key;
  sec.append(el("span", "board-lg", name));
  return sec;
}

/**
 * The Upgrades drawer. `open` marks every shown row seen, then opens the drawer; the opener
 * (the Upgrades key on the rail) owns its lit cap and dot.
 */
export function createUpgradesPanel({
  progress,
  getView,
  now,
  chipFor,
  clock,
  door,
  signal,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  /** The game's clock: prices, timers and the New row. */
  now: () => number;
  /** Countdown chips in Running now, one per boost. */
  chipFor: ReadonlyMap<BoostId, HTMLElement>;
  /** Milliseconds for the drawer's settle (the screen's tap clock). */
  clock: () => number;
  /** The drawer's key on the rail: the shell writes its aria-expanded (#373). */
  door?: HTMLElement;
  /** Aborting it removes the drawer's document listeners. */
  signal?: AbortSignal;
}): {
  sheet: BoardSheet;
  render: () => void;
  open: (from?: HTMLElement) => void;
} {
  const sheet = createBoardSheet({
    name: "upgrades",
    title: "Upgrades",
    infoLabel: "Upgrades and boosts",
    clock,
    ...(door === undefined ? {} : { door }),
    ...(signal === undefined ? {} : { signal }),
  });
  sheet.kick(UPGRADES_KICK);

  // The "i": the upgrades and boosts cards in the drawer's place, one Back under the last.
  const howCards = (["upgrades", "boosts"] as const).map((system) =>
    boardHowCard(system, "Back to Upgrades", () => {
      sheet.showHow(false);
    }),
  );
  const firstBack = howCards[0]?.querySelector<HTMLElement>(".teach-how-back");
  if (firstBack) {
    firstBack.hidden = true;
  }
  sheet.how.append(...howCards);
  sheet.info.addEventListener("click", () => {
    sheet.showHow(true);
  });
  let howPriced = "1:1";

  /**
   * A buy row's tap. A second sleepy tap inside the Done hold, or the tap that opened the
   * drawer, does nothing. The store is read again at the tap: a pocket that fell under the
   * price since the last paint blinks and buys nothing.
   */
  const wireBuy = (
    row: BoardRow,
    viewOf: (mountain: Mountain, at: number) => RowView,
    buy: (mountain: Mountain, at: number) => Mountain,
    score: (mountain: Mountain) => number,
  ): void => {
    const root = row.root;
    if (!(root instanceof HTMLButtonElement)) {
      return;
    }
    buyOnTap(
      root,
      root,
      (press) => {
        if (row.holding() || press.early) {
          return;
        }
        const snapshot = progress.getSnapshot();
        if (!snapshot.ready) {
          return;
        }
        const at = now();
        if (!viewOf(snapshot.mountain, at).can) {
          row.blink();
          return;
        }
        const before = score(snapshot.mountain);
        progress.applyMutation((current) =>
          markAllSeen(buy(current, at), shownRows(current)),
        );
        if (score(progress.getSnapshot().mountain) > before) {
          row.done();
        }
      },
      { settling: () => sheet.settling() },
    );
  };

  const boostRows: readonly BoostRow[] = BOOSTS.map((boost) => {
    const row = createBoardRow({
      tag: "button",
      className: "upgrade boost",
      data: { boost: boost.id },
      name: boost.name,
      icon: false,
    });
    wireBuy(
      row,
      (mountain, at) => boostRowView(mountain, at, boost, false),
      (mountain, at) =>
        buyBoost({
          mountain,
          id: boost.id,
          now: at,
          pricing: effectiveRates(mountain),
        }),
      (mountain) => mountain.boosts?.[boost.id] ?? Number.NEGATIVE_INFINITY,
    );
    return { boost, id: boostRowId(boost), row };
  });

  const upgradeRows: readonly UpgradeRow[] = UPGRADES.map((upgrade) => {
    const row = createBoardRow({
      tag: "button",
      className: "upgrade",
      data: { upgrade: upgrade.id },
      name: upgrade.name,
      icon: false,
    });
    wireBuy(
      row,
      (mountain, at) => upgradeRowView(mountain, at, upgrade, false),
      (mountain) => buyUpgrade(mountain, upgrade.id),
      (mountain) => upgradeLevel(mountain, upgrade.id),
    );
    return { upgrade, id: upgradeRowId(upgrade), row };
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

  const spare = sheet.list.querySelector(".board-spare");
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
    if (spare === null) {
      sheet.list.append(...parts);
    } else {
      spare.before(...parts);
    }
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
    for (const card of howCards) {
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
      for (const { row } of [...boostRows, ...upgradeRows, ...toolRows]) {
        row.render(undefined);
        mark(row.root, "teach-new", false);
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
      row.render(rowView);
      mark(row.root, "teach-new", id === newId);
    }
    let upgradesShowing = false;
    for (const { upgrade, id, row } of upgradeRows) {
      const rowView = upgradeRowView(current, at, upgrade, id === newId);
      hide(row.root, !rowView.shown);
      upgradesShowing ||= rowView.shown;
      row.render(rowView);
      mark(row.root, "teach-new", id === newId);
    }
    let anyFound = false;
    for (const { id, row } of toolRows) {
      const rowView = toolRowView(current, id);
      hide(row.root, !rowView.shown);
      anyFound ||= rowView.shown;
      row.render(rowView);
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
      progress.applyMutation((current) =>
        markAllSeen(current, shownRows(current)),
      );
    }
    const view = getView();
    if (view.ready && !sheet.isOpen()) {
      order(newRowId(view.mountain, now()));
    }
    sheet.open(from);
  };

  return { sheet, render, open };
}
