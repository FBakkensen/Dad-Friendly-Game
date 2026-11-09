/* global console, process, document, innerWidth, innerHeight, scrollBy, scrollY, sessionStorage, localStorage, getComputedStyle, setTimeout, URL, HTMLButtonElement, HTMLElement, Element, HTMLImageElement, Image, requestAnimationFrame, MutationObserver */
/**
 * Real-browser layout guard (jsdom can't see CSS). Run it with:
 *   npm run visual   (starts its own dev server; part of npm run check)
 * Fails if the board scrolls at the phone (424x924) or a PC size, if an
 * overlay isn't laid over the board, or if the board's own parts miss their
 * bars (targets, type, contrast, exact 2x art) (#370).
 */
import { existsSync, mkdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import {
  contrastRatio,
  targetsCloserThan,
  undersizedTargets,
  WINDOW_SCENE_PARTS,
} from "../src/ui-audit-measure.ts";
import {
  CREW,
  SAVE_KEY,
  crewMountain,
  crystalMountain,
  fleetMountain,
  freshMountain,
  heartMountain,
  fullGraniteMountain,
  heirMountain,
  idleMountain,
  lastStoneSave,
  machineMountain,
  machinePickMountain,
  openMountain,
  savingMountain,
  seedJson,
  shortMountain,
  toolsMountain,
  workshopSave,
} from "./fixtures.mjs";

// Serves the app itself unless VISUAL_URL points at a running one.
const server =
  process.env.VISUAL_URL === undefined
    ? await createServer({
        server: { host: "127.0.0.1", port: 4174, strictPort: false },
        logLevel: "error",
      }).then((dev) => dev.listen())
    : undefined;
const BASE =
  process.env.VISUAL_URL ??
  server?.resolvedUrls?.local[0] ??
  "http://127.0.0.1:4174/";
const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome"].find((path) =>
    existsSync(path),
  ) ??
  "/usr/bin/google-chrome";
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

// One stone short of the Lantern of Guidance, away for ten minutes.
const BEFORE_LANTERN = {
  remaining: 99_000_001,
  pocket: 180,
  helpers: 0,
  carts: 0,
};

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

/**
 * Each scenario opens its own browser context, so they are independent. They
 * are registered here and run at the end, VISUAL_JOBS at a time (default: 1.5
 * per core), on one Vite server and one Chrome.
 */
const sections = [];
/**
 * VISUAL_ONLY=<regex> runs only the sections whose label matches. A filtered
 * run says so, and one that matches nothing fails rather than passing empty.
 */
const only =
  process.env.VISUAL_ONLY === undefined
    ? undefined
    : new RegExp(process.env.VISUAL_ONLY);
if (only !== undefined) {
  console.warn(
    `VISUAL_ONLY=${String(process.env.VISUAL_ONLY)}: running only the sections it matches, not the whole check.`,
  );
}
const section = (label, run) => {
  if (only === undefined || only.test(label)) {
    sections.push({ label, run });
  }
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox"],
});

/** Pages opened at a PC size: they take clicks, the phone takes taps. */
const desks = new WeakMap();

/** A tap on the phone, a click on a PC. */
async function press(page, selector) {
  if (desks.get(page) === true) {
    await page.click(selector);
  } else {
    await page.tap(selector);
  }
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

/** The drawer's own module, as the dev server serves it: the spare's tiers. */
const DRAWER_UI = "/src/board-drawer.ts";

/**
 * An open drawer measured in board px (#373): its box, what it leaves in view,
 * its list and spare plate, and each shown row with its parts. A row's name,
 * info, need, why, flag, gain, tag and verb must lie inside it and apart.
 */
async function drawerFacts(page, name) {
  return page.evaluate(
    async (selector, ui) => {
      const { spareTier } = await import(ui);
      const board = globalThis.__board();
      const sheet = document.querySelector(selector);
      if (sheet === null) {
        return { ok: false, missing: selector };
      }
      const px = (rect) => ({
        l: (rect.left - board.left) / board.scale,
        t: (rect.top - board.top) / board.scale,
        r: (rect.right - board.left) / board.scale,
        b: (rect.bottom - board.top) / board.scale,
      });
      const near = (a, b) => Math.abs(a - b) <= 0.5;
      const box = px(sheet.getBoundingClientRect());
      const placed =
        near(box.t, 178) &&
        near(box.b, 864) &&
        near(box.l, 8) &&
        near(box.r, 416);
      // What a finger meets at the centre of the odometer and the save line.
      const sheetBox = sheet.getBoundingClientRect();
      const reach = (part, clear) => {
        const el = document.querySelector(part);
        if (el === null) {
          return false;
        }
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          (b.left + b.right) / 2,
          (b.top + b.bottom) / 2,
        );
        // The scrim over the board is clear: it shows what is under it.
        return (
          hit !== null &&
          (el.contains(hit) || hit.classList.contains("board-scrim")) &&
          clear(b)
        );
      };
      const odometerClear = reach(
        ".board-odo",
        (b) => b.bottom <= sheetBox.top + 0.5,
      );
      const saveLineClear = reach(
        ".board-saveline",
        (b) => b.top >= sheetBox.bottom - 0.5,
      );
      const list = sheet.querySelector(".board-sheet-list");
      const spare = sheet.querySelector(".board-spare");
      const scrolls =
        list !== null && list.scrollHeight > list.clientHeight + 1;
      const spareClass =
        spare === null
          ? ""
          : ([...spare.classList].find((cls) =>
              ["is-tall", "is-mid", "is-short", "is-off"].includes(cls),
            ) ?? "");
      // Off, the plate gives the list's gap back, so it is measured without that room, as
      // the drawer measures it.
      const freed =
        spare !== null && list !== null && spare.classList.contains("is-off")
          ? Number.parseFloat(getComputedStyle(list).rowGap) || 0
          : 0;
      const spareWant =
        spare === null ? "" : `is-${spareTier(spare.offsetHeight - freed)}`;
      const shown = (el) =>
        el.closest("[hidden]") === null && el.getClientRects().length > 0;
      const rows = [...sheet.querySelectorAll(".board-row")].filter(shown);
      const listBox = list?.getBoundingClientRect();
      const PARTS = [
        ".board-row-name",
        ".board-row-info",
        ".board-row-need",
        ".board-row-why",
        ".board-row-flag",
        ".board-row-gain",
        ".board-row-tag",
        ".board-row-verb",
      ];
      const rowFacts = rows.map((row) => {
        const r = px(row.getBoundingClientRect());
        const parts = PARTS.flatMap((part) =>
          [...row.querySelectorAll(part)]
            .filter((el) => shown(el) && (el.textContent ?? "").trim() !== "")
            .map((el) => ({ part, el, b: px(el.getBoundingClientRect()) })),
        );
        const inside = parts.every(
          ({ b }) =>
            b.l >= r.l - 0.5 &&
            b.r <= r.r + 0.5 &&
            b.t >= r.t - 0.5 &&
            b.b <= r.b + 0.5,
        );
        // The name keeps its whole width on its line: one too long runs past
        // the words' column, which clips it.
        const mid = row.querySelector(".board-row-mid");
        const nameEl = row.querySelector(".board-row-name");
        const nameFull =
          mid === null ||
          nameEl === null ||
          nameEl.getBoundingClientRect().right <=
            mid.getBoundingClientRect().right + 0.5;
        // A line that runs past its box is cut by an ellipsis inside it.
        const spills = parts
          .filter(({ el }) => el.scrollWidth > el.clientWidth + 1)
          .filter(({ el }) => getComputedStyle(el).textOverflow !== "ellipsis")
          .map(({ part }) => part);
        const overlaps = [];
        for (let i = 0; i < parts.length; i += 1) {
          for (let j = i + 1; j < parts.length; j += 1) {
            const a = parts[i].b;
            const b = parts[j].b;
            const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
            const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
            if (w > 0.5 && h > 0.5) {
              overlaps.push(`${parts[i].part}/${parts[j].part}`);
            }
          }
        }
        return {
          id:
            row.dataset.tier ??
            row.dataset.boost ??
            row.dataset.upgrade ??
            row.dataset.tool ??
            "",
          classes: [...row.classList].filter((cls) => cls.startsWith("is-")),
          top: r.t,
          bottom: r.b,
          height: r.b - r.t,
          width: r.r - r.l,
          words: parts.map(({ el }) => (el.textContent ?? "").trim()),
          inside: inside && nameFull,
          nameFull,
          spills,
          overlaps,
          inView:
            listBox !== undefined &&
            row.getBoundingClientRect().top >= listBox.top - 0.5 &&
            row.getBoundingClientRect().bottom <= listBox.bottom + 0.5,
        };
      });
      // Rows next to each other in the list stand 10 board px apart.
      const gaps = [];
      for (let i = 1; i < rows.length; i += 1) {
        let between = rows[i].previousElementSibling;
        while (between !== null && !shown(between)) {
          between = between.previousElementSibling;
        }
        if (between === rows[i - 1]) {
          gaps.push(
            Math.round((rowFacts[i].top - rowFacts[i - 1].bottom) * 10) / 10,
          );
        }
      }
      return {
        ok: true,
        box: [box.l, box.t, box.r, box.b].map(
          (side) => Math.round(side * 10) / 10,
        ),
        placed,
        odometerClear,
        saveLineClear,
        scrolls,
        spareClass,
        spareWant,
        rows: rowFacts,
        gaps,
      };
    },
    OPEN_SHEET(name),
    DRAWER_UI,
  );
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

async function open(
  [width, height],
  save,
  {
    standalone = false,
    search = "",
    stopClock = false,
    reducedMotion = false,
  } = {},
) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
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
  page.on("pageerror", (error) => {
    failures.push(
      `page error at ${String(width)}x${String(height)}: ${String(error)}`,
    );
  });
  const desk = isDesk([width, height]);
  desks.set(page, desk);
  await page.setViewport({ width, height, isMobile: !desk, hasTouch: !desk });
  // A clock the check can push forward, for veins and other timed things.
  await page.evaluateOnNewDocument(() => {
    const realNow = Date.now.bind(Date);
    globalThis.__skewMs = 0;
    Date.now = () => realNow() + globalThis.__skewMs;
  });
  if (stopClock) {
    // A crew of thousands digs millions a second. With the clock stopped it
    // cannot reach a relic mid-check, so no reveal lands on a tap.
    await page.evaluateOnNewDocument(() => {
      const stopped = Date.now();
      Date.now = () => stopped;
    });
  }
  await boardProbe(page);
  await page.evaluateOnNewDocument(
    (key, value) => {
      if (sessionStorage.getItem("visual-seeded") === null) {
        sessionStorage.setItem("visual-seeded", "1");
        localStorage.setItem(key, value);
      }
    },
    SAVE_KEY,
    seedJson(save),
  );
  if (reducedMotion) {
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
  }
  await page.goto(new URL(search, BASE).href, { waitUntil: "networkidle0" });
  return { page, close: () => context.close() };
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
 * The seeded crew has one engineer. The sheet's title and the way back both
 * sit on screen, and the page itself does not scroll.
 */
async function engineersSheetFits(page, { top = 0, bottom = 0 } = {}) {
  await press(page, KEY("engineers"));
  const covered = await coversBoard(page, ".engineers-dialog");
  const detail = await page.$eval(
    ".engineers-dialog",
    (sheet, insets) => {
      // The board's box: the sheet's buttons sit above the save line.
      const board = globalThis.__board();
      const floor = Math.min(board.saveTop, board.bottom - insets.bottom);
      const buttons = [...sheet.querySelectorAll("button")].filter(
        (button) => !button.hidden && button.getClientRects().length > 0,
      );
      const boxes = buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return {
          height: box.height / board.scale,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          clipped: button.scrollWidth > button.clientWidth + 1,
          text: button.textContent,
        };
      });
      const title =
        sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      const close =
        sheet.querySelector(".engineers-close")?.getBoundingClientRect()
          .bottom ?? Infinity;
      // Only what shows: How it works cards stay hidden until "i" (#246).
      const text = sheet.innerText;
      // A first visit swaps the act buttons for one guided button: the
      // first trip, or later the first tend.
      const guided =
        sheet.querySelector(".engineer-first-trip:not([hidden])") !== null;
      const promote = sheet.querySelector(".engineer-promote");
      const promoteLines = (() => {
        if (promote === null || promote.hidden) {
          return 0;
        }
        const range = document.createRange();
        range.selectNodeContents(promote);
        return range.getClientRects().length;
      })();
      return {
        boxesOk: boxes.every(
          (box) =>
            box.height >= 44 &&
            box.left >= board.left &&
            box.right <= board.right &&
            box.top >= board.top + insets.top &&
            box.bottom <= floor &&
            !box.clipped,
        ),
        count: boxes.length,
        title,
        close,
        titleOk: title >= board.top + insets.top,
        closeOk: close <= floor,
        words:
          (text.includes("Tend a machine") ||
            (guided &&
              (text.includes("exploring") || text.includes("Tend the")))) &&
          text.includes("stones/sec") &&
          text.includes("Promote:") &&
          text.includes("Promote a worker") &&
          promoteLines >= 1 &&
          promoteLines <= 2 &&
          !text.includes("?") &&
          !text.includes("%"),
      };
    },
    { top, bottom },
  );
  const pageStill = await noScroll(page);
  await page.$eval(".engineers-close", (button) => {
    button.click();
  });
  const closed = await page.$eval(
    ".engineers-dialog",
    (element) => element.hidden,
  );
  const ok =
    covered &&
    detail.boxesOk &&
    detail.count >= 4 &&
    detail.titleOk &&
    detail.closeOk &&
    detail.words &&
    pageStill &&
    closed;
  if (!ok) {
    console.log("engineers sheet", { covered, detail, pageStill, closed });
  }
  return ok;
}

/**
 * The window's rules module, as the dev server serves it: the checks place
 * the vein with the game's own veinSpot. Passed into the page as data, so
 * it is the browser's import, not one of this script's.
 */
const MINE_WINDOW_RULES = "/src/mine-window.ts";

/**
 * The vein at each corner of its range (veinSpot at x 0.35/0.65, y 0.4/0.8),
 * placed as board-window.ts places it: inline, 7 art px in from the window's
 * corner to the view. Each glint must sit inside .board-window-view and be
 * what a finger at its centre meets (#371).
 */
async function veinInView(page) {
  return page.evaluate(async (rules) => {
    const { veinSpot } = await import(rules);
    const vein = document.querySelector(".golden-vein");
    const view = document.querySelector(".board-window-view");
    if (vein === null || view === null) {
      return { ok: false, spots: [] };
    }
    const { left, top } = vein.style;
    const wasHidden = vein.hidden;
    vein.hidden = false;
    const spots = [];
    for (const [x, y] of [
      [0.35, 0.4],
      [0.65, 0.4],
      [0.35, 0.8],
      [0.65, 0.8],
    ]) {
      const spot = veinSpot(x, y);
      vein.style.left = `${String((7 + spot.left) * 2)}px`;
      vein.style.top = `${String((7 + spot.top) * 2)}px`;
      const v = vein.getBoundingClientRect();
      const w = view.getBoundingClientRect();
      const hit = document.elementFromPoint(
        (v.left + v.right) / 2,
        (v.top + v.bottom) / 2,
      );
      spots.push({
        x,
        y,
        ok:
          getComputedStyle(vein).position === "absolute" &&
          v.width > 0 &&
          v.left >= w.left - 0.5 &&
          v.right <= w.right + 0.5 &&
          v.top >= w.top - 0.5 &&
          v.bottom <= w.bottom + 0.5 &&
          hit !== null &&
          vein.contains(hit),
        vein: [v.left, v.top, v.right, v.bottom].map(Math.round),
        view: [w.left, w.top, w.right, w.bottom].map(Math.round),
      });
    }
    vein.hidden = wasHidden;
    vein.style.left = left;
    vein.style.top = top;
    return { ok: spots.every((spot) => spot.ok), spots };
  }, MINE_WINDOW_RULES);
}

// The main screen and its sheets, at the phone and on the PC.
for (const viewport of SCREENS) {
  section(`section 1 (main screen) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await open(viewport, {
      version: 4,
      mountain: CREW,
      lastSeen: Date.now(),
    });
    check(await noScroll(page), `${size} main screen has no scroll`);
    // A dig's "+N" rises inside the window; the page stays still (#371).
    await press(page, ".board-window");
    check(await noScroll(page), `${size} no scroll with a dig's +N rising`);
    // The tier rows live in the Buys drawer (#373): each one, brought into its
    // list's view, sits wholly above the save line and below the drawer's top.
    const buysUp = await openSheet(page, "buys");
    const tiersVisible = await page.$eval(OPEN_SHEET("buys"), (sheet) => {
      const board = globalThis.__board();
      const list = sheet.querySelector(".board-sheet-list");
      const rows = [...sheet.querySelectorAll(".tier")].filter(
        (tier) => tier.closest("[hidden]") === null,
      );
      const ok =
        list !== null &&
        rows.length >= 4 &&
        rows.every((tier) => {
          // Scroll the list alone, never the clip or the page.
          const port = list.getBoundingClientRect();
          const at = tier.getBoundingClientRect();
          if (at.bottom > port.bottom) {
            list.scrollTop += at.bottom - port.bottom;
          } else if (at.top < port.top) {
            list.scrollTop -= port.top - at.top;
          }
          const box = tier.getBoundingClientRect();
          return (
            box.top >= port.top - 0.5 &&
            box.bottom <= port.bottom + 0.5 &&
            box.bottom <= board.saveTop &&
            box.bottom <= board.bottom
          );
        });
      if (list !== null) {
        list.scrollTop = 0;
      }
      return ok;
    });
    check(buysUp && tiersVisible, `${size} every tier row is above the fold`);
    await closeSheet(page, "buys");

    // The vein lives inside the window's view and on top of it, at every
    // corner of its range (#371).
    const veinInside = await veinInView(page);
    check(
      veinInside.ok,
      `${size} golden vein sits inside the window's view, on top, at each end of its range`,
    );
    if (!veinInside.ok) {
      console.log("vein in view", size, JSON.stringify(veinInside));
    }

    // A socket's note holds the shelf's key; the tag is a label (#370).
    await openShelf(page);
    check(
      await coversBoard(page, ".shelf-dialog"),
      `${size} relic shelf is laid over the game`,
    );
    await press(page, ".shelf-close");
    await press(page, KEY("ledger"));
    check(
      await coversBoard(page, ".game-menu"),
      `${size} menu is laid over the game`,
    );
    const fieldLogRow = await page.$eval(".game-menu", (menu) => {
      const copy = [...menu.querySelectorAll("button")].find(
        (button) => button.textContent === "Copy field log",
      );
      if (copy === undefined) {
        return false;
      }
      const board = globalThis.__board();
      const box = copy.getBoundingClientRect();
      const fat =
        box.height / board.scale >= 44 &&
        box.left >= board.left &&
        box.right <= board.right;
      menu.scrollTop = menu.scrollHeight;
      const closeBottom =
        menu.querySelector(".menu-close")?.getBoundingClientRect().bottom ??
        Infinity;
      menu.scrollTop = 0;
      return fat && closeBottom <= board.saveTop;
    });
    check(fieldLogRow, `${size} field log menu row is tappable`);
    await press(page, ".start-over-link");
    check(
      await coversBoard(page, ".start-over"),
      `${size} start-over confirm is laid over the game`,
    );
    await press(page, ".start-over-cancel");
    // Upgrades is a drawer now (#373): it slides up under the odometer to the
    // save line, and the save line stays on top of the board.
    const upgradesUp = await openSheet(page, "upgrades");
    const upgradesBox = await drawerFacts(page, "upgrades");
    check(
      upgradesUp &&
        upgradesBox.placed &&
        upgradesBox.odometerClear &&
        upgradesBox.saveLineClear,
      `${size} upgrades drawer is laid over the board, under the odometer and over the save line`,
    );
    if (!upgradesBox.placed || !upgradesBox.saveLineClear) {
      console.log("upgrades drawer", size, JSON.stringify(upgradesBox));
    }
    // Every row, the "i" and the way back can be reached, scrolling if it must.
    const sheetReachable = await page.$eval(OPEN_SHEET("upgrades"), (sheet) => {
      const board = globalThis.__board();
      // Rows not yet nearly affordable are hidden (#245); check what shows.
      const buttons = [...sheet.querySelectorAll("button")].filter(
        (button) =>
          button.closest("[hidden]") === null &&
          button.getClientRects().length > 0,
      );
      const wide = buttons.every((button) => {
        const box = button.getBoundingClientRect();
        return (
          box.height / board.scale >= 44 &&
          box.left >= board.left &&
          box.right <= board.right
        );
      });
      const list = sheet.querySelector(".board-sheet-list");
      if (list !== null) {
        list.scrollTop = 0;
      }
      const titleTop =
        sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      if (list !== null) {
        list.scrollTop = list.scrollHeight;
      }
      const closeBottom =
        sheet.querySelector(".board-sheet-back")?.getBoundingClientRect()
          .bottom ?? Infinity;
      if (list !== null) {
        list.scrollTop = 0;
      }
      return (
        buttons.length >= 2 &&
        wide &&
        titleTop >= board.top &&
        closeBottom <= board.saveTop
      );
    });
    check(sheetReachable, `${size} upgrades drawer buttons are tappable`);
    const sheetFit = await page.$eval(OPEN_SHEET("upgrades"), (sheet) => {
      const shown = (el) =>
        el.closest("[hidden]") === null && el.getClientRects().length > 0;
      // The drawer is the board's riveted frame: its skin is painted, edge to
      // edge, so nothing of the board shows through (#373).
      const skinOf = sheet.querySelector(":scope > canvas.board-skin");
      const box = sheet.getBoundingClientRect();
      const skinBox = skinOf?.getBoundingClientRect();
      const opaque =
        skinOf !== null &&
        skinOf.width > 0 &&
        skinBox !== undefined &&
        Math.abs(skinBox.width - box.width) <= 1 &&
        Math.abs(skinBox.height - box.height) <= 1;
      const list = sheet.querySelector(".board-sheet-list");
      const text = [
        ...sheet.querySelectorAll(
          ".board-row-name, .board-row-info, .board-row-price, .board-row-verb",
        ),
      ].filter((node) => shown(node) && (node.textContent ?? "") !== "");
      // The board's bar: 13px or more (#370).
      const typeOk = text.every(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 13,
      );
      const lasting = [
        ...sheet.querySelectorAll(".upgrade:not(.boost):not([hidden])"),
      ];
      const priceRight = lasting.every((row) => {
        const name = row.querySelector(".board-row-name");
        const tag = row.querySelector(".board-row-tag");
        if (name === null || tag === null) {
          return false;
        }
        const price = tag.getBoundingClientRect();
        const label = name.getBoundingClientRect();
        const rowRight = row.getBoundingClientRect().right;
        const scale = globalThis.__board().scale;
        // The price tag sits at the right of its own row, past the name.
        return (
          price.left + 1 >= label.right - 1 &&
          rowRight - price.right <= 16 * scale &&
          rowRight - price.right >= -1
        );
      });
      const lineCount = (node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length;
      };
      const buyLinesOk = [...sheet.querySelectorAll(".board-row-verb")]
        .filter(shown)
        .every((verb) => lineCount(verb) <= 1);
      const boosts = [...sheet.querySelectorAll(".upgrade.boost")].filter(
        (row) => !row.hidden,
      );
      const stacked =
        boosts.length < 2 ||
        boosts[1].getBoundingClientRect().top >=
          boosts[0].getBoundingClientRect().bottom - 1;
      const effectsOk = [
        ...sheet.querySelectorAll(".upgrade:not([hidden]) .board-row-info"),
      ]
        .filter(shown)
        .every((node) => lineCount(node) <= 2);
      // A full Upgrades runs longer than the drawer and scrolls inside it,
      // its spare plate off (C1); a shorter one fits.
      const spare = sheet.querySelector(".board-spare");
      const scrolls =
        list !== null && list.scrollHeight > list.clientHeight + 1;
      return {
        fits:
          list !== null &&
          (!scrolls ||
            (spare?.classList.contains("is-off") === true &&
              lasting.length + boosts.length >= 6)),
        scroll: list?.scrollHeight,
        client: list?.clientHeight,
        opaque,
        typeOk,
        lasting: lasting.length,
        priceRight,
        buyLinesOk,
        stacked,
        effectsOk,
      };
    });
    check(
      sheetFit.fits &&
        sheetFit.opaque &&
        sheetFit.typeOk &&
        sheetFit.priceRight &&
        sheetFit.buyLinesOk &&
        sheetFit.stacked &&
        sheetFit.effectsOk,
      `${size} upgrades drawer fits, on its painted frame`,
    );
    if (
      !sheetFit.fits ||
      !sheetFit.opaque ||
      !sheetFit.typeOk ||
      !sheetFit.priceRight ||
      !sheetFit.buyLinesOk ||
      !sheetFit.stacked ||
      !sheetFit.effectsOk
    ) {
      console.log(`upgrades detail ${size} ${JSON.stringify(sheetFit)}`);
    }
    await closeSheet(page, "upgrades");
    const engineersFat = await page.$eval(KEY("engineers"), (button) => {
      const board = globalThis.__board();
      const box = button.getBoundingClientRect();
      return (
        !button.hidden &&
        !button.disabled &&
        /^Engineers\b/.test(button.getAttribute("aria-label") ?? "") &&
        box.height / board.scale >= 44 &&
        box.width / board.scale >= 44 &&
        box.left >= board.left &&
        box.right <= board.right
      );
    });
    check(engineersFat, `${size} engineers key is tappable`);
    check(
      await engineersSheetFits(page),
      `${size} engineers sheet fits with no scroll`,
    );
    await close();
  });
}

