import workerUrl from "./assets/helper-miner.png";
import stoneUrl from "./assets/board/res-stone.png";
import brickUrl from "./assets/board/res-brick.png";
import wagonUrl from "./assets/city/horse-wagon.png";
import pickUrl from "./assets/pick.png";
import kilnUrl from "./assets/board/mach-kiln.png";
import type { AuthController } from "./auth";
import { createSaveLine } from "./board-save";
import { el, hide, mark, setAttr, write } from "./board-dom";
import { deviceAmount, type DeviceStorage } from "./buys-amount";
import {
  hireKey,
  orderStrip,
  stockpiles,
  workersView,
  type Pip,
  type Stockpile,
} from "./frame-view";
import type { Mountain } from "./mountain";
import { saveOnLeave } from "./save-on-leave";
import {
  SITES,
  SITE_NAMES,
  nextView,
  siteLamp,
  siteOpen,
  type SiteId,
} from "./next-view";
import type { ProgressStore } from "./progress-store";
import type { BuyAmount } from "./tiers";
import { tierBuyMove } from "./economy/actions";
import type { FrameState } from "./frame-state";
import { createFrameCards } from "./frame-cards";
import { createFrameSaveCards } from "./frame-save-cards";
import { createFrameLedger, type FrameLedger } from "./frame-ledger";
import { createBoardHost } from "./board-host";
import { createCitySite } from "./city-site";
import { createMineSite } from "./mine-site";
import { createRefinerySite } from "./refinery-site";
import { createStageSheet, type StageSheet } from "./stage-sheet";
import { createWorkforceSheet, type WorkforceSheet } from "./workforce-sheet";
import "./frame.css";

/**
 * Slice 1's frame (#659; spec, "The frame, the same on every site"), the
 * game's screen since #664: the order strip, the stockpile with the count of workers and
 * the hire key, the site's scene (the mine, #660; the city, #662), Next, the site bar and the
 * save line. `main` mounts it for everyone (src/main.ts). It paints the pure views
 * (frame-view, next-view, workforce-view), shows its cards over itself
 * (frame-cards: the shift report and the end card), and
 * changes the game only through `progress.dispatch`.
 */

const SITE_ICONS: Readonly<Record<SiteId, string>> = {
  mine: pickUrl,
  refinery: kilnUrl,
  city: wagonUrl,
};

function icon(url: string, className: string): HTMLImageElement {
  const img = el("img", className);
  img.src = url;
  img.alt = "";
  img.draggable = false;
  return img;
}

type OrderParts = {
  readonly root: HTMLButtonElement;
  readonly top: HTMLElement;
  readonly name: HTMLElement;
  readonly step: HTMLElement;
  readonly pips: readonly HTMLElement[];
  readonly line: HTMLElement;
};

function buildOrder(state: FrameState): OrderParts {
  const root = el("button", "frame-order");
  root.type = "button";
  root.setAttribute("aria-label", "The order. Opens the city.");
  const name = el("span", "frame-order-name");
  const step = el("span", "frame-order-step");
  const pipRow = el("span", "frame-pips");
  const pips = [0, 1, 2].map(() => el("i", "frame-pip"));
  pipRow.append(...pips);
  const top = el("span", "frame-order-top");
  top.append(name, step);
  const line = el("span", "frame-order-line");
  // The pips sit under the step, beside what it requires: the key to the
  // Ledger takes the strip's end (#708).
  const bottom = el("span", "frame-order-bottom");
  bottom.append(line, pipRow);
  root.append(top, bottom);
  root.addEventListener("click", () => {
    state.go("city");
  });
  return { root, top, name, step, pips, line };
}

function paintPips(pips: readonly HTMLElement[], states: readonly Pip[]): void {
  for (const [index, pip] of pips.entries()) {
    setAttr(pip, "data-pip", states[index]);
  }
}

function paintOrder(parts: OrderParts, mountain: Mountain): void {
  const strip = orderStrip(mountain);
  paintPips(parts.pips, strip.pips);
  // Planning has no name or step: its line takes both rows, beside the pips (#708).
  setAttr(parts.root, "data-order", strip.kind);
  hide(parts.top, strip.kind === "planning");
  if (strip.kind === "planning") {
    write(parts.name, "");
    write(parts.step, "");
    write(parts.line, strip.line);
    return;
  }
  write(parts.name, strip.name);
  write(parts.step, strip.step);
  write(
    parts.line,
    `Requires ${strip.requires.map((need) => need.line).join(" · ")}`,
  );
}

