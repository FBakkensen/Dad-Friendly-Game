// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth, type AuthController } from "./auth";
import { createMemoryCloudSave } from "./cloud-save";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import { FRESH_OFF } from "./line-switch";
import { readPhoneBackup } from "./phone-backup";
import { createProgressStore, type ProgressStore } from "./progress-store";
import { createMemoryStorage } from "./test-fixtures";

/*
 * The frame's life on the page (#727 ports the board's lifecycle tests). A hidden or closed
 * page saves at once, and a return reads the server before it settles. The app never
 * unmounts; tests do, many times a file in one document. Whatever the frame hangs on the
 * document or window must come off when its signal aborts.
 */

const user = { uid: "test-dad", label: "Test Dad" };

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({ [FRESH_OFF]: 0 });
});

afterEach(() => {
  unmount.abort();
  unmount = new AbortController();
  holdFactors({});
  Reflect.deleteProperty(document, "visibilityState");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function mount({
  auth = createMemoryAuth({ state: { kind: "signed-in", user }, user }),
  signal = unmount.signal,
}: { auth?: AuthController; signal?: AbortSignal } = {}): {
  readonly progress: ProgressStore;
  readonly storage: Storage;
} {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const storage = createMemoryStorage();
  const progress = createProgressStore({
    auth,
    cloudSave: createMemoryCloudSave({ docs: new Map() }),
    sessionStorage: storage,
    cloudWriteGapMs: 0,
  });
  signal.addEventListener("abort", () => {
    progress.dispose();
  });
  mountFrameScreen({ root, auth, progress, storage, signal });
  return { progress, storage };
}

const showPage = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

/** A listener the frame added to the document or window, and how often it has run. */
interface Heard {
  readonly on: "document" | "window";
  readonly type: string;
  calls: number;
}

/**
 * Counts every run of every listener added to the document or window, from now to the
 * returned stop. A listener taken off with removeEventListener comes off as usual.
 */
function hearPage(): { readonly heard: Heard[]; readonly stop: () => void } {
  const heard: Heard[] = [];
  const targets: readonly (readonly [Heard["on"], EventTarget])[] = [
    ["document", document],
    ["window", window],
  ];
  const restores = targets.map(([on, target]) => {
    const own = (["addEventListener", "removeEventListener"] as const).map(
      (name) => [name, Object.getOwnPropertyDescriptor(target, name)] as const,
    );
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const wrappers = new Map<
      EventListenerOrEventListenerObject,
      EventListener
    >();
    target.addEventListener = (type, listener, options) => {
      if (listener === null) {
        add(type, listener, options);
        return;
      }
      const record: Heard = { on, type, calls: 0 };
      heard.push(record);
      const wrapper: EventListener = (event) => {
        record.calls += 1;
        if (typeof listener === "function") {
          listener.call(target, event);
        } else {
          listener.handleEvent(event);
        }
      };
      wrappers.set(listener, wrapper);
      add(type, wrapper, options);
    };
    target.removeEventListener = (type, listener, options) => {
      remove(
        type,
        listener === null ? null : (wrappers.get(listener) ?? listener),
        options,
      );
    };
    return () => {
      for (const [name, descriptor] of own) {
        if (descriptor === undefined) {
          Reflect.deleteProperty(target, name);
        } else {
          Object.defineProperty(target, name, descriptor);
        }
      }
    };
  });
  return {
    heard,
    stop: () => {
      for (const restore of restores) restore();
    },
  };
}

/** Fires one plain event of every type the frame listens for, on the target it listens on. */
function firePage(heard: readonly Heard[]): void {
  const seen = new Set<string>();
  for (const { on, type } of heard) {
    if (seen.has(`${on} ${type}`)) continue;
    seen.add(`${on} ${type}`);
    (on === "document" ? document : window).dispatchEvent(new Event(type));
  }
}

describe("the frame saves when the page goes", () => {
  it("a hidden page writes the phone's backup at once", async () => {
    const { progress, storage } = mount();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 4_321 },
    }));
    // Wipe the copy the change wrote, so only the hide can write it again.
    storage.clear();
    const flush = vi.spyOn(progress, "flush");
    showPage("hidden");
    expect(flush).toHaveBeenCalledTimes(1);
    const backup = readPhoneBackup({ storage, uid: user.uid });
    expect(backup.kind === "present" && backup.save.mountain.stock.stones).toBe(
      4_321,
    );
  });

  it("a closed page (pagehide) saves at once", () => {
    const { progress } = mount();
    const flush = vi.spyOn(progress, "flush");
    window.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("a return settles only once the server has been read", async () => {
    const { progress } = mount();
    let read: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      read = resolve;
    });
    vi.spyOn(progress, "resume").mockReturnValue({ kind: "reading", done });
    const tick = vi.spyOn(progress, "tick");
    showPage("visible");
    // No tap lands on top of another device's save: nothing settles before the read.
    expect(tick).not.toHaveBeenCalled();
    read();
    await done;
    await Promise.resolve();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("a guest's return settles at once", () => {
    const { progress } = mount();
    vi.spyOn(progress, "resume").mockReturnValue({ kind: "idle" });
    const tick = vi.spyOn(progress, "tick");
    showPage("visible");
    expect(tick).toHaveBeenCalledTimes(1);
  });
});

describe("a mounted frame once its signal aborts", () => {
  it("leaves no listener on the document or window that still runs", () => {
    const page = hearPage();
    try {
      const stop = new AbortController();
      mount({ signal: stop.signal });
      expect(page.heard.length).toBeGreaterThan(0);

      // While mounted, every listener the frame added hears its event.
      firePage(page.heard);
      expect(
        page.heard
          .filter(({ calls }) => calls === 0)
          .map(({ on, type }) => `${on} ${type}`),
      ).toEqual([]);

      stop.abort();
      for (const record of page.heard) record.calls = 0;
      firePage(page.heard);

      expect(
        page.heard
          .filter(({ calls }) => calls > 0)
          .map(({ on, type }) => `${on} ${type}`),
      ).toEqual([]);
    } finally {
      page.stop();
    }
  });

  it("does not save or settle the store when the page hides or returns", () => {
    // The store is made outside the frame and outlives it, as in the app.
    const auth = createMemoryAuth({ state: { kind: "signed-in", user }, user });
    const progress = createProgressStore({
      auth,
      cloudSave: createMemoryCloudSave({ docs: new Map() }),
      sessionStorage: createMemoryStorage(),
      cloudWriteGapMs: 0,
    });
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const stop = new AbortController();
    mountFrameScreen({
      root,
      auth,
      progress,
      storage: createMemoryStorage(),
      signal: stop.signal,
    });
    stop.abort();
    const flush = vi.spyOn(progress, "flush");
    const resume = vi.spyOn(progress, "resume");
    const tick = vi.spyOn(progress, "tick");

    showPage("hidden");
    showPage("visible");
    window.dispatchEvent(new Event("pagehide"));

    expect(flush).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
    progress.dispose();
  });
});