// Tier cards keep one fixed height and never truncate, even at x999 and huge prices.
for (const viewport of [PHONE]) {
  section(`section 2 (tier cards) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    for (const [crew, font] of [
      [
        {
          helpers: 999,
          carts: 999,
          drills: 999,
          borers: 999,
          machines: 999,
          kids: 999,
        },
        undefined,
      ],
      [{ helpers: 120, carts: 85, drills: 40, borers: 0 }, undefined],
      [{ helpers: 120, carts: 85 }, undefined],
      [{ helpers: 1, carts: 0 }, undefined],
      // A long pocket (888,888) stays inside the odometer.
      [{ helpers: 24, carts: 12, pocket: 888_888 }, "DejaVu Sans"],
      // CI's fallback font is wide; it must fit there too.
      [{ helpers: 999, carts: 999 }, "DejaVu Sans"],
      [
        {
          helpers: 999,
          carts: 999,
          drills: 999,
          borers: 999,
          machines: 999,
          kids: 999,
        },
        "DejaVu Sans",
      ],
      // Short of helpers: idle machines on every card, the longest crew line.
      [
        {
          helpers: 1,
          carts: 999,
          drills: 999,
          borers: 999,
          machines: 999,
          kids: 0,
        },
        "DejaVu Sans",
      ],
      // Every crew synergy bought: "↑999%" joins the rate line.
      [
        {
          helpers: 999,
          carts: 999,
          drills: 999,
          borers: 999,
          machines: 999,
          upgrades: {
            boots: 1,
            cartSyn: 1,
            drillSyn: 1,
            borerSyn: 1,
            machineSyn: 1,
          },
        },
        "DejaVu Sans",
      ],
      [
        {
          helpers: 120,
          carts: 85,
          drills: 40,
          borers: 7,
          upgrades: {
            boots: 1,
            cartSyn: 1,
            drillSyn: 1,
            borerSyn: 1,
            machineSyn: 1,
          },
        },
        "DejaVu Sans",
      ],
      // Before the Hammer: the Great Machine card is locked.
      [
        { helpers: 9, carts: 9, drills: 9, borers: 9, remaining: 80_000_000 },
        "DejaVu Sans",
      ],
    ]) {
      const { page, close } = await open(
        viewport,
        {
          version: 4,
          mountain: { remaining: 50_000_000, pocket: 49_999_999, ...crew },
          lastSeen: Date.now(),
        },
        { stopClock: true },
      );
      if (font !== undefined) {
        await page.addStyleTag({
          content: `* { font-family: "${font}" !important; }`,
        });
      }
      await openSheet(page, "buys");
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll(".tier")]
          .filter((card) => !card.hidden)
          .map((card) => ({
            height: Math.round(card.getBoundingClientRect().height),
            // The name, the price and the gain show in full. The name keeps
            // its whole width on its line, so a name too long for the row
            // runs past the words' column, which clips it: its right edge is
            // read against that column's. The info line falls back through
            // its options and may end in its ellipsis, inside the row (#373,
            // the plan's Review Focus 5).
            clipped: [
              ...card.querySelectorAll(
                ".board-row-name, .board-row-price, .board-row-info, .board-row-gain",
              ),
            ]
              .filter((line) => {
                if (line.closest("[hidden]") !== null) {
                  return false;
                }
                if (line.classList.contains("board-row-name")) {
                  const mid = line.closest(".board-row-mid");
                  return (
                    mid === null ||
                    line.getBoundingClientRect().right >
                      mid.getBoundingClientRect().right + 0.5
                  );
                }
                if (line.classList.contains("board-row-gain")) {
                  return (
                    line.scrollWidth > line.clientWidth + 1 ||
                    line.getBoundingClientRect().right >
                      card.getBoundingClientRect().right + 0.5
                  );
                }
                return (
                  line.scrollWidth > line.clientWidth + 1 &&
                  !(
                    line.classList.contains("board-row-info") &&
                    getComputedStyle(line).textOverflow === "ellipsis" &&
                    line.getBoundingClientRect().right <=
                      card.getBoundingClientRect().right
                  )
                );
              })
              .map((line) => line.textContent),
          })),
      );
      const label = `${size} tier cards with ${String(crew.helpers)} helpers, ${String(crew.carts)} carts${font === undefined ? "" : ` in ${font}`}`;
      check(
        cards.every((card) => card.height >= 48),
        `${label} are at least 48px tall`,
      );
      const clipped = cards.flatMap((card) => card.clipped);
      check(
        clipped.length === 0,
        `${label} show every name, price and gain in full, and each info line whole or cut by its ellipsis ${clipped.join(" | ")}`,
      );
      check(await noScroll(page), `${label} have no scroll`);
      // The pocket is the odometer now (#370): five drums in their housing.
      const odometerFits = await page.evaluate(() => {
        const board = globalThis.__board();
        const odometer = document.querySelector(".board-odo");
        if (odometer === null) {
          return false;
        }
        const box = odometer.getBoundingClientRect();
        return (
          (odometer.getAttribute("aria-label") ?? "").startsWith("Stones ") &&
          box.left >= board.left &&
          box.right <= board.right &&
          odometer.scrollWidth <= odometer.clientWidth + 1 &&
          [...odometer.querySelectorAll(".board-drum")].every(
            (drum) => drum.scrollWidth <= drum.clientWidth + 1,
          )
        );
      });
      check(odometerFits, `${label} keep the odometer in its housing`);
      // The crew line lives in the Crew section at the top of Buys (#371).
      const crewLineFits = await page.evaluate(() => {
        const line = document.querySelector(
          '.board-sheet[data-sheet="buys"].is-open .crew .crew-status',
        );
        if (line === null) return false;
        const box = line.getBoundingClientRect();
        const height = parseFloat(getComputedStyle(line).lineHeight) || 24;
        return (
          line.scrollWidth <= line.clientWidth + 1 &&
          box.left >= 0 &&
          box.right <= innerWidth &&
          box.height <= height * 1.5
        );
      });
      check(crewLineFits, `${label} keep the crew line on one line`);
      if (
        font === "DejaVu Sans" &&
        crew.helpers === 999 &&
        crew.borers === 999 &&
        crew.machines === 999 &&
        crew.upgrades === undefined
      ) {
        await closeSheet(page, "buys");
        check(
          await engineersSheetFits(page),
          `${label} engineers sheet fits with no scroll`,
        );
      }
      await close();
    }
  });
}

// Installed PWA (standalone), with status and gesture bar insets. The board
// is the measured 424x924 installed-app viewport and pads no insets (#370,
// Task 1 ruling), so only the page staying still and the vein are checked.
for (const viewport of [PHONE]) {
  section(`section 3 (standalone) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await open(
      viewport,
      { version: 4, mountain: CREW, lastSeen: Date.now() },
      { standalone: true },
    );
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    check(
      await noScroll(page),
      `${size} standalone PWA with insets has no scroll`,
    );

    // A real vein after minutes of play: on screen, on top, and tappable.
    await page.evaluate(() => {
      globalThis.__skewMs = 7 * 60 * 1000;
    });
    await page
      .waitForSelector(".golden-vein:not([hidden])", { timeout: 3_000 })
      .catch(() => undefined);
    const veinOnTop = await page.evaluate(() => {
      const vein = document.querySelector(".golden-vein");
      if (vein === null || vein.hidden) {
        return false;
      }
      const box = vein.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return (
        box.width > 0 &&
        y > 0 &&
        y < innerHeight &&
        x > 0 &&
        x < innerWidth &&
        hit !== null &&
        vein.contains(hit)
      );
    });
    check(
      veinOnTop,
      `${size} standalone golden vein appears on top of the window`,
    );
    if (veinOnTop) {
      await page.tap(".golden-vein");
      // The payout shows in the board note under the window (#371).
      await page
        .waitForSelector(".board-note.on .vein-note", { timeout: 2_000 })
        .catch(() => undefined);
      const note = await page
        .$eval(".board-note.on .vein-note", (element) => element.textContent)
        .catch(() => undefined);
      check(
        note?.startsWith("Golden vein!") === true,
        `${size} standalone golden vein pays when tapped`,
      );
    }
    await close();
  });
}

// A save from before staffing: the one-time "Your crew grew" card, at the
// smallest phone, over the game and dismissable, with no scroll.
for (const standalone of [false, true]) {
  section(`section 4 (line 816) ${JSON.stringify(standalone)}`, async () => {
    const viewport = PHONE;
    const label = `424x924${standalone ? " standalone" : ""}`;
    const { page, close } = await open(
      viewport,
      {
        legacy: true,
        version: 4,
        mountain: { ...CREW, helpers: 3 },
        lastSeen: Date.now(),
      },
      { standalone },
    );
    const crewText = await page.$eval(".welcome-crew", (el) => el.textContent);
    check(
      crewText?.endsWith("joined to run your machines.") === true,
      `${label} crew-grew note shows for an old save`,
    );
    const engineerText = await page.$eval(
      ".welcome-engineer",
      (el) => el.textContent,
    );
    check(
      engineerText === "Your best worker steps up as engineer.",
      `${label} engineer note shows for an old save that owns a borer`,
    );
    check(
      await coversBoard(page, ".welcome-back"),
      `${label} crew-grew card is laid over the game`,
    );
    check(await noScroll(page), `${label} crew-grew card has no scroll`);
    await page.tap(".welcome-continue");
    check(
      await page.$eval(".welcome-back", (el) => el.hidden),
      `${label} crew-grew card closes`,
    );
    await close();
  });
}

// Welcome-back, then the relic it uncovered.
section("section 5 (line 856)", async () => {
  {
    const viewport = PHONE;
    const { page, close } = await open(viewport, {
      version: 4,
      mountain: { ...BEFORE_LANTERN, helpers: 5 },
      lastSeen: Date.now() - 10 * 60 * 1000,
    });
    check(
      await coversBoard(page, ".welcome-back"),
      "welcome-back is laid over the game",
    );
    await page.tap(".welcome-continue");
    check(
      await coversBoard(page, ".relic-reveal"),
      "relic reveal is laid over the game",
    );
    await close();
  }
});

// Found tools on the Upgrades sheet, and keepsakes on a relic's detail (#148).
async function foundSheetsFit(page, { top = 0, bottom = 0 } = {}) {
  await openSheet(page, "upgrades");
  const tools = await page.$eval(
    OPEN_SHEET("upgrades"),
    (sheet, insets) => {
      const rows = [...sheet.querySelectorAll(".found-tool")].filter(
        (row) => row.closest("[hidden]") === null,
      );
      const text = rows.map((row) => row.textContent ?? "").join(" ");
      const list = sheet.querySelector(".board-sheet-list");
      if (list !== null) {
        list.scrollTop = 0;
      }
      const titleTop =
        sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      if (list !== null) {
        list.scrollTop = list.scrollHeight;
      }
      const close = sheet
        .querySelector(".board-sheet-back")
        ?.getBoundingClientRect();
      if (list !== null) {
        list.scrollTop = 0;
      }
      return {
        count: rows.length,
        found: text.includes("Found") && text.includes("Grandfather's pick"),
        clean: !text.includes("?") && !/\d/.test(text),
        titleOk: titleTop >= insets.top,
        closeOk:
          close !== undefined &&
          close.height >= 44 &&
          close.bottom <= innerHeight - insets.bottom,
      };
    },
    { top, bottom },
  );
  const toolsStill = await noScroll(page);
  await closeSheet(page, "upgrades");
  await openShelf(page);
  await page.evaluate(() => {
    document.querySelectorAll(".shelf-list li")[2]?.scrollIntoView();
  });
  await page.$$eval(".shelf-list li", (rows) => {
    rows[2]?.click();
  });
  const detail = await page.$eval(
    ".relic-detail .reveal-card",
    (card, insets) => {
      const box = card.getBoundingClientRect();
      const back = card
        .querySelector(".reveal-continue")
        ?.getBoundingClientRect();
      const stories = [...card.querySelectorAll(".keepsake-story")].filter(
        (row) => row.closest("li")?.hidden !== true,
      );
      const text = stories.map((row) => row.textContent ?? "").join(" ");
      return {
        fits: box.top >= 0 && box.bottom <= innerHeight,
        backOk:
          back !== undefined &&
          back.height >= 44 &&
          back.top >= insets.top &&
          back.bottom <= innerHeight - insets.bottom,
        stories: stories.length,
        clean: text.length > 0 && !text.includes("?") && !/\d/.test(text),
      };
    },
    { top, bottom },
  );
  const detailStill = await noScroll(page);
  const ok =
    tools.count === 4 &&
    tools.found &&
    tools.clean &&
    tools.titleOk &&
    tools.closeOk &&
    toolsStill &&
    detail.fits &&
    detail.backOk &&
    detail.stories === 5 &&
    detail.clean &&
    detailStill;
  return ok;
}

const FOUND_BELOW = {
  remaining: 74_000_000,
  pocket: 100,
  helpers: 12,
  carts: 2,
  drills: 1,
  borers: 1,
  machines: 0,
  kids: 0,
  finds: [
    "pick",
    "lamp",
    "map",
    "boots",
    "drawing",
    "watch",
    "whistle",
    "pebble",
    "ribbon",
  ],
};

for (const standalone of [false, true]) {
  section(`section 6 (line 977) ${JSON.stringify(standalone)}`, async () => {
    const viewport = PHONE;
    const label = `424x924${standalone ? " standalone" : ""}`;
    const { page, close } = await open(
      viewport,
      { version: 4, mountain: FOUND_BELOW, lastSeen: Date.now() },
      { standalone },
    );
    check(
      await foundSheetsFit(
        page,
        standalone ? STANDALONE_INSETS : { top: 0, bottom: 0 },
      ),
      `${label} found tools and keepsakes fit`,
    );
    await close();
  });
}

// Every relic found: the shelf scrolls inside itself, and a tapped relic's
// detail card (art, virtue, "Your power") sits over the game and fits.
for (const viewport of [[424, 924]]) {
  section(`section 7 (line 997) ${JSON.stringify(viewport)}`, async () => {
    const label = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await open(viewport, {
      version: 5,
      mountain: {
        remaining: 0,
        pocket: 0,
        helpers: 40,
        carts: 10,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
        staffed: 2,
      },
      lastSeen: Date.now(),
    });
    await openShelf(page);
    check(await noScroll(page), `${label} full shelf has no page scroll`);
    await page.evaluate(() => {
      document.querySelectorAll(".shelf-list li")[4]?.scrollIntoView();
    });
    await page.$$eval(".shelf-list li", (rows) => {
      rows[4]?.click();
    });
    check(
      await coversBoard(page, ".relic-detail"),
      `${label} relic detail is laid over the game`,
    );
    check(await noScroll(page), `${label} relic detail has no scroll`);
    const fits = await page.$eval(".relic-detail .reveal-card", (card) => {
      const box = card.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    });
    check(fits, `${label} relic detail card fits the screen`);
    await page.tap(".relic-detail .reveal-continue");
    check(
      await page.$eval(".relic-detail", (el) => el.hidden),
      `${label} relic detail closes back to the shelf`,
    );
    await close();
  });
}

// Mantle of the Hero: reveal, then the Legend finale over the game (#103).
// Version 5: one stone left on the 240M mountain, so the tap finds the Mantle.
for (const viewport of [[424, 924]]) {
  section(`section 8 (line 1045) ${JSON.stringify(viewport)}`, async () => {
    const label = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await open(viewport, {
      version: 5,
      mountain: {
        remaining: 1,
        pocket: 0,
        helpers: 999,
        carts: 999,
        drills: 999,
        borers: 999,
        machines: 999,
        kids: 999,
        staffed: 2,
      },
      lastSeen: Date.now(),
    });
    await page.tap(".board-window");
    await page.waitForSelector(".relic-reveal:not([hidden])");
    await page.tap(".relic-reveal:not(.legend) .reveal-continue");
    check(
      await coversBoard(page, ".legend"),
      `${label} Legend finale is laid over the game`,
    );
    check(await noScroll(page), `${label} Legend finale has no scroll`);
    const fits = await page.$eval(".legend-card", (card) => {
      const box = card.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    });
    check(fits, `${label} Legend card fits the screen`);
    await page.tap(".legend .reveal-continue");
    check(
      await page.$eval(".legend", (el) => el.hidden),
      `${label} Legend finale closes`,
    );
    await close();
  });
}

// Pass the mine to your kid (#131): the confirm, then the new run's header.
for (const viewport of [[424, 924]]) {
  section(`section 9 (line 1087) ${JSON.stringify(viewport)}`, async () => {
    const label = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await open(viewport, lastStoneSave());
    await page.tap(".board-window");
    await page.waitForSelector(".relic-reveal:not([hidden])");
    await page.tap(".relic-reveal:not(.legend) .reveal-continue");
    await page.tap(".legend .legend-pass");
    check(
      await coversBoard(page, ".legacy-dialog"),
      `${label} pass-the-mine confirm is laid over the game`,
    );
    check(await noScroll(page), `${label} pass-the-mine confirm has no scroll`);
    const fits = await page.$eval(".legacy-card", (card) => {
      const box = card.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    });
    check(fits, `${label} pass-the-mine card fits the screen`);
    await page.tap(".legacy-confirm");
    check(
      await page.$eval(".legacy-dialog", (el) => el.hidden),
      `${label} pass-the-mine confirm closes`,
    );
    check(
      await page.$eval(
        ".legacy-badge",
        (el) => !el.hidden && el.textContent === "Legacy ×2",
      ),
      `${label} Legacy badge shows ×2`,
    );
    // Let the last tap's float finish drifting first.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    check(await noScroll(page), `${label} new run has no scroll`);
    // The badge's words sit on the Legacy plate, inside the window and
    // above the crew plate (#371).
    const badgeFits = await page.$eval(".legacy-badge", (badge) => {
      const box = badge.getBoundingClientRect();
      const mine = document.querySelector(".board-mine");
      const crew = document.querySelector(".board-crew");
      if (mine === null || crew === null) {
        return { ok: false };
      }
      const inside = mine.getBoundingClientRect();
      const below = crew.getBoundingClientRect();
      return {
        ok:
          box.width > 0 &&
          badge.closest(".board-legacy") !== null &&
          box.left >= inside.left &&
          box.right <= inside.right &&
          box.top >= inside.top &&
          box.bottom <= inside.bottom &&
          box.bottom <= below.top,
        badge: [box.left, box.top, box.right, box.bottom].map(Math.round),
        mine: [inside.left, inside.top, inside.right, inside.bottom].map(
          Math.round,
        ),
        crewTop: Math.round(below.top),
      };
    });
    check(
      badgeFits.ok,
      `${label} Legacy badge sits inside the window, above the crew plate`,
    );
    if (!badgeFits.ok) {
      console.log("legacy badge", label, JSON.stringify(badgeFits));
    }
    await close();
  });
}

// Trouble is never saved, so the dev boot previews a cave-in. The card must
// stay on screen at the smallest phone, including the installed PWA.
for (const standalone of [false, true]) {
  section(`section 10 (line 1138) ${JSON.stringify(standalone)}`, async () => {
    const viewport = PHONE;
    const label = `424x924${standalone ? " standalone" : ""}`;
    const { page, close } = await open(
      viewport,
      { version: 4, mountain: CREW, lastSeen: Date.now() },
      { standalone, search: "?trouble=cave-in" },
    );
    await openSheet(page, "buys");
    const card = await page
      .$eval('.tier[data-tier="cart"]', (el) => {
        const box = el.getBoundingClientRect();
        return {
          kind: el.dataset.trouble ?? "",
          rate: el.querySelector(".board-row-info")?.textContent ?? "",
          label: el.getAttribute("aria-label") ?? "",
          height: box.height,
          width: box.width,
          top: box.top,
          bottom: box.bottom,
        };
      })
      .catch(() => undefined);
    check(card?.kind === "cave-in", `${label} trouble card is a cave-in`);
    // The shout leads the row's info line: "Cave-in! · Hold to fix" (#373).
    check(
      card?.rate.split(" · ")[0] === "Cave-in!",
      `${label} trouble card says Cave-in!`,
    );
    check(
      card !== undefined &&
        !/\d|\?/.test(card.label) &&
        card.label.includes("Cave-in"),
      `${label} trouble card label has no numbers`,
    );
    check(
      (card?.height ?? 0) >= 44 && (card?.width ?? 0) >= 44,
      `${label} trouble card is a fat target`,
    );
    const fits = await page.evaluate(
      (bottomInset) => {
        const el = document.querySelector('.tier[data-tier="cart"]');
        if (el === null) {
          return false;
        }
        const box = el.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight - bottomInset;
      },
      standalone ? STANDALONE_INSETS.bottom : 0,
    );
    check(fits, `${label} trouble card sits on screen`);
    check(await noScroll(page), `${label} trouble card has no scroll`);
    await close();
  });
}

// An expedition still out: the chip shows in the Running now note, and the
// sheet (Recall, posts, the way back) fits the phone, including the PWA.
for (const standalone of [false, true]) {
  section(`section 11 (line 1191) ${JSON.stringify(standalone)}`, async () => {
    const viewport = PHONE;
    const label = `424x924${standalone ? " standalone" : ""}`;
    const now = Date.now();
    const { page, close } = await open(
      viewport,
      {
        version: 4,
        mountain: {
          remaining: 90_700_000,
          pocket: 9_765,
          helpers: 51,
          carts: 24,
          drills: 6,
          borers: 2,
          engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
          expeditions: [
            {
              engineer: "Ada",
              tunnel: "old-shaft",
              sentAt: now,
              returnsAt: now + 40 * 60_000,
              home: "borer",
              find: { kind: "quiet" },
            },
          ],
        },
        lastSeen: now,
      },
      { standalone },
    );
    const insets = standalone ? STANDALONE_INSETS : { top: 0, bottom: 0 };
    // The trip's clock lives in the Running now note the dial opens (#370).
    await page.tap(".board-dial");
    await page
      .waitForSelector(".board-note.on .effect-row", { timeout: 2_000 })
      .catch(() => undefined);
    const chip = await page.evaluate(() => {
      const board = globalThis.__board();
      const note = document.querySelector(".board-note.on");
      const row = note?.querySelector(".board-running .effect-row");
      const shown = [...(row?.querySelectorAll(".expedition-chip") ?? [])].find(
        (el) => !el.hidden,
      );
      if (note === null || shown === undefined) {
        return { ok: false, text: "" };
      }
      const box = shown.getBoundingClientRect();
      const host = note.getBoundingClientRect();
      const text = shown.textContent ?? "";
      return {
        ok:
          box.width > 0 &&
          box.top >= host.top - 1 &&
          box.bottom <= host.bottom + 1 &&
          box.left >= host.left - 1 &&
          box.right <= host.right + 1 &&
          host.left >= board.left &&
          host.right <= board.right &&
          host.top >= board.top &&
          host.bottom <= board.saveTop &&
          text.includes("Ada") &&
          /\d+:\d{2}|\dh\d{2}/.test(text),
        text,
      };
    });
    check(
      chip.ok,
      `${label} expedition chip sits in the Running now note (${chip.text})`,
    );
    check(await noScroll(page), `${label} expedition chip has no scroll`);
    await page.tap(KEY("engineers"));
    const sheet = await page.$eval(
      ".engineers-dialog",
      (dialog, pad) => {
        const buttons = [...dialog.querySelectorAll("button")].filter(
          (button) => !button.hidden && button.getClientRects().length > 0,
        );
        const boxesOk = buttons.every((button) => {
          const box = button.getBoundingClientRect();
          return (
            box.height >= 44 &&
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.top >= pad.top &&
            box.bottom <= innerHeight - pad.bottom &&
            button.scrollWidth <= button.clientWidth + 1
          );
        });
        const close =
          dialog.querySelector(".engineers-close")?.getBoundingClientRect()
            .bottom ?? Infinity;
        const title =
          dialog.querySelector("h2")?.getBoundingClientRect().top ?? -1;
        // Only what shows: How it works cards stay hidden until "i" (#246).
        const text = dialog.innerText;
        const recall = dialog.querySelector(".engineer-recall");
        return {
          boxesOk,
          count: buttons.length,
          titleOk: title >= pad.top,
          closeOk: close <= innerHeight - pad.bottom,
          recall: recall !== null && !recall.hidden,
          words:
            text.includes("Call her back") &&
            text.includes("exploring the old shaft") &&
            !text.includes("?") &&
            !text.includes("%"),
          discovery: [...dialog.querySelectorAll(".engineer-trip")]
            .filter((node) => !node.hidden && node.closest("[hidden]") === null)
            .map((node) => node.textContent ?? "")
            .every((line) => line.length > 0 && !/\d|\?/.test(line)),
        };
      },
      insets,
    );
    check(
      sheet.boxesOk &&
        sheet.count >= 3 &&
        sheet.titleOk &&
        sheet.closeOk &&
        sheet.recall &&
        sheet.words &&
        sheet.discovery,
      `${label} engineers sheet fits with an expedition out`,
    );
    if (!(sheet.boxesOk && sheet.closeOk && sheet.recall)) {
      console.log("expedition sheet", sheet);
    }
    check(await noScroll(page), `${label} expedition sheet has no scroll`);
    await close();
  });
}

// Five engineers, one open card and four rows, plus a keepsake they brought
// home. Short phones and the installed PWA, with no scroll.
for (const viewport of [PHONE]) {
  section(`section 12 (line 1322) ${JSON.stringify(viewport)}`, async () => {
    for (const standalone of [false, true]) {
      const label = `${String(viewport[0])}x${String(viewport[1])}${standalone ? " standalone" : ""}`;
      const now = Date.now();
      const { page, close } = await open(
        viewport,
        {
          version: 4,
          mountain: {
            remaining: 90_700_000,
            pocket: 9_765,
            helpers: 51,
            carts: 24,
            drills: 6,
            borers: 2,
            engineers: [
              { name: "Ada", rank: 1, trips: 3, post: "borer" },
              { name: "Nils", rank: 0, trips: 0, post: "camp" },
              { name: "Ruth", rank: 2, trips: 9, post: "drill" },
              { name: "Otto", rank: 0, trips: 0, post: "tunnel" },
              { name: "Mae", rank: 0, trips: 0, post: "cart" },
            ],
            expeditions: [
              {
                engineer: "Otto",
                tunnel: "old-shaft",
                sentAt: now,
                returnsAt: now + 40 * 60_000,
                home: "camp",
                find: { kind: "quiet" },
              },
            ],
            finds: ["drawing", "watch"],
          },
          lastSeen: now,
        },
        { standalone },
      );
      const insets = standalone ? STANDALONE_INSETS : { top: 0, bottom: 0 };
      await page.tap(KEY("engineers"));
      const crew = await page.$eval(
        ".engineers-dialog",
        (dialog, pad) => {
          const buttons = [...dialog.querySelectorAll("button")].filter(
            (button) => !button.hidden && button.getClientRects().length > 0,
          );
          const boxesOk = buttons.every((button) => {
            const box = button.getBoundingClientRect();
            return (
              box.height >= 44 &&
              box.left >= 0 &&
              box.right <= innerWidth &&
              box.top >= pad.top &&
              box.bottom <= innerHeight - pad.bottom &&
              button.scrollWidth <= button.clientWidth + 1
            );
          });
          const promote = dialog.querySelector(".engineer-promote");
          const promoteBottom =
            promote?.getBoundingClientRect().bottom ?? Infinity;
          const brought = dialog.querySelector(".engineer-brought");
          const broughtSize = brought
            ? Number.parseFloat(getComputedStyle(brought).fontSize)
            : 0;
          const text = dialog.textContent ?? "";
          return {
            boxesOk,
            open: dialog.querySelectorAll(".engineer.is-open").length,
            mini: dialog.querySelectorAll(".engineer.is-mini").length,
            promoteOk: promoteBottom <= innerHeight - pad.bottom,
            brought: brought !== null && !brought.hidden,
            broughtSize,
            story: text.includes("A child's drawing"),
            sheetScroll: dialog.scrollHeight <= dialog.clientHeight + 1,
            words: !text.includes("?"),
            discovery: [
              ...dialog.querySelectorAll(
                ".engineer-trip, .engineer-brought-story, .keepsake-story",
              ),
            ]
              .map((node) => node.textContent ?? "")
              .every((line) => line.length === 0 || !/\d|\?/.test(line)),
          };
        },
        insets,
      );
      check(
        crew.boxesOk &&
          crew.open === 1 &&
          crew.mini === 4 &&
          crew.promoteOk &&
          crew.brought &&
          crew.broughtSize >= 16 &&
          crew.story &&
          crew.sheetScroll &&
          crew.words &&
          crew.discovery &&
          (await noScroll(page)),
        `${label} five engineers and a keepsake fit with no scroll`,
      );
      if (!crew.boxesOk || !crew.sheetScroll || !crew.promoteOk) {
        console.log("five engineers", label, crew);
      }
      await close();
    }
  });
}