/** A stockpile in the top row: its count, and once the stockyard opens its room and bar (#671). */
type PileParts = {
  readonly root: HTMLElement;
  readonly count: HTMLElement;
  readonly room: HTMLElement;
  readonly bar: HTMLElement;
};

function buildPile(url: string, countClass: string): PileParts {
  const root = el("div", "frame-pile");
  const count = el("span", `${countClass} board-num`);
  const room = el("span", "frame-pile-room");
  const words = el("span", "frame-pile-words");
  words.append(count, room);
  const bar = el("i", "frame-pile-bar");
  root.append(icon(url, "frame-icon"), words, bar);
  return { root, count, room, bar };
}

function paintPile(parts: PileParts, pile: Stockpile | undefined): void {
  hide(parts.root, pile === undefined);
  if (pile === undefined) {
    return;
  }
  write(parts.count, pile.text);
  write(parts.room, pile.full === true ? "full" : (pile.room ?? ""));
  hide(parts.room, pile.room === undefined);
  mark(parts.root, "full", pile.full === true);
  hide(parts.bar, pile.fill === undefined);
  parts.bar.style.width = `${String(Math.round((pile.fill ?? 0) * 1000) / 10)}%`;
}

type TopParts = {
  readonly root: HTMLElement;
  readonly stones: HTMLElement;
  readonly stonePile: PileParts;
  readonly brickPile: PileParts;
  readonly workers: HTMLButtonElement;
  readonly count: HTMLElement;
  readonly free: HTMLElement;
  readonly lamp: HTMLElement;
  readonly hire: HTMLButtonElement;
  readonly hireFace: HTMLElement;
  readonly hirePrice: HTMLElement;
};

function buildTop(state: FrameState): TopParts {
  const root = el("div", "frame-top");
  const stonePile = buildPile(stoneUrl, "frame-pile-count");
  stonePile.root.dataset["good"] = "stones";
  const brickPile = buildPile(brickUrl, "frame-pile-num");
  brickPile.root.dataset["good"] = "brick";
  const stones = stonePile.count;
  const workers = el("button", "frame-workers");
  workers.type = "button";
  workers.setAttribute("aria-label", "The workforce");
  const count = el("span", "frame-workers-count board-num");
  const free = el("span", "frame-workers-free");
  const lamp = el("i", "frame-lamp");
  workers.append(icon(workerUrl, "frame-icon"), count, free, lamp);
  workers.addEventListener("click", state.openWorkforce);
  const hire = el("button", "frame-hire");
  hire.type = "button";
  const hireFace = el("span", "frame-hire-face");
  const hirePrice = el("span", "frame-hire-price board-num");
  hire.append(hireFace, hirePrice);
  hire.addEventListener("click", () => {
    const key = hireKey(state.mountain(), state.amount());
    void state.progress.dispatch(tierBuyMove("helper", key.count));
  });
  root.append(stonePile.root, brickPile.root, workers, hire);
  return {
    root,
    stones,
    stonePile,
    brickPile,
    workers,
    count,
    free,
    lamp,
    hire,
    hireFace,
    hirePrice,
  };
}

function paintTop(
  parts: TopParts,
  mountain: Mountain,
  amount: BuyAmount,
): void {
  const piles = stockpiles(mountain);
  const stone = piles.find((pile) => pile.good === "stones");
  paintPile(parts.stonePile, stone);
  paintPile(
    parts.brickPile,
    piles.find((pile) => pile.good === "brick"),
  );
  mark(parts.root, "two-piles", piles.length > 1);
  // The exact count, as the odometer carried it, for the journeys (#664).
  setAttr(parts.stones, "data-count", String(mountain.stock.stones));
  const workers = workersView(mountain);
  write(parts.count, String(workers.owned));
  write(parts.free, `${String(workers.free)} free`);
  mark(parts.free, "has-free", workers.free > 0);
  setAttr(parts.lamp, "data-lamp", workers.lamp ? "green" : "dark");
  const key = hireKey(mountain, amount);
  write(parts.hireFace, key.face);
  write(parts.hirePrice, key.price);
  mark(parts.hire, "can", key.can);
  parts.hire.setAttribute(
    "aria-label",
    `Hire ${key.count === 1 ? "a worker" : `${String(key.count)} workers`} for ${key.price} stone`,
  );
}

type NextParts = {
  readonly root: HTMLButtonElement;
  readonly head: HTMLElement;
  readonly line: HTMLElement;
  readonly ready: HTMLElement;
};

/**
 * Where a tap on Next goes: the city for an order, else the next other site
 * with something, else the workforce, else this site. The count of workers
 * opens the workforce on every site too.
 */
