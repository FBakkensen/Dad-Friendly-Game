/* global console, process, document, innerWidth, innerHeight, scrollBy, scrollY, sessionStorage, localStorage, getComputedStyle, setTimeout, URL, HTMLButtonElement, Image */
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
} from "../src/ui-audit-measure.ts";
import {
  CREW,
  SAVE_KEY,
  crewMountain,
  freshMountain,
  lastStoneSave,
  openMountain,
  seedJson,
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
const section = (label, run) => {
  sections.push({ label, run });
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
  { standalone = false, search = "", stopClock = false } = {},
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
  await press(page, ".engineers-button");
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
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    check(await noScroll(page), `${size} no scroll with crew floats running`);
    const tiersVisible = await page.evaluate(() =>
      [...document.querySelectorAll(".tier")]
        .filter((tier) => !tier.hidden)
        .every(
          (tier) =>
            tier.getBoundingClientRect().bottom <= globalThis.__board().bottom,
        ),
    );
    check(tiersVisible, `${size} every tier card is above the fold`);

    // The vein lives inside the mountain, not in the page flow.
    const veinInside = await page.evaluate(() => {
      const vein = document.querySelector(".golden-vein");
      const wrap = document.querySelector(".mountain-stage");
      if (vein === null || wrap === null) {
        return false;
      }
      // Place it at the far corner a vein can use, as the game does inline.
      const { left, top } = vein.style;
      vein.style.left = "80%";
      vein.style.top = "80%";
      vein.hidden = false;
      const v = vein.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      const ok =
        getComputedStyle(vein).position === "absolute" &&
        v.top >= w.top - v.height / 2 &&
        v.bottom <= w.bottom + v.height / 2 &&
        v.left >= w.left - v.width / 2 &&
        v.right <= w.right + v.width / 2;
      vein.hidden = true;
      vein.style.left = left;
      vein.style.top = top;
      return ok;
    });
    check(veinInside, `${size} golden vein sits inside the mountain`);

    // A socket's note holds the shelf's key; the tag is a label (#370).
    await openShelf(page);
    check(
      await coversBoard(page, ".shelf-dialog"),
      `${size} relic shelf is laid over the game`,
    );
    await press(page, ".shelf-close");
    await press(page, ".menu-button");
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
    await press(page, ".upgrades-button");
    check(
      await coversBoard(page, ".upgrades-dialog"),
      `${size} upgrades sheet is laid over the game`,
    );
    // Every buy button and the way back can be reached, scrolling if it must.
    const sheetReachable = await page.$eval(".upgrades-dialog", (sheet) => {
      const board = globalThis.__board();
      // Rows not yet nearly affordable are hidden (#245); check what shows.
      const buttons = [...sheet.querySelectorAll("button")].filter(
        (button) => button.getClientRects().length > 0,
      );
      const wide = buttons.every((button) => {
        const box = button.getBoundingClientRect();
        return (
          box.height / board.scale >= 44 &&
          box.left >= board.left &&
          box.right <= board.right
        );
      });
      sheet.scrollTop = 0;
      const titleTop =
        sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      sheet.scrollTop = sheet.scrollHeight;
      const closeBottom =
        sheet.querySelector(".upgrades-close")?.getBoundingClientRect()
          .bottom ?? Infinity;
      sheet.scrollTop = 0;
      return (
        buttons.length >= 2 &&
        wide &&
        titleTop >= board.top &&
        closeBottom <= board.saveTop
      );
    });
    check(sheetReachable, `${size} upgrades sheet buttons are tappable`);
    const sheetFit = await page.$eval(".upgrades-dialog", (sheet) => {
      const card = sheet.querySelector(".upgrades-card");
      const style = card === null ? null : getComputedStyle(card);
      const background = style?.backgroundColor ?? "";
      const opaque =
        style !== null &&
        background !== "transparent" &&
        background !== "rgba(0, 0, 0, 0)" &&
        style.backgroundImage === "none";
      const border =
        style !== null &&
        Number.parseFloat(style.borderTopWidth) >= 1 &&
        style.borderTopStyle !== "none";
      const shadow = style !== null && style.boxShadow !== "none";
      const text = [
        ...sheet.querySelectorAll(
          ".upgrade-name, .upgrade-effect, .upgrade-buy",
        ),
      ];
      const typeOk = text.every(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 14.4,
      );
      const lastingBuys = [
        // The New card's one big button runs full width under its lines.
        ...sheet.querySelectorAll(
          ".upgrade:not(.boost):not([hidden]) .upgrade-buy:not(.teach-action)",
        ),
      ];
      const cardRight = card?.getBoundingClientRect().right ?? 0;
      const priceRight = lastingBuys.every((button) => {
        const name = button.closest(".upgrade")?.querySelector(".upgrade-name");
        if (name === null || name === undefined) {
          return false;
        }
        const price = button.getBoundingClientRect();
        const label = name.getBoundingClientRect();
        // The price sits at the right of its own row card (#250 shows lasting
        // rows here; before, the sheet held only the New card and boosts).
        const rowRight =
          button.closest(".upgrade")?.getBoundingClientRect().right ??
          cardRight;
        const scale = globalThis.__board().scale;
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
      const buyLinesOk = [...sheet.querySelectorAll(".upgrade-buy")].every(
        (button) =>
          !button.textContent.startsWith("Buy") || lineCount(button) <= 1,
      );
      const boosts = [...sheet.querySelectorAll(".upgrade.boost")].filter(
        (row) => !row.hidden,
      );
      const stacked =
        boosts.length < 2 ||
        boosts[1].getBoundingClientRect().top >=
          boosts[0].getBoundingClientRect().bottom - 1;
      const effectsOk = [
        ...sheet.querySelectorAll(".upgrade:not([hidden]) .upgrade-effect"),
      ].every((node) => lineCount(node) <= 2);
      return {
        fits: sheet.scrollHeight <= sheet.clientHeight + 1,
        scroll: sheet.scrollHeight,
        client: sheet.clientHeight,
        opaque,
        border,
        shadow,
        typeOk,
        priceRight,
        buyLinesOk,
        stacked,
        effectsOk,
        background,
      };
    });
    check(
      sheetFit.fits &&
        sheetFit.opaque &&
        sheetFit.border &&
        sheetFit.shadow &&
        sheetFit.typeOk &&
        sheetFit.priceRight &&
        sheetFit.buyLinesOk &&
        sheetFit.stacked &&
        sheetFit.effectsOk,
      `${size} upgrades sheet fits, with an opaque card`,
    );
    if (
      !sheetFit.fits ||
      !sheetFit.opaque ||
      !sheetFit.border ||
      !sheetFit.shadow ||
      !sheetFit.typeOk ||
      !sheetFit.priceRight ||
      !sheetFit.buyLinesOk ||
      !sheetFit.stacked ||
      !sheetFit.effectsOk
    ) {
      console.log(`upgrades detail ${size} ${JSON.stringify(sheetFit)}`);
    }
    await press(page, ".upgrades-close");
    const engineersFat = await page.$eval(".engineers-button", (button) => {
      const board = globalThis.__board();
      const box = button.getBoundingClientRect();
      return (
        !button.hidden &&
        button.getAttribute("aria-label") === "Engineers" &&
        box.height / board.scale >= 44 &&
        box.width / board.scale >= 44 &&
        box.left >= board.left &&
        box.right <= board.right
      );
    });
    check(engineersFat, `${size} engineers button is tappable`);
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
      await page.evaluate(() => {
        const openBuys = document.querySelector(".buys-button");
        if (openBuys instanceof HTMLButtonElement) {
          openBuys.click();
        }
      });
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll(".tier")]
          .filter((card) => !card.hidden)
          .map((card) => ({
            height: Math.round(card.getBoundingClientRect().height),
            clipped: [
              ...card.querySelectorAll(".tier-name, .tier-cost, .tier-rate"),
            ]
              .filter((line) => line.scrollWidth > line.clientWidth + 1)
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
        `${label} show every line in full ${clipped.join(" | ")}`,
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
      const crewLineFits = await page.evaluate(() => {
        const line = document.querySelector(".crew-status");
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
        await page.evaluate(() => {
          document.querySelector(".buys-close")?.click();
        });
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
      `${size} standalone golden vein appears on top of the mountain`,
    );
    if (veinOnTop) {
      await page.tap(".golden-vein");
      const note = await page.$eval(
        ".vein-note",
        (element) => element.textContent,
      );
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
  await page.tap(".upgrades-button");
  const tools = await page.$eval(
    ".upgrades-dialog",
    (sheet, insets) => {
      const rows = [...sheet.querySelectorAll(".found-tool")].filter(
        (row) => !row.hidden,
      );
      const text = rows.map((row) => row.textContent ?? "").join(" ");
      sheet.scrollTop = 0;
      const titleTop =
        sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      sheet.scrollTop = sheet.scrollHeight;
      const close = sheet
        .querySelector(".upgrades-close")
        ?.getBoundingClientRect();
      sheet.scrollTop = 0;
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
  await page.tap(".upgrades-close");
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
    await page.tap(".mountain");
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
    await page.tap(".mountain");
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
    const badgeFits = await page.$eval(".legacy-badge", (badge) => {
      const box = badge.getBoundingClientRect();
      const stage = badge.parentElement.getBoundingClientRect();
      return (
        box.left >= 0 &&
        box.right <= innerWidth &&
        box.top >= stage.top &&
        box.bottom <= stage.bottom
      );
    });
    check(badgeFits, `${label} Legacy badge sits inside the mountain`);
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
    await page.click(".buys-button");
    const card = await page
      .$eval('[data-tier="cart"]', (el) => {
        const box = el.getBoundingClientRect();
        return {
          kind: el.dataset.trouble ?? "",
          rate: el.querySelector(".tier-rate")?.textContent ?? "",
          label: el.getAttribute("aria-label") ?? "",
          height: box.height,
          width: box.width,
          top: box.top,
          bottom: box.bottom,
        };
      })
      .catch(() => undefined);
    check(card?.kind === "cave-in", `${label} trouble card is a cave-in`);
    check(card?.rate === "Cave-in!", `${label} trouble card says Cave-in!`);
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
        const el = document.querySelector('[data-tier="cart"]');
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
    await page.tap(".engineers-button");
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
      await page.tap(".engineers-button");
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
    await press(page, ".menu-button");
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
    await page.tap(".menu-button");
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
              ".board-top, .board-saveline, .board-drawer-clip, .board-note",
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
      await page.tap(".mountain");
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
      const fit = await fitOf(page, "#app", ".material-bit, .menu-button");
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
      const rates = await page.$$eval(".tier-rate", (nodes) =>
        nodes.map((node) => node.textContent ?? ""),
      );
      const cart = rates.find((line) => line.includes("99/s"));
      // Before the Granite (10M) the borer is a locked preview that names its depth (#250, #356).
      const borer = rates.find((line) => line.startsWith("Borer"));
      await page.click(".buys-button");
      const inside = await page.$$eval(".tier-rate", (nodes) =>
        nodes.every((node) => {
          const card = node.closest(".tier");
          if (card === null || card.hidden) {
            return true;
          }
          const rate = node.getBoundingClientRect();
          const box = card.getBoundingClientRect();
          if (getComputedStyle(node).display === "none") {
            return true;
          }
          return (
            rate.height > 0 &&
            rate.bottom <= box.bottom + 1 &&
            rate.right <= box.right + 1
          );
        }),
      );
      const still = await noScroll(page);
      check(
        still &&
          inside &&
          cart !== undefined &&
          cart.startsWith("+") &&
          cart.includes("·") &&
          !cart.startsWith("\u2191") &&
          borer !== undefined &&
          borer === "Borer · 10M",
        `${size} cart shows +N and the locked borer says where it opens`,
      );
      if (!still || !inside || cart === undefined || borer === undefined) {
        console.log("crew gains", size, rates, inside);
      }
      const posts = await page.$eval(".crew-posts", (button) => ({
        text: button.textContent ?? "",
        label: button.getAttribute("aria-label") ?? "",
        height: button.getBoundingClientRect().height,
      }));
      await page.tap(".crew-posts");
      const opened = await page.$eval(".crew-breakdown", (line) => ({
        hidden: line.hidden,
        text: line.textContent ?? "",
      }));
      const named =
        posts.text.includes("on carts") ||
        posts.label.includes("on carts") ||
        (!opened.hidden && opened.text.includes("on carts"));
      check(
        named &&
          posts.label.includes("on carts") &&
          posts.label.includes("free") &&
          posts.height >= 44 &&
          (await noScroll(page)),
        `${size} worker line names where the crew is`,
      );
      if (!named || posts.height < 44) {
        console.log("posts", size, posts, opened);
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
    await first.tap(".mountain");
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

// The relic plate is centred on the board and the rock, and the rock sits
// clear below the board's top (#370). Locked thumb buttons stay quiet.
const SHELF_VIEWS = SCREENS;
const PHONE_SHOTS = new Set(["424x924"]);

async function shelfCentre(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const plate = document.querySelector(".board-relics");
    const top = document.querySelector(".board-top");
    const rock = document.querySelector(".mountain-stage");
    if (plate === null || top === null || rock === null) {
      return { ok: false, delta: 999, rockDelta: 999 };
    }
    const box = plate.getBoundingClientRect();
    const topBox = top.getBoundingClientRect();
    const rockBox = rock.getBoundingClientRect();
    const mid = (box.left + box.right) / 2;
    const view = (board.left + board.right) / 2;
    const rockMid = (rockBox.left + rockBox.right) / 2;
    // In board px, so a PC fit reads the same as the phone.
    const delta = (mid - view) / board.scale;
    const rockDelta = (mid - rockMid) / board.scale;
    const art = document.querySelector(".mountain-art");
    const artBox = art?.getBoundingClientRect();
    const clear =
      artBox !== undefined &&
      artBox.top >= topBox.bottom - 0.5 &&
      artBox.height > 1;
    const fat =
      artBox !== undefined &&
      artBox.width / board.scale >= 96 &&
      artBox.height / board.scale >= 96;
    return {
      ok: Math.abs(delta) <= 2 && Math.abs(rockDelta) <= 2 && clear && fat,
      delta,
      rockDelta,
      clear,
      fat,
      artHeight:
        artBox === undefined ? 0 : Math.round(artBox.height / board.scale),
    };
  });
}

async function thumbState(page) {
  return page.evaluate(() => {
    const read = (selector) => {
      const button = document.querySelector(selector);
      if (!(button instanceof HTMLButtonElement)) {
        return null;
      }
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      const scale = globalThis.__board().scale;
      return {
        disabled: button.disabled,
        border: style.borderTopColor,
        color: style.color,
        background: style.backgroundColor,
        width: box.width / scale,
        height: box.height / scale,
      };
    };
    const buys = read(".buys-button");
    const workshop = read(".thumb-workshop");
    const engineers = read(".engineers-button");
    const upgrades = read(".upgrades-button");
    const buttons = [buys, workshop, engineers, upgrades];
    if (buttons.some((button) => button === null)) {
      return { ok: false, buys, workshop, engineers, upgrades };
    }
    const laidOut =
      buttons.every((button) => button.height >= 48 && button.width >= 48) &&
      buttons.every(
        (button) =>
          Math.abs(button.width - buys.width) <= 1 &&
          Math.abs(button.height - buys.height) <= 1,
      );
    return { ok: laidOut, buys, workshop, engineers, upgrades };
  });
}

async function scrollSheet(page, scroller, edge) {
  await page.evaluate(
    (scrollerSelector, which) => {
      const element = document.querySelector(scrollerSelector);
      const cards = [
        ...(element?.querySelectorAll(".sheet-card") ?? []),
      ].filter((node) => !node.hidden && node.getClientRects().length > 0);
      const card =
        which === "start"
          ? cards.reduce((best, item) =>
              item.getBoundingClientRect().top <
              best.getBoundingClientRect().top
                ? item
                : best,
            )
          : cards.reduce((best, item) =>
              item.getBoundingClientRect().bottom >
              best.getBoundingClientRect().bottom
                ? item
                : best,
            );
      card?.scrollIntoView({
        block: which === "start" ? "start" : "end",
        inline: "nearest",
      });
    },
    scroller,
    edge,
  );
}

async function sheetEdges(page, scroller) {
  return page.evaluate((scrollerSelector) => {
    const element = document.querySelector(scrollerSelector);
    const sheet = element?.closest(".buys-card, .upgrades-card");
    // The Upgrades header row holds the title and the 48px i, so the cards
    // clear that row, not just the title text.
    const header = sheet?.querySelector(".upgrades-head, h2");
    const footer = sheet?.querySelector(".buys-close, .upgrades-close");
    const cards = () =>
      [...(element?.querySelectorAll(".sheet-card") ?? [])].filter(
        (node) => !node.hidden && node.getClientRects().length > 0,
      );
    if (
      element === null ||
      sheet === null ||
      sheet === undefined ||
      header === null ||
      header === undefined ||
      footer === null ||
      footer === undefined ||
      cards().length === 0
    ) {
      return { ok: false, topGap: -1, endGap: -1, first: "", last: "" };
    }
    const topmost = () =>
      cards().reduce((best, card) =>
        card.getBoundingClientRect().top < best.getBoundingClientRect().top
          ? card
          : best,
      );
    const bottommost = () =>
      cards().reduce((best, card) =>
        card.getBoundingClientRect().bottom >
        best.getBoundingClientRect().bottom
          ? card
          : best,
      );
    const firstEl = topmost();
    firstEl.scrollIntoView({ block: "start", inline: "nearest" });
    const firstBox = firstEl.getBoundingClientRect();
    const head = header.getBoundingClientRect();
    const portTop = element.getBoundingClientRect();
    // Gaps in board px, so a PC fit reads the same as the phone.
    const scale = globalThis.__board().scale;
    const topGap = (firstBox.top - head.bottom) / scale;
    const lastEl = bottommost();
    lastEl.scrollIntoView({ block: "end", inline: "nearest" });
    const lastBox = lastEl.getBoundingClientRect();
    const foot = footer.getBoundingClientRect();
    const portEnd = element.getBoundingClientRect();
    const endGap = (foot.top - lastBox.bottom) / scale;
    const overflows = element.scrollHeight > element.clientHeight + 1;
    // The sheet stops under the odometer's legend, so a buy's spend shows
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
      firstBox.top >= portTop.top + 7 * scale &&
      firstBox.bottom <= portTop.bottom + 1;
    const lastIn =
      lastBox.top >= portEnd.top - 1 &&
      lastBox.bottom <= portEnd.bottom - 7 * scale;
    const clip = (node) =>
      (node.textContent ?? "").replaceAll(/\s+/g, " ").slice(0, 42);
    return {
      ok:
        pageStill &&
        odometerClear &&
        firstIn &&
        lastIn &&
        firstBox.top >= head.bottom &&
        lastBox.bottom <= foot.top &&
        gapOk(topGap) &&
        gapOk(endGap),
      topGap: Math.round(topGap * 10) / 10,
      endGap: Math.round(endGap * 10) / 10,
      overflows,
      odometerClear,
      first: clip(firstEl),
      last: clip(lastEl),
    };
  }, scroller);
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
      const thumbs = await thumbState(page);
      const freshPaint =
        thumbs.ok &&
        !thumbs.buys.disabled &&
        thumbs.buys.border === "rgb(242, 196, 109)" &&
        thumbs.workshop.disabled &&
        thumbs.workshop.background === "rgb(58, 42, 28)" &&
        thumbs.engineers.disabled &&
        thumbs.upgrades.disabled === false &&
        thumbs.upgrades.color === "rgb(242, 196, 109)";
      check(
        freshPaint,
        `${size} fresh thumb bar: Buys and Upgrades gold, Workshop and Engineers quiet`,
      );
      if (!freshPaint) {
        console.log("thumbs fresh", size, thumbs);
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
      const thumbs = await thumbState(page);
      const openPaint =
        thumbs.ok &&
        [thumbs.buys, thumbs.workshop, thumbs.engineers, thumbs.upgrades].every(
          (button) =>
            button.disabled === false && button.color === "rgb(242, 196, 109)",
        );
      check(openPaint, `${size} unlocked thumb bar is all gold`);
      if (!openPaint) {
        console.log("thumbs open", size, thumbs);
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
    for (const [name, scroller, openSelector] of [
      ["buys", ".buys-dialog .tier-grid", ".buys-button"],
      ["upgrades", ".upgrades-scroll", ".upgrades-button"],
    ]) {
      await press(page, openSelector);
      const dialog = name === "buys" ? ".buys-dialog" : ".upgrades-dialog";
      await page.waitForSelector(`${dialog}:not([hidden])`);
      await scrollSheet(page, scroller, "start");
      if (shotThis) {
        await shot(page, `${name}-top-${size}`);
      }
      await scrollSheet(page, scroller, "end");
      if (shotThis) {
        await shot(page, `${name}-end-${size}`);
      }
      const edges = await sheetEdges(page, scroller);
      check(
        edges.ok,
        `${size} ${name} first card clears the header and last card clears the footer`,
      );
      if (!edges.ok) {
        console.log(name, size, edges);
      }
      const closeSelector = name === "buys" ? ".buys-close" : ".upgrades-close";
      await page.click(closeSelector);
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
    const menu = document.querySelector(".menu-button");
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
    const rows = [...document.querySelectorAll(".crew-row")];
    const counts = rows.map((row) => row.querySelectorAll(".crew-bit").length);
    const balanced =
      counts.length === 0 || Math.max(...counts) - Math.min(...counts) <= 1;
    const pageStill =
      scrollY === 0 &&
      app.scrollTop === 0 &&
      document.documentElement.scrollHeight ===
        document.documentElement.clientHeight &&
      app.scrollHeight === app.clientHeight;
    return {
      ok: apart && housed && balanced && pageStill,
      apart,
      housed,
      balanced,
      pageStill,
      counts,
      pocket: pill.getAttribute("aria-label"),
    };
  });
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
    await page.waitForSelector(".buys-button");
    await page.tap(".buys-button");
    await page.waitForSelector(".buys-dialog:not([hidden])");
    const buys = await page.evaluate(() => {
      const card = (tier) => document.querySelector(`[data-tier="${tier}"]`);
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
      return {
        drillName: drill?.querySelector(".tier-name")?.textContent,
        drillGain: shown("drill", ".tier-gain"),
        drillWhy: shown("drill", ".tier-why"),
        machineLocked:
          machine?.querySelector(".tier-cost")?.textContent === "Locked",
        machineGain: shown("machine", ".tier-gain"),
        machineWhy:
          card("machine")?.querySelector(".tier-why")?.textContent ===
          // The Deep Heart's 120M of depth in stones: 10M + 35M x 2.625 + 75M x 6.3
          // is 574.375M, shown as 574.3M (#357).
          "The Great Machine joins your crew at 574.3M stones. Keep digging, Dad!",
      };
    });
    check(
      buys.drillName === "Steam drill" &&
        buys.drillGain &&
        buys.drillWhy &&
        buys.machineLocked &&
        !buys.machineGain &&
        buys.machineWhy,
      `${size} unaffordable drill keeps its lines and the locked machine says where it opens`,
    );
    if (buys.drillName !== "Steam drill" || !buys.drillGain) {
      console.log("buys mix", size, buys);
    }
    await page.$eval('[data-tier="drill"]', (card) => {
      card.scrollIntoView({ block: "center" });
    });
    await shot(page, `buys-mix-${size}`);
    await page.click(".buys-close");
    await page.tap(".thumb-workshop");
    await page.waitForSelector(".workshop-dialog:not([hidden])");
    await shot(page, `workshop-mix-${size}`);
    await page.click(".workshop-close");
    await page.tap(".upgrades-button");
    await page.waitForSelector(".upgrades-dialog:not([hidden])");
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
        armsEffect: shown("tap", ".upgrade-effect"),
        armsWhy: shown("tap", ".upgrade-why"),
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
    if (!upgrades.armsEffect) {
      console.log("upgrades mix", size, upgrades);
    }
    await page.$eval('[data-upgrade="tap"]', (card) => {
      card.scrollIntoView({ block: "center" });
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
  ["buys", () => guardSave(Date.now()), [".buys-button"]],
  ["upgrades", () => guardSave(Date.now()), [".upgrades-button"]],
  ["workshop", () => guardSave(Date.now()), [".thumb-workshop"]],
  ["engineers", () => guardSave(Date.now()), [".engineers-button"]],
  ["relic shelf", () => guardSave(Date.now()), [".board-socket", SHELF_KEY]],
  ["save drawer", () => guardSave(Date.now()), [".save-status"]],
  ["menu", () => guardSave(Date.now()), [".menu-button"]],
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
      ".mountain",
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
/** The board's own controls; the save drawer's buttons join when it is open. */
const BOARD_TARGETS =
  ".board-socket, .board-dial, .save-status, .board-save-drawer.is-open .board-platebtn, .board-note.on .board-platebtn";
/** Every other control a finger can reach on the board at that moment. */
const NEIGHBOURS = "#app button, #app [role='button']";
/** Board text read against the board's art: the bars ask 4.5:1 of these. */
const BOARD_LEGENDS = [
  ".board-odo-legend .board-lg:not(.board-spend)",
  ".board-dial .board-lg",
  ".board-tag .board-lg",
  ".board-save-words",
  ".board-save-safe",
  ".board-save-why",
].join(", ");
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
      // popup, and the popup's own buttons are what a finger meets there.
      // That holds for the board's own controls too.
      const popupEls = [
        ...document.querySelectorAll(
          ".board-note.on, .board-save-drawer.is-open",
        ),
      ];
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
      const mine = [...document.querySelectorAll(own)].filter(
        (el) =>
          onScreen(el) &&
          (popupEls.some((popup) => popup.contains(el)) || !underPopup(el)),
      );
      const others = [...document.querySelectorAll(neighbours)].filter(
        (el) =>
          onScreen(el) && onTop(el) && !underPopup(el) && !mine.includes(el),
      );
      return { own: mine.map(measure), others: others.map(measure) };
    },
    BOARD_TARGETS,
    NEIGHBOURS,
  );
}

/** Pairs closer than 8 board px where at least one is the board's own. */
function boardGaps({ own, others }) {
  const ownNames = new Set(own.map((target) => target.selector));
  // A scaled board snaps each box to device pixels, so an 8px gap can read
  // 7.99 board px on a PC: allow a tenth of a pixel.
  return targetsCloserThan([...own, ...others], 7.9).filter(
    (pair) => ownNames.has(pair.a) || ownNames.has(pair.b),
  );
}

/** Text in the board's parts that a person sees, and its size. */
async function boardTextSizes(page) {
  return page.evaluate(() => {
    const roots = [
      ...document.querySelectorAll(
        ".board-top, .board-saveline, .board-save-drawer.is-open, .board-note.on",
      ),
    ];
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
  });
}

/** Every img, sprite and skin of the board drawn at exactly twice its art. */
async function boardArtAt2x(page) {
  return page.evaluate(async () => {
    const parts = [
      ...document.querySelectorAll(
        ".board-top, .board-saveline, .board-save-drawer.is-open, .board-note.on",
      ),
    ];
    const misses = [];
    let count = 0;
    const drawn = (el) =>
      el.getClientRects().length > 0 && el.closest("[hidden]") === null;
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
    for (const part of parts) {
      const imgs = part.matches(".board-top, .board-saveline")
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
      const sprites = part.matches(".board-top, .board-saveline")
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
  });
}

/**
 * Each legend's text colour against its background pixels: the 10th and 90th
 * percentile by luminance (which the gate reads) and the darkest and lightest
 * (printed). The background is read from a screenshot (device scale 1)
 * taken with the text itself made clear, so glyph edges are never mistaken for
 * the background.
 */
async function boardContrast(page) {
  const boxes = await page.evaluate((selector) => {
    return [...document.querySelectorAll(selector)]
      .filter((el) => {
        const style = getComputedStyle(el);
        return (
          (el.textContent ?? "").trim() !== "" &&
          el.getClientRects().length > 0 &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0
        );
      })
      .map((el) => {
        const box = el.getBoundingClientRect();
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
  }, BOARD_LEGENDS);
  const clear = await page.addStyleTag({
    content: `${BOARD_LEGENDS.split(", ")
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
      // The controls at rest, before any note or drawer opens.
      const rest = await boardTargets(page);

      // Gated on the 10th/90th percentile of the background: the enamel is
      // textured, and a lone scratch should not fail a legend. The strict
      // darkest/lightest ratio is printed beside it.
      const contrast = await boardContrast(page);
      const dim = contrast.filter((row) => row.pct < 4.5);
      check(
        contrast.length >= 4 && dim.length === 0,
        `${label} ${String(contrast.length)} legends at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90, ${String(Math.min(...contrast.map((row) => row.ratio)))}:1 at the extremes)`,
      );
      if (dim.length > 0 || contrast.length < 4) {
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
        rest.own.length >= 8 &&
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

// Pages wait on the network as much as the CPU, so 1.5 per core beats 1
// (measured on 4 cores: 70 s at 4 jobs, 63 s at 6, 62 s at 8).
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
console.log("\nAll visual checks passed.");