// Welcome card naming a find, over the game, at the short phone and the PWA.
for (const standalone of [false, true]) {
  section(`section 13 (line 1430) ${JSON.stringify(standalone)}`, async () => {
    const viewport = PHONE;
    const label = `424x924${standalone ? " standalone" : ""}`;
    const now = Date.now();
    const { page, close } = await open(
      viewport,
      {
        version: 4,
        mountain: {
          remaining: 90_700_000,
          pocket: 9_765,
          helpers: 20,
          carts: 1,
          drills: 1,
          borers: 1,
          engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
          expeditions: [
            {
              engineer: "Ada",
              tunnel: "old-shaft",
              sentAt: now - 90 * 60_000,
              returnsAt: now - 30 * 60_000,
              home: "borer",
              find: { kind: "tool", id: "pick" },
            },
          ],
        },
        lastSeen: now - 2 * 60 * 60_000,
      },
      { standalone },
    );
    const bottom = standalone ? STANDALONE_INSETS.bottom : 0;
    const card = await page.$eval(
      ".welcome-back",
      (dialog, inset) => {
        const line = dialog.querySelector(".welcome-return")?.textContent ?? "";
        const closeBox = dialog
          .querySelector(".welcome-continue")
          ?.getBoundingClientRect();
        const title =
          dialog.querySelector("h2")?.getBoundingClientRect().top ?? -1;
        return {
          hidden: dialog.hidden,
          line,
          title: dialog.querySelector("h2")?.textContent ?? "",
          titleOk: title >= 0,
          closeOk:
            closeBox !== undefined &&
            closeBox.height >= 44 &&
            closeBox.top >= 0 &&
            closeBox.bottom <= innerHeight - inset,
        };
      },
      bottom,
    );
    check(
      !card.hidden &&
        card.title === "While you were away" &&
        card.line ===
          "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper." &&
        !/\d|\?/.test(card.line) &&
        card.titleOk &&
        card.closeOk,
      `${label} welcome card names the find`,
    );
    if (card.hidden || !card.closeOk) {
      console.log("welcome find", card);
    }
    check(
      await coversBoard(page, ".welcome-back"),
      `${label} welcome card with a find is laid over the game`,
    );
    check(
      await noScroll(page),
      `${label} welcome card with a find has no scroll`,
    );
    await page.tap(".welcome-continue");
    check(
      await page.$eval(".welcome-back", (el) => el.hidden),
      `${label} welcome card with a find closes`,
    );
    await close();
  });
}

/** Workshop sheet (#199): real numbers, no scroll, a dark sketch, a named refund. */
const WORKSHOP_SIZES = SCREENS;
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

for (const viewport of WORKSHOP_SIZES) {
  section(`section 14 (line 1531) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const now = Date.now();
    const { page, close } = await open(viewport, workshopSave(now, true));
    await press(page, KEY("ledger"));
    await press(page, ".workshop-open");
    const laid = await coversBoard(page, ".workshop-dialog");
    const fit = await page.$eval(".workshop-dialog", (sheet) => {
      const board = globalThis.__board();
      // Crafts sit in a list that may scroll. Every other button stays on screen.
      const buttons = [...sheet.querySelectorAll("button")].filter(
        (button) =>
          !button.hidden &&
          button.getClientRects().length > 0 &&
          button.closest(".workshop-recipes") === null,
      );
      const boxes = buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return {
          height: box.height / board.scale,
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          clipped: button.scrollWidth > button.clientWidth + 1,
          text: button.textContent ?? "",
        };
      });
      const text = sheet.textContent ?? "";
      const sketch = sheet.querySelector(".workshop-card.is-hidden");
      const labels = [
        ...sheet.querySelectorAll(".label, .workshop-craft, .workshop-cancel"),
      ];
      const typeOk = labels.every(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 14.4,
      );
      const misses = boxes.filter(
        (box) =>
          !(
            box.height >= 44 &&
            box.top >= board.top &&
            box.bottom <= board.saveTop &&
            box.left >= board.left &&
            box.right <= board.right &&
            !box.clipped
          ),
      );
      return {
        boxesOk: misses.length === 0,
        misses,
        count: boxes.length,
        text,
        sketch: sketch?.textContent ?? "",
        typeOk,
        cancel: sheet.querySelector(".workshop-cancel")?.textContent ?? "",
      };
    });
    const still = await noScroll(page);
    check(
      laid &&
        still &&
        fit.boxesOk &&
        fit.count >= 3 &&
        fit.typeOk &&
        fit.text.includes("On the bench: Sturdy props") &&
        fit.text.includes("left") &&
        fit.text.includes("Lv 0/2") &&
        fit.text.includes("500K stones") &&
        fit.text.includes("Bench busy") &&
        fit.cancel.includes("250K") &&
        fit.cancel.includes("clay") &&
        fit.cancel.includes("iron") &&
        fit.text.includes("Axle grease") &&
        fit.sketch === "A folded sketch, still in the dark." &&
        !/[?]/.test(fit.text) &&
        !/\d/.test(fit.sketch),
      `${size} workshop sheet fits with real numbers`,
    );
    if (!fit.boxesOk || !still || !fit.typeOk) {
      console.log("workshop fit", size, JSON.stringify(fit.misses), fit);
    }
    const timerSplit = await page.$eval(".workshop-dialog", (sheet) => {
      const bench = sheet.querySelector(".workshop-bench");
      const timers = sheet.querySelector(".workshop-timers");
      return (
        bench !== null &&
        timers !== null &&
        !bench.contains(timers) &&
        !timers.hidden
      );
    });
    check(timerSplit, `${size} the live timer sits apart from the bench`);
    await shot(page, `workshop-busy-${size}`);
    if (viewport[0] === 390) {
      await page.tap(".workshop-cancel");
      const armed = await page.$eval(
        ".workshop-cancel",
        (button) => button.textContent ?? "",
      );
      const stillBusy = await page.$eval(
        ".workshop-bench",
        (bench) => bench.textContent ?? "",
      );
      check(
        armed === "Tap again to cancel" && stillBusy.includes("On the bench"),
        `${size} cancel asks for a second tap`,
      );
      await shot(page, "workshop-cancel-confirm-424x924");
      await page.tap(".workshop-cancel");
      const freed = await page.$eval(
        ".workshop-bench",
        (bench) => bench.textContent ?? "",
      );
      check(
        freed.includes("The bench is free"),
        `${size} cancel clears the bench`,
      );
      await shot(page, "workshop-free-424x924");
      if ((await page.$(".workshop-craft.is-short")) === null) {
        const more = await page.$(".workshop-more:not([hidden])");
        if (more !== null) {
          await more.tap();
        }
      }
      const short = await page.$(".workshop-craft.is-short");
      const shortText = await page.$eval(".workshop-dialog", (sheet) =>
        [...sheet.querySelectorAll(".workshop-need")].map(
          (line) => line.textContent ?? "",
        ),
      );
      check(
        shortText.some(
          (text) => text.startsWith("Need ") && text.includes(" more "),
        ),
        `${size} a short craft says what is missing`,
      );
      if (short !== null) {
        await short.tap();
      }
      const shaking = await page.$eval(
        ".workshop-dialog",
        (sheet) => sheet.querySelector(".is-shaking") !== null,
      );
      check(shaking, `${size} a short craft shakes`);
      await shot(page, "workshop-shake-424x924");
      if (
        (await page.$(
          "[data-recipe='axle-grease'] .workshop-craft:not(.is-short)",
        )) === null
      ) {
        const earlier = await page.$(".workshop-earlier:not([hidden])");
        if (earlier !== null) {
          await earlier.tap();
        }
      }
      const ready = await page.$(
        "[data-recipe='axle-grease'] .workshop-craft:not(.is-short)",
      );
      if (ready !== null) {
        await ready.tap();
      }
      const hammer = await page.$eval(".workshop-bench", (bench) =>
        bench.classList.contains("is-hammer"),
      );
      const floated = await page.$eval(
        ".workshop-floats",
        (host) => host.querySelectorAll(".float-chip").length,
      );
      check(
        hammer && floated > 0,
        `${size} a craft floats materials and taps the hammer`,
      );
      await shot(page, "workshop-hammer-424x924");
    }
    await close();
  });
}

section("section 15 (line 1703)", async () => {
  {
    const now = Date.now();
    const { page, close } = await open(PHONE, {
      version: 6,
      lastSeen: now,
      mountain: {
        remaining: 239_500_000,
        pocket: 100,
        helpers: 1,
        staffed: 2,
        startedAt: now - 1_000,
      },
      workshop: {
        materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
        recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
      },
    });
    await page.tap(KEY("ledger"));
    const locked = await page.$eval(".workshop-locked", (row) => ({
      text: row.textContent ?? "",
      hidden: row.hidden,
    }));
    const openHidden = await page.$eval(
      ".workshop-open",
      (button) => button.hidden,
    );
    check(
      !locked.hidden &&
        locked.text.includes("Workshop · opens as the clay comes in") &&
        !locked.text.includes("?") &&
        openHidden,
      "424x924 workshop is a locked silhouette before the first clay",
    );
    await shot(page, "workshop-locked-424x924");
    check(await noScroll(page), "424x924 locked menu has no page scroll");
    await close();
  }
});

/**
 * Layer card, folded welcome, craft-done notice, and the four-chip line (#200).
 * Same sizes as the workshop check.
 */
const NOTICE_SIZES = [[424, 924]];

function noticeSave({ mined, lastSeen, mountain = {}, workshop = {} }) {
  return {
    version: 6,
    lastSeen,
    mountain: {
      remaining: 240_000_000 - mined,
      pocket: 20,
      helpers: 0,
      carts: 0,
      staffed: 2,
      ...mountain,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
      ...workshop,
    },
  };
}

/** Visible buttons and reading-size labels inside one root. */
async function fitOf(page, selector, labelSelector) {
  return page.$eval(
    selector,
    (root, labelsOf) => {
      const shown = (node) => {
        if (node.hidden || getComputedStyle(node).visibility === "hidden") {
          return false;
        }
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };
      // The board's own controls have their own bars (the board section).
      const buttons = [...root.querySelectorAll("button")]
        .filter(shown)
        .filter(
          (button) =>
            button.closest(
              ".board-top, .board-saveline, .board-drawer-clip, .board-note, .board-bays, .board-ready-row",
            ) === null,
        );
      const boxes = buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return {
          height: box.height,
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          text: button.textContent ?? "",
        };
      });
      const labels = [...root.querySelectorAll(labelsOf)].filter(
        (node) => shown(node) && (node.textContent ?? "").trim() !== "",
      );
      const typeOk =
        labels.length > 0 &&
        labels.every(
          (node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 14.4,
        );
      return {
        boxesOk:
          boxes.length > 0 &&
          boxes.every(
            (box) =>
              box.height >= 44 &&
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              box.left >= 0 &&
              box.right <= innerWidth,
          ),
        typeOk,
        texts: boxes.map((box) => box.text),
        body: root.textContent ?? "",
      };
    },
    labelSelector,
  );
}

for (const viewport of NOTICE_SIZES) {
  section(`section 16 (line 1822) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const now = Date.now();

    {
      const { page, close } = await open(
        viewport,
        noticeSave({ mined: 9_999_999, lastSeen: now }),
      );
      await page.tap(".board-window");
      await page.waitForSelector(".relic-reveal:not([hidden])", {
        timeout: 3_000,
      });
      await page.tap(".reveal-continue");
      await page.waitForSelector(".layer-arrival:not([hidden])", {
        timeout: 3_000,
      });
      const fit = await fitOf(page, ".layer-card", "h2, p, button");
      const still = await noScroll(page);
      check(
        still &&
          fit.boxesOk &&
          fit.typeOk &&
          fit.texts.includes("Dig on") &&
          fit.body.includes("You broke into the Granite!") &&
          fit.body.includes("The Granite suits borers. Tough on drills.") &&
          fit.body.includes("A sketch for the shed came up with the rock.") &&
          !/[0-9?]/.test(
            fit.body.slice(fit.body.indexOf("A sketch for the shed")),
          ),
        `${size} layer card fits, Dig on is on screen`,
      );
      if (!still || !fit.boxesOk || !fit.typeOk) {
        console.log("layer card", size, fit);
      }
      await shot(page, `layer-card-check-${size}`);
      await close();
    }

    {
      const { page, close } = await open(
        viewport,
        noticeSave({
          mined: 9_990_000,
          lastSeen: now - 30 * 60 * 1000,
          mountain: { helpers: 20, carts: 1, pocket: 5_000_000 },
          workshop: {
            materials: { clay: 9, iron: 4, crystal: 0, heartstone: 0 },
            recipes: [
              "iron-rails",
              "sturdy-props",
              "blasting-charge",
              "reinforce",
              "axle-grease",
            ],
            bench: {
              recipe: "iron-rails",
              startedAt: now - 20 * 60 * 1000,
              endsAt: now - 10 * 60 * 1000,
            },
          },
        }),
      );
      await page.waitForSelector(".welcome-layer", { timeout: 3_000 });
      await page.waitForSelector(".welcome-craft", { timeout: 3_000 });
      const fit = await fitOf(page, ".welcome-card", "h2, p, button");
      const still = await noScroll(page);
      check(
        still &&
          fit.boxesOk &&
          fit.typeOk &&
          fit.texts.includes("Back to the mountain") &&
          fit.body.includes("You broke into the Granite!") &&
          fit.body.includes("The Granite suits borers. Tough on drills.") &&
          fit.body.includes("A sketch for the shed came up with the rock.") &&
          fit.body.includes("are fitted") &&
          fit.body.includes("/s"),
        `${size} welcome card folds in the layer and the fitted craft`,
      );
      if (!still || !fit.boxesOk || !fit.typeOk) {
        console.log("welcome fold", size, fit);
      }
      await shot(page, `welcome-fold-${size}`);
      await close();
    }

    {
      const { page, close } = await open(
        viewport,
        noticeSave({
          mined: 12_000_000,
          lastSeen: now,
          mountain: { helpers: 1, carts: 1, pocket: 5_000_000 },
          workshop: {
            materials: { clay: 10, iron: 6, crystal: 0, heartstone: 0 },
            recipes: [
              "iron-rails",
              "sturdy-props",
              "blasting-charge",
              "reinforce",
              "axle-grease",
            ],
            bench: {
              recipe: "iron-rails",
              startedAt: now - 600_000,
              endsAt: now + 700,
            },
          },
        }),
      );
      await page.waitForSelector(".craft-notice:not([hidden])", {
        timeout: 5_000,
      });
      const fit = await fitOf(page, ".notice-card", "p, button");
      const still = await noScroll(page);
      check(
        still &&
          fit.boxesOk &&
          fit.typeOk &&
          fit.texts.includes("The crew feels it") &&
          fit.body.includes("are fitted") &&
          fit.body.includes("/s"),
        `${size} craft-done notice fits, the accept button is on screen`,
      );
      if (!still || !fit.boxesOk || !fit.typeOk) {
        console.log("craft notice", size, fit);
      }
      await shot(page, `craft-notice-check-${size}`);
      await close();
    }

    {
      const { page, close } = await open(
        viewport,
        noticeSave({
          mined: 130_000_000,
          lastSeen: now,
          mountain: { helpers: 1, pocket: 1_000 },
          workshop: {
            materials: { clay: 10, iron: 35, crystal: 15, heartstone: 1 },
            recipes: [
              "iron-rails",
              "sturdy-props",
              "blasting-charge",
              "reinforce",
              "axle-grease",
              "diamond-bits",
              "crystal-flare",
              "heartstone-core",
              "heartstone-ember",
            ],
          },
        }),
      );
      const line = await page.$eval(
        ".material-line",
        (row) => row.textContent ?? "",
      );
      // The material line is in the ledger, which the Ledger key opens until
      // B7 (#373): its chips are read where he sees them, in the open menu.
      await press(page, KEY("ledger"));
      await page
        .waitForSelector(".game-menu:not([hidden]) .material-bit", {
          visible: true,
          timeout: 3_000,
        })
        .catch(() => undefined);
      const fit = await fitOf(page, ".game-menu", ".material-bit");
      const still = await noScroll(page);
      const chipsOk = ["Clay", "Iron", "Crystal", "Heartstone"].every((name) =>
        line.includes(name),
      );
      check(
        still && chipsOk && fit.boxesOk && fit.typeOk && !line.includes("?"),
        `${size} mountain shows all four material chips`,
      );
      if (!still || !chipsOk || !fit.boxesOk || !fit.typeOk) {
        console.log("four chips", size, line, fit);
      }
      await shot(page, `materials-four-${size}`);
      await close();
    }

    {
      const { page, close } = await open(
        viewport,
        noticeSave({
          mined: 4_500_000,
          lastSeen: now,
          mountain: {
            pocket: 255_200,
            helpers: 28,
            carts: 13,
            drills: 5,
            upgrades: { boots: 1, cartSyn: 1 },
          },
          workshop: {
            materials: { clay: 4, iron: 0, crystal: 0, heartstone: 0 },
          },
        }),
      );
      // Each tier's gain and lines are its row in the Buys drawer (#373).
      await openSheet(page, "buys");
      const rows = await page.$$eval(".tier", (nodes) =>
        nodes.map((node) => ({
          tier: node.dataset.tier ?? "",
          locked: node.classList.contains("is-locked"),
          gain: node.querySelector(".board-row-gain")?.textContent ?? "",
          info: node.querySelector(".board-row-info")?.textContent ?? "",
          label: node.getAttribute("aria-label") ?? "",
        })),
      );
      const cartRow = rows.find((row) => row.tier === "cart");
      const cart = cartRow?.gain;
      // Before the Granite (10M) the borer is a locked preview that names its
      // depth (#250, #356): "Borer · 10M", or the longer line that says it.
      const borerRow = rows.find((row) => row.tier === "borer");
      const borer =
        borerRow?.locked === true && /\b10M\b/.test(borerRow.info)
          ? borerRow.info
          : undefined;
      const inside = await page.$$eval(
        ".tier .board-row-info, .tier .board-row-gain",
        (nodes) =>
          nodes.every((node) => {
            const card = node.closest(".tier");
            if (card === null || card.closest("[hidden]") !== null) {
              return true;
            }
            if (node.hidden || getComputedStyle(node).display === "none") {
              return true;
            }
            const rate = node.getBoundingClientRect();
            const box = card.getBoundingClientRect();
            return (
              rate.height > 0 &&
              rate.bottom <= box.bottom + 1 &&
              rate.right <= box.right + 1
            );
          }),
      );
      const still = await noScroll(page);
      const gainsOk =
        still &&
        inside &&
        // The row's gain is what one more cart adds, "+15/s"; the crew
        // synergy it carries is in the row's label (#373).
        cart !== undefined &&
        /^\+[\d.,]+[KMBT]?\/s$/.test(cart) &&
        !cart.startsWith("\u2191") &&
        (cartRow?.label ?? "").includes("faster from crew synergy") &&
        borer !== undefined;
      check(
        gainsOk,
        `${size} cart shows +N and the locked borer says where it opens`,
      );
      if (!gainsOk) {
        console.log(
          "crew gains",
          size,
          JSON.stringify({ rows, inside, still }),
        );
      }
      // The crew line is the Crew section at the top of Buys (#371), under
      // its Crew legend; its chips name the posts, and the words a screen
      // reader hears count the free hands too. Text, not a door (#373).
      const posts = await page.$eval(OPEN_SHEET("buys"), (sheet) => {
        const section = sheet.querySelector(".crew");
        const line = section?.querySelector(".crew-posts");
        const words = line?.querySelector(".crew-posts-words");
        const title = sheet.querySelector('.board-sec[data-sec="crew"]');
        const box = line?.getBoundingClientRect();
        const chips = [...(line?.querySelectorAll(".crew-bit") ?? [])];
        const sheetBox = sheet.getBoundingClientRect();
        return {
          text: chips.map((chip) => chip.textContent ?? "").join(" | "),
          label: words?.textContent ?? "",
          height: box?.height ?? 0,
          chipsOk:
            chips.length > 0 &&
            chips.every((chip) => {
              const at = chip.getBoundingClientRect();
              return (
                Number.parseFloat(getComputedStyle(chip).fontSize) >= 13 &&
                at.left >= sheetBox.left &&
                at.right <= sheetBox.right
              );
            }),
          titled:
            title !== null &&
            (title.textContent ?? "").startsWith("Crew") &&
            box !== undefined &&
            title.getBoundingClientRect().bottom <= box.top + 0.5,
        };
      });
      const named = posts.text.includes("on carts");
      check(
        named &&
          posts.titled &&
          posts.chipsOk &&
          posts.label.includes("on carts") &&
          posts.label.includes("free") &&
          (await noScroll(page)),
        `${size} worker line names where the crew is`,
      );
      if (!named || !posts.titled || !posts.chipsOk) {
        console.log("posts", size, posts);
      }
      await shot(page, `crew-gains-${size}`);
      await close();
    }
  });
}

// One writer tab. The other shows a card and does not scroll in Chrome on the phone.
section("section 17 (line 2085)", async () => {
  {
    const context = await browser.createBrowserContext();
    const [width, height] = PHONE;
    const first = await context.newPage();
    const second = await context.newPage();
    for (const page of [first, second]) {
      await boardProbe(page);
      page.on("pageerror", (error) => {
        failures.push(`other tab: ${String(error)}`);
      });
      await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    }
    await first.goto(BASE, { waitUntil: "networkidle0" });
    await second.goto(BASE, { waitUntil: "networkidle0" });
    await second.waitForSelector(".other-tab:not([hidden])", {
      timeout: 5_000,
    });
    const title = await second.$eval(
      "#other-tab-title",
      (element) => element.textContent,
    );
    const body = await second.$eval(
      ".other-tab-body",
      (element) => element.textContent,
    );
    const button = await second.$eval(".other-tab-play", (element) => ({
      text: element.textContent,
      height: element.getBoundingClientRect().height,
    }));
    check(
      title === "Playing in another tab" &&
        body === "The other one has the mountain. Nothing here is lost." &&
        button.text === "Play here" &&
        button.height >= 48,
      "424x924 other tab card is gentle and fat",
    );
    check(
      await coversBoard(second, ".other-tab"),
      "424x924 other tab card is laid over the game",
    );
    check(await noScroll(second), "424x924 other tab has no scroll");
    await shot(second, "other-tab-424x924");
    await first.bringToFront();
    await first.tap(".board-window");
    // The odometer reads the pocket in words for a screen reader (#370).
    const kept = await first.$eval(".board-odo", (element) =>
      element.getAttribute("aria-label"),
    );
    await second.bringToFront();
    await second.tap(".other-tab-play");
    await second.waitForSelector(".other-tab[hidden]", { timeout: 5_000 });
    await first.bringToFront();
    await first.waitForSelector(".other-tab:not([hidden])", { timeout: 5_000 });
    const moved = await second.$eval(".board-odo", (element) =>
      element.getAttribute("aria-label"),
    );
    check(
      kept === "Stones 1" && moved === "Stones 1",
      "424x924 Play here keeps the stone",
    );
    check(await noScroll(second), "424x924 after Play here has no scroll");
    check(
      await noScroll(first),
      "424x924 the tab that stepped aside has no scroll",
    );
    await shot(first, "other-tab-stepped-aside-424x924");
    await shot(second, "other-tab-playing-here-424x924");
    await context.close();
  }
});

// Two saves found. The real sheet, no scrollbar in Chrome on the phone.
section("section 18 (line 2148)", async () => {
  {
    const { page, close } = await open(PHONE, {}, { search: "?saves=two" });
    await page.waitForSelector(".save-conflict:not([hidden])", {
      timeout: 5_000,
    });
    const title = await page.$eval(
      "#save-conflict-title",
      (element) => element.textContent,
    );
    const body = await page.$eval(
      ".save-conflict-body",
      (element) => element.textContent,
    );
    const play = await page.$eval(".save-conflict-play", (element) => ({
      text: element.textContent,
      height: element.getBoundingClientRect().height,
    }));
    const cards = await page.$$eval(".save-card", (elements) =>
      elements.map((element) => element.textContent ?? ""),
    );
    const sheetFits = await page.$eval(
      ".save-conflict",
      (element) => element.scrollHeight <= element.clientHeight + 1,
    );
    check(title === "Two saves found", "424x924 conflict sheet is titled");
    check(
      (body ?? "").includes("nothing is lost") && !(body ?? "").includes("?"),
      "424x924 conflict sheet has no placeholder question",
    );
    check(
      // 12.4M of depth reads 10M + 2.4M x 2.625 in the Granite's stones (#357).
      cards.some((card) => card.includes("Granite, 16.3M deep")) &&
        cards.some((card) => card.includes("This phone")) &&
        cards.some((card) => card.includes("Other device")),
      "424x924 conflict cards name both saves",
    );
    check(
      play.text === "Play this one" && play.height >= 48,
      "424x924 Play this one is a 48px target",
    );
    check(sheetFits, "424x924 conflict sheet does not scroll inside");
    check(
      await coversBoard(page, ".save-conflict"),
      "424x924 conflict sheet is laid over the game",
    );
    check(await noScroll(page), "424x924 conflict sheet has no scroll");
    await shot(page, "save-conflict-real-424x924");
    await page.click(".save-conflict-play");
    const confirm = await page.$eval(
      ".save-conflict-confirm",
      (element) => element.hidden !== true && (element.textContent ?? ""),
    );
    check(
      confirm.includes("saved for 7 days"),
      "424x924 Play this one asks before switching",
    );
    check(await noScroll(page), "424x924 conflict confirm has no scroll");
    await shot(page, "save-conflict-real-press-424x924");
    await close();
  }
});

// The relic plate is centred on the board, and the gauge row spans the board
// clear below its top, with a fat mine window (#370, #371). Locked keys
// stay quiet (#373).
const SHELF_VIEWS = SCREENS;
const PHONE_SHOTS = new Set(["424x924"]);

