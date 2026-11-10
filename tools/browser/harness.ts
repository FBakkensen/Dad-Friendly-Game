import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import type { Browser, Page, Viewport } from "puppeteer-core";

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