function nextTarget(
  mountain: Mountain,
  here: SiteId,
): SiteId | "workforce" | undefined {
  const view = nextView(mountain);
  if (view.kind === "order") {
    return "city";
  }
  if (view.kind === "nothing") {
    return undefined;
  }
  // The other sites first, from the one after this, then the workforce,
  // then this site: a tap always moves him, unless only here has something.
  const at = SITES.indexOf(here);
  const order = [
    ...SITES.slice(at + 1),
    ...SITES.slice(0, at),
    "workforce" as const,
    here,
  ];
  return order.find((where) =>
    view.counts.some((entry) => entry.where === where),
  );
}

function buildNext(state: FrameState): NextParts {
  const root = el("button", "frame-next");
  root.type = "button";
  const what = el("span", "frame-next-what");
  const head = el("span", "frame-next-head");
  const line = el("span", "frame-next-line");
  what.append(head, line);
  const count = el("span", "frame-next-count");
  const ready = el("b", "board-num");
  count.append(ready, "ready");
  root.append(what, count);
  root.addEventListener("click", () => {
    const target = nextTarget(state.mountain(), state.site());
    if (target === "workforce") {
      state.openWorkforce();
    } else if (target !== undefined) {
      state.go(target);
    }
  });
  return { root, head, line, ready };
}

function paintNext(parts: NextParts, mountain: Mountain): void {
  const view = nextView(mountain);
  write(parts.head, view.kind === "nothing" ? view.line : view.head);
  write(parts.line, view.kind === "nothing" ? view.then : view.line);
  write(parts.ready, String(view.ready));
  mark(parts.root, "go", view.ready > 0);
  setAttr(parts.root, "data-next", view.kind);
}

type SiteBar = {
  readonly root: HTMLElement;
  readonly tabs: Readonly<Record<SiteId, HTMLButtonElement>>;
  readonly lamps: Readonly<Record<SiteId, HTMLElement>>;
};

function buildSiteBar(state: FrameState): SiteBar {
  const root = el("nav", "frame-sites");
  root.setAttribute("aria-label", "Sites");
  const tabs = {} as Record<SiteId, HTMLButtonElement>;
  const lamps = {} as Record<SiteId, HTMLElement>;
  for (const site of SITES) {
    const tab = el("button", "frame-site");
    tab.type = "button";
    tab.dataset["site"] = site;
    const lamp = el("i", "frame-lamp");
    tab.append(
      icon(SITE_ICONS[site], "frame-site-icon"),
      el("span", "frame-site-name", SITE_NAMES[site]),
      lamp,
    );
    tab.addEventListener("click", () => {
      state.go(site);
    });
    root.append(tab);
    tabs[site] = tab;
    lamps[site] = lamp;
  }
  return { root, tabs, lamps };
}

function paintSiteBar(bar: SiteBar, mountain: Mountain, here: SiteId): void {
  for (const site of SITES) {
    // A site joins the bar when its work opens (#671).
    hide(bar.tabs[site], !siteOpen(mountain, site));
    setAttr(bar.lamps[site], "data-lamp", siteLamp(mountain, site));
    mark(bar.tabs[site], "on", site === here);
    setAttr(bar.tabs[site], "aria-current", site === here ? "page" : undefined);
  }
}

export type FrameScreen = {
  /** Paints every part from the store's latest mountain. */
  readonly paint: () => void;
  readonly sheet: WorkforceSheet;
  readonly stageSheet: StageSheet;
};

/** The parts, built once, in the frame's order from top to bottom. */
function buildFrame(
  state: FrameState,
  now: () => number,
  key: HTMLButtonElement,
  signal: AbortSignal | undefined,
): {
  readonly root: HTMLElement;
  readonly scene: HTMLElement;
  readonly paint: (mountain: Mountain) => void;
} {
  const order = buildOrder(state);
  // The order, and the key to the Ledger at the strip's end (#708).
  const strip = el("div", "frame-strip");
  strip.append(order.root, key);
  const top = buildTop(state);
  const scene = el("div", "frame-scene");
  const mine = createMineSite(state, signal);
  const refinery = createRefinerySite(state, signal);
  const city = createCitySite(state, signal);
  scene.append(mine.root, refinery.root, city.root);
  const next = buildNext(state);
  const bar = buildSiteBar(state);
  const root = el("div", "frame");
  root.append(strip, top.root, scene, next.root, bar.root);
  return {
    root,
    scene,
    paint: (mountain) => {
      paintOrder(order, mountain);
      paintTop(top, mountain, state.amount());
      paintNext(next, mountain);
      paintSiteBar(bar, mountain, state.site());
      mine.paint(mountain, state.site() === "mine", now());
      refinery.paint(mountain, state.site() === "refinery", now());
      city.paint(mountain, state.site() === "city", now());
      setAttr(scene, "data-site", state.site());
      setAttr(scene, "aria-label", SITE_NAMES[state.site()]);
    },
  };
}

