import borerUrl from "./assets/board/mach-borer.png";
import tarpUrl from "./assets/board/mach-borer-tarp.png";
import cartUrl from "./assets/board/mach-cart.png";
import drillUrl from "./assets/board/mach-drill.png";
import kidDimUrl from "./assets/board/mach-kid-dim.png";
import kidUrl from "./assets/board/mach-kid.png";
import machineDimUrl from "./assets/board/mach-machine-dim.png";
import machineUrl from "./assets/board/mach-machine.png";
import workerUrl from "./assets/board/mach-worker.png";
import {
  el,
  hide,
  legend,
  mark,
  scrollIntoList,
  setAttr,
  write,
} from "./board-dom";
import { createBoardSheet, type BoardSheet } from "./board-drawer";
import type { BoardHost } from "./board-host";
import {
  createBoardRow,
  rowsOnBoard,
  type BoardRow,
  type RowsOnBoard,
} from "./board-row";
import { createAmountKey } from "./buys-amount";
import { BUY_SECTIONS, buyRowView, type BuyIcon } from "./buys-rows";
import { buysTap } from "./buys-tap";
import { createCrewChips, type ChipBit } from "./crew-chips";
import { crewCounts } from "./crew-count";
import { createRateCounter } from "./crew-rate";
import { grandpaPost, staffNeeded } from "./engineers";
import { reducedMotion } from "./float-text";
import { formatCompact } from "./format";
import type { TroubleTier } from "./hazards";
import type { Mountain } from "./mountain";
import type { Move } from "./economy/actions";
import type {
  Dispatch,
  ProgressSnapshot,
  ProgressStore,
} from "./progress-store";
import { effectiveRates, firstIdleTier } from "./rates";
import type { ReadyPick } from "./ready-now";
import {
  STAFFING_INTRO,
  crewPostLabel,
  crewPostsWords,
  grandpaChipWords,
  grandpaSentence,
  stonesASecond,
  workerWords,
} from "./screen-words";
import { showsDot } from "./teach";
import { TIERS, owned, tierById, type BuyAmount, type TierId } from "./tiers";
import { watchFixHold } from "./trouble-tap";

/*
 * The Buys drawer (#373): the Crew section with its sentence and chips, then a row per tier in
 * the drawer skin, Crew first and Machines under it, and the Ready now footnote. Every row's
 * words come from buys-rows.ts; every buy is a buyTier move through the screen's dispatch
 * (#409), and a press on a troubled machine goes to pressTrouble and fixTrouble.
 */

/** The kick under the title while staffing has nothing to teach. */
const BUYS_KICK = "Crew and machines that mine while you rest";
/** How the Ready now plate picks, under the list. */
const READY_FOOT =
  "Ready now offers the biggest machine your free workers can run and you can afford. It saves for the next one when nothing is affordable, offers a worker only when no hand is free, and never buys for you.";

/** Each Buys icon's board art, at 32 art px. */
const BUY_ICON: Readonly<Record<BuyIcon, string>> = {
  worker: workerUrl,
  kid: kidUrl,
  "kid-dim": kidDimUrl,
  cart: cartUrl,
  drill: drillUrl,
  borer: borerUrl,
  tarp: tarpUrl,
  machine: machineUrl,
  "machine-dim": machineDimUrl,
};

/** What a row shows before the save is in: the tier's own art, never a lock read from a save. */
const FIRST_ICON: Readonly<Record<TierId, BuyIcon>> = {
  helper: "worker",
  kid: "kid",
  cart: "cart",
  drill: "drill",
  borer: "borer",
  machine: "machine",
};

/** The list's parts that are not tier rows, by their ids in the board's layout. */
const SEC_CREW = "sec:crew";
const CREW = "crew";
const POSTS = "posts";
const SEC_MACHINES = "sec:machines";
const FOOT = "foot";

interface TierRow {
  readonly id: TierId;
  readonly row: BoardRow;
}

