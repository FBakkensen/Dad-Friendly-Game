/* global console, process, document, URL */
/**
 * Writes the slice 1 mock's pictures (#649): mockups/slice-1/shots/<scene>.png, the 424x924
 * phone at 2x.
 *
 *   node mockups/slice-1/shots.mjs [scene ...]
 */
import { mkdirSync } from "node:fs";
import {
  launchChrome,
  newWindow,
  startServer,
} from "../../tools/browser/harness.ts";

const SCENES = ["start", "shaft", "board", "levels", "order", "welcome"];
const OUT = "mockups/slice-1/shots";
const PHONE = {
  width: 424,
  height: 924,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const asked = process.argv.slice(2);
const scenes = asked.length > 0 ? asked : SCENES;
mkdirSync(OUT, { recursive: true });
const server = await startServer({ port: 4177, url: process.env.MOCKUP_URL });
const browser = await launchChrome();
let failed = false;
for (const scene of scenes) {
  const { page, close } = await newWindow(browser, PHONE);
  page.on("pageerror", (error) => {
    failed = true;
    console.error(`${scene}: ${error.message}`);
  });
  await page.goto(
    new URL(`mockups/slice-1/index.html?scene=${scene}`, server.base).href,
  );
  await page.waitForFunction(() => document.body.dataset.mock === "ready", {
    timeout: 30_000,
  });
  const scrolls = await page.evaluate(
    () =>
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight,
  );
  if (scrolls) {
    failed = true;
    console.error(`${scene}: the phone scrolls`);
  }
  await page.screenshot({ path: `${OUT}/${scene}.png` });
  console.log(`${OUT}/${scene}.png`);
  await close();
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
