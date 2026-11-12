import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  HELD_TAP_START,
  SAVE_KEY,
  chromePath,
  clockPatches,
  holdThrough,
  openPair,
  press,
  seedScript,
  startServer,
  stepTapClock,
} from "./harness.ts";
import { SESSION_SAVE_KEY } from "../../src/session-save";

describe("chromePath", () => {
  it("prefers CHROME_PATH over any installed Chrome", () => {
    expect(chromePath({ CHROME_PATH: "/opt/chrome" }, () => true)).toBe(
      "/opt/chrome",
    );
  });

  it("takes the first google-chrome that exists", () => {
    const only = (p: string): boolean => p === "/usr/local/bin/google-chrome";
    expect(chromePath({}, only)).toBe("/usr/local/bin/google-chrome");
    expect(chromePath({}, () => true)).toBe("/usr/bin/google-chrome");
  });

  it("falls back to /usr/bin/google-chrome when none exists", () => {
    expect(chromePath({}, () => false)).toBe("/usr/bin/google-chrome");
  });
});

describe("startServer", () => {
  it("starts nothing for a given url, and its close does nothing", async () => {
    const start = vi.fn();
    const server = await startServer(
      { port: 4175, url: "http://example.test/" },
      start,
    );
    expect(server.base).toBe("http://example.test/");
    await server.close();
    expect(start).not.toHaveBeenCalled();
  });

  it("starts Vite on the port when no url is given, and closes it", async () => {
    const close = vi.fn(() => Promise.resolve());
    const start = vi.fn(() =>
      Promise.resolve({ base: "http://127.0.0.1:4175/", close }),
    );
    const server = await startServer({ port: 4175, url: undefined }, start);
    expect(start).toHaveBeenCalledWith(4175);
    expect(server.base).toBe("http://127.0.0.1:4175/");
    await server.close();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("seedScript", () => {
  const json = '{"a":"it\'s"}';
  const run = (
    src: string,
    ls: Map<string, string>,
    ss: Map<string, string>,
  ) => {
    const store = (m: Map<string, string>) => ({
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    });
    runInNewContext(src, {
      localStorage: store(ls),
      sessionStorage: store(ss),
    });
  };

  it("uses the key the game saves under", () => {
    expect(SAVE_KEY).toBe(SESSION_SAVE_KEY);
  });

  it("once writes only while its guard is unset", () => {
    const src = seedScript({ kind: "once", guard: "g", json }, "k") ?? "";
    const ls = new Map<string, string>();
    const ss = new Map<string, string>();
    run(src, ls, ss);
    expect(ls.get("k")).toBe(json);
    expect(ss.get("g")).toBe("1");
    ls.set("k", "changed");
    run(src, ls, ss);
    expect(ls.get("k")).toBe("changed");
  });

  it("everyLoad writes on every run", () => {
    const src = seedScript({ kind: "everyLoad", json }, "k") ?? "";
    const ls = new Map<string, string>();
    run(src, ls, new Map());
    ls.set("k", "changed");
    run(src, ls, new Map());
    expect(ls.get("k")).toBe(json);
  });

  it("remove deletes the key", () => {
    const ls = new Map([["k", "v"]]);
    run(seedScript({ kind: "remove" }, "k") ?? "", ls, new Map());
    expect(ls.has("k")).toBe(false);
  });

  it("none installs nothing", () => {
    expect(seedScript({ kind: "none" }, "k")).toBeUndefined();
  });
});

describe("clockPatches", () => {
  it("maps each clock to today's patches in install order", () => {
    expect(clockPatches({ date: "real", tap: "real" })).toEqual([]);
    expect(clockPatches({ date: "skewable", tap: "real" })).toEqual(["skew"]);
    expect(clockPatches({ date: "stopped", tap: "held" })).toEqual([
      "skew",
      "stop",
      "tap",
    ]);
    expect(clockPatches({ date: "real", tap: "held" })).toEqual(["tap"]);
  });
});

describe("held tap clock and the pair", () => {
  it("starts far past any event stamp", () => {
    expect(HELD_TAP_START).toBe(1e9);
  });

  it("stepTapClock moves the page's __tapNow by the step", async () => {
    const g = { __tapNow: 5 };
    const page = {
      evaluate: (fn: (by: number) => void, by: number) => {
        const saved = (globalThis as Record<string, unknown>)["__tapNow"];
        (globalThis as Record<string, unknown>)["__tapNow"] = g.__tapNow;
        fn(by);
        g.__tapNow = (globalThis as Record<string, unknown>)[
          "__tapNow"
        ] as number;
        (globalThis as Record<string, unknown>)["__tapNow"] = saved;
        return Promise.resolve();
      },
    };
    await stepTapClock(page as never, 500);
    expect(g.__tapNow).toBe(505);
  });

  it("openPair prepares two pages in one context, then loads them in turn", async () => {
    const calls: string[] = [];
    const fakePage = (name: string) => ({
      on: vi.fn(),
      setViewport: vi.fn(() => Promise.resolve()),
      evaluateOnNewDocument: vi.fn(() => Promise.resolve()),
      goto: vi.fn((url: string) => {
        calls.push(`${name} ${url}`);
        return Promise.resolve();
      }),
    });
    const pages = [fakePage("first"), fakePage("second")];
    const context = {
      newPage: vi.fn(() => Promise.resolve(pages.shift())),
      close: vi.fn(() => Promise.resolve()),
    };
    const browser = { createBrowserContext: () => Promise.resolve(context) };
    const pair = await openPair(browser as never, "http://x.test/", {
      viewport: { width: 424, height: 924 },
      seed: { kind: "everyLoad", json: "{}" },
      clock: { date: "real", tap: "real" },
      onPageError: () => undefined,
    });
    expect(context.newPage).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["first http://x.test/", "second http://x.test/"]);
    await pair.close();
    expect(context.close).toHaveBeenCalled();
  });
});

describe("press and holdThrough", () => {
  const fakePage = (held: boolean) => {
    const calls: string[] = [];
    const page = {
      tap: vi.fn((selector: string) => {
        calls.push(`tap ${selector}`);
        return Promise.resolve();
      }),
      $eval: vi.fn(() => Promise.resolve({ x: 10, y: 20 })),
      waitForFunction: vi.fn(
        (_done: unknown, options: { timeout: number }, selector: string) => {
          calls.push(`wait ${selector} ${String(options.timeout)}`);
          return held ? Promise.resolve() : Promise.reject(new Error("t/o"));
        },
      ),
      touchscreen: {
        touchStart: vi.fn((x: number, y: number) => {
          calls.push(`touchStart ${String(x)},${String(y)}`);
          return Promise.resolve();
        }),
        touchEnd: vi.fn(() => {
          calls.push("touchEnd");
          return Promise.resolve();
        }),
      },
    };
    return { page, calls };
  };

  it("press taps", async () => {
    const phone = fakePage(true);
    await press(phone.page as never, ".a");
    expect(phone.calls).toEqual(["tap .a"]);
  });

  it("holdThrough holds a finger until done, then lifts", async () => {
    const { page, calls } = fakePage(true);
    const held = await holdThrough(page as never, ".k", () => true);
    expect(held).toBe(true);
    expect(calls).toEqual(["touchStart 10,20", "wait .k 3000", "touchEnd"]);
  });

  it("holdThrough lifts the finger after a timeout", async () => {
    const { page, calls } = fakePage(false);
    const held = await holdThrough(page as never, ".k", () => true);
    expect(held).toBe(false);
    expect(calls).toEqual(["touchStart 10,20", "wait .k 3000", "touchEnd"]);
  });
});