/** The Crew section, the two legends and the footnote, built once. */
interface CrewParts {
  readonly crewSec: HTMLElement;
  readonly crew: HTMLElement;
  readonly crewStatus: HTMLElement;
  readonly posts: HTMLElement;
  readonly postsWords: HTMLElement;
  readonly machineSec: HTMLElement;
  readonly foot: HTMLElement;
}

function buildCrewParts(): CrewParts {
  // The Crew section: the crew's sentence, then where the hands are, as chips.
  const crew = el("section", "crew");
  crew.setAttribute("aria-label", "Your crew");
  const crewStatus = el("p", "crew-status");
  crewStatus.setAttribute("aria-live", "polite");
  // Text, not a door. The full sentence is spoken from hidden words; the chips say it again in
  // short, for the eye only.
  const posts = el("p", "crew-posts");
  const postsWords = el("span", "crew-posts-words");
  posts.append(postsWords);
  crew.append(crewStatus, posts);
  return {
    crewSec: legend("Crew", "crew", "per second"),
    crew,
    crewStatus,
    posts,
    postsWords,
    machineSec: legend("Machines", "machines"),
    foot: el("p", "board-sheet-foot", READY_FOOT),
  };
}

/**
 * Puts the parts in the drawer and returns them by their layout ids. The footnote stands under
 * the list, over Back: never part of the list's scroll. Until the save is in, nothing from it
 * shows: no row, legend, crew line or footnote.
 */
function placeParts(
  sheet: BoardSheet,
  parts: CrewParts,
  rows: readonly TierRow[],
): ReadonlyMap<string, HTMLElement> {
  const inSection = (section: readonly TierId[]) =>
    rows
      .filter(({ id }) => section.includes(id))
      .map(({ id, row }) => [id, row.root] as const);
  const byId = new Map<string, HTMLElement>([
    [SEC_CREW, parts.crewSec],
    [CREW, parts.crew],
    ...inSection(BUY_SECTIONS.crew),
    [SEC_MACHINES, parts.machineSec],
    ...inSection(BUY_SECTIONS.machines),
  ]);
  sheet.place([...byId.values()]);
  sheet.footer.prepend(parts.foot);
  byId.set(POSTS, parts.posts).set(FOOT, parts.foot);
  for (const part of byId.values()) {
    part.hidden = true;
  }
  return byId;
}

/** The ids of the parts the save shows, in list order. The footnote shows under every list. */
function shownParts(
  shown: readonly TierId[],
  crewed: boolean,
): readonly string[] {
  const inSection = (section: readonly TierId[]) =>
    section.filter((id) => shown.includes(id));
  return [
    SEC_CREW,
    CREW,
    ...(crewed ? [POSTS] : []),
    ...inSection(BUY_SECTIONS.crew),
    ...(shown.some((id) => tierById(id).staff > 0) ? [SEC_MACHINES] : []),
    ...inSection(BUY_SECTIONS.machines),
    FOOT,
  ];
}

/** The idle machine shown as the staffing New row, while it is. */
function guidedOf(
  mountain: Mountain,
  at: number,
  trouble: ProgressSnapshot["trouble"],
): TierId | undefined {
  return showsDot(mountain, "staffing")
    ? firstIdleTier(mountain, at, trouble)
    : undefined;
}

/** The crew's sentence: short of hands, no crew yet, or what it mines. */
function crewSentence(rate: number, idle: number, short: number): string {
  if (short > 0) {
    return `${formatCompact(rate)}/s · ${formatCompact(idle)} idle, need ${formatCompact(short)} ${workerWords(short)}`;
  }
  if (rate === 0) {
    return "No crew yet. Hire a worker to mine for you.";
  }
  // Compact once it's big, so the line never wraps on a phone.
  return rate >= 1_000
    ? `Your crew mines ${formatCompact(rate)} stones/s`
    : `Your crew mines ${stonesASecond(rate)}`;
}