async function shelfCentre(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const plate = document.querySelector(".board-relics");
    const top = document.querySelector(".board-top");
    const row = document.querySelector(".board-gauge-row");
    const win = document.querySelector(".board-window");
    if (plate === null || top === null || row === null || win === null) {
      return { ok: false, delta: 999 };
    }
    const box = plate.getBoundingClientRect();
    const topBox = top.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const winBox = win.getBoundingClientRect();
    const mid = (box.left + box.right) / 2;
    const view = (board.left + board.right) / 2;
    // In board px, so a PC fit reads the same as the phone.
    const delta = (mid - view) / board.scale;
    const spanLeft = (rowBox.left - board.left) / board.scale;
    const spanRight = (board.right - rowBox.right) / board.scale;
    const spans = Math.abs(spanLeft) <= 2 && Math.abs(spanRight) <= 2;
    const clear = rowBox.top >= topBox.bottom - 0.5 && rowBox.height > 1;
    const fat =
      winBox.width / board.scale >= 96 && winBox.height / board.scale >= 96;
    return {
      ok: Math.abs(delta) <= 2 && spans && clear && fat,
      delta,
      spanLeft,
      spanRight,
      clear,
      fat,
      window: [winBox.width, winBox.height].map((side) =>
        Math.round(side / board.scale),
      ),
    };
  });
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

/**
 * Scrolls an open drawer's list (#373) to its first or last item: a section
 * legend, the crew line, a row or the footnote. The spare plate is not one.
 */
async function scrollSheet(page, name, edge) {
  await page.$eval(
    `${OPEN_SHEET(name)} .board-sheet-list`,
    (list, which) => {
      list.scrollTop = which === "start" ? 0 : list.scrollHeight;
    },
    edge,
  );
}

async function sheetEdges(page, name) {
  return page.evaluate((selector) => {
    const sheet = document.querySelector(selector);
    const element = sheet?.querySelector(".board-sheet-list");
    // The head holds the title, the kick and the 48px "i"; the items clear
    // all three, not just the title text.
    const headParts = [
      ...(sheet?.querySelectorAll(
        ".board-sheet-title, .board-sheet-kick, .board-sheet-info",
      ) ?? []),
    ].filter((node) => node.getClientRects().length > 0);
    // What stands under the list: Buys' footnote when it shows, else Back.
    const footer = [
      ...(sheet?.querySelectorAll(".board-sheet-footer > *") ?? []),
    ].find((node) => !node.hidden && node.getClientRects().length > 0);
    const cards = () =>
      [...(element?.children ?? [])].filter(
        (node) =>
          !node.hidden &&
          !node.classList.contains("board-spare") &&
          node.getClientRects().length > 0,
      );
    if (
      sheet === null ||
      element === null ||
      element === undefined ||
      headParts.length === 0 ||
      footer === null ||
      footer === undefined ||
      cards().length === 0
    ) {
      return { ok: false, topGap: -1, endGap: -1, first: "", last: "" };
    }
    const scale = globalThis.__board().scale;
    const firstEl = cards()[0];
    element.scrollTop = 0;
    const firstBox = firstEl.getBoundingClientRect();
    const headBottom = Math.max(
      ...headParts.map((node) => node.getBoundingClientRect().bottom),
    );
    const portTop = element.getBoundingClientRect();
    // Gaps in board px, so a PC fit reads the same as the phone.
    const topGap = (firstBox.top - headBottom) / scale;
    const lastEl = cards().at(-1);
    element.scrollTop = element.scrollHeight;
    const lastBox = lastEl.getBoundingClientRect();
    const foot = footer.getBoundingClientRect();
    const portEnd = element.getBoundingClientRect();
    const endGap = (foot.top - lastBox.bottom) / scale;
    const overflows = element.scrollHeight > element.clientHeight + 1;
    // The drawer stops under the odometer's legend, so a buy's spend shows
    // on the board above it (#370).
    const legend = document
      .querySelector(".board-odo-legend")
      ?.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    const odometerClear =
      legend !== undefined && sheetBox.top >= legend.bottom - 1;
    const app = document.querySelector("#app");
    const pageStill =
      scrollY === 0 &&
      (app?.scrollTop ?? 0) === 0 &&
      document.documentElement.scrollHeight ===
        document.documentElement.clientHeight;
    const gapOk = (gap) => {
      const rounded = Math.round(gap);
      return rounded >= 8 && (!overflows || rounded <= 16);
    };
    const firstIn =
      firstBox.top >= portTop.top - 0.5 &&
      firstBox.bottom <= portTop.bottom + 0.5;
    const lastIn =
      lastBox.top >= portEnd.top - 0.5 &&
      lastBox.bottom <= portEnd.bottom + 0.5;
    element.scrollTop = 0;
    const clip = (node) =>
      (node.textContent ?? "").replaceAll(/\s+/g, " ").slice(0, 42);
    return {
      ok:
        pageStill &&
        odometerClear &&
        firstIn &&
        lastIn &&
        firstBox.top >= headBottom &&
        lastBox.bottom <= foot.top &&
        gapOk(topGap) &&
        gapOk(endGap),
      topGap: Math.round(topGap * 10) / 10,
      endGap: Math.round(endGap * 10) / 10,
      overflows,
      odometerClear,
      firstIn,
      lastIn,
      first: clip(firstEl),
      last: clip(lastEl),
    };
  }, OPEN_SHEET(name));
}

for (const viewport of SHELF_VIEWS) {
  section(`section 19 (relic plate) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const shotThis = PHONE_SHOTS.has(size);
    {
      const { page, close } = await open(viewport, freshMountain());
      await page.waitForSelector(".board-relics");
      const centre = await shelfCentre(page);
      check(
        centre.ok && (await noScroll(page)),
        `${size} relic plate is centred and the screen does not scroll`,
      );
      if (!centre.ok) {
        console.log("shelf", size, centre);
      }
      const keys = await keyState(page);
      const freshPaint =
        keys.ok &&
        keyOpen(keys.buys) &&
        keyOpen(keys.upgrades) &&
        keyOpen(keys.ledger) &&
        [keys.workshop, keys.engineers].every(
          (key) => key.disabled && key.locked && key.dim,
        );
      check(
        freshPaint,
        `${size} fresh key rail: Buys, Upgrades and Ledger open, Workshop and Engineers locked`,
      );
      if (!freshPaint) {
        console.log("keys fresh", size, keys);
      }
      if (shotThis) {
        await shot(page, `mountain-fresh-${size}`);
      }
      await close();
    }
    {
      const { page, close } = await open(viewport, openMountain());
      await page.waitForSelector(".board-relics");
      const centre = await shelfCentre(page);
      check(
        centre.ok && (await noScroll(page)),
        `${size} relic plate with finds is centred and the screen does not scroll`,
      );
      if (!centre.ok) {
        console.log("shelf relics", size, centre);
      }
      const keys = await keyState(page);
      const openPaint =
        keys.ok &&
        [
          keys.buys,
          keys.workshop,
          keys.engineers,
          keys.upgrades,
          keys.ledger,
        ].every(keyOpen);
      check(openPaint, `${size} unlocked key rail is all open`);
      if (!openPaint) {
        console.log("keys open", size, keys);
      }
      // A found relic is lit in its socket; the next one is dark (#370).
      const lit = await page.$$eval(
        ".board-socket .board-relic",
        (relics) =>
          relics.filter((relic) => !relic.src.includes("-dark")).length,
      );
      check(lit >= 3, `${size} save with relics lights their sockets`);
      if (shotThis) {
        await shot(page, `mountain-relics-${size}`);
      }
      await close();
    }
  });
}

// Long Buys and Upgrades lists. The first card clears the header, the last
// card clears the footer, and the sheet stays below the odometer.
const SHEET_SHOTS = new Set(["424x924", "1366x768"]);
for (const viewport of SCREENS) {
  section(`section 20 (long sheets) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const shotThis = SHEET_SHOTS.has(size);
    const { page, close } = await open(viewport, crewMountain());
    await page.waitForSelector(".board-relics");
    for (const name of ["buys", "upgrades"]) {
      await openSheet(page, name);
      await scrollSheet(page, name, "start");
      if (shotThis) {
        await shot(page, `${name}-top-${size}`);
      }
      await scrollSheet(page, name, "end");
      if (shotThis) {
        await shot(page, `${name}-end-${size}`);
      }
      const edges = await sheetEdges(page, name);
      check(
        edges.ok,
        `${size} ${name} first card clears the header and last card clears the footer`,
      );
      if (!edges.ok) {
        console.log(name, size, edges);
      }
      await closeSheet(page, name);
    }
    check(
      await noScroll(page),
      `${size} main screen has no scroll after the sheets`,
    );
    await close();
  });
}

// The pocket's odometer stays in its housing and clear of the dial and the
// menu at every length (#370), and a four-part crew line must not leave one
// chip alone on the next row.
const PILL_VIEWS = [PHONE];
function crewSave(pocket) {
  return {
    version: 6,
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 12_000_000,
      pocket,
      helpers: 18,
      carts: 7,
      drills: 2,
      staffed: 2,
    },
    workshop: {
      materials: { clay: 10, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge", "reinforce"],
    },
  };
}

async function pillClear(page) {
  return page.evaluate(() => {
    const pill = document.querySelector(".board-odo");
    // The menu's door is the Ledger key on the rail now (#373).
    const menu = document.querySelector('.board-key[data-key="ledger"]');
    const dial = document.querySelector(".board-dial");
    const app = document.querySelector("#app");
    if (pill === null || menu === null || dial === null || app === null) {
      return { ok: false };
    }
    const a = pill.getBoundingClientRect();
    const misses = (other) => {
      const b = other.getBoundingClientRect();
      return (
        a.right <= b.left + 0.5 ||
        a.left >= b.right - 0.5 ||
        a.bottom <= b.top + 0.5 ||
        a.top >= b.bottom - 0.5
      );
    };
    const apart = misses(menu) && misses(dial);
    // Five drums, each face inside its drum: nothing spills at any length.
    const drums = [...pill.querySelectorAll(".board-drum")];
    const housed =
      drums.length === 5 &&
      drums.every((drum) => drum.scrollWidth <= drum.clientWidth + 1) &&
      pill.scrollWidth <= pill.clientWidth + 1;
    const pageStill =
      scrollY === 0 &&
      app.scrollTop === 0 &&
      document.documentElement.scrollHeight ===
        document.documentElement.clientHeight &&
      app.scrollHeight === app.clientHeight;
    return {
      ok: apart && housed && pageStill,
      apart,
      housed,
      pageStill,
      pocket: pill.getAttribute("aria-label"),
    };
  });
}

/**
 * The crew line's chips, in the Crew section at the top of Buys (#371): Buys
 * lays them out as it opens, in even rows, never one chip alone.
 */
async function crewRowsBalanced(page) {
  await openSheet(page, "buys");
  const counts = await page.$$eval(
    `${OPEN_SHEET("buys")} .crew .crew-row`,
    (rows) => rows.map((row) => row.querySelectorAll(".crew-bit").length),
  );
  await closeSheet(page, "buys");
  return {
    ok: counts.length > 0 && Math.max(...counts) - Math.min(...counts) <= 1,
    counts,
  };
}

for (const viewport of PILL_VIEWS) {
  section(`section 21 (odometer) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    for (const pocket of [32_500, 999_900_000_000_000, 1_000_000_000_000_000]) {
      const { page, close } = await open(viewport, crewSave(pocket));
      await page.waitForSelector(".board-odo");
      const clear = await pillClear(page);
      check(
        clear.ok,
        `${size} pocket ${String(pocket)} stays in the odometer, clear of the dial and the menu`,
      );
      if (!clear.ok) {
        console.log("pill", size, pocket, clear);
      }
      const rows = await crewRowsBalanced(page);
      check(
        rows.ok,
        `${size} pocket ${String(pocket)}: Buys' crew chips sit in even rows`,
      );
      if (!rows.ok) {
        console.log("crew rows", size, pocket, rows);
      }
      if (pocket === 32_500) {
        await shot(page, `pocket-crew-${size}`);
      }
      await close();
    }
  });
}

// Buys, Workshop, and Upgrades: affordable, too expensive, and locked.
for (const viewport of [PHONE]) {
  section(`section 22 (line 2613) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await open(viewport, crewSave(32_500));
    await openSheet(page, "buys");
    const buys = await page.evaluate(() => {
      const card = (tier) =>
        document.querySelector(`.tier[data-tier="${tier}"]`);
      const shown = (tier, selector) => {
        const node = card(tier)?.querySelector(selector);
        return (
          node !== null &&
          node !== undefined &&
          !node.hidden &&
          node.textContent !== ""
        );
      };
      const drill = card("drill");
      const machine = card("machine");
      // The Deep Heart's 120M of depth in stones: 10M + 35M x 2.625 + 75M x 6.3
      // is 574.375M, shown as 574.3M (#357). The row shows the long line, or
      // its short form where the long one does not fit (#373).
      const machineLines = [
        "The Great Machine joins your crew at 574.3M stones. Keep digging, Dad!",
        "Machine · 574.3M",
      ];
      return {
        // A row a tap buys now: the worker or the cart.
        readyRow: ["helper", "cart"].some(
          (tier) => card(tier)?.classList.contains("is-ready") === true,
        ),
        drillName:
          drill?.querySelector(".board-row-name")?.firstChild?.textContent,
        drillDear: drill?.classList.contains("is-dear") === true,
        drillGain: shown("drill", ".board-row-gain"),
        drillWhy: shown("drill", ".board-row-info"),
        machineLocked:
          machine?.classList.contains("is-locked") === true &&
          machine.querySelector(".board-row-price")?.textContent === "Locked",
        machineGain: shown("machine", ".board-row-gain"),
        machineWhy: machineLines.includes(
          machine?.querySelector(".board-row-info")?.textContent ?? "",
        ),
      };
    });
    check(
      buys.readyRow &&
        buys.drillName === "Steam drill" &&
        buys.drillDear &&
        buys.drillGain &&
        buys.drillWhy &&
        buys.machineLocked &&
        !buys.machineGain &&
        buys.machineWhy,
      `${size} unaffordable drill keeps its lines and the locked machine says where it opens`,
    );
    if (
      buys.drillName !== "Steam drill" ||
      !buys.drillGain ||
      !buys.machineWhy
    ) {
      console.log("buys mix", size, buys);
    }
    await page.$eval('.tier[data-tier="drill"]', (card) => {
      const list = card.closest(".board-sheet-list");
      if (list !== null) {
        list.scrollTop +=
          card.getBoundingClientRect().top -
          list.getBoundingClientRect().top -
          (list.clientHeight - card.offsetHeight) / 2;
      }
    });
    await shot(page, `buys-mix-${size}`);
    await closeSheet(page, "buys");
    await page.tap(KEY("workshop"));
    await page.waitForSelector(".workshop-dialog:not([hidden])");
    await shot(page, `workshop-mix-${size}`);
    await page.click(".workshop-close");
    await openSheet(page, "upgrades");
    const upgrades = await page.evaluate(() => {
      const card = (id) => document.querySelector(`[data-upgrade="${id}"]`);
      const shown = (id, selector) => {
        const node = card(id)?.querySelector(selector);
        return (
          node !== null &&
          node !== undefined &&
          !node.hidden &&
          node.textContent !== ""
        );
      };
      return {
        armsDear: card("tap")?.classList.contains("is-dear") === true,
        armsEffect: shown("tap", ".board-row-info"),
        armsWhy: shown("tap", ".board-row-why"),
        // A locked row is hidden until open and nearly affordable (#245).
        roadsLocked: card("drillSyn")?.hidden === true,
      };
    });
    check(
      upgrades.armsDear &&
        upgrades.armsEffect &&
        upgrades.armsWhy &&
        upgrades.roadsLocked,
      `${size} unaffordable upgrade keeps its lines and a locked one does not`,
    );
    if (!upgrades.armsEffect || !upgrades.armsWhy) {
      console.log("upgrades mix", size, upgrades);
    }
    await page.$eval('[data-upgrade="tap"]', (card) => {
      const list = card.closest(".board-sheet-list");
      if (list !== null) {
        list.scrollTop +=
          card.getBoundingClientRect().top -
          list.getBoundingClientRect().top -
          (list.clientHeight - card.offsetHeight) / 2;
      }
    });
    await shot(page, `upgrades-mix-${size}`);
    await close();
  });
}

// The running countdowns (0, 1, 3, and every one at once) are lines in the
// Running now note the boost dial opens, and the note stays on the board (#370).
const EFFECT_VIEWS = SCREENS;
function effectSave(count) {
  const now = Date.now();
  // 0, 1, and 3 are that many chips. 12 is both boosts, four craft clocks, the bench, and five trips.
  const names = ["Ada", "Nils", "Ruth", "Otto", "Mae"];
  const full = count >= 12;
  const tripCount = full ? 5 : count >= 3 ? 1 : 0;
  const expeditions = Array.from({ length: tripCount }, (_, index) => ({
    engineer: names[index],
    tunnel: "side-seam",
    sentAt: now - 60_000,
    // Longer than the boosts, so a clock stays on screen when the row is full.
    returnsAt: now + (40 + index) * 60_000,
    home: "camp",
    find: { kind: "quiet" },
  }));
  const boosts =
    count >= 2
      ? { sharper: now + 10 * 60_000, overtime: now + 20 * 60_000 }
      : count >= 1
        ? { sharper: now + 10 * 60_000 }
        : {};
  const engineers = names
    .slice(0, Math.max(1, tripCount))
    .map((name, index) => ({
      name,
      rank: 0,
      trips: 0,
      post: index < tripCount ? "tunnel" : "camp",
    }));
  return {
    version: 6,
    lastSeen: now,
    mountain: {
      remaining: 240_000_000 - 12_000_000,
      pocket: 5_000_000,
      helpers: 20,
      carts: 2,
      borers: 1,
      staffed: 2,
      engineers,
      expeditions,
      boosts,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
      ...(full
        ? {
            chargeUntil: now + 8 * 60_000,
            axleUntil: now + 12 * 60_000,
            flareUntil: now + 50 * 60_000,
            emberUntil: now + 15 * 60_000,
            bench: {
              recipe: "iron-rails",
              startedAt: now - 1_000,
              endsAt: now + 9 * 60_000,
            },
          }
        : {}),
    },
  };
}

for (const viewport of EFFECT_VIEWS) {
  section(`section 23 (Running now) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    for (const count of [0, 1, 3, 12]) {
      const { page, close } = await open(viewport, effectSave(count));
      await page.waitForSelector(".board-dial");
      await press(page, ".board-dial");
      await page
        .waitForSelector(".board-note.on .board-running", { timeout: 2_000 })
        .catch(() => undefined);
      const placed = await page.evaluate((count) => {
        const board = globalThis.__board();
        const note = document.querySelector(".board-note.on");
        const row = note?.querySelector(".board-running .effect-row");
        if (note === null || row === null || row === undefined) {
          return { ok: false, open: note !== null };
        }
        const noteBox = note.getBoundingClientRect();
        const chips = [...row.querySelectorAll(".effect-chip")].filter(
          (chip) => !chip.hidden,
        );
        const expected = count >= 12 ? 12 : count;
        const boxes = chips.map((chip) => chip.getBoundingClientRect());
        const apart = boxes.every((box, index) =>
          boxes.every((other, otherIndex) => {
            if (index === otherIndex) {
              return true;
            }
            return (
              box.right <= other.left + 0.5 ||
              box.left >= other.right - 0.5 ||
              box.bottom <= other.top + 0.5 ||
              box.top >= other.bottom - 0.5
            );
          }),
        );
        const inside = boxes.every(
          (box) =>
            box.width > 8 &&
            box.top >= noteBox.top - 1 &&
            box.bottom <= noteBox.bottom + 1 &&
            box.left >= noteBox.left - 1 &&
            box.right <= noteBox.right + 1,
        );
        const labeled = chips.every((chip) => {
          const name = chip.querySelector(".effect-name")?.textContent ?? "";
          const time = chip.querySelector(".effect-time")?.textContent ?? "";
          return name.length > 0 && /\d/.test(time);
        });
        const none =
          note.querySelector(".board-running-none")?.textContent ?? "";
        const packed =
          chips.length === expected &&
          row.querySelector(".effect-more") === null &&
          !/\+\d/.test(row.textContent ?? "") &&
          apart &&
          inside &&
          labeled &&
          (expected > 0 ? none === "" : none === "Nothing running");
        // The note stays on the board, above the save line.
        const onBoard =
          noteBox.left >= board.left - 0.5 &&
          noteBox.right <= board.right + 0.5 &&
          noteBox.top >= board.top - 0.5 &&
          noteBox.bottom <= board.saveTop + 0.5;
        const app = document.querySelector("#app");
        const still =
          app !== null &&
          app.scrollHeight === app.clientHeight &&
          document.documentElement.scrollHeight ===
            document.documentElement.clientHeight;
        return {
          ok:
            still &&
            packed &&
            onBoard &&
            chips.every((chip) => chip.scrollWidth <= chip.clientWidth + 1),
          shown: chips.length,
          labels: chips.map((chip) => chip.textContent),
          none,
          note: [noteBox.left, noteBox.top, noteBox.right, noteBox.bottom].map(
            Math.round,
          ),
          board: [board.left, board.top, board.right, board.saveTop].map(
            Math.round,
          ),
          apart,
          inside,
          labeled,
          still,
        };
      }, count);
      check(
        placed.ok,
        `${size} ${String(count)} running countdowns sit in the Running now note`,
      );
      if (!placed.ok) {
        console.log("running now", size, count, placed);
      }
      if (count === 1 || count === 3 || count >= 12) {
        await shot(page, `effects-${String(count)}-${size}`);
      }
      await close();
    }
  });
}

// #238: no screen moves the page. Lists inside a sheet may scroll; the page never does.
const GUARD_SIZES = SCREENS;
function guardSave(lastSeen, remaining = 200_000_000) {
  return {
    version: 6,
    lastSeen,
    mountain: {
      remaining,
      pocket: 3_250_000,
      helpers: 34,
      carts: 12,
      drills: 4,
      borers: 1,
      staffed: 2,
      engineers: [{ name: "Ada", rank: 1, trips: 3, post: "camp" }],
      boosts: { sharper: lastSeen + 3_600_000 },
    },
    workshop: {
      materials: { clay: 12, iron: 6, crystal: 2, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
    },
  };
}
const GUARD_SCREENS = [
  ["main, fresh", () => freshMountain(), []],
  ["main, mid-game", () => guardSave(Date.now()), []],
  // Each door by its key on the rail (#373).
  ["buys", () => guardSave(Date.now()), [KEY("buys")]],
  ["upgrades", () => guardSave(Date.now()), [KEY("upgrades")]],
  ["workshop", () => guardSave(Date.now()), [KEY("workshop")]],
  ["engineers", () => guardSave(Date.now()), [KEY("engineers")]],
  ["relic shelf", () => guardSave(Date.now()), [".board-socket", SHELF_KEY]],
  ["save drawer", () => guardSave(Date.now()), [".save-status"]],
  ["menu", () => guardSave(Date.now()), [KEY("ledger")]],
  // A bay opens Buys; the Ready now plate buys the pick (#372).
  ["bays", () => guardSave(Date.now()), [".board-bay"]],
  ["ready", () => guardSave(Date.now()), [".board-ready"]],
  ["welcome", () => guardSave(Date.now() - 3 * 3_600_000), []],
  [
    "legacy",
    () => ({
      version: 5,
      mountain: {
        remaining: 1,
        pocket: 0,
        helpers: 999,
        kids: 999,
        staffed: 2,
        legacy: 1,
      },
      lastSeen: Date.now(),
    }),
    [
      ".board-window",
      ".relic-reveal:not(.legend) .reveal-continue",
      ".legend .legend-pass",
    ],
  ],
];
for (const viewport of GUARD_SIZES) {
  // One section per screen: each opens its own page.
  for (const [name, save, taps] of GUARD_SCREENS) {
    section(
      `section 24 (no page scroll) ${JSON.stringify(viewport)} ${name}`,
      async () => {
        const size = `${String(viewport[0])}x${String(viewport[1])}`;
        {
          const { page, close } = await open(viewport, save());
          let opened = true;
          for (const selector of taps) {
            opened = await page
              .waitForSelector(selector, { visible: true, timeout: 5_000 })
              .then(() => press(page, selector))
              .then(
                () => true,
                () => false,
              );
            await new Promise((resolve) => setTimeout(resolve, 300));
            if (!opened) {
              break;
            }
          }
          check(
            opened && (await noScroll(page)),
            `${size} ${name} opens without scrolling the page`,
          );
          await close();
        }
      },
    );
  }
}

// The board itself (#370): the relic plate, the stock row, the save line and
// its drawer, at the phone and the three PC sizes, on a fresh save, a mid save,
// one with Overtime running, and the save line in its error words.
function overtimeSave() {
  const save = openMountain();
  return {
    ...save,
    mountain: {
      ...save.mountain,
      boosts: { overtime: Date.now() + 20 * 60_000 },
    },
  };
}
const BOARD_SAVES = [
  ["fresh", () => freshMountain(), ""],
  ["mid", () => openMountain(), ""],
  ["Overtime", () => overtimeSave(), ""],
  ["save error", () => openMountain(), "?save=error"],
];
/**
 * The board's own controls; the save drawer's buttons join when it is open.
 * The mine window and the vein are the gauge row's (#371). The keys on the
 * rail, and an open drawer's rows, plates and "i" (#373).
 */
const BOARD_TARGETS = [
  ".board-socket",
  ".board-dial",
  ".save-status",
  ".board-save-drawer.is-open .board-platebtn",
  ".board-note.on .board-platebtn",
  ".board-window",
  ".golden-vein",
  ".board-bay",
  ".board-ready",
  ".board-dig-button",
  ".board-key:not(:disabled)",
  ".board-sheet.is-open button.board-row:not([hidden])",
  ".board-sheet.is-open .board-platebtn",
  ".board-sheet.is-open .board-sheet-info",
].join(", ");
/** Every other control a finger can reach on the board at that moment. */
const NEIGHBOURS = "#app button, #app [role='button']";
/**
 * The bays' and the Ready row's words (#372): the band tag, each bay's name,
 * sub-line, price legend and price, the flap digits, the plate's three lines
 * and the red button's legend.
 */
const BAY_LEGENDS = [
  ".board-band .board-lg",
  ".board-bay-name",
  ".board-bay-sub",
  ".board-bay-price-lg",
  ".board-bay-tag-text",
  ".board-flap-d",
  ".board-ready-kick",
  ".board-ready-main",
  ".board-ready-why",
  ".board-dig-lg",
  ".board-dig-lg b",
];
/**
 * Legends every board shows at rest: the nine of the top, the gauge row and
 * the save line, then the band tag, three names, three sub-lines, three price
 * legends, the plate's three lines and the red button's legend (#372), and
 * the five key names on the rail (#373).
 */
const LEGENDS_AT_REST = 9 + 14 + 5;
/** Board text read against the board's art: the bars ask 4.5:1 of these. */
const BOARD_LEGENDS = [
  ".board-odo-legend .board-lg:not(.board-spend)",
  ".board-dial .board-lg",
  ".board-tag .board-lg",
  ".board-save-words",
  ".board-save-safe",
  ".board-save-why",
  // The gauge row (#371): Stones a sec, the crew plate, No. 2 Shaft and the
  // Legacy plate's words.
  ".board-gauge-legend",
  ".board-crew-legend",
  ".board-crew-n",
  ".board-crew-free",
  ".board-window-tag .board-lg",
  ".board-legacy .legacy-badge",
  ...BAY_LEGENDS,
  // The key rail (#373): each key's name and its unlock line or clock.
  ".board-key-name",
  ".board-key-sub",
].join(", ");
/** The board's parts whose text and art the bars measure. */
const BOARD_PARTS =
  ".board-top, .board-gauge-row, .board-bays, .board-ready-row, .board-rail, .board-saveline, .board-save-drawer.is-open, .board-note.on, .board-sheet.is-open";
/** Parts whose every img and sprite is measured; a note's art is its skins. */
const BOARD_ART =
  ".board-top, .board-gauge-row, .board-bays, .board-ready-row, .board-rail, .board-saveline, .board-sheet.is-open";
/** The drawer slides in steps(6) over 240ms. */
const DRAWER_MS = 400;

/**
 * A note's skins paint once their art has loaded (src/board-skin.ts), a frame
 * or two after it opens: wait for that before measuring them.
 */
async function notePainted(page) {
  await page
    .waitForFunction(
      () =>
        [
          ...document.querySelectorAll(".board-note.on canvas.board-skin"),
        ].every((canvas) => canvas.style.width !== ""),
      { timeout: 2_000 },
    )
    .catch(() => undefined);
}

/**
 * Visible controls in board px (rendered size / --board-scale): the board's
 * own, and the neighbours they must stand 8px from. A closed sheet, the
 * closed drawer and the parked note are not on screen, so they do not count.
 */
async function boardTargets(page) {
  return page.evaluate(
    (own, neighbours) => {
      const board = globalThis.__board();
      const onScreen = (el) =>
        el.getClientRects().length > 0 &&
        el.closest("[hidden]") === null &&
        getComputedStyle(el).visibility !== "hidden";
      const measure = (el) => {
        const box = el.getBoundingClientRect();
        const name =
          el.getAttribute("aria-label") ??
          (el.textContent ?? "").replace(/\s+/g, " ").trim();
        return {
          selector: `.${el.classList[0] ?? el.tagName} ${name.slice(0, 24)}`,
          left: (box.left - board.left) / board.scale,
          top: (box.top - board.top) / board.scale,
          width: box.width / board.scale,
          height: box.height / board.scale,
          rendered: [box.width, box.height],
        };
      };
      // A neighbour under the open drawer is out of reach, so it is skipped.
      const onTop = (el) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          (box.left + box.right) / 2,
          (box.top + box.bottom) / 2,
        );
        return hit !== null && (el.contains(hit) || hit.contains(el));
      };
      // So is one the open note or drawer lies over: it is beneath the
      // popup, which takes every tap there (an open note is pointer-events
      // auto), and the popup's own buttons are what a finger meets there.
      // That holds for the board's own controls too. A bay's thanks note is
      // pointer-events none (#372): taps pass through it, so a bay under it
      // is still in reach and still measured.
      const popupEls = [
        ...document.querySelectorAll(
          ".board-note.on, .board-save-drawer.is-open, .board-sheet.is-open",
        ),
      ].filter((popup) => getComputedStyle(popup).pointerEvents !== "none");
      const popups = popupEls.map((popup) => popup.getBoundingClientRect());
      const underPopup = (el) => {
        const box = el.getBoundingClientRect();
        return popups.some(
          (popup) =>
            box.left < popup.right &&
            box.right > popup.left &&
            box.top < popup.bottom &&
            box.bottom > popup.top,
        );
      };
      // A row scrolled out of an open drawer's list (C1) is out of reach until
      // the list brings it back, so only rows wholly in the list's view count.
      const inPort = (el) => {
        const list = el.closest(".board-sheet-list");
        if (list === null) {
          return true;
        }
        const box = el.getBoundingClientRect();
        const port = list.getBoundingClientRect();
        return box.top >= port.top - 0.5 && box.bottom <= port.bottom + 0.5;
      };
      const mine = [...document.querySelectorAll(own)].filter(
        (el) =>
          onScreen(el) &&
          inPort(el) &&
          (popupEls.some((popup) => popup.contains(el)) || !underPopup(el)),
      );
      const others = [...document.querySelectorAll(neighbours)].filter(
        (el) =>
          onScreen(el) &&
          inPort(el) &&
          onTop(el) &&
          !underPopup(el) &&
          !mine.includes(el),
      );
      return { own: mine.map(measure), others: others.map(measure) };
    },
    BOARD_TARGETS,
    NEIGHBOURS,
  );
}

