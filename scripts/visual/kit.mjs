/* global console, process, document, innerWidth, innerHeight, scrollBy, scrollY, getComputedStyle */
/** The visual check's shared kit: the server, Chrome, the sizes and the helpers more than one module uses. */
import {
  cardRisen,
  startServer,
  launchChrome,
  press as pressOn,
  open as openHarness,
} from "../../tools/browser/harness.ts";
import { seedJson } from "../../tools/browser/fixtures.ts";
import { mkdirSync } from "node:fs";
import { failures } from "./registry.mjs";

// Serves the app itself unless VISUAL_URL points at a running one.
const server = await startServer({ port: 4174, url: process.env.VISUAL_URL });
const BASE = server.base;
/** The phone: the installed app on the OnePlus 15, the board at scale 1 (#370). */
const PHONE = [424, 924];
const browser = await launchChrome();

/** A tap. */
async function press(page, selector) {
  await pressOn(page, selector);
}

/** The save drawer is open and its slide has ended: true when it did within 4 s. */
async function saveDrawerSettled(page) {
  return page
    .waitForFunction(
      () => {
        const sheet = document.querySelector(".board-save-drawer");
        return (
          sheet !== null &&
          sheet.classList.contains("is-open") &&
          sheet.getAnimations().length === 0
        );
      },
      { timeout: 4_000 },
    )
    .then(
      () => true,
      () => false,
    );
}

/** Installed PWA on Android: edge to edge, status bar and gesture bar as safe-area insets. */
const STANDALONE_INSETS = { top: 24, bottom: 48, left: 0, right: 0 };

/**
 * The board in viewport px: #app's box, its scale, and the top of the
 * save line, where every sheet stops (#370). In-page code calls
 * globalThis.__board().
 */
async function boardProbe(page) {
  await page.evaluateOnNewDocument(() => {
    globalThis.__board = () => {
      const app = document.querySelector("#app")?.getBoundingClientRect();
      const line = document
        .querySelector(".board-saveline")
        ?.getBoundingClientRect();
      const scale =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--board-scale",
          ),
        ) || 1;
      const left = app?.left ?? 0;
      const top = app?.top ?? 0;
      const right = app?.right ?? innerWidth;
      const bottom = app?.bottom ?? innerHeight;
      return { left, top, right, bottom, scale, saveTop: line?.top ?? bottom };
    };
  });
}

// Adapts visual's (size, save, options) call shape onto the harness open.
async function openScreen(
  [width, height],
  save,
  {
    standalone = false,
    search = "",
    stopClock = false,
    reducedMotion = false,
    tapClock = "real",
    seedKey,
  } = {},
) {
  const { page, close } = await openHarness(browser, BASE, {
    viewport: { width, height, isMobile: true, hasTouch: true },
    seed: { kind: "once", guard: "visual-seeded", json: seedJson(save) },
    // A phone backup's key for the slice 1 preview's saves (#659); SAVE_KEY when undefined.
    seedKey,
    // A clock the check can push forward, for timed things; stopped, a crew of
    // thousands cannot reach a new band mid-check. A held tap clock moves only by stepTapClock.
    clock: { date: stopClock ? "stopped" : "skewable", tap: tapClock },
    search,
    onPageError: (error) => {
      failures.push(
        `page error at ${String(width)}x${String(height)}: ${String(error)}`,
      );
    },
    beforeLoad: async (page) => {
      if (standalone) {
        const cdp = await page.createCDPSession();
        await cdp.send("Emulation.setSafeAreaInsetsOverride", {
          insets: STANDALONE_INSETS,
        });
        await cdp
          .send("Emulation.setEmulatedMedia", {
            features: [{ name: "display-mode", value: "standalone" }],
          })
          .catch(() => undefined);
      }
      await boardProbe(page);
      if (reducedMotion) {
        await page.emulateMediaFeatures([
          { name: "prefers-reduced-motion", value: "reduce" },
        ]);
      }
    },
  });
  return { page, close };
}

/**
 * The overlay (fixed, or a board card absolute in the board, #464) covers the
 * board down to the save line, and the save line stays on top of it (#370).
 */
async function coversBoard(page, selector) {
  // A tap's click lands a frame later on a slow runner; let the overlay open first.
  await page
    .waitForSelector(`${selector}:not([hidden])`, { timeout: 2_000 })
    .catch(() => undefined);
  const result = await page.$eval(selector, (element) => {
    const board = globalThis.__board();
    const rect = element.getBoundingClientRect();
    const line = document.querySelector(".board-saveline");
    const lineBox = line?.getBoundingClientRect();
    const hit =
      lineBox === undefined
        ? null
        : document.elementFromPoint(
            (lineBox.left + lineBox.right) / 2,
            (lineBox.top + lineBox.bottom) / 2,
          );
    const lineOnTop = line !== null && hit !== null && line.contains(hit);
    const ok =
      !element.hidden &&
      ["fixed", "absolute"].includes(getComputedStyle(element).position) &&
      rect.top <= board.top + 0.5 &&
      rect.left <= board.left + 0.5 &&
      rect.right >= board.right - 0.5 &&
      rect.bottom >= board.saveTop - 0.5 &&
      lineOnTop;
    return {
      ok,
      rect: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round),
      board: [board.left, board.top, board.right, board.saveTop].map(
        Math.round,
      ),
      lineOnTop,
    };
  });
  if (!result.ok) {
    console.log("cover", selector, JSON.stringify(result));
  }
  return result.ok;
}

/** Nothing scrolls: not the page, not the game root, not sideways. */
async function noScroll(page) {
  const result = await page.evaluate(() => {
    const app = document.querySelector("#app");
    const root = document.documentElement;
    scrollBy(0, 80);
    app?.scrollBy(0, 80);
    const still = scrollY === 0 && (app?.scrollTop ?? 0) === 0;
    const ok =
      still &&
      root.scrollHeight === root.clientHeight &&
      root.scrollWidth === root.clientWidth &&
      app !== null &&
      app.scrollHeight === app.clientHeight &&
      app.scrollWidth === app.clientWidth;
    if (!ok && app !== null) {
      // Say what grew, so a CI-only overflow can be fixed without guessing.
      return {
        ok,
        detail: JSON.stringify({
          root: [
            root.scrollWidth,
            root.scrollHeight,
            root.clientWidth,
            root.clientHeight,
          ],
          app: [
            app.scrollWidth,
            app.scrollHeight,
            app.clientWidth,
            app.clientHeight,
          ],
          rows: [...app.children].map((child) => [
            child.className,
            Math.round(child.getBoundingClientRect().height),
          ]),
        }),
      };
    }
    return { ok, detail: "" };
  });
  if (!result.ok) {
    console.log("scroll", result.detail);
  }
  return result.ok;
}

// Set VISUAL_SHOTS to a folder to keep a PNG of each checked screen.
const SHOTS = process.env.VISUAL_SHOTS;
if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
}

async function shot(page, name) {
  if (!SHOTS) {
    return;
  }
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

export {
  server,
  BASE,
  PHONE,
  browser,
  press,
  saveDrawerSettled,
  boardProbe,
  openScreen,
  coversBoard,
  cardRisen,
  noScroll,
  shot,
};