/** The crew line at `shown` stones a second, or at the crew's own rate. */
function paintCrewStatus(
  target: HTMLElement,
  { mountain, trouble }: Pick<ProgressSnapshot, "mountain" | "trouble">,
  at: number,
  shown: number | undefined,
): void {
  const rates = effectiveRates(mountain, at, trouble);
  const rate = shown ?? rates.crewPerSecond;
  const idle = TIERS.reduce(
    (total, tier) => total + owned(mountain, tier) - rates.running[tier.id],
    0,
  );
  mark(target, "crew-short", rates.helpersShort > 0);
  mark(target, "crew-waiting", rate === 0);
  write(target, crewSentence(rate, idle, rates.helpersShort));
}

/** Where the hands are: the full sentence, spoken, and the chips that say it in short. */
function crewPosts(
  mountain: Mountain,
  at: number,
  trouble: ProgressSnapshot["trouble"],
): { readonly words: string; readonly bits: readonly ChipBit[] } {
  const rates = effectiveRates(mountain, at, trouble);
  const pool = mountain.helpers + mountain.kids;
  const { spare: free } = crewCounts(mountain, at, trouble);
  const stations = TIERS.flatMap((tier) => {
    const label = crewPostLabel(tier.id);
    return label === undefined
      ? []
      : [
          {
            label,
            workers: rates.running[tier.id] * staffNeeded(mountain, tier),
          },
        ];
  });
  const grandpa = grandpaPost(mountain, rates.running);
  const words = `${crewPostsWords(pool, free, stations)}${grandpa === undefined ? "" : `. ${grandpaSentence(grandpa)}`}`;
  if (pool <= 0) {
    return { words, bits: [] };
  }
  const bits = [
    { key: "pool", text: `${formatCompact(pool)} ${workerWords(pool)}` },
    ...stations
      .filter((post) => post.workers > 0)
      .map((post) => ({
        key: post.label,
        text: `${formatCompact(post.workers)} on ${post.label}`,
      })),
    // After a pass, the old dad tends the biggest machine.
    ...(grandpa === undefined
      ? []
      : [{ key: "grandpa", text: grandpaChipWords(grandpa) }]),
  ];
  return { words, bits };
}

function sameChips(a: readonly ChipBit[], b: readonly ChipBit[]): boolean {
  return (
    a.length === b.length &&
    a.every((bit, index) => bit.text === b[index]?.text)
  );
}

/** Paints each row from its view. Returns the tiers shown, and the staffing New row's. */
function paintRows(
  rows: readonly TierRow[],
  { mountain, trouble }: Pick<ProgressSnapshot, "mountain" | "trouble">,
  {
    at,
    pick,
    onBoard,
    amount,
  }: { at: number; pick: ReadyPick; onBoard: RowsOnBoard; amount: BuyAmount },
): { readonly shown: readonly TierId[]; readonly fresh: TierId | undefined } {
  const guided = guidedOf(mountain, at, trouble);
  const shown: TierId[] = [];
  let fresh: TierId | undefined;
  for (const { id, row } of rows) {
    const view = buyRowView({
      mountain,
      now: at,
      trouble,
      tier: id,
      pick,
      guided,
      amount,
    });
    if (view.shown) {
      shown.push(id);
    }
    if (view.guided) {
      fresh = id;
    }
    row.setIcon(BUY_ICON[view.icon]);
    onBoard.paint(id, row, view);
    mark(row.root, "teach-new", view.guided);
    const kind = view.state === "trouble" ? trouble?.kind : undefined;
    setAttr(row.root, "data-trouble", kind);
  }
  return { shown, fresh };
}

/** Until the save is in, the rows go dark in their places: names and icons only, disabled. */
function paintRowsLoading(
  rows: readonly TierRow[],
  onBoard: RowsOnBoard,
): void {
  for (const { id, row } of rows) {
    onBoard.paint(id, row, undefined);
    mark(row.root, "teach-new", false);
    setAttr(row.root, "data-trouble", undefined);
  }
}