/**
 * The vein sits on the window as today's vein sat on the rock, so its gap to
 * the window is the one gap the bars do not ask for (#371).
 */
const veinOnWindow = (pair) =>
  [pair.a, pair.b].some((name) => name.startsWith(".board-window ")) &&
  [pair.a, pair.b].some((name) => name.startsWith(".golden-vein "));

/** Pairs closer than 8 board px where at least one is the board's own. */
function boardGaps({ own, others }) {
  const ownNames = new Set(own.map((target) => target.selector));
  // A scaled board snaps each box to device pixels, so an 8px gap can read
  // 7.99 board px on a PC: allow a tenth of a pixel.
  return targetsCloserThan([...own, ...others], 7.9).filter(
    (pair) =>
      (ownNames.has(pair.a) || ownNames.has(pair.b)) && !veinOnWindow(pair),
  );
}

/** Text in the board's parts that a person sees, and its size. */
async function boardTextSizes(page, partsOf = BOARD_PARTS) {
  return page.evaluate((parts) => {
    const roots = [...document.querySelectorAll(parts)];
    const small = [];
    let count = 0;
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const own = [...el.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent ?? "")
          .join("")
          .trim();
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (
          own === "" ||
          box.width < 1 ||
          box.height < 1 ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          continue;
        }
        count += 1;
        const size = Number.parseFloat(style.fontSize);
        if (size < 13) {
          small.push(`${own.slice(0, 24)} ${String(size)}px`);
        }
      }
    }
    return { count, small };
  }, partsOf);
}

/** Every img, sprite and skin of the board drawn at exactly twice its art. */
async function boardArtAt2x(page, partsOf = BOARD_PARTS, artOf = BOARD_ART) {
  return page.evaluate(
    async (partsOf, artOf) => {
      const parts = [...document.querySelectorAll(partsOf)];
      const misses = [];
      let count = 0;
      // Art under visibility: hidden (an off spare plate) is not drawn.
      const drawn = (el) =>
        el.getClientRects().length > 0 &&
        el.closest("[hidden]") === null &&
        getComputedStyle(el).visibility !== "hidden";
      const natural = (url) =>
        new Promise((resolve) => {
          const art = new Image();
          art.onload = () => {
            resolve([art.naturalWidth, art.naturalHeight]);
          };
          art.onerror = () => {
            resolve([0, 0]);
          };
          art.src = url;
        });
      // Art still loading is not art drawn wrong: an img whose source just
      // changed (the tub filling) is decoded, and a skin is given a few
      // frames to paint once its art has loaded (src/board-skin.ts), before
      // either is measured. Under the full gate's load both can lag.
      await Promise.all(
        parts.flatMap((part) =>
          [...part.querySelectorAll("img")].map((img) =>
            img.decode().catch(() => undefined),
          ),
        ),
      );
      const unpainted = () =>
        parts.some((part) =>
          [...part.querySelectorAll("canvas.board-skin")].some(
            (canvas) =>
              canvas.style.width === "" &&
              canvas.parentElement !== null &&
              drawn(canvas.parentElement),
          ),
        );
      for (let frame = 0; frame < 60 && unpainted(); frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      for (const part of parts) {
        const imgs = part.matches(artOf)
          ? [...part.querySelectorAll("img")].filter(drawn)
          : [];
        for (const img of imgs) {
          count += 1;
          if (
            img.naturalWidth === 0 ||
            img.clientWidth !== 2 * img.naturalWidth ||
            img.clientHeight !== 2 * img.naturalHeight
          ) {
            misses.push(
              `img ${img.className} ${String(img.clientWidth)}x${String(img.clientHeight)} of ${String(img.naturalWidth)}x${String(img.naturalHeight)}`,
            );
          }
        }
        const sprites = part.matches(artOf)
          ? [part, ...part.querySelectorAll("*")].filter(
              (el) =>
                drawn(el) &&
                el.tagName !== "CANVAS" &&
                getComputedStyle(el).backgroundImage.startsWith("url("),
            )
          : [];
        for (const sprite of sprites) {
          count += 1;
          const style = getComputedStyle(sprite);
          const url = /url\("?([^")]+)"?\)/.exec(style.backgroundImage)?.[1];
          const [width, height] = await natural(url ?? "");
          const size = style.backgroundSize.split(" ").map(Number.parseFloat);
          if (width === 0 || size[0] !== 2 * width || size[1] !== 2 * height) {
            misses.push(
              `sprite ${sprite.className} ${style.backgroundSize} of ${String(width)}x${String(height)}`,
            );
          }
        }
        for (const canvas of part.querySelectorAll("canvas.board-skin")) {
          if (!drawn(canvas.parentElement)) {
            continue;
          }
          count += 1;
          const width = Number.parseFloat(canvas.style.width);
          const height = Number.parseFloat(canvas.style.height);
          if (width !== 2 * canvas.width || height !== 2 * canvas.height) {
            misses.push(
              `skin of ${canvas.parentElement.className} ${canvas.style.width}x${canvas.style.height} of ${String(canvas.width)}x${String(canvas.height)}`,
            );
          }
        }
      }
      return { count, misses };
    },
    partsOf,
    artOf,
  );
}

/**
 * Each legend's text colour against its background pixels: the 10th and 90th
 * percentile by luminance (which the gate reads) and the darkest and lightest
 * (printed). The background is read from a screenshot (device scale 1)
 * taken with the text itself made clear, so glyph edges are never mistaken for
 * the background.
 */
async function boardContrast(page, legends = BOARD_LEGENDS) {
  const boxes = await page.evaluate((selector) => {
    // A legend scrolled out of an open drawer's list is not on screen.
    const inPort = (el) => {
      const list = el.closest(".board-sheet-list");
      if (list === null) {
        return true;
      }
      const box = el.getBoundingClientRect();
      const port = list.getBoundingClientRect();
      return box.top >= port.top - 0.5 && box.bottom <= port.bottom + 0.5;
    };
    return [...document.querySelectorAll(selector)]
      .filter((el) => {
        const style = getComputedStyle(el);
        return (
          (el.textContent ?? "").trim() !== "" &&
          el.getClientRects().length > 0 &&
          el.closest("[hidden]") === null &&
          inPort(el) &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0
        );
      })
      .map((el) => {
        // The words' own extent: a legend centred in a wide box (Stones a
        // sec spans the gauge) is read against what lies under its words,
        // not against the bezel beside them (#371).
        const outer = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const words = range.getBoundingClientRect();
        const box =
          words.width > 0 && words.height > 0
            ? {
                left: Math.max(outer.left, words.left),
                top: Math.max(outer.top, words.top),
                right: Math.min(outer.right, words.right),
                bottom: Math.min(outer.bottom, words.bottom),
              }
            : outer;
        const rgb = /rgba?\(([^)]+)\)/
          .exec(getComputedStyle(el).color)?.[1]
          .split(/[\s,/]+/)
          .slice(0, 3)
          .map(Number);
        return {
          text: (el.textContent ?? "").trim().slice(0, 28),
          fg: rgb ?? [0, 0, 0],
          clip: {
            x: Math.ceil(box.left),
            y: Math.ceil(box.top),
            width: Math.floor(box.right) - Math.ceil(box.left),
            height: Math.floor(box.bottom) - Math.ceil(box.top),
          },
        };
      });
  }, legends);
  const clear = await page.addStyleTag({
    content: `${legends
      .split(", ")
      .map((selector) => `${selector}, ${selector} *`)
      .join(
        ", ",
      )} { color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; }`,
  });
  const rows = [];
  for (const box of boxes) {
    if (box.clip.width < 1 || box.clip.height < 1) {
      rows.push({ ...box, ratio: 0, darkest: [], lightest: [] });
      continue;
    }
    const png = await page.screenshot({ clip: box.clip, encoding: "base64" });
    const range = await page.evaluate(
      (data, fg) =>
        new Promise((resolve) => {
          const art = new Image();
          art.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = art.naturalWidth;
            canvas.height = art.naturalHeight;
            const context = canvas.getContext("2d");
            context.drawImage(art, 0, 0);
            const { data: px } = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const all = [];
            for (let i = 0; i < px.length; i += 4) {
              const rgb = [px[i], px[i + 1], px[i + 2]];
              if (!rgb.every((channel, index) => channel === fg[index])) {
                all.push(rgb);
              }
            }
            all.sort((a, b) => lum(...a) - lum(...b));
            const at = (q) =>
              all[Math.min(all.length - 1, Math.floor(q * all.length))] ?? fg;
            resolve({
              darkest: all[0] ?? fg,
              lightest: all[all.length - 1] ?? fg,
              p10: at(0.1),
              p90: at(0.9),
            });
          };
          art.src = `data:image/png;base64,${data}`;
        }),
      png,
      box.fg,
    );
    const ratio = Math.min(
      contrastRatio(box.fg, range.darkest),
      contrastRatio(box.fg, range.lightest),
    );
    const pct = Math.min(
      contrastRatio(box.fg, range.p10),
      contrastRatio(box.fg, range.p90),
    );
    rows.push({
      ...box,
      ...range,
      ratio: Math.round(ratio * 100) / 100,
      pct: Math.round(pct * 100) / 100,
    });
  }
  await clear.evaluate((tag) => {
    tag.remove();
  });
  return rows;
}

for (const viewport of SCREENS) {
  for (const [name, save, search] of BOARD_SAVES) {
    section(`board ${JSON.stringify(viewport)} ${name}`, async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      const label = `${size} board, ${name}:`;
      const desk = isDesk(viewport);
      const { page, close } = await open(viewport, save(), { search });
      await page.waitForSelector(".board-relics");
      await page.evaluate(() => document.fonts.ready.then(() => true));
      check(await noScroll(page), `${label} no page scroll`);
      // The controls at rest, before any note or drawer opens. A New note
      // that shows by itself above its key is put away first (#372).
      await putNoteAway(page);
      const rest = await boardTargets(page);

      // Gated on the 10th/90th percentile of the background: the enamel is
      // textured, and a lone scratch should not fail a legend. The strict
      // darkest/lightest ratio is printed beside it.
      const contrast = await boardContrast(page);
      const dim = contrast.filter((row) => row.pct < 4.5);
      check(
        contrast.length >= LEGENDS_AT_REST && dim.length === 0,
        `${label} ${String(contrast.length)} legends at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90, ${String(Math.min(...contrast.map((row) => row.ratio)))}:1 at the extremes)`,
      );
      if (dim.length > 0 || contrast.length < LEGENDS_AT_REST) {
        console.log("board contrast", size, name, JSON.stringify(contrast));
      }

      // A socket's note ends in the Relic shelf key, and the key opens the
      // shelf over the board (#370).
      await press(page, ".board-socket");
      await page
        .waitForSelector(SHELF_KEY, { visible: true, timeout: 2_000 })
        .catch(() => undefined);
      await notePainted(page);
      const keyTargets = await boardTargets(page);
      const keyText = await boardTextSizes(page);
      const keyArt = PHONE === viewport ? await boardArtAt2x(page) : undefined;
      const keyShown = keyTargets.own.some((target) =>
        target.selector.startsWith(".board-platebtn Relic shelf"),
      );
      if (keyShown) {
        await press(page, SHELF_KEY);
      }
      check(
        keyShown && (await coversBoard(page, ".shelf-dialog")),
        `${label} a socket's note opens the shelf from its Relic shelf key`,
      );
      await press(page, ".shelf-close");
      await page
        .waitForSelector(".shelf-dialog[hidden]", { timeout: 2_000 })
        .catch(() => undefined);

      // The Running now note opens under the dial and stays on the board.
      await press(page, ".board-dial");
      await page
        .waitForSelector(".board-note.on", { timeout: 2_000 })
        .catch(() => undefined);
      await notePainted(page);
      const note = await page.evaluate(() => {
        const board = globalThis.__board();
        const box = document
          .querySelector(".board-note.on")
          ?.getBoundingClientRect();
        if (box === undefined) {
          return { ok: false, box: [] };
        }
        return {
          ok:
            box.width > 0 &&
            box.left >= board.left - 0.5 &&
            box.right <= board.right + 0.5 &&
            box.top >= board.top - 0.5 &&
            box.bottom <= board.saveTop + 0.5,
          box: [box.left, box.top, box.right, box.bottom].map(Math.round),
          board: [board.left, board.top, board.right, board.saveTop].map(
            Math.round,
          ),
        };
      });
      check(note.ok, `${label} the Running now note opens inside the board`);
      if (!note.ok) {
        console.log("board note", size, name, JSON.stringify(note));
      }
      const noteText = await boardTextSizes(page);
      const noteArt = PHONE === viewport ? await boardArtAt2x(page) : undefined;

      // The save drawer slides up over the board; the save line stays.
      await press(page, ".save-status");
      // Wait for the slide to end, not a fixed time: under the full gate's
      // load a fixed wait caught the drawer mid-slide.
      await page
        .waitForFunction(
          () => {
            const sheet = document.querySelector(".board-save-drawer");
            return (
              sheet !== null &&
              sheet.classList.contains("is-open") &&
              sheet.getAnimations().length === 0
            );
          },
          { timeout: DRAWER_MS * 10 },
        )
        .catch(() => undefined);
      const drawer = await page.evaluate(() => {
        const board = globalThis.__board();
        const sheet = document.querySelector(".board-save-drawer");
        const line = document.querySelector(".board-saveline");
        if (sheet === null || line === null) {
          return { ok: false };
        }
        const box = sheet.getBoundingClientRect();
        const lineBox = line.getBoundingClientRect();
        const hit = document.elementFromPoint(
          (lineBox.left + lineBox.right) / 2,
          (lineBox.top + lineBox.bottom) / 2,
        );
        const buttons = [...sheet.querySelectorAll("button")].filter(
          (button) => button.getClientRects().length > 0,
        );
        return {
          ok:
            sheet.classList.contains("is-open") &&
            box.top >= board.top - 0.5 &&
            box.bottom <= lineBox.top + 0.5 &&
            lineBox.top >= board.top &&
            lineBox.bottom <= board.bottom + 0.5 &&
            hit !== null &&
            line.contains(hit) &&
            buttons.length === 2 &&
            buttons.every((button) => {
              const at = button.getBoundingClientRect();
              return at.bottom <= box.bottom + 0.5 && at.top >= box.top - 0.5;
            }),
          box: [box.left, box.top, box.right, box.bottom].map(Math.round),
          line: [lineBox.left, lineBox.top, lineBox.right, lineBox.bottom].map(
            Math.round,
          ),
          buttons: buttons.length,
        };
      });
      check(
        drawer.ok,
        `${label} the save drawer opens and leaves the save line visible`,
      );
      if (!drawer.ok) {
        console.log("board drawer", size, name, JSON.stringify(drawer));
      }
      check(
        await noScroll(page),
        `${label} no page scroll with the drawer open`,
      );

      // Targets with the drawer open: its buttons and the save line.
      const drawerTargets = await boardTargets(page);
      const targets = [
        ...rest.own,
        ...keyTargets.own.filter((target) =>
          target.selector.startsWith(".board-platebtn"),
        ),
        ...drawerTargets.own.filter((target) =>
          target.selector.startsWith(".board-platebtn"),
        ),
      ];
      const under = undersizedTargets(targets);
      // The plate and the stock row show in both states: name each pair once.
      const close8 = [
        ...new Map(
          [
            ...boardGaps(rest),
            ...boardGaps(keyTargets),
            ...boardGaps(drawerTargets),
          ].map((pair) => [`${pair.a}|${pair.b}`, pair]),
        ).values(),
      ];
      // On a PC, say how big the smallest control is drawn on the desk.
      const smallest = targets.reduce(
        (least, target) =>
          Math.min(...target.rendered) < Math.min(...least.rendered)
            ? target
            : least,
        targets[0] ?? { rendered: [0, 0] },
      );
      const rendered = desk
        ? ` (smallest drawn ${smallest.rendered.map((side) => side.toFixed(1)).join("x")})`
        : "";
      check(
        // The top's, the window, three bays, the plate and the red button.
        rest.own.length >= 14 &&
          rest.own.some((target) =>
            target.selector.startsWith(".board-window "),
          ) &&
          keyShown &&
          drawerTargets.own.length >= 3 &&
          under.length === 0 &&
          close8.length === 0,
        `${label} controls are 48x48 board px, 8px from the next${rendered}`,
      );
      if (under.length > 0 || close8.length > 0) {
        console.log(
          "board targets",
          size,
          name,
          JSON.stringify({
            under: under.map((target) => [
              target.selector,
              Math.round(target.width * 10) / 10,
              Math.round(target.height * 10) / 10,
            ]),
            close: close8.map((pair) => [
              pair.a,
              pair.b,
              Math.round(pair.gap * 10) / 10,
            ]),
          }),
        );
      }

      const drawerText = await boardTextSizes(page);
      const small = [...keyText.small, ...noteText.small, ...drawerText.small];
      check(
        small.length === 0,
        `${label} board text is 13px or more (${String(keyText.count + noteText.count + drawerText.count)} runs)`,
      );
      if (small.length > 0) {
        console.log("board text", size, name, JSON.stringify(small));
      }

      if (noteArt !== undefined) {
        const drawerArt = await boardArtAt2x(page);
        const misses = [
          ...(keyArt?.misses ?? []),
          ...noteArt.misses,
          ...drawerArt.misses,
        ];
        check(
          misses.length === 0 && noteArt.count >= 8,
          `${label} ${String((keyArt?.count ?? 0) + noteArt.count + drawerArt.count)} images, sprites and skins at exactly 2x`,
        );
        if (misses.length > 0) {
          console.log("board 2x", size, name, JSON.stringify(misses));
        }
      }
      await close();
    });
  }
}

// The gauge row (#371): the output gauge, the mine window down No. 2 Shaft
// with its vein and Legacy plate, and the crew plate, at the phone and the
// three PC sizes, in each band. The bars are the board's: no scroll, 48px
// targets 8px apart (the vein exempt from its gap to the window only), 13px
// text, art at exactly 2x, 4.5:1 contrast at p10/p90, and the crew plate's
// words on the plate. These pages keep the bundled faces (Barlow Condensed,
// Share Tech Mono): the plate is sized for them, and the check proves they
// loaded rather than measuring a fallback face.
const GAUGE_SAVES = [
  ["early", () => crewMountain(), "topsoil"],
  ["mid", () => openMountain(), "granite"],
  ["crystal", () => crystalMountain(), "crystal"],
  ["heart", () => heartMountain(), "heart"],
];
/** The vein's range: veinSpot at x 0.35/0.65 and y 0.4/0.8. */
const VEIN_CORNERS = [
  [0.35, 0.4],
  [0.65, 0.4],
  [0.35, 0.8],
  [0.65, 0.8],
];

/** Shows the vein at a corner of its range, as board-window.ts places it; undefined hides it. */
async function placeVein(page, corner) {
  await page.evaluate(
    async (at, rules) => {
      const vein = document.querySelector(".golden-vein");
      if (vein === null) {
        return;
      }
      if (at === undefined) {
        vein.hidden = true;
        return;
      }
      const { veinSpot } = await import(rules);
      const spot = veinSpot(at[0], at[1]);
      vein.style.left = `${String((7 + spot.left) * 2)}px`;
      vein.style.top = `${String((7 + spot.top) * 2)}px`;
      vein.hidden = false;
    },
    corner,
    MINE_WINDOW_RULES,
  );
}

/**
 * The board's targets with the vein placed at a corner of its range. The
 * screen's own second tick hides a vein that is not really glinting, and under
 * the full gate's load that tick can land between placing and measuring, so
 * place and measure again until the vein is in the measurement.
 */
async function targetsWithVein(page, corner) {
  let set = { own: [] };
  for (let tries = 0; tries < 5; tries += 1) {
    await placeVein(page, corner);
    set = await boardTargets(page);
    if (set.own.some((target) => target.selector.startsWith(".golden-vein "))) {
      return set;
    }
  }
  return set;
}

/** The bundled faces are loaded, so the plate is measured as it ships. */
async function boardFontsLoaded(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('700 13px "Barlow Condensed"'),
      document.fonts.load('26px "Share Tech Mono"'),
    ]);
    return (
      document.fonts.check('700 13px "Barlow Condensed"') &&
      document.fonts.check('26px "Share Tech Mono"') &&
      [...document.fonts].some(
        (face) =>
          face.family.replace(/"/g, "") === "Barlow Condensed" &&
          face.status === "loaded",
      ) &&
      [...document.fonts].some(
        (face) =>
          face.family.replace(/"/g, "") === "Share Tech Mono" &&
          face.status === "loaded",
      )
    );
  });
}

/**
 * The crew plate's words (legend, figure, free count) measured as drawn
 * glyph runs, not boxes: a flex item can shrink under its words and let them
 * spill, so each run's range must sit inside the plate.
 */
async function crewPlateWords(page) {
  return page.evaluate(() => {
    const plate = document.querySelector(".board-crew");
    if (plate === null) {
      return { ok: false, runs: [] };
    }
    const box = plate.getBoundingClientRect();
    const runs = [
      ...plate.querySelectorAll(
        ".board-crew-legend, .board-crew-n, .board-crew-free",
      ),
    ].map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return {
        text: el.textContent ?? "",
        ok:
          r.width > 0 &&
          r.left >= box.left - 0.5 &&
          r.right <= box.right + 0.5 &&
          r.top >= box.top - 0.5 &&
          r.bottom <= box.bottom + 0.5,
        run: [r.left, r.right].map((side) => Math.round(side - box.left)),
      };
    });
    // Neither run overlaps the next: the words push along, never over.
    const apart = runs.every(
      (run, index) => index === 0 || runs[index - 1].run[1] <= run.run[0] + 0.5,
    );
    return {
      ok: runs.length === 3 && apart && runs.every((run) => run.ok),
      plate: Math.round(box.width),
      runs,
    };
  });
}