/**
 * Mounts the frame on `root` and keeps it painted: a store change, and a
 * tick a second, as today's board does.
 */
export function mountFrameScreen({
  root,
  auth,
  progress,
  storage,
  now = Date.now,
  signal,
}: {
  root: HTMLElement;
  auth: AuthController;
  progress: ProgressStore;
  /** Where the amount key is kept; localStorage when undefined. */
  storage?: DeviceStorage | undefined;
  now?: () => number;
  signal?: AbortSignal | undefined;
}): FrameScreen {
  let site: SiteId = "mine";
  const amount = deviceAmount(storage);
  let paint = (): void => undefined;
  const state: FrameState = {
    progress,
    mountain: () => progress.getSnapshot().mountain,
    amount: amount.amount,
    advanceAmount: () => {
      amount.advance();
      paint();
    },
    site: () => site,
    go: (next) => {
      site = next;
      paint();
    },
    openWorkforce: () => {
      sheet.open();
    },
    openStage: (stage) => {
      stageSheet.open(stage);
    },
  };
  // One board host for the Ledger and the save's cards: one settle (#707, #708).
  const board = createBoardHost({ clock: () => performance.now(), signal });
  const closeSheets = (): void => {
    sheet.close();
    stageSheet.close();
  };
  const ledger: FrameLedger = createFrameLedger({
    progress,
    auth,
    board,
    storage,
    now,
    overSave: () => saveLine.isOpen(),
    onOpen: closeSheets,
    requestPaint: () => {
      paint();
    },
    signal,
  });
  const frame = buildFrame(state, now, ledger.key, signal);
  const sheet = createWorkforceSheet(state, now);
  const stageSheet = createStageSheet(state, now);
  /** A card comes up: every sheet and the Ledger close under it. */
  const closeUnderCard = (): void => {
    closeSheets();
    ledger.close();
  };
  const cards = createFrameCards({
    progress,
    onShow: closeUnderCard,
    onStockyard: () => {
      state.go("refinery");
    },
  });
  const saveCards = createFrameSaveCards({
    progress,
    board,
    now,
    requestPaint: () => {
      paint();
    },
    onShow: closeUnderCard,
  });
  const saveLine = createSaveLine({
    progress,
    auth,
    getView: () => progress.getSnapshot(),
    now,
    signal,
  });
  const drawerClip = el("div", "board-drawer-clip");
  drawerClip.append(saveLine.drawer);
  root.classList.add("frame-app");
  root.replaceChildren(
    frame.root,
    sheet.root,
    stageSheet.root,
    cards.root,
    ...ledger.roots,
    ...saveCards.roots,
    drawerClip,
    saveLine.line,
  );
  paint = () => {
    const { mountain, ready } = progress.getSnapshot();
    // A site that is not open (the refinery, before the Light Tower) is never shown;
    // a save loaded from the cloud or a Saved copy can close the one in view.
    if (!siteOpen(mountain, site)) {
      site = "mine";
    }
    // Until a signed-in save is in, the store holds a new mine: its numbers
    // would say the mine is gone, so the frame shows none (#664).
    frame.root.toggleAttribute("data-loading", !ready);
    frame.paint(mountain);
    sheet.paint(mountain);
    stageSheet.paint(mountain);
    cards.paint();
    ledger.paint();
    saveCards.paint();
    saveLine.render();
  };
  paint();
  runFrame(progress, paint, signal);
  return { paint, sheet, stageSheet };
}

/**
 * A tick a second settles the workers' work, a store change repaints, and a
 * hidden or closed page saves at once (`saveOnLeave`).
 */
function runFrame(
  progress: ProgressStore,
  paint: () => void,
  signal: AbortSignal | undefined,
): void {
  const ticking = setInterval(() => {
    // A hidden tab's throttled timer would settle a night a minute at a
    // time, and its report would tell only the last minute (#663). The
    // return settles it whole (`saveOnLeave`).
    if (document.visibilityState === "hidden") {
      return;
    }
    progress.tick();
    paint();
  }, 1000);
  const unsubscribe = progress.subscribe(paint);
  signal?.addEventListener("abort", () => {
    clearInterval(ticking);
    unsubscribe();
  });
  saveOnLeave(progress, signal === undefined ? {} : { signal });
}
