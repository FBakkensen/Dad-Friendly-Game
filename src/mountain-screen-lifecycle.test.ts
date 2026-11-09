// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuthController } from "./auth";
import { mountScreen, signedIn, stopScreens } from "./mountain-screen.harness";

/*
 * A mounted screen's life on the page. The app never unmounts; tests do, a hundred times a
 * file in one document. Whatever the screen hangs on the document or window must come off
 * when its signal aborts, or every screen a test file mounts stays in memory to the end.
 */

afterEach(stopScreens);

/** A listener the screen added to the document or window, and how often it has run. */
interface Heard {
  readonly on: "document" | "window";
  readonly type: string;
  /** The first frame outside this file: the line that added it. */
  readonly from: string;
  calls: number;
}

const firstSourceFrame = (stack: string | undefined): string =>
  (stack ?? "")
    .split("\n")
    .slice(1)
    .find((line) => !line.includes("mountain-screen-lifecycle"))
    ?.trim() ?? "unknown";

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
      const record: Heard = {
        on,
        type,
        from: firstSourceFrame(new Error("added").stack),
        calls: 0,
      };
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

/** Fires one plain event of every type the screen listens for, on the target it listens on. */
function firePage(heard: readonly Heard[]): void {
  const seen = new Set<string>();
  for (const { on, type } of heard) {
    if (seen.has(`${on} ${type}`)) continue;
    seen.add(`${on} ${type}`);
    (on === "document" ? document : window).dispatchEvent(new Event(type));
  }
}

describe("a mounted screen once its signal aborts", () => {
  it("leaves no listener on the document or window that still runs", () => {
    const page = hearPage();
    try {
      const stop = new AbortController();
      mountScreen({ signal: stop.signal });
      expect(page.heard.length).toBeGreaterThan(0);

      // While mounted, every listener the screen added hears its event.
      firePage(page.heard);
      expect(
        page.heard.filter(({ calls }) => calls === 0).map(({ from }) => from),
      ).toEqual([]);

      stop.abort();
      for (const record of page.heard) record.calls = 0;
      firePage(page.heard);

      expect(
        page.heard
          .filter(({ calls }) => calls > 0)
          .map(({ on, type, from }) => `${on} ${type} ${from}`),
      ).toEqual([]);
    } finally {
      page.stop();
    }
  });

  it("leaves no mutation observer watching", () => {
    // happy-dom keeps every observing MutationObserver on its window, as a browser keeps one on
    // a live node: an observer left watching keeps its whole screen.
    const watching = new Set<MutationObserver>();
    class CountedObserver extends MutationObserver {
      override observe(target: Node, options?: MutationObserverInit): void {
        watching.add(this);
        super.observe(target, options);
      }
      override disconnect(): void {
        watching.delete(this);
        super.disconnect();
      }
    }
    vi.stubGlobal("MutationObserver", CountedObserver);
    try {
      const stop = new AbortController();
      mountScreen({ signal: stop.signal });
      stop.abort();
      expect(watching.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("leaves only the store watching the account", () => {
    const auth = signedIn();
    /** Each auth watch still on, by the line that started it. */
    const watches = new Set<string>();
    const watched: AuthController = {
      ...auth,
      subscribe: (listener) => {
        const from = firstSourceFrame(new Error("watched").stack);
        watches.add(from);
        const unwatch = auth.subscribe(listener);
        return () => {
          watches.delete(from);
          unwatch();
        };
      },
    };
    const stop = new AbortController();
    mountScreen({ auth: watched, signal: stop.signal });
    stop.abort();

    // The store is made outside the screen and outlives it; its own watch stays.
    expect(
      [...watches].filter((from) => !from.includes("progress-store")),
    ).toEqual([]);
  });

  it("does not save or settle the store when the page hides or returns", () => {
    const stop = new AbortController();
    const { progress } = mountScreen({ auth: signedIn(), signal: stop.signal });
    stop.abort();
    const flush = vi.spyOn(progress, "flush");
    const resume = vi.spyOn(progress, "resume");
    const tick = vi.spyOn(progress, "tick");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));

    expect(flush).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
  });
});
