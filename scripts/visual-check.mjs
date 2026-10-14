/* global console, process, document, innerWidth, innerHeight, scrollBy, scrollY, sessionStorage, localStorage, getComputedStyle, setTimeout, URL */
/**
 * Real-browser layout guard (jsdom can't see CSS). Run it with:
 *   npm run visual   (starts its own dev server; part of npm run check, so CI runs it)
 * Fails if any phone viewport scrolls, or if an overlay isn't laid over the game.
 */
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";

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
const SAVE_KEY = "dad-friendly-session";
const VIEWPORTS = [
  [360, 560],
  [360, 640],
  [375, 667],
  [390, 664],
  [390, 844],
  [412, 780],
  [412, 915],
  [470, 860],
];
// Every tier so far on screen: the compact, three-to-a-row grid.
const CREW = {
  remaining: 90_700_000,
  pocket: 9_765,
  helpers: 51,
  carts: 24,
  drills: 6,
  borers: 2,
  // Both boosts running: their chips must sit in the mountain, not the flow.
  boosts: { sharper: Date.now() + 3_600_000, overtime: Date.now() + 3_600_000 },
};
/** A current save that owns a borer already has its first engineer. */
function withCurrentEngineer(mountain) {
  if ((mountain.borers ?? 0) < 1 || mountain.engineers !== undefined) {
    return mountain;
  }
  return {
    ...mountain,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
  };
}

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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox"],
});

/** Installed PWA on Android: edge to edge, status bar and gesture bar as safe-area insets. */
const STANDALONE_INSETS = { top: 24, bottom: 48, left: 0, right: 0 };

async function open(
  [width, height],
  save,
  { standalone = false, search = "" } = {},
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
  await page.setViewport({ width, height, isMobile: true, hasTouch: true });
  // A clock the check can push forward, for veins and other timed things.
  await page.evaluateOnNewDocument(() => {
    const realNow = Date.now.bind(Date);
    globalThis.__skewMs = 0;
    Date.now = () => realNow() + globalThis.__skewMs;
  });
  await page.evaluateOnNewDocument(
    (key, value) => {
      if (sessionStorage.getItem("visual-seeded") === null) {
        sessionStorage.setItem("visual-seeded", "1");
        localStorage.setItem(key, value);
      }
    },
    SAVE_KEY,
    // Seeds are current saves (M7 staffing grant already done) unless they say `legacy`.
    JSON.stringify(
      save.legacy || save.mountain === undefined
        ? { ...save, legacy: undefined }
        : {
            ...save,
            mountain: withCurrentEngineer({ staffed: 2, ...save.mountain }),
          },
    ),
  );
  await page.goto(new URL(search, BASE).href, { waitUntil: "networkidle0" });
  return { page, close: () => context.close() };
}

