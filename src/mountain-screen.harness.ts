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

export function setReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
  })) as unknown as typeof window.matchMedia;
}

let unmount = new AbortController();

/**
 * Each mounted screen ticks every second. Call this after each test, or the
 * leaked ticks pile up and slow every later test in the file.
 */
export function stopScreens(): void {
  unmount.abort();
  unmount = new AbortController();
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
  random,
  veinStorage = storage,
  tabWriter,
  signal = unmount.signal,
}: {
  auth?: AuthController;
  cloudSave?: CloudSave;
  storage?: Storage;
  veinStorage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
  tapClock?: () => number;
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
    veinStorage,
    lanternUrl: tileUrl,
    mountainUrl: tileUrl,
    stoneUrl: tileUrl,
    veinUrl: tileUrl,
    upgradesUrl: tileUrl,
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
  return {
    root,
    progress,
    dig: find(".board-window", HTMLButtonElement),
    authButton: find(".auth-action", HTMLButtonElement),
    text: (selector: string) => root.querySelector(selector)?.textContent,
    /** What the board's odometer reads, e.g. "Stones 41,380". */
    pocket: () => root.querySelector(".board-odo")?.getAttribute("aria-label"),
  };
}