/** What a Buys row's tap needs from its drawer. */
interface RowWiring {
  readonly progress: ProgressStore;
  readonly onBoard: RowsOnBoard;
  readonly now: () => number;
  readonly pick: () => ReadyPick;
  /** How many a tap buys now (#358). */
  readonly amount: () => BuyAmount;
  /** Buys `count` of `what` from the row `id`: Done holds that row. */
  readonly buy: (id: TierId, what: TierId, count: number) => void;
}

function troubledHere(
  snapshot: ProgressSnapshot,
  id: TierId,
): TroubleTier | undefined {
  return snapshot.trouble?.tier === id ? snapshot.trouble.tier : undefined;
}

/**
 * A tier row's taps, through the board's model. The staffing New row hires a worker, and its
 * hold keeps a second tap off the machine. A press on a troubled machine presses or holds the
 * fix instead of buying.
 */
function wireTierRow(
  button: HTMLButtonElement,
  id: TierId,
  { progress, onBoard, now, pick, amount, buy }: RowWiring,
): void {
  // A fix holds the row again: the burst of presses that fixed it must not run on into a buy,
  // even inside the hold of an earlier buy.
  const fixed = (tier: TroubleTier): void => {
    if (progress.getSnapshot().trouble === undefined) {
      onBoard.result(tier, "fixed");
    }
  };
  const fixHold = watchFixHold(button, {
    tier: () => troubledHere(progress.getSnapshot(), id),
    fix: (tier) => {
      progress.fixTrouble(tier);
      fixed(tier);
    },
  });
  onBoard.tap(button, (press, event) => {
    const snapshot = progress.getSnapshot();
    // The click that ends a hold that fixed is not a tap, and nothing buys before the save is in.
    if (fixHold.heldFix() || !snapshot.ready) {
      return;
    }
    // The second tap of the double tap that opened Buys, or a second sleepy tap inside the
    // Done hold, spends nothing. A trouble press is not a spend, so it still counts.
    const intent = troubledHere(snapshot, id) === undefined ? "act" : "trouble";
    if (onBoard.press(id, press, event, intent) !== "act") {
      return;
    }
    const at = now();
    const guided = guidedOf(snapshot.mountain, at, snapshot.trouble);
    const tap = buysTap({
      snapshot,
      tier: id,
      pick: pick(),
      now: at,
      guided,
      amount: amount(),
    });
    switch (tap.kind) {
      case "blink":
        onBoard.result(id, "refused");
        return;
      case "hire":
        buy(id, "helper", 1);
        return;
      case "trouble":
        progress.pressTrouble(tap.tier);
        fixed(tap.tier);
        return;
      case "buy":
        buy(id, id, tap.count);
    }
  });
}

/** One of a tier is today's buy; ×10 and Max buy several in one move (#358). */
function buyMove(
  what: TierId,
  count: number,
): Extract<Move, { kind: "buyTier" | "buyTiers" }> {
  return count === 1
    ? { kind: "buyTier", id: what }
    : { kind: "buyTiers", id: what, count };
}

/** A tier's row, built once, with its own art until the save is in. */
function tierRow(id: TierId, wiring: RowWiring): TierRow {
  const row = createBoardRow({
    tag: "button",
    className: "tier",
    data: { tier: id },
    name: tierById(id).name,
    icon: true,
  });
  row.setIcon(BUY_ICON[FIRST_ICON[id]]);
  if (row.root instanceof HTMLButtonElement) {
    wireTierRow(row.root, id, wiring);
  }
  return { id, row };
}

/** The Buys list on the board's model: the parts it shows, and the crew chips laid out on it. */
interface BuysLayout {
  /** A ready render: the save's latest parts and chips. */
  paint(parts: readonly string[], bits: readonly ChipBit[]): void;
  /** Open on the page, before the board's model hears it: measures what the open freezes. */
  opening(): void;
  /** Opens the drawer through `openSheet`. The latest layout stays whole. */
  open(openSheet: () => void): void;
  /** Shut: the latest shows, and the chips lay out again. */
  closed(): void;
}

