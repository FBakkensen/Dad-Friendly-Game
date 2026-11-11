/**
 * Shared by the mountain-screen test files (split for parallel workers):
 * mount a screen on in-memory storage and art, and stop it afterwards.
 */
import {
  createMemoryAuth,
  createUnconfiguredAuth,
  type AuthController,
} from "./auth";
import { type CloudSave } from "./cloud-save";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { type TabWriter } from "./tab-writer";
import { vi } from "vitest";

export function setReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
  })) as unknown as typeof window.matchMedia;
}

let unmount = new AbortController();

/** The real timer, taken before any test fakes the clock. */
const nextTask = globalThis.setTimeout;

/**
 * Each mounted screen ticks every second and listens to the page. Call this after each test,
 * or the screens pile up and every later test in the file runs slower and in more memory.
 * It waits one task after the abort: V8 keeps whatever a WeakRef was made for (happy-dom's
 * query caches make many) alive to the end of the task, and a test file's tests otherwise run
 * as one long task.
 * Then it puts back every vi.spyOn, so a spy on a store never holds a stopped screen.
 */
export async function stopScreens(): Promise<void> {
  unmount.abort();
  unmount = new AbortController();
  await new Promise((resolve) => {
    nextTask(resolve, 0);
  });
  vi.restoreAllMocks();
}

export const tileUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

export const signedIn = (): AuthController => {
  const user = { uid: "test-dad", label: "Test Dad" };
  return createMemoryAuth({ state: { kind: "signed-in", user }, user });
};

export function mountScreen({
  auth = createUnconfiguredAuth(),
  cloudSave,
  storage = createMemoryStorage(),
  now,
  tapClock,
  pressAge = () => 0,
  random,
  deviceStorage = storage,
  tabWriter,
  signal = unmount.signal,
}: {
  auth?: AuthController;
  cloudSave?: CloudSave;
  storage?: Storage;
  deviceStorage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
  tapClock?: () => number;
  /** Tests run on fake clocks whose stamps do not line up with an event's: 0 unless set. */
  pressAge?: (event: Event) => number;
  random?: () => number;
  tabWriter?: TabWriter;
  signal?: AbortSignal;
} = {}) {
  const root = document.createElement("div");
  const progress = createProgressStore({
    auth,
    sessionStorage: storage,
    cloudWriteGapMs: 0,
    ...(cloudSave === undefined ? {} : { cloudSave }),
    ...(now === undefined ? {} : { now }),
    ...(tabWriter === undefined ? {} : { tabWriter }),
  });
  mountMountainScreen({
    root,
    deviceStorage,
    veinUrl: tileUrl,
    tierArt: {
      helper: "helper.png",
      cart: "cart.png",
      drill: "drill.png",
      borer: "borer.png",
      machine: "machine.png",
      kid: "kid.png",
    },
    relicArt: {
      lantern: "lantern.png",
      shield: "shield.png",
      hammer: "hammer.png",
      heart: "heart.png",
      crown: "crown.png",
      mantle: "mantle.png",
    },
    auth,
    progress,
    ...(now === undefined ? {} : { now }),
    ...(tapClock === undefined ? {} : { tapClock }),
    pressAge,
    ...(random === undefined ? {} : { random }),
    signal,
  });
  const find = <T extends Element>(selector: string, type: new () => T): T => {
    const el = root.querySelector(selector);
    if (!(el instanceof type)) {
      throw new Error(`${selector} did not render`);
    }
    return el;
  };
  /** A keyboard click: never early, so it acts through the drawer's settle. */
  const keyClick = (selector: string): void => {
    find(selector, HTMLButtonElement).click();
  };
  return {
    root,
    progress,
    dig: find(".board-window", HTMLButtonElement),
    /** The Ledger's account row: sign in or out. */
    account: find(".ledger-account", HTMLButtonElement),
    /** Opens the Ledger drawer from its key. */
    openLedger: () => {
      keyClick(".board-key[data-key=ledger]");
    },
    /** Starts over from the Ledger: its Start over plate, then Yes on its page. */
    startOver: () => {
      keyClick(".board-key[data-key=ledger]");
      keyClick(".ledger-start-over");
      keyClick(".ledger-yes");
    },
    /** Opens the Engineers drawer from its key. */
    openEngineers: () => {
      keyClick(".board-key[data-key=engineers]");
    },
    /** Opens the Engineers drawer, then her page from her row (a keyboard click). */
    openEngineer: (name: string) => {
      if (root.querySelector(`${ENGINEERS_SHEET}.is-open`) === null) {
        keyClick(".board-key[data-key=engineers]");
      }
      keyClick(`${ENGINEERS_SHEET} .engineer-row[data-engineer="${name}"]`);
    },
    /** The Engineers drawer's page shown now, or undefined on the list or while shut. */
    engineersPage: () => engineersPage(root),
    text: (selector: string) => root.querySelector(selector)?.textContent,
    /** What the board's odometer reads, e.g. "Stones 41,380". */
    pocket: () => root.querySelector(".board-odo")?.getAttribute("aria-label"),
  };
}

