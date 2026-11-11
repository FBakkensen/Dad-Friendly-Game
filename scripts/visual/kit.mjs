/* global console, process, document, innerWidth, innerHeight, scrollBy, scrollY, localStorage, getComputedStyle, HTMLButtonElement, requestAnimationFrame */
/** The visual check's shared kit: the server, Chrome, the sizes and the helpers more than one module uses. */
import {
  startServer,
  launchChrome,
  press as pressOn,
  open as openHarness,
  holdThrough as holdThroughOn,
} from "../../tools/browser/harness.ts";
import { seedJson, SAVE_KEY } from "../../tools/browser/fixtures.ts";
import { mkdirSync } from "node:fs";
import { failures } from "./registry.mjs";

// Serves the app itself unless VISUAL_URL points at a running one.
const server = await startServer({ port: 4174, url: process.env.VISUAL_URL });
const BASE = server.base;
/** The phone: the installed app on the OnePlus 15, the board at scale 1 (#370). */
const PHONE = [424, 924];
/** The PC sizes: the same board, scaled to fit on the desk. */
const PCS = [
  [1280, 800],
  [1366, 768],
  [1440, 900],
];
const SCREENS = [PHONE, ...PCS];
/** A PC is a desk from 600px wide (src/board-fit.ts): mouse, not touch. */
const isDesk = ([width]) => width >= 600;

const browser = await launchChrome();

/** Pages opened at a PC size: they take clicks, the phone takes taps. */
const desks = new WeakMap();

/** A tap on the phone, a click on a PC. */
async function press(page, selector) {
  await pressOn(page, selector, { desk: desks.get(page) === true });
}

/** A key on the rail (#373): buys, workshop, engineers, upgrades or ledger. */
const KEY = (id) => `.board-key[data-key="${id}"]`;
/** A drawer (#373): buys or upgrades. */
const SHEET = (name) => `.board-sheet[data-sheet="${name}"]`;
/** A drawer that is open. */
const OPEN_SHEET = (name) => `${SHEET(name)}.is-open`;
/** A drawer's Back plate. */
const SHEET_BACK = (name) => `${SHEET(name)} .board-sheet-back`;

/**
 * The drawer has slid all the way up: open, its slide done, its top at the
 * board's --sheet-top (178 board px), and its skin painted.
 */
async function sheetSettled(page, name) {
  return page
    .waitForFunction(
      (selector) => {
        const sheet = document.querySelector(selector);
        if (sheet === null || !sheet.classList.contains("is-open")) {
          return false;
        }
        const board = globalThis.__board();
        const top =
          (sheet.getBoundingClientRect().top - board.top) / board.scale;
        return (
          sheet.getAnimations().length === 0 &&
          Math.abs(top - 178) <= 0.5 &&
          [...sheet.querySelectorAll(":scope > canvas.board-skin")].every(
            (canvas) => canvas.style.width !== "",
          )
        );
      },
      { timeout: 5_000 },
      SHEET(name),
    )
    .then(
      () => true,
      () => false,
    );
}

/** Opens a drawer by its key, the way a dad does, and waits for the slide. */
async function openSheet(page, name) {
  await page.waitForSelector(`${KEY(name)}:not(:disabled)`, { visible: true });
  await press(page, KEY(name));
  return sheetSettled(page, name);
}

/**
 * Shuts a drawer by its Back plate. A keyboard press (a click with no
 * pointer) is never early, so the drawer's settle does not swallow it.
 */
async function closeSheet(page, name) {
  await page.$eval(SHEET_BACK(name), (button) => {
    button.click();
  });
  await page
    .waitForSelector(`${SHEET(name)}:not(.is-open)`, { timeout: 2_000 })
    .catch(() => undefined);
}

/** The note's key on the board: a socket's note ends in "Relic shelf" (#370). */
const SHELF_KEY = ".board-note.on .board-platebtn";