/** The overlay is fixed and covers the whole viewport. */
async function coversViewport(page, selector) {
  // A tap's click lands a frame later on a slow runner; let the overlay open first.
  await page
    .waitForSelector(`${selector}:not([hidden])`, { timeout: 2_000 })
    .catch(() => undefined);
  return page.$eval(selector, (element) => {
    const rect = element.getBoundingClientRect();
    return (
      !element.hidden &&
      getComputedStyle(element).position === "fixed" &&
      rect.top <= 0 &&
      rect.left <= 0 &&
      rect.right >= innerWidth &&
      rect.bottom >= innerHeight
    );
  });
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
  await page.tap(".engineers-button");
  const covered = await coversViewport(page, ".engineers-dialog");
  const detail = await page.$eval(
    ".engineers-dialog",
    (sheet, insets) => {
      const buttons = [...sheet.querySelectorAll("button")].filter(
        (button) => !button.hidden && button.getClientRects().length > 0,
      );
      const boxes = buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return {
          height: box.height,
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
      const text = sheet.textContent ?? "";
      return {
        boxesOk: boxes.every(
          (box) =>
            box.height >= 44 &&
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.top >= insets.top &&
            box.bottom <= innerHeight - insets.bottom &&
            !box.clipped,
        ),
        count: boxes.length,
        title,
        close,
        titleOk: title >= insets.top,
        closeOk: close <= innerHeight - insets.bottom,
        words:
          text.includes("Tend a machine") &&
          text.includes("stones/sec") &&
          text.includes("Promote a worker:") &&
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

/** Chrome's URL bar hides and shows by resizing the viewport about 56px. */
const URL_BAR = 56;

for (const viewport of VIEWPORTS) {
  const size = `${String(viewport[0])}x${String(viewport[1])}`;
  const { page, close } = await open(viewport, {
    version: 4,
    mountain: CREW,
    lastSeen: Date.now(),
  });
  check(await noScroll(page), `${size} main screen has no scroll`);
  if (viewport[1] >= 640) {
    await page.setViewport({
      width: viewport[0],
      height: viewport[1] - URL_BAR,
      isMobile: true,
      hasTouch: true,
    });
    check(await noScroll(page), `${size} no scroll with the URL bar shown`);
  }
  await page.setViewport({
    width: viewport[0],
    height: viewport[1],
    isMobile: true,
    hasTouch: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  check(
    await noScroll(page),
    `${size} no scroll with the URL bar hidden, crew floats running`,
  );
  const tiersVisible = await page.evaluate(() =>
    [...document.querySelectorAll(".tier")]
      .filter((tier) => !tier.hidden)
      .every((tier) => tier.getBoundingClientRect().bottom <= innerHeight),
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

  const chipsInside = await page.evaluate(() => {
    const wrap = document
      .querySelector(".mountain-wrap")
      ?.getBoundingClientRect();
    const chips = [...document.querySelectorAll(".boost-chip")].filter(
      (chip) => !chip.hidden,
    );
    return (
      wrap !== undefined &&
      chips.length === 2 &&
      chips.every((chip) => {
        const box = chip.getBoundingClientRect();
        return (
          box.top >= wrap.top &&
          box.bottom <= wrap.bottom &&
          box.left >= wrap.left &&
          box.right <= wrap.right
        );
      })
    );
  });
  check(chipsInside, `${size} boost countdowns sit inside the mountain`);

  await page.waitForSelector(".relic-shelf", { visible: true });
  await page.tap(".relic-shelf");
  check(
    await coversViewport(page, ".shelf-dialog"),
    `${size} relic shelf is laid over the game`,
  );
  await page.tap(".shelf-close");
  await page.tap(".menu-button");
  check(
    await coversViewport(page, ".game-menu"),
    `${size} menu is laid over the game`,
  );
  const fieldLogRow = await page.$eval(".game-menu", (menu) => {
    const copy = [...menu.querySelectorAll("button")].find(
      (button) => button.textContent === "Copy field log",
    );
    if (copy === undefined) {
      return false;
    }
    const box = copy.getBoundingClientRect();
    const fat = box.height >= 44 && box.left >= 0 && box.right <= innerWidth;
    menu.scrollTop = menu.scrollHeight;
    const closeBottom =
      menu.querySelector(".menu-close")?.getBoundingClientRect().bottom ??
      Infinity;
    menu.scrollTop = 0;
    return fat && closeBottom <= innerHeight;
  });
  check(fieldLogRow, `${size} field log menu row is tappable`);
  await page.tap(".start-over-link");
  check(
    await coversViewport(page, ".start-over"),
    `${size} start-over confirm is laid over the game`,
  );
  await page.tap(".start-over-cancel");
  await page.tap(".upgrades-button");
  check(
    await coversViewport(page, ".upgrades-dialog"),
    `${size} upgrades sheet is laid over the game`,
  );
  // Every buy button and the way back can be reached, scrolling if it must.
  const sheetReachable = await page.$eval(".upgrades-dialog", (sheet) => {
    const buttons = [...sheet.querySelectorAll("button")];
    const wide = buttons.every((button) => {
      const box = button.getBoundingClientRect();
      return box.height >= 44 && box.left >= 0 && box.right <= innerWidth;
    });
    sheet.scrollTop = 0;
    const titleTop =
      sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
    sheet.scrollTop = sheet.scrollHeight;
    const closeBottom =
      sheet.querySelector(".upgrades-close")?.getBoundingClientRect().bottom ??
      Infinity;
    sheet.scrollTop = 0;
    return (
      buttons.length >= 4 && wide && titleTop >= 0 && closeBottom <= innerHeight
    );
  });
  check(sheetReachable, `${size} upgrades sheet buttons are tappable`);
  await page.tap(".upgrades-close");
  const engineersFat = await page.$eval(".engineers-button", (button) => {
    const box = button.getBoundingClientRect();
    return (
      !button.hidden &&
      button.getAttribute("aria-label") === "Engineers" &&
      box.height >= 44 &&
      box.width >= 44 &&
      box.left >= 0 &&
      box.right <= innerWidth
    );
  });
  check(engineersFat, `${size} engineers button is tappable`);
  check(
    await engineersSheetFits(page),
    `${size} engineers sheet fits with no scroll`,
  );
  await close();
}

// Tier cards keep one fixed height and never truncate, even at x999 and huge prices.
for (const viewport of [
  [360, 560],
  [360, 640],
  [390, 844],
  [412, 915],
]) {
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
    // The longest pocket ("888.8 thousand stones") stays on one line.
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
    const { page, close } = await open(viewport, {
      version: 4,
      mountain: { remaining: 50_000_000, pocket: 49_999_999, ...crew },
      lastSeen: Date.now(),
    });
    if (font !== undefined) {
      await page.addStyleTag({
        content: `* { font-family: "${font}" !important; }`,
      });
    }
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
      cards.every((card) => card.height === 64),
      `${label} are all 64px tall`,
    );
    const clipped = cards.flatMap((card) => card.clipped);
    check(
      clipped.length === 0,
      `${label} show every line in full ${clipped.join(" | ")}`,
    );
    check(await noScroll(page), `${label} have no scroll`);
    const pocketFits = await page.evaluate(() => {
      const row = document
        .querySelector(".pocket-row")
        ?.getBoundingClientRect();
      const pocket = document.querySelector(".pocket");
      return (
        row !== undefined &&
        pocket !== null &&
        row.left >= 0 &&
        row.right <= innerWidth &&
        pocket.scrollWidth <= pocket.clientWidth + 1 &&
        pocket.getBoundingClientRect().height <= 48
      );
    });
    check(pocketFits, `${label} keep the pocket on one line`);
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
      viewport[0] === 360 &&
      viewport[1] === 560 &&
      font === "DejaVu Sans" &&
      crew.helpers === 999 &&
      crew.borers === 999 &&
      crew.machines === 999 &&
      crew.upgrades === undefined
    ) {
      check(
        await engineersSheetFits(page),
        `${label} engineers sheet fits with no scroll`,
      );
    }
    await close();
  }
}

// Installed PWA (standalone): full device height with status and gesture bar insets.
for (const viewport of VIEWPORTS) {
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
  const insideSafeArea = await page.evaluate(
    (bottomInset) =>
      [
        ...document.querySelectorAll(
          ".tier, .save-status, .menu-button, .upgrades-button, .engineers-button",
        ),
      ]
        .filter((element) => !element.hidden)
        .every(
          (element) =>
            element.getBoundingClientRect().bottom <= innerHeight - bottomInset,
        ),
    STANDALONE_INSETS.bottom,
  );
  check(insideSafeArea, `${size} standalone controls clear the gesture bar`);
  if (viewport[0] === 360 && viewport[1] === 560) {
    check(
      await engineersSheetFits(page, STANDALONE_INSETS),
      `${size} standalone engineers sheet fits with no scroll`,
    );
  }

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
}

// A save from before staffing: the one-time "Your crew grew" card, at the
// smallest phone, over the game and dismissable, with no scroll.
for (const standalone of [false, true]) {
  const viewport = [360, 560];
  const label = `360x560${standalone ? " standalone" : ""}`;
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
    await coversViewport(page, ".welcome-back"),
    `${label} crew-grew card is laid over the game`,
  );
  check(await noScroll(page), `${label} crew-grew card has no scroll`);
  await page.tap(".welcome-continue");
  check(
    await page.$eval(".welcome-back", (el) => el.hidden),
    `${label} crew-grew card closes`,
  );
  await close();
}

// Welcome-back, then the relic it uncovered.
{
  const viewport = [360, 640];
  const { page, close } = await open(viewport, {
    version: 4,
    mountain: { ...BEFORE_LANTERN, helpers: 5 },
    lastSeen: Date.now() - 10 * 60 * 1000,
  });
  check(
    await coversViewport(page, ".welcome-back"),
    "welcome-back is laid over the game",
  );
  await page.tap(".welcome-continue");
  check(
    await coversViewport(page, ".relic-reveal"),
    "relic reveal is laid over the game",
  );
  await close();
}

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
  await page.tap(".relic-shelf");
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
  const viewport = [360, 560];
  const label = `360x560${standalone ? " standalone" : ""}`;
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
}

// Every relic found: the shelf scrolls inside itself, and a tapped relic's
// detail card (art, virtue, "Your power") sits over the game and fits.
for (const viewport of [
  [360, 560],
  [390, 844],
]) {
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
  await page.tap(".relic-shelf");
  check(await noScroll(page), `${label} full shelf has no page scroll`);
  await page.evaluate(() => {
    document.querySelectorAll(".shelf-list li")[4]?.scrollIntoView();
  });
  await page.$$eval(".shelf-list li", (rows) => {
    rows[4]?.click();
  });
  check(
    await coversViewport(page, ".relic-detail"),
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
}

// Mantle of the Hero: reveal, then the Legend finale over the game (#103).
// Version 5: one stone left on the 240M mountain, so the tap finds the Mantle.
for (const viewport of [
  [360, 560],
  [390, 844],
]) {
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
    await coversViewport(page, ".legend"),
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
}

// Pass the mine to your kid (#131): the confirm, then the new run's header.
for (const viewport of [
  [360, 560],
  [390, 844],
]) {
  const label = `${String(viewport[0])}x${String(viewport[1])}`;
  const { page, close } = await open(viewport, {
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
  });
  await page.tap(".mountain");
  await page.waitForSelector(".relic-reveal:not([hidden])");
  await page.tap(".relic-reveal:not(.legend) .reveal-continue");
  await page.tap(".legend .legend-pass");
  check(
    await coversViewport(page, ".legacy-dialog"),
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
}

// Trouble is never saved, so the dev boot previews a cave-in. The card must
// stay on screen at the smallest phone, including the installed PWA.
for (const standalone of [false, true]) {
  const viewport = [360, 560];
  const label = `360x560${standalone ? " standalone" : ""}`;
  const { page, close } = await open(
    viewport,
    { version: 4, mountain: CREW, lastSeen: Date.now() },
    { standalone, search: "?trouble=cave-in" },
  );
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
}

// An expedition still out: the chip stays in the mountain, and the sheet
// (Recall, posts, the way back) fits a short phone, including the PWA.
for (const standalone of [false, true]) {
  const viewport = [360, 560];
  const label = `360x560${standalone ? " standalone" : ""}`;
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
  const chip = await page.$eval(".mountain-wrap", (wrap) => {
    const host = wrap.querySelector(".boost-chips");
    const shown = [...wrap.querySelectorAll(".expedition-chip")].find(
      (el) => !el.hidden,
    );
    if (host === null || shown === undefined) {
      return { ok: false, text: "" };
    }
    const box = shown.getBoundingClientRect();
    const mountain = wrap.getBoundingClientRect();
    const text = shown.textContent ?? "";
    return {
      ok:
        getComputedStyle(host).position === "absolute" &&
        box.width > 0 &&
        box.top >= mountain.top &&
        box.bottom <= mountain.bottom &&
        box.left >= mountain.left &&
        box.right <= mountain.right &&
        text.includes("will be gone") &&
        !/\d|\?/.test(text),
      text,
    };
  });
  check(
    chip.ok,
    `${label} expedition chip sits in the mountain (${chip.text})`,
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
      const text = dialog.textContent ?? "";
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
}

// Five engineers, one open card and four rows, plus a keepsake they brought
// home. Short phones and the installed PWA, with no scroll.
for (const viewport of [
  [360, 560],
  [360, 640],
  [375, 667],
]) {
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
}

// Welcome card naming a find, over the game, at the short phone and the PWA.
for (const standalone of [false, true]) {
  const viewport = [360, 560];
  const label = `360x560${standalone ? " standalone" : ""}`;
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
    await coversViewport(page, ".welcome-back"),
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
