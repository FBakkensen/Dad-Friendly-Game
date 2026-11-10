import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import type { Browser, BrowserContext, Page, Viewport } from "puppeteer-core";

const CHROME_DEFAULT = "/usr/bin/google-chrome";
const CHROME_CANDIDATES = [CHROME_DEFAULT, "/usr/local/bin/google-chrome"];

/** CHROME_PATH, else the first google-chrome that exists, else /usr/bin/google-chrome. */
export function chromePath(
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = existsSync,
): string {
  return env["CHROME_PATH"] ?? CHROME_CANDIDATES.find(exists) ?? CHROME_DEFAULT;
}

export function launchChrome(
  options: { readonly args?: readonly string[] } = {},
): Promise<Browser> {
  return puppeteer.launch({
    executablePath: chromePath(),
    args: [...(options.args ?? ["--no-sandbox"])],
  });
}

export interface RunningServer {
  readonly base: string;
  close(): Promise<void>;
}

/** Starts Vite on `port`, the way every browser script did before the harness. */
async function startVite(port: number): Promise<RunningServer> {
  const { createServer } = await import("vite");
  const dev = await createServer({
    server: { host: "127.0.0.1", port, strictPort: false },
    logLevel: "error",
  }).then((started) => started.listen());
  return {
    base: dev.resolvedUrls?.local[0] ?? `http://127.0.0.1:${String(port)}/`,
    close: () => dev.close(),
  };
}

/** Starts Vite on `port` unless `url` is given; `close()` is a no-op when it did not start one. */
export async function startServer(
  options: { readonly port: number; readonly url: string | undefined },
  start: (port: number) => Promise<RunningServer> = startVite,
): Promise<RunningServer> {
  if (options.url !== undefined) {
    return { base: options.url, close: () => Promise.resolve() };
  }
  return start(options.port);
}

/** A bare page in its own context, for callers that drive navigation themselves (mockups). */
export async function newWindow(
  browser: Browser,
  viewport: Viewport,
): Promise<{ page: Page; close(): Promise<void> }> {
  // Its own context, so its own window: a background tab in a shared
  // window gets no animation frames, and the frame-polled waits stall.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  return { page, close: () => context.close() };
}

/** The localStorage key the game keeps its save under (scripts/fixtures.mjs SAVE_KEY). */
export const SAVE_KEY = "dad-friendly-session";

/** How a page's save is put in localStorage before the game boots. */
export type SeedMode =
  | { readonly kind: "once"; readonly guard: string; readonly json: string }
  | { readonly kind: "everyLoad"; readonly json: string }
  | { readonly kind: "remove" }
  | { readonly kind: "none" };

/** Which clocks a page runs on: Date.now, and the board's tap clock (performance.now). */
export interface PageClock {
  readonly date: "real" | "skewable" | "stopped";
  readonly tap: "real" | "held";
}

/** Where a held tap clock starts: far past any event's stamp, which counts from the page's load. */
export const HELD_TAP_START = 1_000_000_000;

export interface OpenOptions {
  readonly viewport: Viewport;
  readonly seed: SeedMode;
  readonly clock: PageClock;
  readonly search?: string;
  readonly waitUntil?: "networkidle0" | "domcontentloaded";
  readonly onPageError: (error: Error) => void;
  /** Runs after the init scripts and before the load: visual's standalone insets, reducedMotion, boardProbe. */
  readonly beforeLoad?: (page: Page) => Promise<void>;
}

/** The init script each seed mode installs; pure, so it can be unit tested. */
export function seedScript(seed: SeedMode, key: string): string | undefined {
  const k = JSON.stringify(key);
  switch (seed.kind) {
    case "once": {
      const guard = JSON.stringify(seed.guard);
      return `if (sessionStorage.getItem(${guard}) === null) { sessionStorage.setItem(${guard}, "1"); localStorage.setItem(${k}, ${JSON.stringify(seed.json)}); }`;
    }
    case "everyLoad":
      return `localStorage.setItem(${k}, ${JSON.stringify(seed.json)});`;
    case "remove":
      return `localStorage.removeItem(${k});`;
    case "none":
      return undefined;
  }
}