/** Opens the relic shelf the way a dad does: a socket, then its note's key. */
async function openShelf(page) {
  await page.waitForSelector(".board-socket", { visible: true });
  await press(page, ".board-socket");
  await page.waitForSelector(SHELF_KEY, { visible: true, timeout: 5_000 });
  await press(page, SHELF_KEY);
}

/** Installed PWA on Android: edge to edge, status bar and gesture bar as safe-area insets. */
const STANDALONE_INSETS = { top: 24, bottom: 48, left: 0, right: 0 };

/**
 * The board in viewport px: #app's box, its scale on a PC, and the top of the
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
  } = {},
) {
  const desk = isDesk([width, height]);
  const { page, close } = await openHarness(browser, BASE, {
    viewport: { width, height, isMobile: !desk, hasTouch: !desk },
    seed: { kind: "once", guard: "visual-seeded", json: seedJson(save) },
    // A clock the check can push forward, for veins and other timed things; stopped, a crew of
    // thousands cannot reach a relic mid-check. A held tap clock moves only by stepTapClock.
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
  desks.set(page, desk);
  return { page, close };
}

/**
 * The overlay is fixed and covers the board down to the save line, and the
 * save line stays on top of it (#370). On a PC the board is a box on the desk.
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
      getComputedStyle(element).position === "fixed" &&
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

/**
 * The window's rules module, as the dev server serves it: the checks place
 * the vein with the game's own veinSpot. Passed into the page as data, so
 * it is the browser's import, not one of this script's.
 */
const MINE_WINDOW_RULES = "/src/mine-window.ts";
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

/** The five keys on the rail (#373): locked or open, icon and ink, size. */
async function keyState(page) {
  return page.evaluate(() => {
    const read = (id) => {
      const button = document.querySelector(`.board-key[data-key="${id}"]`);
      if (!(button instanceof HTMLButtonElement)) {
        return null;
      }
      const box = button.getBoundingClientRect();
      const scale = globalThis.__board().scale;
      const icon = button.querySelector(".board-key-icon");
      const name = button.querySelector(".board-key-name");
      return {
        disabled: button.disabled,
        locked: button.classList.contains("is-locked"),
        dim: (icon?.getAttribute("src") ?? "").includes("-dim"),
        color: name === null ? "" : getComputedStyle(name).color,
        width: box.width / scale,
        height: box.height / scale,
      };
    };
    const buys = read("buys");
    const workshop = read("workshop");
    const engineers = read("engineers");
    const upgrades = read("upgrades");
    const ledger = read("ledger");
    const keys = [buys, workshop, engineers, upgrades, ledger];
    if (keys.some((key) => key === null)) {
      return { ok: false, buys, workshop, engineers, upgrades, ledger };
    }
    // Every key is the same width and at least 48 board px each way; a key
    // with a sub-line under it is taller.
    const laidOut =
      keys.every((key) => key.height >= 48 && key.width >= 48) &&
      keys.every((key) => Math.abs(key.width - buys.width) <= 1);
    return { ok: laidOut, buys, workshop, engineers, upgrades, ledger };
  });
}

/** An open key: enabled, its icon bright and its name in the board's ink. */
const keyOpen = (key) =>
  key.disabled === false &&
  !key.locked &&
  !key.dim &&
  key.color === "rgb(217, 221, 208)";

/** The bays have the save in: enabled, with their names written. */
async function baysDrawn(page) {
  return page
    .waitForFunction(
      () => {
        const bays = [...document.querySelectorAll(".board-bay")];
        return (
          bays.length === 3 &&
          bays.every(
            (bay) =>
              !bay.disabled &&
              (bay.querySelector(".board-bay-name")?.textContent ?? "") !== "",
          )
        );
      },
      { timeout: 5_000 },
    )
    .then(
      () => true,
      () => false,
    );
}

/**
 * The key rail's foot, and every key's, stands at least 8 board px above the
 * save line's top (#373).
 */