for (const viewport of SCREENS) {
  for (const [name, save, band] of GAUGE_SAVES) {
    section(`gauge row ${JSON.stringify(viewport)} ${name}`, async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      const label = `${size} gauge row, ${name}:`;
      const { page, close } = await open(viewport, save());
      await page.waitForSelector(".board-mine[data-band]");
      const fonts = await boardFontsLoaded(page);
      check(fonts, `${label} the bundled faces are loaded`);
      check(await noScroll(page), `${label} no page scroll`);

      // The band's view behind the glass, and what the save owns in it.
      const scene = await page.evaluate(async () => {
        const mine = document.querySelector(".board-mine");
        const art = document.querySelector(".board-window-art");
        if (art instanceof HTMLImageElement && !art.complete) {
          await art.decode().catch(() => undefined);
        }
        const shown = (selector) => {
          const el = document.querySelector(selector);
          return (
            el !== null &&
            el.closest("[hidden]") === null &&
            el.getClientRects().length > 0
          );
        };
        return {
          band: mine?.getAttribute("data-band") ?? "",
          art: art?.getAttribute("src") ?? "",
          artWidth: art?.naturalWidth ?? 0,
          machine: shown(".board-window-machine"),
          kid: shown(".board-window-kid"),
          plate: shown(".board-legacy"),
          badge: document.querySelector(".board-legacy .legacy-badge")
            ?.textContent,
        };
      });
      check(
        scene.band === band &&
          scene.art.includes(`mine-view-${band}`) &&
          scene.artWidth === 92,
        `${label} the window shows the ${band} view`,
      );
      const heart = name === "heart";
      check(
        heart
          ? scene.machine &&
              scene.kid &&
              scene.plate &&
              (scene.badge ?? "").startsWith("Legacy ×")
          : !scene.machine && !scene.kid && !scene.plate,
        heart
          ? `${label} the Great Machine, the kid and the Legacy plate show`
          : `${label} no Great Machine, kid or Legacy plate before they are earned`,
      );
      if (scene.band !== band || (heart && !scene.plate)) {
        console.log("gauge row scene", size, name, JSON.stringify(scene));
      }

      // Targets at rest, then with the vein at each end of its range.
      const sets = [await boardTargets(page)];
      for (const corner of VEIN_CORNERS) {
        sets.push(await targetsWithVein(page, corner));
      }
      await placeVein(page, undefined);
      const own = sets.flatMap((set) => set.own);
      const under = undersizedTargets(own);
      const close8 = [
        ...new Map(
          sets
            .flatMap((set) => boardGaps(set))
            .map((pair) => [`${pair.a}|${pair.b}`, pair]),
        ).values(),
      ];
      const veins = own.filter((target) =>
        target.selector.startsWith(".golden-vein "),
      ).length;
      check(
        own.some((target) => target.selector.startsWith(".board-window ")) &&
          veins === VEIN_CORNERS.length &&
          under.length === 0 &&
          close8.length === 0,
        `${label} the window and the vein are 48x48 board px, 8px from the next`,
      );
      if (under.length > 0 || close8.length > 0) {
        console.log(
          "gauge row targets",
          size,
          name,
          JSON.stringify({
            under: under.map((target) => target.selector),
            close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
          }),
        );
      }

      // Contrast first, before a tap puts "+N" over the view.
      const contrast = await boardContrast(page);
      const dim = contrast.filter((row) => row.pct < 4.5);
      const want = [
        "Stones a sec",
        "Crew",
        "free",
        "No. 2 Shaft",
        ...(heart ? ["Legacy ×"] : []),
      ];
      const read = want.every((words) =>
        contrast.some((row) => row.text.includes(words)),
      );
      check(
        read && dim.length === 0,
        `${label} ${String(contrast.length)} legends at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
      );
      if (!read || dim.length > 0) {
        console.log("gauge row contrast", size, name, JSON.stringify(contrast));
      }

      // The New sign (#373): in the band between the plate's words and the
      // key rail, clear of the DIG legend, and a tap at its middle goes through.
      const sign = await page.evaluate(() => {
        const slot = document.querySelector(".board-sign-slot:not([hidden])");
        const face = slot?.querySelector(".board-sign");
        if (face === null || face === undefined) {
          return { shown: false };
        }
        const r = face.getBoundingClientRect();
        const box = (selector) =>
          document.querySelector(selector)?.getBoundingClientRect();
        const apart = (b) =>
          b === undefined ||
          r.right <= b.left + 0.5 ||
          r.left >= b.right - 0.5 ||
          r.bottom <= b.top + 0.5 ||
          r.top >= b.bottom - 0.5;
        const words = box(".board-ready-text");
        const legend = box(".board-dig-lg");
        const rail = box(".board-rail");
        const hit = document.elementFromPoint(
          (r.left + r.right) / 2,
          (r.top + r.bottom) / 2,
        );
        return {
          shown: true,
          key: slot?.getAttribute("data-key") ?? "",
          text: face.textContent ?? "",
          clearOfWords: apart(words),
          clearOfLegend: apart(legend),
          aboveRail: rail !== undefined && r.bottom <= rail.top + 0.5,
          passes: hit !== null && !face.contains(hit) && hit !== slot,
          size: Number.parseFloat(
            getComputedStyle(face.querySelector(".board-sign-text") ?? face)
              .fontSize,
          ),
          rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
        };
      });
      if (name === "mid" || sign.shown) {
        check(
          sign.shown &&
            sign.clearOfWords &&
            sign.clearOfLegend &&
            sign.aboveRail &&
            sign.passes &&
            sign.size >= 14,
          `${label} the New sign stands between the plate's words and the rail, clear of the DIG legend, at 14px, and taps go through it`,
        );
        if (
          !sign.shown ||
          !sign.clearOfWords ||
          !sign.clearOfLegend ||
          !sign.aboveRail ||
          !sign.passes ||
          sign.size < 14
        ) {
          console.log("new sign", size, name, JSON.stringify(sign));
        }
      }

      // A dig shows "+N"; its text joins the 13px count.
      await press(page, ".board-window");
      const text = await boardTextSizes(page);
      check(
        text.small.length === 0 && text.count >= 20,
        `${label} board text is 13px or more (${String(text.count)} runs)`,
      );
      if (text.small.length > 0) {
        console.log("gauge row text", size, name, JSON.stringify(text.small));
      }

      // Art is measured at the phone, where the board is drawn at scale 1.
      if (PHONE === viewport) {
        await placeVein(page, VEIN_CORNERS[0]);
        const art = await boardArtAt2x(page);
        await placeVein(page, undefined);
        check(
          art.misses.length === 0 && art.count >= 20,
          `${label} ${String(art.count)} images, sprites and skins at exactly 2x`,
        );
        if (art.misses.length > 0) {
          console.log("gauge row 2x", size, name, JSON.stringify(art.misses));
        }
      }

      const words = await crewPlateWords(page);
      check(
        fonts && words.ok,
        `${label} the crew plate's words stay on the plate`,
      );
      if (!words.ok) {
        console.log("crew plate", size, name, JSON.stringify(words));
      }
      await close();
    });
  }

  section(`gauge row ${JSON.stringify(viewport)} moving parts`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} gauge row:`;

    // While a signed-in save loads, the window is its frame and glass alone:
    // no view, machine, kid, tub or miner from a save it has not read yet.
    // The Deep Heart save owns every machine and the kid, so any leak shows.
    {
      const { page, close } = await open(viewport, heartMountain(), {
        search: "?save=loading",
      });
      const loading = await page
        .waitForFunction(
          () =>
            (
              document.querySelector(".save-status")?.textContent ?? ""
            ).includes("Loading your save"),
          { timeout: 3_000 },
        )
        .then(
          () => true,
          () => false,
        );
      // let the board's loop step a few frames over the empty window
      await new Promise((resolve) => setTimeout(resolve, 300));
      const seen = await page.evaluate(
        (parts) => ({
          parts: parts.filter((part) =>
            [...document.querySelectorAll(part)].some(
              (el) => el.getClientRects().length > 0,
            ),
          ),
          glass: [".board-window-frame", ".board-window-glass"].every(
            (part) =>
              (document.querySelector(part)?.getClientRects().length ?? 0) > 0,
          ),
        }),
        [...WINDOW_SCENE_PARTS],
      );
      check(
        loading && seen.glass && seen.parts.length === 0,
        `${label} while the save loads the window is its frame and glass, with no machine, kid, tub or miner`,
      );
      if (seen.parts.length > 0 || !loading) {
        console.log("loading window", size, { loading, ...seen });
      }
      await close();
    }

    // A cave-in shows in the window (the dev boot previews one).
    {
      const { page, close } = await open(viewport, openMountain(), {
        search: "?trouble=cave-in",
      });
      await page.waitForSelector(".board-mine[data-band]");
      const caveIn = await page
        .waitForSelector(".board-window-cave-in:not([hidden])", {
          visible: true,
          timeout: 3_000,
        })
        .then(
          () => true,
          () => false,
        );
      check(caveIn, `${label} a cave-in shows in the window`);
      check(await noScroll(page), `${label} no page scroll with the cave-in`);
      await close();
    }

    // Three taps on the window add exactly three times the tap's yield, and
    // the odometer reads it. The clock is stopped, so the crew adds nothing.
    {
      const start = heartMountain();
      const { page, close } = await open(
        viewport,
        { ...start, mountain: { ...start.mountain, pocket: 0 } },
        { stopClock: true },
      );
      await page.waitForSelector(".board-mine[data-band]");
      const pocket = () =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key) ?? "{}").mountain?.pocket,
          SAVE_KEY,
        );
      const before = await pocket();
      const yieldWords = await page.$eval(
        ".board-window",
        (button) => button.getAttribute("aria-label") ?? "",
      );
      const match = /tap to mine (one stone|([\d,.]+) stones)$/.exec(
        yieldWords,
      );
      const each =
        match === null
          ? NaN
          : match[2] === undefined
            ? 1
            : Number(match[2].replace(/,/g, ""));
      for (let tap = 0; tap < 3; tap += 1) {
        await press(page, ".board-window");
      }
      const after = await pocket();
      const shown = await page.evaluate(() => ({
        odo: document.querySelector(".board-odo")?.getAttribute("aria-label"),
        plus: document.querySelector(".board-dig-plus")?.textContent,
      }));
      check(
        Number.isFinite(each) &&
          after - before === 3 * each &&
          shown.odo === `Stones ${Math.floor(after).toLocaleString("en-US")}` &&
          shown.plus === `+${match?.[2] ?? "1"}`,
        `${label} three taps on the window add three times the tap's ${String(each)} and the odometer reads it`,
      );
      if (after - before !== 3 * each) {
        console.log("window taps", size, { yieldWords, before, after, shown });
      }
      await close();
    }

    // Reduced motion: the window and the needle hold still; a tap still
    // shows "+N", without rising.
    {
      const { page, close } = await open(viewport, heartMountain(), {
        reducedMotion: true,
      });
      await page.waitForSelector(".board-mine[data-band]");
      const clip = await page.evaluate(() => {
        const row = document.querySelector(".board-gauge-row");
        const box = row?.getBoundingClientRect();
        return box === undefined
          ? undefined
          : {
              x: Math.ceil(box.left),
              y: Math.ceil(box.top),
              width: Math.floor(box.width),
              height: Math.floor(box.height),
            };
      });
      // Let the first frames land, then compare two shots 600ms apart.
      await new Promise((resolve) => setTimeout(resolve, 300));
      const first = await page.screenshot({ clip, encoding: "base64" });
      await new Promise((resolve) => setTimeout(resolve, 600));
      const second = await page.screenshot({ clip, encoding: "base64" });
      check(
        clip !== undefined && first === second,
        `${label} under reduced motion the window and the needle hold still`,
      );
      await press(page, ".board-window");
      const plusAt = () =>
        page.$eval(".board-dig-plus", (plus) => ({
          shown: !plus.hidden && plus.getClientRects().length > 0,
          top: plus.style.top,
          text: plus.textContent,
        }));
      const up = await plusAt();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const later = await plusAt();
      check(
        up.shown && later.shown && up.top === later.top && up.text !== "",
        `${label} under reduced motion a tap shows +N without rising`,
      );
      if (!up.shown || up.top !== later.top) {
        console.log("reduced plus", size, up, later);
      }
      await close();
    }

    // The largest crews: the late save's 1,998 with 1,998 free, and a crew
    // past a hundred thousand. The plate's words stay on it.
    for (const [crewName, crewSave] of [
      ["late", () => lastStoneSave()],
      [
        "huge",
        () => ({
          ...openMountain(),
          mountain: { ...openMountain().mountain, helpers: 123_456, carts: 0 },
        }),
      ],
    ]) {
      const { page, close } = await open(viewport, crewSave(), {
        stopClock: true,
      });
      await page.waitForSelector(".board-crew");
      const fonts = await boardFontsLoaded(page);
      const words = await crewPlateWords(page);
      check(
        fonts && words.ok,
        `${label} the ${crewName} crew's plate keeps its words on it (${words.runs
          .map((run) => run.text)
          .join(" ")})`,
      );
      if (!words.ok) {
        console.log("crew plate", size, crewName, JSON.stringify(words));
      }
      check(
        await noScroll(page),
        `${label} the ${crewName} crew does not scroll`,
      );
      await close();
    }
  });
}

// The machine bays and the Ready row (#372): the band tag and three bays
// under the gauge row, then the Ready now plate and the red DIG button, at
// the phone and the three PC sizes. In each band the tag reads the layer's
// words and the bays are C2's tiers; every bay's words, flaps and price stay
// in its button; the bars are the board's (48px targets 8px apart, 13px text,
// art at exactly 2x, 4.5:1 contrast at p10/p90); the page never scrolls and
// the key rail ends at least 8px above the save line. Then the taps: a sleepy double
// tap on Ready now buys exactly one, Saving for opens Buys, a troubled bay
// fixes with five taps or a hold, and the red button digs exactly the tap's
// yield.
const BAYS_UI = "/src/board-bays.ts";
const EARLY_TIERS = ["cart", "drill", "borer"];
const MACHINE_TIERS = ["drill", "borer", "machine"];
const BAY_SAVES = [
  ["early", () => crewMountain(), EARLY_TIERS],
  ["mid", () => openMountain(), EARLY_TIERS],
  ["crystal", () => crystalMountain(), EARLY_TIERS],
  ["heart", () => heartMountain(), MACHINE_TIERS],
  ["fleet", () => fleetMountain(), EARLY_TIERS],
  ["saving", () => savingMountain(), EARLY_TIERS],
];
const BAYS_AND_READY = ".board-bays, .board-ready-row";
/** One lamp frame is 20 art px: red, the fourth frame, sits at -120 CSS px. */
const LAMP_RED_X = "-120px";

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
 * The band tag and each bay's parts. Words are measured by their glyph runs
 * across (a clipped name spills past its box) and by their line boxes down.
 */
async function baysLayout(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom };
    };
    const words = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const run = range.getBoundingClientRect();
      const line = el.getBoundingClientRect();
      return { l: run.left, t: line.top, r: run.right, b: line.bottom };
    };
    const round = (b) => [b.l, b.t, b.r, b.b].map(Math.round);
    const inside = (a, b) =>
      a.l >= b.l - 0.5 &&
      a.r <= b.r + 0.5 &&
      a.t >= b.t - 0.5 &&
      a.b <= b.b + 0.5;
    const overlap = (a, b) =>
      a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
    const root = document.querySelector(".board-bays");
    const band = document.querySelector(".board-band");
    const gauge = document.querySelector(".board-gauge-row");
    if (root === null || band === null || gauge === null) {
      return { ok: false, band: "", tiers: [], bays: [] };
    }
    const rootBox = box(root);
    const bandBox = box(band);
    const bandText = band.querySelector(".board-lg");
    const bandWordsBox = bandText === null ? undefined : words(bandText);
    // The tag rises onto the bays' top edge (420), clear of the gauge row.
    const bandOk =
      bandWordsBox !== undefined &&
      bandBox.l >= rootBox.l - 0.5 &&
      bandBox.r <= rootBox.r + 0.5 &&
      bandBox.t >= box(gauge).b - 0.5 &&
      bandBox.b <= rootBox.b + 0.5 &&
      inside(bandWordsBox, bandBox);
    const bays = [...root.querySelectorAll(".board-bay")].map((bay) => {
      const own = box(bay);
      const name = bay.querySelector(".board-bay-name");
      const sub = bay.querySelector(".board-bay-sub");
      const flap = bay.querySelector(".board-flap");
      const price = bay.querySelector(".board-bay-price");
      const legend = bay.querySelector(".board-bay-price-lg");
      const tag = bay.querySelector(".board-bay-tag");
      const tagText = bay.querySelector(".board-bay-tag-text");
      const parts = {
        name: words(name),
        sub: words(sub),
        flap: box(flap),
        price: box(price),
      };
      const names = Object.keys(parts);
      const overlaps = [];
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          if (overlap(parts[names[i]], parts[names[j]])) {
            overlaps.push(`${names[i]}/${names[j]}`);
          }
        }
      }
      const outside = names.filter((part) => !inside(parts[part], own));
      // The price's legend and figure stay in the price column.
      const priceWords = [legend, ...(tag.hidden ? [] : [tagText])].filter(
        (el) => (el.textContent ?? "") !== "",
      );
      const priceOut = priceWords
        .filter((el) => !inside(words(el), parts.price))
        .map((el) => el.textContent);
      return {
        tier: bay.dataset.tier ?? "",
        name: name.textContent ?? "",
        sub: sub.textContent ?? "",
        flaps: [...flap.querySelectorAll(".board-flap-d")].map(
          (digit) => digit.textContent ?? "",
        ),
        legend: legend.textContent ?? "",
        price: tag.hidden ? "" : (tagText.textContent ?? ""),
        ok:
          name.textContent !== "" &&
          sub.textContent !== "" &&
          overlaps.length === 0 &&
          outside.length === 0 &&
          priceOut.length === 0,
        overlaps,
        outside,
        priceOut,
        boxes: Object.fromEntries(
          [["bay", own], ...Object.entries(parts)].map(([key, b]) => [
            key,
            round(b),
          ]),
        ),
      };
    });
    return {
      ok: bandOk && bays.length === 3 && bays.every((bay) => bay.ok),
      bandOk,
      band: bandText?.textContent ?? "",
      bandBox: round(bandBox),
      tiers: bays.map((bay) => bay.tier),
      bays,
    };
  });
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

/** The words a bay, the plate or the red button shows, by selector. */
async function textOf(page, selector) {
  return page
    .$eval(selector, (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .catch(() => undefined);
}

/** The stored save's mountain, as the last write left it. */
async function storedMountain(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}").mountain ?? {},
    SAVE_KEY,
  );
}

/** A finger (or the mouse button) held on the selector's centre for `ms`. */
async function hold(page, selector, ms) {
  const at = await page.$eval(selector, (el) => {
    const b = el.getBoundingClientRect();
    return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
  });
  if (desks.get(page) === true) {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await page.mouse.up();
  } else {
    await page.touchscreen.touchStart(at.x, at.y);
    await new Promise((resolve) => setTimeout(resolve, ms));
    await page.touchscreen.touchEnd();
  }
}

/**
 * The New note shows once the save is in, on the first render or the next
 * second's tick; wait that out, then put any board note away with Escape.
 */
async function putNoteAway(page) {
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  for (let tries = 0; tries < 3; tries += 1) {
    if ((await page.$(".board-note.on")) === null) {
      return;
    }
    await page.keyboard.press("Escape");
  }
}

/**
 * A sleepy double tap at the selector's centre: two taps `gap` ms apart at
 * one point, with nothing between them, so a loaded run keeps them close.
 * The second lands on whatever the first put there. With `gap` "drawer", the
 * second tap comes down as soon as a row of the rising Buys drawer is under
 * the point, however slow the runner is (#373). Returns what the second press came down
 * on (the board, or Buys and its row) and how long after the first, both read
 * in the page as the presses land.
 */