/** The Ledger drawer's rows (#375), as the screen tests read them. */
export const STONES_ROW = ".ledger-stones";
export const STONES_NAME = ".ledger-stones .board-row-name";
export const STONES_INFO = ".ledger-stones .board-row-info";
export const RELICS_GOAL = ".ledger-relics .board-row-info";
export const RELICS_HINT = ".ledger-relics .board-row-why";
export const RELICS_BAR = ".ledger-relics .board-row-bar";
export const ACCOUNT_INFO = ".ledger-account .board-row-info";
export const LEDGER_SHEET = ".board-sheet[data-sheet=ledger]";

/** The Engineers drawer (#455), as the screen tests read it. */
export const ENGINEERS_SHEET = ".board-sheet[data-sheet=engineers]";
/** Its kick: the resting line, or a cheer standing in it. */
export const ENGINEERS_KICK = `${ENGINEERS_SHEET} .board-sheet-kick`;

/** The Engineers drawer is open. */
export function engineersOpen(root: HTMLElement): boolean {
  return (
    root.querySelector(ENGINEERS_SHEET)?.classList.contains("is-open") === true
  );
}

/** The Engineers drawer's shown page, while it is open on one; else undefined. */
function engineersPage(root: HTMLElement): HTMLElement | undefined {
  if (!engineersOpen(root)) {
    return undefined;
  }
  return (
    root.querySelector<HTMLElement>(
      `${ENGINEERS_SHEET} .board-sheet-page:not([hidden]) > .board-page`,
    ) ?? undefined
  );
}

/** The relics drawer (#465) and its three pages, as the screen tests read them. */
export const RELICS_SHEET = ".board-sheet[data-sheet=relics]";
export const REVEAL_PAGE = ".relic-reveal-page";
export const DETAIL_PAGE = ".relic-detail-page";
export const LEGEND_PAGE = ".relic-legend-page";
/** The shelf's rows, in the relics' order. */
export const SHELF_ROWS = `${RELICS_SHEET} .relic-row`;

/** The relics drawer is open on its shelf, with no page over the list. */
export function shelfShown(root: HTMLElement): boolean {
  const sheet = root.querySelector(RELICS_SHEET);
  return (
    sheet?.classList.contains("is-open") === true &&
    sheet.querySelector(".board-sheet-list")?.hasAttribute("hidden") === false
  );
}

/** The page `page` names, while the relics drawer is open on it; else null. */
export function relicPage(root: HTMLElement, page: string): HTMLElement | null {
  const sheet = root.querySelector(RELICS_SHEET);
  if (sheet?.classList.contains("is-open") !== true) {
    return null;
  }
  return sheet.querySelector<HTMLElement>(
    `.board-sheet-page:not([hidden]) > ${page}`,
  );
}

/**
 * Puts away the relic reveals and layer cards a jump in depth opened, as a dad's Carry on and
 * Dig in would: they open by themselves, and a card that opens itself closes any drawer.
 */
export function closeArrivals(root: HTMLElement): void {
  for (let i = 0; i < 20; i += 1) {
    const go = root.querySelector<HTMLButtonElement>(
      ".board-sheet[data-sheet=relics].is-open .board-sheet-page:not([hidden]) .relic-page-carry, .layer-arrival:not([hidden]) .layer-dig",
    );
    if (go === null) return;
    go.click();
  }
}