/** The clock patches a PageClock installs, in install order. */
export function clockPatches(
  clock: PageClock,
): readonly ("skew" | "stop" | "tap")[] {
  return [
    ...(clock.date === "real" ? [] : (["skew"] as const)),
    ...(clock.date === "stopped" ? (["stop"] as const) : []),
    ...(clock.tap === "held" ? (["tap"] as const) : []),
  ];
}

/** Moves a held tap clock on by `ms`, as if that long had passed for the board's model. */
export async function stepTapClock(page: Page, ms: number): Promise<void> {
  await page.evaluate((by) => {
    (globalThis as unknown as { __tapNow: number }).__tapNow += by;
  }, ms);
}

interface ClockGlobals {
  __skewMs: number;
  __tapNow: number;
}

async function installClock(page: Page, clock: PageClock): Promise<void> {
  for (const patch of clockPatches(clock)) {
    if (patch === "skew") {
      // A clock the check can push forward, for veins and other timed things.
      await page.evaluateOnNewDocument(() => {
        const realNow = Date.now.bind(Date);
        const g = globalThis as unknown as ClockGlobals;
        g.__skewMs = 0;
        Date.now = () => realNow() + g.__skewMs;
      });
    } else if (patch === "stop") {
      // A crew of thousands digs millions a second. With the clock stopped it
      // cannot reach a relic mid-check, so no reveal lands on a tap.
      await page.evaluateOnNewDocument(() => {
        const stopped = Date.now();
        Date.now = () => stopped;
      });
    } else {
      // The board's tap clock stands still until the check steps it (stepTapClock), so the
      // drawer's settle and the Done hold end when the check says, never by load. It starts far
      // past any event's stamp: every press is too old to trust and is judged when it is handled.
      await page.evaluateOnNewDocument((start) => {
        const g = globalThis as unknown as ClockGlobals;
        g.__tapNow = start;
        globalThis.performance.now = () => g.__tapNow;
      }, HELD_TAP_START);
    }
  }
}

/** Everything a page gets before it loads, in the order the scripts always did it. */
async function prepare(page: Page, options: OpenOptions): Promise<void> {
  page.on("pageerror", (error) => {
    options.onPageError(error as Error);
  });
  await page.setViewport(options.viewport);
  await installClock(page, options.clock);
  const seed = seedScript(options.seed, SAVE_KEY);
  if (seed !== undefined) {
    await page.evaluateOnNewDocument(seed);
  }
  await options.beforeLoad?.(page);
}

async function load(
  page: Page,
  base: string,
  options: OpenOptions,
): Promise<void> {
  await page.goto(new URL(options.search ?? "", base).href, {
    waitUntil: options.waitUntil ?? "networkidle0",
  });
}

/** A fresh context with one prepared page, loaded on `base`. */
export async function open(
  browser: Browser,
  base: string,
  options: OpenOptions,
): Promise<{ page: Page; context: BrowserContext; close(): Promise<void> }> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await prepare(page, options);
  await load(page, base, options);
  return { page, context, close: () => context.close() };
}

/** One context with two pages, loaded one after the other: the second shows the other-tab card. */
export async function openPair(
  browser: Browser,
  base: string,
  options: OpenOptions,
): Promise<{
  pages: readonly [Page, Page];
  context: BrowserContext;
  close(): Promise<void>;
}> {
  const context = await browser.createBrowserContext();
  const first = await context.newPage();
  const second = await context.newPage();
  for (const page of [first, second]) {
    await prepare(page, options);
  }
  await load(first, base, options);
  await load(second, base, options);
  return { pages: [first, second], context, close: () => context.close() };
}