/**
 * Rows never move under a finger: while the drawer is open with a save in, every part keeps the
 * place it had as it opened, and words still change in place. The board's model holds that
 * layout; this paints it, and measures the chips and the footnote for it.
 */
function createBuysLayout(
  board: BoardHost,
  sheet: BoardSheet,
  byId: ReadonlyMap<string, HTMLElement>,
  { posts, postsWords }: CrewParts,
): BuysLayout {
  const chips = createCrewChips(posts, postsWords);
  let bits: readonly ChipBit[] = [];
  let chipRows = 0;
  const show = (parts: readonly string[]): void => {
    for (const [id, part] of byId) {
      hide(part, !parts.includes(id));
    }
  };
  const paintView = (): void => {
    const view = board.view();
    const layout = view.layouts.get("buys");
    if (layout !== undefined) {
      show(layout.parts);
    }
    // Frozen, words that grow in place run on past the line rather than wrap a chip row
    // (board.css).
    mark(
      posts,
      "is-frozen",
      layout !== undefined && view.stack.includes("buys"),
    );
  };
  const layOut = (): void => {
    chipRows = chips.layout(bits, posts.clientWidth);
  };
  const send = (parts: readonly string[]): void => {
    board.send({
      kind: "layout",
      overlay: "buys",
      layout: { parts, chipRows },
    });
  };
  // The footnote takes room from the list. On an open drawer whose list would scroll with it
  // there, it steps aside, so early and mid-game Buys fit.
  const fitted = (parts: readonly string[]): readonly string[] =>
    sheet.list.scrollHeight > sheet.list.clientHeight + 1
      ? parts.filter((id) => id !== FOOT)
      : parts;
  return {
    paint(parts, latest) {
      const view = board.view();
      const open = view.stack.includes("buys");
      const frozen = open ? view.layouts.get("buys") : undefined;
      // Not frozen, the latest shows, and the chips and the footnote measure on it.
      if (frozen === undefined) {
        show(parts);
      }
      if (!sameChips(latest, bits)) {
        bits = latest;
        if (frozen === undefined) {
          layOut();
        } else {
          chips.refresh(latest);
        }
      }
      // A drawer opened before the save was in lays out once, as the save lands.
      if (open && frozen === undefined) {
        send(fitted(parts));
      }
      send(parts);
      paintView();
    },
    opening() {
      // The chips were measured while the drawer was shut: fit them now.
      layOut();
      const latest = board.view().layouts.get("buys");
      if (latest !== undefined) {
        send(fitted(latest.parts));
      }
    },
    open(openSheet) {
      const view = board.view();
      // The latest, before the open freezes what `opening` measured.
      const latest = view.stack.includes("buys")
        ? undefined
        : view.layouts.get("buys");
      openSheet();
      // Shut again, the footnote comes back, to be measured at the next open.
      if (latest !== undefined) {
        send(latest.parts);
      }
      paintView();
    },
    closed() {
      paintView();
      layOut();
    },
  };
}

/**
 * The Buys drawer. `pick` is the Ready now pick the screen painted on the plate this frame,
 * so a row's amber lamp always agrees with it. `open` lays the crew chips out on the open
 * drawer and brings the staffing New row into view.
 */
