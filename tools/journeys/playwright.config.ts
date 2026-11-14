/**
 * Gameplay journeys (#552): Playwright Test drives a phone-sized Chrome through stored player
 * journeys (`*.journey.ts`), read against the game's own rules. `npm run journeys`, and the
 * full gate's `journeys` step. The visual check and `npm run play` stay on puppeteer-core.
 *
 * It runs the Chrome the other browser checks use (CHROME_PATH, else google-chrome), so it
 * downloads no browser, in the cloud container or on GitHub's runner.
 */
import { defineConfig } from "@playwright/test";
import { chromePath } from "../browser/harness.ts";

/** Away from the other scripts' Vite ports (4174, and 4175 upward when that one is taken). */
const PORT = 4186;
const BASE = `http://127.0.0.1:${String(PORT)}/`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.journey.ts",
  // A failure keeps its trace here (git-ignored): npx playwright show-trace <it>/trace.zip
  outputDir: "../../.gate/journeys",
  forbidOnly: process.env["CI"] !== undefined,
  retries: 0,
  // One Chrome at a time: the gate's heavy lane already shares the cores out.
  workers: 1,
  timeout: 60_000,
  reporter: "line",
  use: {
    baseURL: BASE,
    // The board: the game is phone-only.
    viewport: { width: 424, height: 924 },
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
    launchOptions: { executablePath: chromePath(), args: ["--no-sandbox"] },
  },
  webServer: {
    command: `node_modules/.bin/vite --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: BASE,
    reuseExistingServer: false,
    // Vite serves the repo root, where index.html is.
    cwd: "../..",
  },
});