async function doubleTap(page, selector, gap = 120) {
  const at = await page.$eval(selector, (el) => {
    const b = el.getBoundingClientRect();
    return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
  });
  await page.evaluate(() => {
    const presses = [];
    globalThis.__presses = presses;
    // When Buys opens, read as the class lands: after the click handler that
    // opened it and set its settle's start, so it is no earlier than that
    // start. A press this long after it is at least that long into the settle.
    globalThis.__buysOpenedAt = undefined;
    const sheet = document.querySelector('.board-sheet[data-sheet="buys"]');
    if (sheet !== null) {
      new MutationObserver((records, observer) => {
        if (sheet.classList.contains("is-open")) {
          globalThis.__buysOpenedAt = performance.now();
          observer.disconnect();
        }
      }).observe(sheet, { attributes: true, attributeFilter: ["class"] });
    }
    document.addEventListener(
      "pointerdown",
      (event) => {
        const hit = event.target instanceof Element ? event.target : null;
        const card = hit?.closest("[data-tier]");
        const name = card?.getAttribute("data-tier") ?? "";
        presses.push({
          at: event.timeStamp,
          on:
            hit === null
              ? "nothing"
              : `${hit.closest('.board-sheet[data-sheet="buys"]') === null ? "the board" : "Buys"}${name === "" ? "" : ` ${name}`}`,
        });
      },
      { capture: true },
    );
  });
  for (let tap = 0; tap < 2; tap += 1) {
    if (tap > 0 && gap === "drawer") {
      await page
        .waitForFunction(
          ({ x, y }) =>
            document
              .elementFromPoint(x, y)
              ?.closest('.board-sheet[data-sheet="buys"] .board-row') != null,
          { polling: "raf", timeout: 2_000 },
          at,
        )
        .catch(() => undefined);
    } else if (tap > 0) {
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
    if (desks.get(page) === true) {
      await page.mouse.click(at.x, at.y);
    } else {
      await page.touchscreen.tap(at.x, at.y);
    }
  }
  // The second tap's buy, if any, lands a frame or two later.
  await new Promise((resolve) => setTimeout(resolve, 120));
  const { presses, openedAt } = await page.evaluate(() => ({
    presses: globalThis.__presses ?? [],
    openedAt: globalThis.__buysOpenedAt ?? null,
  }));
  const first = presses[0];
  const second = presses[1];
  return {
    on: second?.on ?? "nothing",
    ms:
      first === undefined || second === undefined
        ? Infinity
        : Math.round(second.at - first.at),
    // How far into Buys' 400ms settle the second press came, at least.
    intoSettle:
      second === undefined || openedAt === null
        ? Infinity
        : Math.round(second.at - openedAt),
  };
}

const buysOpen = (page) =>
  page
    .$eval(SHEET("buys"), (sheet) => sheet.classList.contains("is-open"))
    .catch(() => false);

for (const viewport of SCREENS) {
  for (const [name, save, tiers] of BAY_SAVES) {
    section(`bays and ready ${JSON.stringify(viewport)} ${name}`, async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      const label = `${size} bays and ready, ${name}:`;
      const seed = save();
      const { page, close } = await open(viewport, seed, { stopClock: true });
      const drawn = await baysDrawn(page);
      const fonts = await boardFontsLoaded(page);
      check(drawn && fonts, `${label} the bays are drawn in the bundled faces`);

      // The tag reads the band's words, and the bays are C2's tiers.
      const expectedBand = await page.evaluate(
        async (ui, remaining) => (await import(ui)).bandWords({ remaining }),
        BAYS_UI,
        seed.mountain.remaining,
      );
      const layout = await baysLayout(page);
      check(
        layout.band === expectedBand &&
          layout.tiers.join(",") === tiers.join(","),
        `${label} the tag reads "${expectedBand}" over the ${tiers.join(", ")} bays`,
      );
      check(
        layout.ok,
        `${label} each bay's name, sub-line, flaps and price lie inside it and apart, and the tag sits on the bays`,
      );
      if (
        !layout.ok ||
        layout.band !== expectedBand ||
        layout.tiers.join(",") !== tiers.join(",")
      ) {
        console.log("bays layout", size, name, JSON.stringify(layout));
      }
      if (name === "fleet") {
        const cart = layout.bays.find((bay) => bay.tier === "cart");
        check(
          cart?.flaps.join("") === "120" && cart.flaps.length === 3,
          `${label} 120 carts show on three flaps`,
        );
      }

      // Targets and gaps: the three bays, the plate and the red button. A
      // New note may show over the Ready row above its key; put it away
      // first, so what it covers is measured too.
      await putNoteAway(page);
      const targets = await boardTargets(page);
      const mine = targets.own.filter((target) =>
        /^\.board-(bay|ready|dig-button) /.test(target.selector),
      );
      const under = undersizedTargets(targets.own);
      const close8 = boardGaps(targets);
      check(
        mine.length === 5 && under.length === 0 && close8.length === 0,
        `${label} the bays, the plate and the red button are 48x48 board px, 8px from the next`,
      );
      if (mine.length !== 5 || under.length > 0 || close8.length > 0) {
        console.log(
          "bays targets",
          size,
          name,
          JSON.stringify({
            mine: mine.map((target) => [
              target.selector,
              Math.round(target.width * 10) / 10,
              Math.round(target.height * 10) / 10,
            ]),
            under: under.map((target) => target.selector),
            close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
          }),
        );
      }

      // Contrast at rest: the tag, the sub-lines, the price legends, the
      // plate and the red button's legend.
      const contrast = await boardContrast(page, BAY_LEGENDS.join(", "));
      const dim = contrast.filter((row) => row.pct < 4.5);
      const subs = layout.bays.map((bay) => bay.sub.trim().slice(0, 28));
      const legends = layout.bays.map((bay) => bay.legend);
      const read =
        contrast.length >= 14 &&
        [...subs, ...legends].every((words) =>
          contrast.some((row) => row.text === words),
        );
      check(
        read && dim.length === 0,
        `${label} ${String(contrast.length)} legends at 4.5:1 or more, sub-lines and price legends among them (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
      );
      if (!read || dim.length > 0) {
        console.log("bays contrast", size, name, JSON.stringify(contrast));
      }

      const text = await boardTextSizes(page, BAYS_AND_READY);
      check(
        text.small.length === 0 && text.count >= 14,
        `${label} the bays' and the plate's text is 13px or more (${String(text.count)} runs)`,
      );
      if (text.small.length > 0) {
        console.log("bays text", size, name, JSON.stringify(text.small));
      }

      // Art is measured at the phone, where the board is drawn at scale 1.
      if (PHONE === viewport) {
        const art = await boardArtAt2x(page, BAYS_AND_READY, BAYS_AND_READY);
        check(
          art.misses.length === 0 && art.count >= 20,
          `${label} ${String(art.count)} images, sprites and skins at exactly 2x`,
        );
        if (art.misses.length > 0) {
          console.log("bays 2x", size, name, JSON.stringify(art.misses));
        }
      }

      check(await noScroll(page), `${label} no page scroll`);
      const foot = await railFoot(page);
      check(
        foot.ok,
        `${label} the rail ends at least 8px above the save line (${String(foot.gap)})`,
      );
      await close();
    });
  }

  section(`bays and ready ${JSON.stringify(viewport)} taps`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} bays and ready:`;
    const cartFlaps = (page) =>
      page.$eval('.board-bay[data-tier="cart"]', (bay) =>
        Number(
          [...bay.querySelectorAll(".board-flap-d")]
            .map((digit) => digit.textContent ?? "")
            .join(""),
        ),
      );

    // A sleepy double tap: two taps 120ms apart buy exactly one cart, the
    // plate says Done, and after the hold it offers the next pick.
    {
      const { page, close } = await open(viewport, crewMountain(), {
        stopClock: true,
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      const kickBefore = await textOf(page, ".board-ready-kick");
      const mainBefore = (await textOf(page, ".board-ready-main")) ?? "";
      // "Buy a cart · 5,868": the price the plate offers, in whole stones.
      const price = Number(
        (mainBefore.split(" · ")[1] ?? "").replaceAll(",", ""),
      );
      const flapsBefore = await cartFlaps(page);
      const storedBefore = await storedMountain(page);
      await press(page, ".board-ready");
      await new Promise((resolve) => setTimeout(resolve, 120));
      await press(page, ".board-ready");
      const done = await textOf(page, ".board-ready-kick");
      const flapsAfter = await cartFlaps(page);
      const storedAfter = await storedMountain(page);
      const spent = storedBefore.pocket - storedAfter.pocket;
      check(
        kickBefore === "Ready now" &&
          flapsAfter - flapsBefore === 1 &&
          storedAfter.carts - storedBefore.carts === 1 &&
          Number.isFinite(price) &&
          price > 0 &&
          spent === price &&
          done === "Done",
        `${label} a double tap on Ready now buys exactly one cart for one price (${String(spent)} of ${String(price)}) and shows Done`,
      );
      if (
        flapsAfter - flapsBefore !== 1 ||
        done !== "Done" ||
        spent !== price
      ) {
        console.log("double tap", size, {
          kickBefore,
          mainBefore,
          flapsBefore,
          flapsAfter,
          storedBefore,
          storedAfter,
          done,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2_100));
      const after = await textOf(page, ".board-ready-kick");
      check(
        after === "Ready now" || after === "Saving for",
        `${label} after the hold the plate reads Ready now or Saving for (${String(after)})`,
      );
      await close();
    }

    // Saving for: the time shows, and a sleepy double tap opens Buys and
    // spends nothing. The first tap opens Buys over the plate; the second
    // lands on the Buys card under the finger (a worker, which the pocket
    // can afford), and that card must not buy so soon after Buys opened.
    // A runner too slow to land the second tap inside the 400ms settle has
    // not tried the guard: try again, at most three times.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { page, close } = await open(viewport, savingMountain(), {
        stopClock: true,
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      const main = await textOf(page, ".board-ready-main");
      const odoBefore = await page.$eval(".board-odo", (odo) =>
        odo.getAttribute("aria-label"),
      );
      const storedBefore = await storedMountain(page);
      // The second tap comes down as a row of the rising drawer reaches the
      // plate, inside its 400ms settle (#373).
      const second = await doubleTap(page, ".board-ready", "drawer");
      const under = `${second.on}, ${String(second.ms)}ms later, ${String(second.intoSettle)}ms into the settle`;
      const opened = await page
        .waitForSelector(OPEN_SHEET("buys"), { timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      const odoAfter = await page.$eval(".board-odo", (odo) =>
        odo.getAttribute("aria-label"),
      );
      const storedAfter = await storedMountain(page);
      const spent =
        odoAfter !== odoBefore ||
        storedAfter.pocket !== storedBefore.pocket ||
        storedAfter.helpers !== storedBefore.helpers;
      // Retried only when the second press surely came after the settle: a
      // press this far after the class landed is at least that far after its
      // start, so it is a real tap and a buy there is correct, not a miss.
      if (second.intoSettle >= 400 && attempt < 2) {
        if (spent) {
          console.log("saving-for double tap after the settle bought", under);
        }
        await close();
        continue;
      }
      check(
        (main ?? "").startsWith("Saving for a cart · in ") &&
          opened &&
          /^Buys \w/.test(second.on) &&
          second.intoSettle < 400 &&
          odoAfter === odoBefore &&
          storedAfter.pocket === storedBefore.pocket &&
          storedAfter.helpers === storedBefore.helpers,
        `${label} Saving for reads "${String(main)}", and a double tap opens Buys with the pocket and odometer unchanged (second tap on ${under})`,
      );
      await close();
      break;
    }

    // A sleepy double tap on an open bay: the first opens Buys, the second
    // lands on a Buys card the pocket can afford (5M stones affords any
    // card here), and buys nothing.
    // As above, a runner too slow for the settle tries again, at most thrice.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { page, close } = await open(viewport, openMountain(), {
        stopClock: true,
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      await putNoteAway(page);
      const bay = '.board-bay[data-tier="cart"]';
      const storedBefore = await storedMountain(page);
      // The second tap comes down as a row of the rising drawer reaches the
      // bay, inside the 400ms settle (#373).
      const second = await doubleTap(page, bay, "drawer");
      const under = `${second.on}, ${String(second.ms)}ms later, ${String(second.intoSettle)}ms into the settle`;
      const opened = await page
        .waitForSelector(OPEN_SHEET("buys"), { timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      const storedAfter = await storedMountain(page);
      const spent = ["pocket", "carts", "drills", "borers", "helpers"].some(
        (field) => storedAfter[field] !== storedBefore[field],
      );
      // Retried only when the second press surely came after the settle (at
      // least 400ms after its start): a buy there is a real tap, not a miss.
      if (second.intoSettle >= 400 && attempt < 2) {
        if (spent) {
          console.log("bay double tap after the settle bought", under);
        }
        await close();
        continue;
      }
      check(
        opened &&
          /^Buys \w/.test(second.on) &&
          second.intoSettle < 400 &&
          storedAfter.pocket === storedBefore.pocket &&
          storedAfter.carts === storedBefore.carts &&
          storedAfter.drills === storedBefore.drills &&
          storedAfter.borers === storedBefore.borers &&
          storedAfter.helpers === storedBefore.helpers,
        `${label} a double tap on an open bay opens Buys and spends nothing (second tap on ${under})`,
      );
      if (storedAfter.pocket !== storedBefore.pocket || !opened) {
        console.log(
          "bay double tap",
          size,
          JSON.stringify({ opened, storedBefore, storedAfter }),
        );
      }
      await close();
      break;
    }

    // Trouble on the cart bay: a red lamp and Hold to fix. Five taps fix it
    // with Buys shut, and the thanks note lets taps through to the bay
    // under it. On a fresh page a 700ms hold fixes it too.
    {
      const troubled = '.board-bay[data-tier="cart"][data-trouble="cave-in"]';
      const { page, close } = await open(viewport, openMountain(), {
        search: "?trouble=cave-in",
        stopClock: true,
      });
      await baysDrawn(page);
      const shown = await page
        .waitForSelector(troubled, { timeout: 3_000 })
        .then(
          () => true,
          () => false,
        );
      const lamp = await page
        .$eval(`${troubled} .board-lamp`, (el) => el.style.backgroundPositionX)
        .catch(() => "");
      const sub = await textOf(page, `${troubled} .board-bay-sub`);
      check(
        shown && lamp === LAMP_RED_X && (sub ?? "").endsWith("Hold to fix"),
        `${label} the troubled cart bay shows its red lamp and Hold to fix`,
      );
      for (let tap = 0; tap < 5; tap += 1) {
        await press(page, '.board-bay[data-tier="cart"]');
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      const fixed = await page
        .waitForFunction(
          () =>
            document
              .querySelector('.board-bay[data-tier="cart"]')
              ?.hasAttribute("data-trouble") === false,
          { timeout: 2_000 },
        )
        .then(
          () => true,
          () => false,
        );
      const shut = !(await buysOpen(page));
      check(
        fixed && shut,
        `${label} five taps fix the troubled bay with Buys shut`,
      );
      // The thanks note is up; the bays under it are still what a finger meets.
      const thanks = await page.evaluate(() => {
        const note = document.querySelector(".board-note.on");
        const thanked = note?.querySelector(".board-thanks") !== null;
        const reach = [...document.querySelectorAll(".board-bay")].map(
          (bay) => {
            const b = bay.getBoundingClientRect();
            const hit = document.elementFromPoint(
              (b.left + b.right) / 2,
              (b.top + b.bottom) / 2,
            );
            return hit !== null && bay.contains(hit);
          },
        );
        return { thanked: note !== null && thanked, reach };
      });
      const underThanks = await boardTargets(page);
      const baysMeasured = underThanks.own.filter((target) =>
        target.selector.startsWith(".board-bay "),
      ).length;
      check(
        thanks.thanked && thanks.reach.every(Boolean) && baysMeasured === 3,
        `${label} under the thanks note every bay is still in reach and measured`,
      );
      if (!thanks.thanked || baysMeasured !== 3) {
        console.log("thanks note", size, { ...thanks, baysMeasured });
      }
      await close();
    }
    {
      const { page, close } = await open(viewport, openMountain(), {
        search: "?trouble=cave-in",
        stopClock: true,
      });
      await baysDrawn(page);
      await page
        .waitForSelector('.board-bay[data-tier="cart"][data-trouble]', {
          timeout: 3_000,
        })
        .catch(() => undefined);
      await hold(page, '.board-bay[data-tier="cart"]', 700);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const cleared = await page.$eval(
        '.board-bay[data-tier="cart"]',
        (bay) => !bay.hasAttribute("data-trouble"),
      );
      check(
        cleared && !(await buysOpen(page)),
        `${label} a 700ms hold fixes the troubled bay with Buys shut`,
      );
      await close();
    }

    // The red button digs exactly the tap's yield, and the window shows it.
    {
      const start = heartMountain();
      const { page, close } = await open(
        viewport,
        { ...start, mountain: { ...start.mountain, pocket: 0 } },
        { stopClock: true },
      );
      await page.waitForSelector(".board-dig-button:not(:disabled)");
      const before = (await storedMountain(page)).pocket;
      const yieldWords = await page.$eval(
        ".board-dig-button",
        (button) => button.getAttribute("aria-label") ?? "",
      );
      const match = /tap to mine (one stone|([\d,.]+) stones)$/.exec(
        yieldWords,
      );
      const each =
        match === null
          ? NaN
          : match[2] === undefined
            ? 1
            : Number(match[2].replace(/,/g, ""));
      await press(page, ".board-dig-button");
      const after = (await storedMountain(page)).pocket;
      const shown = await page.evaluate(() => ({
        odo: document.querySelector(".board-odo")?.getAttribute("aria-label"),
        legend: (document.querySelector(".board-dig-lg")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        plus: document.querySelector(".board-dig-plus")?.textContent,
      }));
      const plus = `+${match?.[2] ?? "1"}`;
      check(
        Number.isFinite(each) &&
          after - before === each &&
          shown.odo === `Stones ${Math.floor(after).toLocaleString("en-US")}` &&
          shown.legend === `By hand · ${plus}` &&
          shown.plus === plus,
        `${label} the red button digs the tap's ${String(each)}, reads By hand · ${plus}, and the window shows ${plus}`,
      );
      if (after - before !== each || shown.plus !== plus) {
        console.log("red button", size, { yieldWords, before, after, shown });
      }
      await close();
    }

    // Reduced motion: two shots of the bays 600ms apart are the same. As a
    // control, without it the drill bay's icon steps between shots (a frame
    // every 0.18s over four frames, so look a few times).
    for (const reducedMotion of [false, true]) {
      const { page, close } = await open(viewport, heartMountain(), {
        reducedMotion,
        stopClock: true,
      });
      await baysDrawn(page);
      const clip = await page.$eval(".board-bays", (bays) => {
        const box = bays.getBoundingClientRect();
        return {
          x: Math.ceil(box.left),
          y: Math.ceil(box.top),
          width: Math.floor(box.width),
          height: Math.floor(box.height),
        };
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const first = await page.screenshot({ clip, encoding: "base64" });
      const later = [];
      for (const wait of reducedMotion ? [600] : [100, 100, 100, 100]) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        later.push(await page.screenshot({ clip, encoding: "base64" }));
      }
      check(
        reducedMotion
          ? later.every((shot) => shot === first)
          : later.some((shot) => shot !== first),
        reducedMotion
          ? `${label} under reduced motion the bays hold still`
          : `${label} without reduced motion the drill bay's icon steps`,
      );
      await close();
    }

    // Mined out: the plate says so and buys nothing; the red button rests,
    // with no legend.
    {
      const start = openMountain();
      const { page, close } = await open(
        viewport,
        { ...start, mountain: { ...start.mountain, remaining: 0 } },
        { stopClock: true },
      );
      await baysDrawn(page);
      const out = await page.evaluate(() => ({
        main: document.querySelector(".board-ready-main")?.textContent,
        kick: document.querySelector(".board-ready-kick")?.textContent,
        plate: document.querySelector(".board-ready")?.disabled,
        dig: document.querySelector(".board-dig-button")?.disabled,
        legend: (
          document.querySelector(".board-dig-lg")?.textContent ?? ""
        ).trim(),
        tiers: [...document.querySelectorAll(".board-bay")].map(
          (bay) => bay.dataset.tier,
        ),
      }));
      check(
        out.main === "The mountain is mined out" &&
          out.kick === "" &&
          out.plate === true &&
          out.dig === true &&
          out.legend === "" &&
          out.tiers.join(",") === MACHINE_TIERS.join(","),
        `${label} mined out, the plate says so, the red button rests without a legend, and the bays are drill, borer and machine`,
      );
      if (out.main !== "The mountain is mined out" || out.legend !== "") {
        console.log("mined out", size, out);
      }
      check(await noScroll(page), `${label} mined out does not scroll`);
      await close();
    }

    // While a save loads, the bays, the plate and the red button are their
    // frames and art alone: no words or numbers from a save not yet read.
    {
      const { page, close } = await open(viewport, heartMountain(), {
        search: "?save=loading",
      });
      const loading = await page
        .waitForFunction(
          () =>
            (
              document.querySelector(".save-status")?.textContent ?? ""
            ).includes("Loading your save"),
          { timeout: 3_000 },
        )
        .then(
          () => true,
          () => false,
        );
      await new Promise((resolve) => setTimeout(resolve, 300));
      const seen = await page.evaluate(() => {
        const drawn = (selector) =>
          [...document.querySelectorAll(selector)].filter(
            (el) => el.getClientRects().length > 0,
          ).length;
        const words = [
          ".board-band .board-lg",
          ".board-bay-name",
          ".board-bay-sub",
          ".board-bay-price-lg",
          ".board-bay-tag-text",
          ".board-flap-d",
          ".board-ready-kick",
          ".board-ready-main",
          ".board-ready-why",
          ".board-dig-lg",
        ].flatMap((selector) =>
          [...document.querySelectorAll(selector)]
            .map((el) => (el.textContent ?? "").trim())
            .filter((text) => text !== ""),
        );
        return {
          words,
          disabled: [
            ...document.querySelectorAll(
              ".board-bay, .board-ready, .board-dig-button",
            ),
          ].every((button) => button.disabled),
          art: {
            icons: drawn(".board-bay-icon"),
            lamps: drawn(".board-bay .board-lamp"),
            plate: drawn(".board-ready-plate"),
            guard: drawn(".board-ready-guard"),
            dig: drawn(".board-dig-sprite"),
          },
          tiers: [...document.querySelectorAll(".board-bay")].map(
            (bay) => bay.dataset.tier,
          ),
        };
      });
      check(
        loading &&
          seen.words.length === 0 &&
          seen.disabled &&
          seen.art.icons === 3 &&
          seen.art.lamps === 3 &&
          seen.art.plate === 1 &&
          seen.art.guard === 1 &&
          seen.art.dig === 1 &&
          seen.tiers.join(",") === EARLY_TIERS.join(","),
        `${label} while the save loads the bays, the plate and the red button show their art and no save words`,
      );
      if (seen.words.length > 0 || !loading) {
        console.log("loading bays", size, { loading, ...seen });
      }
      await close();
    }
  });
}

// Keys and drawers (#373): the key rail and the Buys and Upgrades drawers, at
// the phone and the three PC sizes. The rail: five keys at the mockup's x
// (16 + 80i) and top 768, caps, icons and dots at exactly 2x, names and
// sub-lines at 13px and 4.5:1, each key's lock, lit cap, dot and timer as
// key-rail.ts says, and the rail's foot 8px above the save line. Each drawer,
// opened by its key on nine saves: its box (178..864 by 8..416) with the
// odometer and the save line in view, no page scroll, its list scrolling only
// where C1 allows, rows 76 tall and 10 apart with every part inside and
// apart, 48px targets 8px apart, 13px text, art at 2x, row legends at 4.5:1,
// the spare plate's tier, and the "i" cards fitting with no scroll. Then the
// rows' states, the taps (a sleepy double tap on a key, the Done hold, the red
// blink, the scrim, Escape, the "i") and reduced motion.
const KEY_IDS = ["buys", "workshop", "engineers", "upgrades", "ledger"];
const KEY_RULES = "/src/key-rail.ts";
const SAVE_RULES = "/src/persist.ts";
/** One key cap frame is 32 art px: rest 0, down 1, locked 2, lit 3. */
const CAP_X = { rest: "0px", locked: "-128px", lit: "-192px" };
const RAIL_SAVES = [
  ["fresh", () => freshMountain()],
  ["early", () => crewMountain()],
  ["mid", () => openMountain()],
  ["heart", () => heartMountain()],
  // The bench clock under the Workshop key.
  ["workshop", () => workshopSave(Date.now(), true)],
];
/** The mid save with hands and stones for the borer: the borer is the pick, Ada on it. */
function borerPickMountain() {
  const open = openMountain();
  return {
    ...open,
    mountain: { ...open.mountain, helpers: 28, pocket: 6_000_000 },
  };
}
const DRAWER_SAVES = [
  ["fresh", () => freshMountain()],
  ["early", () => crewMountain()],
  ["mid", () => openMountain()],
  ["short", () => shortMountain()],
  ["idle", () => idleMountain()],
  ["tools", () => toolsMountain()],
  ["machine", () => machineMountain()],
  ["heir", () => heirMountain()],
  ["crew", () => ({ version: 4, mountain: CREW, lastSeen: Date.now() })],
  ["mid, the borer the pick", () => borerPickMountain()],
  // A full Granite: two rows of crew chips, and Buys still fits (#373).
  ["mid, two chip rows", () => fullGraniteMountain()],
  // The Great Machine the pick, with Ada tending it: the flag gives way.
  ["machine, the Great Machine the pick", () => machinePickMountain()],
];
/**
 * Late-game Buys runs longer than the drawer and scrolls inside it (C1): the
 * Great Machine's era, with the Kid row. Up to the borer it fits, its
 * footnote stepping aside when it would push the list into a scroll (#373).
 */
const LONG_BUYS = new Set(["machine", "machine, the Great Machine the pick"]);
/**
 * A full Upgrades scrolls inside its drawer too (C1, the spec's "a full
 * Upgrades"): from six rows, more than the drawer holds at 76px each.
 */
const FULL_UPGRADES_ROWS = 6;
/** Words a drawer row shows, read against its frame at 4.5:1. */
const ROW_LEGENDS = (name) =>
  [
    ".board-row-name",
    ".board-row-info",
    ".board-row-need",
    ".board-row-why",
    ".board-row-flag",
    ".board-row-gain",
    ".board-row-price",
    ".board-row-verb",
    // Buys' footnote over Back, and Upgrades' at the list's end, when shown.
    ".board-sheet-foot",
  ]
    .map((part) => `${OPEN_SHEET(name)} ${part}`)
    .join(", ");
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

/** Each key's place, size and face, beside what key-rail.ts says it shows. */
async function railFacts(page) {
  return page.evaluate(
    async (keyRules, saveRules, saveKey, ids, capX) => {
      const { keyViews } = await import(keyRules);
      const { parseSaveValue } = await import(saveRules);
      const parsed = parseSaveValue(
        JSON.parse(localStorage.getItem(saveKey) ?? "null"),
      );
      const views =
        parsed === undefined
          ? undefined
          : keyViews(parsed.mountain, Date.now(), undefined);
      const board = globalThis.__board();
      const clock = /^\d+:\d\d(:\d\d)?$/;
      return ids.map((id, index) => {
        const key = document.querySelector(`.board-key[data-key="${id}"]`);
        if (key === null) {
          return { id, ok: false };
        }
        const box = key.getBoundingClientRect();
        const left = (box.left - board.left) / board.scale;
        const top = (box.top - board.top) / board.scale;
        const cap = key.querySelector(".board-key-cap");
        const dot = key.querySelector(".board-key-dot");
        const sub = key.querySelector(".board-key-sub");
        const view = views?.[id];
        const subText = sub?.hidden === false ? (sub.textContent ?? "") : "";
        const capShown =
          cap instanceof HTMLElement
            ? cap.style.backgroundPositionX || "0px"
            : "";
        const face =
          view !== undefined &&
          capShown === capX[view.cap] &&
          key.classList.contains("is-lit") === (view.cap === "lit") &&
          key.classList.contains("is-locked") === (view.cap === "locked") &&
          key.disabled === (view.cap === "locked") &&
          (dot?.hidden === false) === view.dot &&
          (clock.test(view.sub)
            ? clock.test(subText) && sub.classList.contains("board-num")
            : subText === view.sub);
        return {
          id,
          ok:
            Math.abs(left - (16 + 80 * index)) <= 0.5 &&
            Math.abs(top - 768) <= 0.5 &&
            face,
          left: Math.round(left * 10) / 10,
          top: Math.round(top * 10) / 10,
          face,
          cap: capShown,
          want: view,
          sub: subText,
          dot: dot?.hidden === false,
          locked: key.classList.contains("is-locked"),
          lit: key.classList.contains("is-lit"),
        };
      });
    },
    KEY_RULES,
    SAVE_RULES,
    SAVE_KEY,
    KEY_IDS,
    CAP_X,
  );
}

/** Two taps at the selector's centre `gap` ms apart; the second meets what the first opened. */
async function tapTwice(page, selector, gap) {
  const at = await page.$eval(selector, (el) => {
    const b = el.getBoundingClientRect();
    return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
  });
  for (let tap = 0; tap < 2; tap += 1) {
    if (tap > 0) {
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
    if (desks.get(page) === true) {
      await page.mouse.click(at.x, at.y);
    } else {
      await page.touchscreen.tap(at.x, at.y);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
}

/** A tap at a board point (board px), the way a finger lands there. */
async function tapBoard(page, x, y) {
  const at = await page.evaluate(
    (bx, by) => {
      const board = globalThis.__board();
      return {
        x: board.left + bx * board.scale,
        y: board.top + by * board.scale,
      };
    },
    x,
    y,
  );
  if (desks.get(page) === true) {
    await page.mouse.click(at.x, at.y);
  } else {
    await page.touchscreen.tap(at.x, at.y);
  }
}

const odometer = (page) =>
  page.$eval(".board-odo", (odo) => odo.getAttribute("aria-label"));

/** Every shown part of an open drawer's list, by its top in board px. */
const listTops = (page, name) =>
  page.$eval(`${OPEN_SHEET(name)} .board-sheet-list`, (list) => {
    const board = globalThis.__board();
    return [...list.children]
      .filter((child) => !child.hidden && child.getClientRects().length > 0)
      .map(
        (child) =>
          Math.round(
            ((child.getBoundingClientRect().top - board.top) / board.scale) *
              10,
          ) / 10,
      );
  });

/** A drawer's "i" cards: shown in its place, inside it, with no scroll. */
async function howFacts(page, name) {
  return page.$eval(OPEN_SHEET(name), (sheet) => {
    const how = sheet.querySelector(".board-sheet-how");
    const list = sheet.querySelector(".board-sheet-list");
    if (how === null || how.hidden) {
      return { ok: false, shown: false };
    }
    const box = sheet.getBoundingClientRect();
    const port = how.getBoundingClientRect();
    const cards = [...how.querySelectorAll(".teach-how")].filter(
      (card) => card.closest("[hidden]") === null,
    );
    const backs = [...how.querySelectorAll(".teach-how-back")].filter(
      (back) =>
        back.closest("[hidden]") === null && back.getClientRects().length > 0,
    );
    const within = (el) => {
      const b = el.getBoundingClientRect();
      return (
        b.top >= port.top - 0.5 &&
        b.bottom <= port.bottom + 0.5 &&
        b.left >= box.left - 0.5 &&
        b.right <= box.right + 0.5
      );
    };
    return {
      ok:
        cards.length >= 1 &&
        backs.length === 1 &&
        how.scrollHeight <= how.clientHeight + 1 &&
        cards.every(within) &&
        backs.every(within) &&
        list?.hidden === true,
      shown: true,
      cards: cards.length,
      backs: backs.length,
      scroll: [how.scrollHeight, how.clientHeight],
    };
  });
}

for (const viewport of SCREENS) {
  section(`keys and drawers ${JSON.stringify(viewport)} rail`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    for (const [name, save] of RAIL_SAVES) {
      const label = `${size} key rail, ${name}:`;
      const { page, close } = await open(viewport, save());
      const drawn = await keysDrawn(page);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      const keys = await railFacts(page);
      check(
        drawn && keys.every((key) => key.ok),
        `${label} five keys at x 16 + 80i and top 768, each cap, dot and sub-line as key-rail.ts says`,
      );
      if (!keys.every((key) => key.ok)) {
        console.log("rail keys", size, name, JSON.stringify(keys));
      }
      const art = await boardArtAt2x(page, ".board-rail", ".board-rail");
      check(
        art.misses.length === 0 && art.count >= 10,
        `${label} ${String(art.count)} caps, icons and dots at exactly 2x`,
      );
      if (art.misses.length > 0) {
        console.log("rail 2x", size, name, JSON.stringify(art.misses));
      }
      const text = await boardTextSizes(page, ".board-rail");
      check(
        text.small.length === 0 && text.count >= 5,
        `${label} names and sub-lines are 13px or more (${String(text.count)} runs)`,
      );
      if (text.small.length > 0) {
        console.log("rail text", size, name, JSON.stringify(text.small));
      }
      const contrast = await boardContrast(
        page,
        ".board-key-name, .board-key-sub",
      );
      const dim = contrast.filter((row) => row.pct < 4.5);
      check(
        contrast.length >= 5 && dim.length === 0,
        `${label} ${String(contrast.length)} names and sub-lines at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
      );
      if (dim.length > 0) {
        console.log("rail contrast", size, name, JSON.stringify(contrast));
      }
      const state = await keyState(page);
      if (name === "fresh") {
        const subs = Object.fromEntries(keys.map((key) => [key.id, key.sub]));
        check(
          state.ok &&
            [state.workshop, state.engineers].every(
              (key) => key.disabled && key.locked && key.dim,
            ) &&
            subs.workshop === "With the clay" &&
            subs.engineers === "With 1st borer",
          `${label} Workshop and Engineers are locked, with their unlock lines`,
        );
      }
      if (name === "mid" || name === "heart") {
        check(
          state.ok &&
            [
              state.buys,
              state.workshop,
              state.engineers,
              state.upgrades,
              state.ledger,
            ].every(keyOpen),
          `${label} every key is open`,
        );
      }
      if (name === "mid") {
        // Upgrades lights where today's glow was, and the red lamps sit on
        // the keys whose systems are still to be taught.
        const lit = keys.find((key) => key.id === "upgrades");
        check(
          lit?.lit === true &&
            lit.cap === CAP_X.lit &&
            keys.some((key) => key.dot),
          `${label} the Upgrades cap is lit and the red lamps show`,
        );
      }
      if (name === "workshop") {
        const bench = keys.find((key) => key.id === "workshop");
        check(
          /^\d+:\d\d$/.test(bench?.sub ?? ""),
          `${label} the bench clock reads under the Workshop key (${String(bench?.sub)})`,
        );
      }
      const foot = await railFoot(page);
      check(
        foot.ok,
        `${label} the rail ends at least 8px above the save line (${String(foot.gap)})`,
      );
      check(await noScroll(page), `${label} no page scroll`);
      await close();
    }
  });

  for (const [saveName, save] of DRAWER_SAVES) {
    section(
      `keys and drawers ${JSON.stringify(viewport)} ${saveName}`,
      async () => {
        const size = `${String(viewport[0])}x${String(viewport[1])}`;
        const { page, close } = await open(viewport, save(), {
          stopClock: true,
        });
        await keysDrawn(page);
        await page.evaluate(() => document.fonts.ready.then(() => true));
        await putNoteAway(page);
        for (const name of ["buys", "upgrades"]) {
          const label = `${size} ${name} drawer, ${saveName}:`;
          const up = await openSheet(page, name);
          // Every row's art has loaded before it is measured.
          await page.evaluate(() =>
            Promise.all(
              [...document.querySelectorAll(".board-sheet.is-open img")].map(
                (img) => img.decode().catch(() => undefined),
              ),
            ),
          );
          const facts = await drawerFacts(page, name);
          check(
            up && facts.placed && facts.odometerClear && facts.saveLineClear,
            `${label} stands at 178..864 by 8..416, with the odometer and the save line in view`,
          );
          if (!facts.placed || !facts.odometerClear || !facts.saveLineClear) {
            const clip = await page.$eval(
              ".board-sheet-clip",
              (el) => el.scrollTop,
            );
            console.log(
              "drawer box",
              size,
              saveName,
              name,
              JSON.stringify({ box: facts.box, clipScrollTop: clip }),
            );
          }
          check(await noScroll(page), `${label} no page scroll`);
          const mayScroll =
            name === "buys"
              ? LONG_BUYS.has(saveName)
              : facts.rows.length >= FULL_UPGRADES_ROWS;
          const mustScroll = name === "buys" && LONG_BUYS.has(saveName);
          check(
            facts.scrolls
              ? mayScroll && facts.spareClass === "is-off"
              : !mustScroll,
            `${label} its list ${facts.scrolls ? "scrolls inside the drawer (C1) with the spare off" : "fits with no scroll"}`,
          );
          if (facts.scrolls !== mustScroll && !(facts.scrolls && mayScroll)) {
            const sizes = await page.$eval(
              `${OPEN_SHEET(name)} .board-sheet-list`,
              (list) => [list.scrollHeight, list.clientHeight],
            );
            console.log("drawer scroll", size, saveName, name, sizes);
          }
          check(
            facts.spareClass === facts.spareWant,
            `${label} the spare plate is ${facts.spareClass}, as its height asks (${facts.spareWant})`,
          );
          const rowsOk =
            facts.rows.every((row) => Math.abs(row.height - 76) <= 0.5) &&
            facts.gaps.every((gap) => Math.abs(gap - 10) <= 0.5);
          check(
            rowsOk,
            `${label} ${String(facts.rows.length)} rows are 76 tall and 10 apart`,
          );
          const crowded = facts.rows.filter(
            (row) =>
              !row.inside || row.overlaps.length > 0 || row.spills.length > 0,
          );
          check(
            crowded.length === 0,
            `${label} every row's name, info, need, flag, gain, tag and verb lie inside it and apart`,
          );
          if (!rowsOk || crowded.length > 0) {
            console.log(
              "drawer rows",
              size,
              saveName,
              name,
              JSON.stringify({
                gaps: facts.gaps,
                crowded,
                rows: facts.rows.map((row) => [row.id, row.height]),
              }),
            );
          }
          const targets = await boardTargets(page);
          const inSheet = (target) =>
            /^\.(board-row|board-platebtn|board-sheet-info) /.test(
              target.selector,
            );
          const own = targets.own.filter(inSheet);
          // A scaled board snaps boxes to device pixels: allow a tenth of a pixel.
          const under = undersizedTargets(own, 47.9);
          const close8 = boardGaps(targets);
          check(
            own.length >= 2 && under.length === 0 && close8.length === 0,
            `${label} ${String(own.length)} targets are 48x48 board px, 8px from the next`,
          );
          if (under.length > 0 || close8.length > 0) {
            console.log(
              "drawer targets",
              size,
              saveName,
              name,
              JSON.stringify({
                under: under.map((target) => target.selector),
                close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
              }),
            );
          }
          const text = await boardTextSizes(page, OPEN_SHEET(name));
          check(
            text.small.length === 0 && text.count >= 3,
            `${label} text is 13px or more (${String(text.count)} runs)`,
          );
          if (text.small.length > 0) {
            console.log(
              "drawer text",
              size,
              saveName,
              name,
              JSON.stringify(text.small),
            );
          }
          const art = await boardArtAt2x(
            page,
            OPEN_SHEET(name),
            OPEN_SHEET(name),
          );
          check(
            art.misses.length === 0 && art.count >= 3,
            `${label} ${String(art.count)} images, sprites and skins at exactly 2x`,
          );
          if (art.misses.length > 0) {
            console.log(
              "drawer 2x",
              size,
              saveName,
              name,
              JSON.stringify(art.misses),
            );
          }
          const contrast = await boardContrast(page, ROW_LEGENDS(name));
          const dim = contrast.filter((row) => row.pct < 4.5);
          check(
            dim.length === 0,
            `${label} ${String(contrast.length)} row legends at 4.5:1 or more (lowest ${String(contrast.length === 0 ? "-" : Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
          );
          if (dim.length > 0) {
            console.log(
              "drawer contrast",
              size,
              saveName,
              name,
              JSON.stringify(dim),
            );
          }
          // The "i": its cards take the list's place, fit, and go back. A
          // finger on it inside the drawer's 400ms settle is the double tap's
          // second tap, so the press waits that out.
          await new Promise((resolve) => setTimeout(resolve, 450));
          await press(page, `${OPEN_SHEET(name)} .board-sheet-info`);
          await page
            .waitForSelector(
              `${OPEN_SHEET(name)} .board-sheet-how:not([hidden])`,
              {
                timeout: 2_000,
              },
            )
            .catch(() => undefined);
          await page.evaluate(() =>
            Promise.all(
              [
                ...document.querySelectorAll(
                  ".board-sheet.is-open .teach-how img",
                ),
              ].map((img) => img.decode().catch(() => undefined)),
            ),
          );
          const how = await howFacts(page, name);
          const howArt = await boardArtAt2x(
            page,
            OPEN_SHEET(name),
            OPEN_SHEET(name),
          );
          const howText = await boardTextSizes(page, OPEN_SHEET(name));
          check(
            how.ok && howArt.misses.length === 0 && howText.small.length === 0,
            `${label} the "i" cards fit the drawer with no scroll, one Back, art at 2x and 13px text`,
          );
          if (!how.ok || howArt.misses.length > 0 || howText.small.length > 0) {
            console.log(
              "drawer how",
              size,
              saveName,
              name,
              JSON.stringify({ how, art: howArt.misses, text: howText.small }),
            );
          }
          await page
            .$eval(
              `${OPEN_SHEET(name)} .board-sheet-how .teach-how-back:not([hidden])`,
              (back) => {
                back.click();
              },
            )
            .catch(() => undefined);
          await closeSheet(page, name);
        }
        await close();
      },
    );
  }

  section(`keys and drawers ${JSON.stringify(viewport)} states`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const rows = (page, name) =>
      page.$$eval(`${OPEN_SHEET(name)} .board-row`, (els) =>
        Object.fromEntries(
          els.map((row) => [
            // A found tool shares its name with an upgrade (boots).
            row.dataset.tool === undefined
              ? (row.dataset.tier ??
                row.dataset.boost ??
                row.dataset.upgrade ??
                "")
              : `tool:${row.dataset.tool}`,
            {
              shown: row.closest("[hidden]") === null,
              classes: [...row.classList],
              lamp:
                row.querySelector(".board-lamp")?.style.backgroundPositionX ??
                "",
              icon:
                row.querySelector(".board-row-icon")?.getAttribute("src") ?? "",
              need: row.querySelector(".board-row-need")?.textContent ?? "",
              flag: row.querySelector(".board-row-flag")?.textContent ?? "",
              badge: row.querySelector(".board-row-badge")?.textContent ?? "",
              price: row.querySelector(".board-row-price")?.textContent ?? "",
              verb: row.querySelector(".board-row-verb")?.textContent ?? "",
              trouble: row.dataset.trouble ?? "",
            },
          ]),
        ),
      );
    const visit = async (save, name, search = "") => {
      const opened = await open(viewport, save(), { search, stopClock: true });
      await keysDrawn(opened.page);
      await putNoteAway(opened.page);
      await openSheet(opened.page, name);
      return { ...opened, rows: await rows(opened.page, name) };
    };
    {
      const { close, rows: early } = await visit(() => crewMountain(), "buys");
      check(
        early.cart?.classes.includes("is-pick") === true &&
          early.cart.lamp === LAMP_X.amber &&
          early.drill?.classes.includes("is-dear") === true,
        `${size} early Buys: the cart is the amber pick and the drill is dear`,
      );
      await close();
    }
    {
      // The locked row: the Great Machine under its tarp until 120M.
      const { close, rows: mid } = await visit(() => openMountain(), "buys");
      check(
        mid.machine?.classes.includes("is-locked") === true &&
          mid.machine.price === "Locked" &&
          mid.machine.icon.includes("mach-machine-dim"),
        `${size} mid Buys: the Great Machine row is locked, dim, and reads Locked`,
      );
      await close();
    }
    {
      const { close, rows: short } = await visit(() => shortMountain(), "buys");
      check(
        short.borer?.classes.includes("is-short") === true &&
          short.borer.need === "Needs 8 workers",
        `${size} short Buys: the borer is short of hands and reads Needs 8 workers (${String(short.borer?.need)})`,
      );
      await close();
    }
    {
      const { close, rows: saving } = await visit(
        () => savingMountain(),
        "buys",
      );
      check(
        saving.cart?.flag === "Saving for",
        `${size} saving Buys: the cart row is flagged Saving for (${String(saving.cart?.flag)})`,
      );
      await close();
    }
    {
      const {
        page,
        close,
        rows: idle,
      } = await visit(() => idleMountain(), "buys");
      // The staffing New row is brought into the list's view, and only the
      // list moves for it: the drawer stays where it opens.
      const seen = await page.$eval(OPEN_SHEET("buys"), (sheet) => {
        const row = sheet.querySelector(".board-row.teach-new");
        const list = sheet.querySelector(".board-sheet-list");
        const clip = sheet.closest(".board-sheet-clip");
        const board = globalThis.__board();
        if (row === null || list === null) {
          return { ok: false };
        }
        const box = row.getBoundingClientRect();
        const port = list.getBoundingClientRect();
        const top =
          (sheet.getBoundingClientRect().top - board.top) / board.scale;
        return {
          ok:
            box.top >= port.top - 0.5 &&
            box.bottom <= port.bottom + 0.5 &&
            Math.abs(top - 178) <= 0.5 &&
            (clip?.scrollTop ?? 0) === 0,
          sheetTop: Math.round(top),
          clipScrollTop: clip?.scrollTop,
        };
      });
      check(
        idle.cart?.classes.includes("teach-new") === true &&
          idle.cart.flag === "New" &&
          seen.ok,
        `${size} idle Buys: the cart row is the staffing New row, in view, and the drawer stays at 178 (${JSON.stringify(seen)})`,
      );
      await close();
    }
    {
      // The Great Machine the pick, Ada tending it: its flag shares the name's
      // line, falls back to "Ready now" where the joined words do not fit,
      // and the name shows in full.
      const {
        page,
        close,
        rows: pick,
      } = await visit(() => machinePickMountain(), "buys");
      const name = await page.$eval(
        `${OPEN_SHEET("buys")} .tier[data-tier="machine"]`,
        (row) => {
          const mid = row.querySelector(".board-row-mid");
          const words = row.querySelector(".board-row-name");
          const flag = row.querySelector(".board-row-flag");
          return {
            full:
              mid !== null &&
              words !== null &&
              words.getBoundingClientRect().right <=
                mid.getBoundingClientRect().right + 0.5,
            flagInside:
              mid !== null &&
              flag !== null &&
              flag.getBoundingClientRect().right <=
                mid.getBoundingClientRect().right + 0.5,
          };
        },
      );
      const flag = pick.machine?.flag ?? "";
      check(
        pick.machine?.classes.includes("is-pick") === true &&
          (flag === "Ready now" || flag.startsWith("Ready now · Ada tends")) &&
          name.full &&
          name.flagInside,
        `${size} the Great Machine as the pick with Ada tending it: the name in full and the flag "${flag}" beside it`,
      );
      await close();
    }
    {
      const { close, rows: machine } = await visit(
        () => machineMountain(),
        "buys",
      );
      check(
        machine.kid?.shown === true &&
          machine.kid.classes.includes("is-locked") &&
          machine.kid.icon.includes("mach-kid-dim"),
        `${size} machine Buys: the Kid worker row is locked and drawn dim`,
      );
      await close();
    }
    {
      const {
        page,
        close,
        rows: machine,
      } = await visit(() => machineMountain(), "buys", "?trouble=cave-in");
      const dot = await page.$eval(
        `${KEY("buys")} .board-key-dot`,
        (el) => !el.hidden,
      );
      check(
        dot && machine.cart?.trouble === "cave-in",
        `${size} machine with a cave-in on the cart: the Buys key's red lamp shows and the cart row has the trouble`,
      );
      await close();
    }
    {
      const { page, close } = await visit(() => heirMountain(), "buys");
      const chips = await page.$$eval(
        `${OPEN_SHEET("buys")} .crew-bit`,
        (els) => els.map((chip) => chip.textContent ?? ""),
      );
      check(
        chips.some((chip) => chip.startsWith("Grandpa")),
        `${size} heir Buys: Grandpa's chip is on the crew line (${chips.join(" | ")})`,
      );
      await close();
    }
    {
      const { close, rows: tools } = await visit(
        () => toolsMountain(),
        "upgrades",
      );
      check(
        tools.tap?.badge === "Lv 2/10" &&
          tools.boots?.price === "Owned" &&
          tools["tool:pick"]?.price === "Found" &&
          tools["tool:lamp"]?.price === "Found",
        `${size} tools Upgrades: Strong arms at Lv 2/10, Better boots Owned, the pick and the lamp Found`,
      );
      if (tools.tap?.badge !== "Lv 2/10" || tools.boots?.price !== "Owned") {
        console.log("tools upgrades", size, JSON.stringify(tools));
      }
      await close();
    }
    {
      const { close, rows: crew } = await visit(
        () => ({ version: 4, mountain: CREW, lastSeen: Date.now() }),
        "upgrades",
      );
      check(
        ["sharper", "overtime"].every(
          (id) =>
            crew[id]?.classes.includes("is-running") === true &&
            crew[id].verb === "Running" &&
            /^\d+:\d\d$/.test(crew[id].price),
        ),
        `${size} crew Upgrades: both boosts are Running with their clocks`,
      );
      await close();
    }
  });

  section(`keys and drawers ${JSON.stringify(viewport)} taps`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} keys and drawers:`;
    // A sleepy double tap on each drawer's key, 150ms apart: the second tap
    // lands on the drawer that slid up under the finger, and neither buys
    // nor closes. Today's sheets (Workshop and Engineers until B6, the
    // Ledger's menu until B7) never buy either.
    {
      const { page, close } = await open(viewport, openMountain(), {
        stopClock: true,
      });
      await keysDrawn(page);
      await putNoteAway(page);
      for (const id of KEY_IDS) {
        const before = await storedMountain(page);
        const odoBefore = await odometer(page);
        await tapTwice(page, KEY(id), 150);
        const after = await storedMountain(page);
        const spent =
          after.pocket !== before.pocket ||
          (await odometer(page)) !== odoBefore ||
          ["helpers", "carts", "drills", "borers", "machines"].some(
            (tier) => (after[tier] ?? 0) !== (before[tier] ?? 0),
          );
        const drawer = id === "buys" || id === "upgrades";
        const stays = drawer
          ? await page.$eval(SHEET(id), (sheet) =>
              sheet.classList.contains("is-open"),
            )
          : true;
        check(
          !spent && stays,
          `${label} a double tap on the ${id} key ${drawer ? "leaves its drawer open and " : ""}buys nothing`,
        );
        if (spent || !stays) {
          console.log(
            "key double tap",
            size,
            id,
            JSON.stringify({ before, after, stays }),
          );
        }
        // Put whatever opened away before the next key.
        await page.keyboard.press("Escape");
        await new Promise((resolve) => setTimeout(resolve, 300));
        for (const sheet of ["buys", "upgrades"]) {
          if (await page.$(OPEN_SHEET(sheet))) {
            await closeSheet(page, sheet);
          }
        }
        for (const back of [
          ".workshop-close",
          ".engineers-close",
          ".menu-close",
        ]) {
          await page
            .$eval(`${back}`, (button) => {
              if (button.getClientRects().length > 0) {
                button.click();
              }
            })
            .catch(() => undefined);
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      await close();
    }

    // Early: the Buys key's double tap keeps Buys open with the odometer
    // unchanged; a tap on the cart row after 600ms buys one and shows Done,
    // and a second tap inside the 1.9s hold buys nothing. No row moves.
    {
      const { page, close } = await open(viewport, crewMountain(), {
        stopClock: true,
      });
      await keysDrawn(page);
      await putNoteAway(page);
      const odoBefore = await odometer(page);
      await tapTwice(page, KEY("buys"), 150);
      const stillOpen = (await page.$(OPEN_SHEET("buys"))) !== null;
      check(
        stillOpen && (await odometer(page)) === odoBefore,
        `${label} early: a double tap on the Buys key leaves Buys open and the odometer unchanged`,
      );
      await sheetSettled(page, "buys");
      await new Promise((resolve) => setTimeout(resolve, 600));
      const topsBefore = await listTops(page, "buys");
      const before = await storedMountain(page);
      const cart = `${OPEN_SHEET("buys")} .tier[data-tier="cart"]`;
      await press(page, cart);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const bought = await storedMountain(page);
      const done = await page.$eval(cart, (row) => ({
        verb: row.querySelector(".board-row-verb")?.textContent ?? "",
        held: row.classList.contains("is-held"),
      }));
      check(
        bought.carts - before.carts === 1 && done.verb === "Done" && done.held,
        `${label} early: a tap on the cart row after 600ms buys one cart and shows Done`,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await press(page, cart);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const again = await storedMountain(page);
      check(
        again.carts === bought.carts && again.pocket === bought.pocket,
        `${label} early: a second tap inside the 1.9s hold buys nothing`,
      );
      const topsAfter = await listTops(page, "buys");
      check(
        topsAfter.join(",") === topsBefore.join(","),
        `${label} early: a buy inside the drawer moves no row`,
      );
      if (topsAfter.join(",") !== topsBefore.join(",")) {
        console.log("frozen rows", size, topsBefore, topsAfter);
      }
      // The "i" shows the how cards in the list's place; their Back brings
      // the list back.
      await press(page, `${OPEN_SHEET("buys")} .board-sheet-info`);
      const cards = await page
        .waitForSelector(`${OPEN_SHEET("buys")} .teach-how`, {
          visible: true,
          timeout: 2_000,
        })
        .then(
          () => true,
          () => false,
        );
      await new Promise((resolve) => setTimeout(resolve, 450));
      await press(
        page,
        `${OPEN_SHEET("buys")} .board-sheet-how .teach-how-back:not([hidden])`,
      );
      const restored = await page
        .waitForFunction(
          (selector) => {
            const sheet = document.querySelector(selector);
            return (
              sheet?.querySelector(".board-sheet-list")?.hidden === false &&
              sheet.querySelector(".board-sheet-how")?.hidden === true
            );
          },
          { timeout: 2_000 },
          OPEN_SHEET("buys"),
        )
        .then(
          () => true,
          () => false,
        );
      check(
        cards && restored,
        `${label} early: the "i" shows the how cards, and their Back restores the list`,
      );
      await close();
    }

    // Saving: a tap on a row he cannot afford spends nothing and its lamp
    // reads red within 200ms.
    {
      const { page, close } = await open(viewport, savingMountain(), {
        stopClock: true,
      });
      await keysDrawn(page);
      await putNoteAway(page);
      await openSheet(page, "buys");
      await new Promise((resolve) => setTimeout(resolve, 450));
      const odoBefore = await odometer(page);
      const before = await storedMountain(page);
      const dear = `${OPEN_SHEET("buys")} .tier.is-dear[data-tier="cart"]`;
      const watch = page.evaluate(
        (selector, red) =>
          new Promise((resolve) => {
            const row = document.querySelector(selector);
            const lamp = row?.querySelector(".board-lamp");
            const started = performance.now();
            let at;
            row?.addEventListener(
              "click",
              () => {
                at = performance.now();
              },
              { once: true },
            );
            const look = () => {
              if (at !== undefined && lamp?.style.backgroundPositionX === red) {
                resolve(performance.now() - at);
                return;
              }
              if (performance.now() - started > 3_000) {
                resolve(Infinity);
                return;
              }
              requestAnimationFrame(look);
            };
            look();
          }),
        dear,
        LAMP_X.red,
      );
      await press(page, dear);
      const redAfter = await watch;
      const after = await storedMountain(page);
      check(
        redAfter <= 200 &&
          after.pocket === before.pocket &&
          after.carts === before.carts &&
          (await odometer(page)) === odoBefore,
        `${label} saving: a tap on a dear row spends nothing and its lamp reads red within 200ms (${String(Math.round(redAfter))}ms)`,
      );
      await close();
    }

    // The ways out: a scrim tap, a scrim tap over a relic socket (which then
    // shows the relic's note), and Escape.
    {
      const { page, close } = await open(viewport, openMountain(), {
        stopClock: true,
      });
      await keysDrawn(page);
      await putNoteAway(page);
      await openSheet(page, "buys");
      await new Promise((resolve) => setTimeout(resolve, 450));
      // A spot on the board above the drawer, off every socket: under the
      // odometer, at the left.
      await tapBoard(page, 24, 170);
      await page
        .waitForSelector(`${SHEET("buys")}:not(.is-open)`, { timeout: 2_000 })
        .catch(() => undefined);
      const shut = !(await buysOpen(page));
      const noNote = (await page.$(".board-note.on")) === null;
      check(shut && noNote, `${label} a scrim tap closes the drawer`);

      await openSheet(page, "buys");
      await new Promise((resolve) => setTimeout(resolve, 450));
      const socket = await page.$eval(".board-socket", (el) => {
        const board = globalThis.__board();
        const b = el.getBoundingClientRect();
        return {
          x: ((b.left + b.right) / 2 - board.left) / board.scale,
          y: ((b.top + b.bottom) / 2 - board.top) / board.scale,
        };
      });
      await tapBoard(page, socket.x, socket.y);
      const note = await page
        .waitForSelector(".board-note.on", { timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      check(
        !(await buysOpen(page)) && note,
        `${label} a scrim tap on a socket closes the drawer and shows the relic's note`,
      );
      await page.keyboard.press("Escape");
      await new Promise((resolve) => setTimeout(resolve, 300));

      await openSheet(page, "upgrades");
      await page.keyboard.press("Escape");
      const escaped = await page
        .waitForSelector(`${SHEET("upgrades")}:not(.is-open)`, {
          timeout: 2_000,
        })
        .then(
          () => true,
          () => false,
        );
      check(escaped, `${label} Escape closes the drawer`);
      await close();
    }

    // Reduced motion: a drawer is all the way open in the first frame after
    // the tap, and a dear tap never paints red. Without it, the drawer is
    // still sliding in that frame.
    for (const reducedMotion of [false, true]) {
      const { page, close } = await open(viewport, savingMountain(), {
        reducedMotion,
        stopClock: true,
      });
      await keysDrawn(page);
      await putNoteAway(page);
      const firstFrame = await page.evaluate(
        (key, sheetSelector) =>
          new Promise((resolve) => {
            document.querySelector(key)?.click();
            requestAnimationFrame(() => {
              const board = globalThis.__board();
              const sheet = document.querySelector(sheetSelector);
              const top = sheet?.getBoundingClientRect().top ?? 0;
              resolve((top - board.top) / board.scale);
            });
          }),
        KEY("buys"),
        SHEET("buys"),
      );
      if (reducedMotion) {
        check(
          Math.abs(firstFrame - 178) <= 0.5,
          `${label} under reduced motion the drawer is fully open in the first frame (${String(Math.round(firstFrame))})`,
        );
      } else {
        check(
          firstFrame > 178.5,
          `${label} without reduced motion the drawer is still sliding in the first frame (${String(Math.round(firstFrame))})`,
        );
      }
      if (reducedMotion) {
        await sheetSettled(page, "buys");
        await new Promise((resolve) => setTimeout(resolve, 450));
        const dear = `${OPEN_SHEET("buys")} .tier.is-dear[data-tier="cart"]`;
        const watch = page.evaluate(
          (selector, red) =>
            new Promise((resolve) => {
              const lamp = document.querySelector(`${selector} .board-lamp`);
              const started = performance.now();
              let painted = false;
              const look = () => {
                painted ||= lamp?.style.backgroundPositionX === red;
                if (performance.now() - started > 800) {
                  resolve(painted);
                  return;
                }
                requestAnimationFrame(look);
              };
              look();
            }),
          dear,
          LAMP_X.red,
        );
        await press(page, dear);
        check(
          !(await watch),
          `${label} under reduced motion a dear tap never paints the lamp red`,
        );
      }
      await close();
    }
  });
}

// Pages wait on the network as much as the CPU, so 1.5 per core beats 1
// (measured on 4 cores: 70 s at 4 jobs, 63 s at 6, 62 s at 8).
if (only !== undefined && sections.length === 0) {
  console.error(
    `VISUAL_ONLY=${String(process.env.VISUAL_ONLY)} matches no section; nothing was checked.`,
  );
  await browser.close();
  await server?.close();
  process.exit(1);
}
const jobs = Math.max(
  1,
  Number(process.env.VISUAL_JOBS ?? Math.ceil(availableParallelism() * 1.5)),
);
const timings = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, sections.length) }, async () => {
    while (next < sections.length) {
      const { label, run } = sections[next];
      next += 1;
      const started = performance.now();
      try {
        await run();
      } catch (error) {
        failures.push(`${label} threw: ${String(error?.stack ?? error)}`);
      }
      timings.push([label, (performance.now() - started) / 1000]);
    }
  }),
);
if (process.env.VISUAL_TIMINGS) {
  for (const [label, seconds] of timings.sort((a, b) => b[1] - a[1])) {
    console.log(`${seconds.toFixed(1).padStart(6)}s  ${label}`);
  }
}

await browser.close();
await server?.close();
if (failures.length > 0) {
  console.error(
    `\n${String(failures.length)} visual check(s) failed:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(
  only === undefined
    ? "\nAll visual checks passed."
    : `\nThe ${String(sections.length)} section(s) VISUAL_ONLY=${String(process.env.VISUAL_ONLY)} matched passed; the rest did not run.`,
);