export function createCrewPanel({
  progress,
  dispatch,
  getView,
  now,
  pick,
  board,
  overSave,
  door,
  storage,
  signal,
}: {
  progress: ProgressStore;
  dispatch: Dispatch;
  getView: () => ProgressSnapshot;
  /** The game's clock: rates, trouble and the New row. */
  now: () => number;
  pick: () => ReadyPick;
  /** The board's tap rules, shared by every drawer and the board. */
  board: BoardHost;
  /** The save drawer is open over the board: its Escape is its own. */
  overSave: () => boolean;
  /** The drawer's key on the rail: the shell writes its aria-expanded. */
  door?: HTMLElement;
  /** Where this device keeps its Buys amount; localStorage when undefined. */
  storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
  /** Aborting it removes the drawer's document listeners. */
  signal?: AbortSignal;
}): {
  sheet: BoardSheet;
  render: () => void;
  open: (from?: HTMLElement) => void;
} {
  const onBoard = rowsOnBoard(board, "buys");
  // ×1, ×10 or Max for every row (#358). A change repaints the rows in place.
  const amountKey = createAmountKey({
    board,
    storage,
    changed: () => {
      render();
    },
  });
  const sheet = createBoardSheet({
    name: "buys",
    title: "Buys",
    infoLabel: "Buys",
    how: { systems: ["staffing", "layers"], backLabel: "Back to Buys" },
    board,
    overSave,
    ...(door === undefined ? {} : { door }),
    headKey: amountKey.root,
    onOpen: () => {
      layout.opening();
    },
    onClose: () => {
      layout.closed();
    },
    onForget: () => {
      onBoard.forget();
      amountKey.forget();
    },
    ...(signal === undefined ? {} : { signal }),
  });
  sheet.kick(BUYS_KICK);
  const parts = buildCrewParts();

  // The crew line counts up to the new rate after a purchase.
  let rateShown: number | undefined;
  const paintStatus = (): void => {
    paintCrewStatus(parts.crewStatus, getView(), now(), rateShown);
  };
  const rate = createRateCounter({
    reduced: reducedMotion,
    paint: (shown) => {
      rateShown = shown;
      paintStatus();
    },
  });
  const crewSpeed = (): number =>
    effectiveRates(getView().mountain, now(), getView().trouble).crewPerSecond;
  const buy = (id: TierId, what: TierId, count: number): void => {
    const before = crewSpeed();
    if (dispatch(buyMove(what, count)).kind === "applied") {
      onBoard.result(id, "applied");
      rate.count(before, crewSpeed());
    }
  };

  const wiring = { progress, onBoard, now, pick, buy };
  const rows = [...BUY_SECTIONS.crew, ...BUY_SECTIONS.machines].map((id) =>
    tierRow(id, { ...wiring, amount: amountKey.amount }),
  );
  const layout = createBuysLayout(
    board,
    sheet,
    placeParts(sheet, parts, rows),
    parts,
  );
  /** The staffing New row the last render painted. */
  let fresh: TierId | undefined;

  const render = (): void => {
    const view = getView();
    // While the save loads, the crew's sentence and chips are the old save's: blank, in place.
    mark(parts.crew, "is-blank", !view.ready);
    mark(parts.crewSec, "is-blank", !view.ready);
    if (view.ready) {
      const at = now();
      const painted = paintRows(rows, view, {
        at,
        pick: pick(),
        onBoard,
        amount: amountKey.amount(),
      });
      fresh = painted.fresh;
      const line = crewPosts(view.mountain, at, view.trouble);
      write(parts.postsWords, line.words);
      paintStatus();
      layout.paint(shownParts(painted.shown, line.bits.length > 0), line.bits);
    } else {
      fresh = undefined;
      paintRowsLoading(rows, onBoard);
    }
    const teach = view.ready && showsDot(view.mountain, "staffing");
    sheet.kick(teach ? STAFFING_INTRO : BUYS_KICK);
    if (sheet.isOpen()) {
      sheet.fitSpare();
    }
  };

  const open = (from?: HTMLElement): void => {
    layout.open(() => {
      sheet.open(from);
    });
    // The staffing New row: bring it into view, scrolling the list alone. The board's clip
    // around the sliding drawer never scrolls.
    const row = rows.find(({ id }) => id === fresh);
    if (row !== undefined) {
      scrollIntoList(sheet.list, row.row.root);
    }
  };

  return { sheet, render, open };
}