async function railFoot(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const bar = document.querySelector("#app > .board-rail");
    if (bar === null) {
      return { ok: false, gap: NaN };
    }
    const bottom = Math.max(
      bar.getBoundingClientRect().bottom,
      ...[...bar.querySelectorAll(".board-key")].map(
        (key) => key.getBoundingClientRect().bottom,
      ),
    );
    const gap = (board.saveTop - bottom) / board.scale;
    return { ok: gap >= 7.9, gap: Math.round(gap * 100) / 100 };
  });
}

/** The stored save's mountain, as the last write left it. */
async function storedMountain(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}").mountain ?? {},
    SAVE_KEY,
  );
}

/**
 * A finger (or the mouse button) held on the selector's centre, and lifted once `done(selector)`
 * holds in the page. True when it held before the timeout.
 */
async function holdThrough(page, selector, done) {
  return holdThroughOn(page, selector, done, {
    desk: desks.get(page) === true,
  });
}

/** Waits for the page to paint `count` more frames: what a press set off has painted. */
async function framesPainted(page, count) {
  await page.evaluate(async (frames) => {
    for (let frame = 0; frame < frames; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

/**
 * Arms a capture click listener on the window before a tap. The function it gives waits for
 * that click and the next animation frame after it: true when the tap was handled within 2 s. A
 * check that nothing opened needs it, so it cannot pass on a tap that never landed.
 */
async function clickHandled(page) {
  await page.evaluate(() => {
    globalThis.__clickHandled = false;
    globalThis.addEventListener(
      "click",
      () =>
        requestAnimationFrame(() => {
          globalThis.__clickHandled = true;
        }),
      { capture: true, once: true },
    );
  });
  return () =>
    page
      .waitForFunction(() => globalThis.__clickHandled === true, {
        timeout: 2_000,
      })
      .then(
        () => true,
        () => false,
      );
}

/**
 * Puts a board note away once the save is in (keysDrawn): a note that shows by itself, the
 * quiet away line, shows on the render that brings the save in. With no fixed wait, for the
 * drawer sections; the New sign is no note and takes no taps.
 */
async function noteAway(page) {
  if ((await page.$(".board-note.on")) === null) {
    return;
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector(".board-note.on") === null,
    { timeout: 2_000 },
  );
}

const buysOpen = (page) =>
  page
    .$eval(SHEET("buys"), (sheet) => sheet.classList.contains("is-open"))
    .catch(() => false);
/** One lamp frame is 20 art px: off 0, amber 1, green 2, red 3. */
const LAMP_X = { off: "0px", amber: "-40px", green: "-80px", red: "-120px" };

/** The keys have the save in: Ledger's name is written and every key is drawn. */
async function keysDrawn(page) {
  return page
    .waitForFunction(
      () =>
        document.querySelectorAll(".board-rail .board-key").length === 5 &&
        (document.querySelector(".save-status")?.textContent ?? "") !== "" &&
        !(document.querySelector(".save-status")?.textContent ?? "").includes(
          "Loading",
        ),
      { timeout: 5_000 },
    )
    .then(
      () => true,
      () => false,
    );
}

export {
  server,
  BASE,
  PHONE,
  PCS,
  SCREENS,
  isDesk,
  browser,
  desks,
  press,
  KEY,
  SHEET,
  OPEN_SHEET,
  SHEET_BACK,
  sheetSettled,
  openSheet,
  closeSheet,
  SHELF_KEY,
  openShelf,
  STANDALONE_INSETS,
  boardProbe,
  openScreen,
  coversBoard,
  noScroll,
  MINE_WINDOW_RULES,
  shot,
  keyState,
  keyOpen,
  baysDrawn,
  railFoot,
  storedMountain,
  holdThrough,
  framesPainted,
  clickHandled,
  noteAway,
  buysOpen,
  LAMP_X,
  keysDrawn,
};
