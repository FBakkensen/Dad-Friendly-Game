/* global console, process, document, innerWidth, innerHeight, scrollBy, scrollY, sessionStorage, localStorage, getComputedStyle, setTimeout, URL, HTMLButtonElement */
/**
 * Real-browser layout guard (jsdom can't see CSS). Run it with:
 *   npm run visual   (starts its own dev server; part of npm run check, so CI runs it)
 * Fails if any phone viewport scrolls, or if an overlay isn't laid over the game.
 */
import { existsSync, mkdirSync } from "node:fs";
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
    const row = document.querySelector(".effect-row")?.getBoundingClientRect();
    const shelf = document
      .querySelector(".relic-shelf")
      ?.getBoundingClientRect();
    const chips = [...document.querySelectorAll(".boost-chip")].filter(
      (chip) => !chip.hidden && !chip.classList.contains("is-overflow"),
    );
    const misses = (box, other) =>
      other === undefined ||
      box.right <= other.left + 0.5 ||
      box.left >= other.right - 0.5 ||
      box.bottom <= other.top + 0.5 ||
      box.top >= other.bottom - 0.5;
    return (
      row !== undefined &&
      chips.length === 2 &&
      getComputedStyle(document.querySelector(".boost-chips")).position !==
        "absolute" &&
      chips.every((chip) => {
        const box = chip.getBoundingClientRect();
        return (
          box.top >= row.top - 1 &&
          box.bottom <= row.bottom + 1 &&
          misses(box, shelf)
        );
      })
    );
  });
  check(chipsInside, `${size} boost countdowns sit in the effects row`);

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
      ...sheet.querySelectorAll(".upgrade-name, .upgrade-effect, .upgrade-buy"),
    ];
    const typeOk = text.every(
      (node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 14.4,
    );
    const lastingBuys = [
      ...sheet.querySelectorAll(".upgrade:not(.boost) .upgrade-buy"),
    ];
    const cardRight = card?.getBoundingClientRect().right ?? 0;
    const priceRight = lastingBuys.every((button) => {
      const name = button.closest(".upgrade")?.querySelector(".upgrade-name");
      if (name === null || name === undefined) {
        return false;
      }
      const price = button.getBoundingClientRect();
      const label = name.getBoundingClientRect();
      return (
        price.left + 1 >= label.right - 1 &&
        cardRight - price.right <= 16 &&
        cardRight - price.right >= -1
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
    const boosts = [...sheet.querySelectorAll(".upgrade.boost")];
    const stacked =
      boosts.length === 2 &&
      boosts[1].getBoundingClientRect().top >=
        boosts[0].getBoundingClientRect().bottom - 1;
    const lockedOk = [...sheet.querySelectorAll(".upgrade.is-locked")].every(
      (row) => {
        const name = row.querySelector(".upgrade-name");
        return (
          name !== null &&
          lineCount(name) <= 1 &&
          name.scrollWidth <= name.clientWidth + 1
        );
      },
    );
    const effectsOk = [
      ...sheet.querySelectorAll(".upgrade:not(.is-locked) .upgrade-effect"),
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
      lockedOk,
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
      sheetFit.lockedOk &&
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
    !sheetFit.lockedOk ||
    !sheetFit.effectsOk
  ) {
    console.log(`upgrades detail ${size} ${JSON.stringify(sheetFit)}`);
  }
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
      await page.evaluate(() => {
        const closeBuys = document.querySelector(".buys-close");
        if (closeBuys instanceof HTMLButtonElement) {
          closeBuys.click();
        }
      });
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
  const chip = await page.$eval(".effect-row", (row) => {
    const shown = [...row.querySelectorAll(".expedition-chip")].find(
      (el) => !el.hidden,
    );
    const shelf = document
      .querySelector(".relic-shelf")
      ?.getBoundingClientRect();
    if (shown === undefined) {
      return { ok: false, text: "" };
    }
    const box = shown.getBoundingClientRect();
    const host = row.getBoundingClientRect();
    const text = shown.textContent ?? "";
    const misses =
      shelf === undefined ||
      box.right <= shelf.left + 0.5 ||
      box.left >= shelf.right - 0.5 ||
      box.bottom <= shelf.top + 0.5 ||
      box.top >= shelf.bottom - 0.5;
    return {
      ok:
        box.width > 0 &&
        box.top >= host.top - 1 &&
        box.bottom <= host.bottom + 1 &&
        misses &&
        text.includes("will be gone") &&
        !/\d|\?/.test(text),
      text,
    };
  });
  check(
    chip.ok,
    `${label} expedition chip sits in the effects row (${chip.text})`,
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

/** Workshop sheet (#199): real numbers, no scroll, a dark sketch, a named refund. */
const WORKSHOP_SIZES = [
  [390, 844],
  [360, 640],
  [360, 560],
];
const SHOTS = "/opt/cursor/artifacts";
if (existsSync("/opt/cursor")) {
  mkdirSync(SHOTS, { recursive: true });
}

async function shot(page, name) {
  if (!existsSync(SHOTS)) {
    return;
  }
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

function workshopSave(now, busy) {
  return {
    version: 6,
    lastSeen: now,
    mountain: {
      remaining: 240_000_000 - 12_000_000,
      pocket: busy ? 50_000 : 200_000,
      helpers: 4,
      carts: 1,
      staffed: 2,
      startedAt: now - 1_000,
    },
    workshop: {
      materials: {
        clay: busy ? 0 : 2,
        iron: busy ? 0 : 1,
        crystal: 0,
        heartstone: 0,
      },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
      ...(busy
        ? {
            bench: {
              recipe: "sturdy-props",
              startedAt: now - 60_000,
              endsAt: now + 9 * 60_000,
            },
            axleUntil: now + 12 * 60_000,
          }
        : {}),
    },
  };
}

for (const viewport of WORKSHOP_SIZES) {
  const size = `${String(viewport[0])}x${String(viewport[1])}`;
  const now = Date.now();
  const { page, close } = await open(viewport, workshopSave(now, true));
  await page.tap(".menu-button");
  await page.tap(".workshop-open");
  const laid = await coversViewport(page, ".workshop-dialog");
  const fit = await page.$eval(".workshop-dialog", (sheet) => {
    const buttons = [...sheet.querySelectorAll("button")].filter(
      (button) => !button.hidden && button.getClientRects().length > 0,
    );
    const boxes = buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return {
        height: box.height,
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
    return {
      boxesOk: boxes.every(
        (box) =>
          box.height >= 44 &&
          box.top >= 0 &&
          box.bottom <= innerHeight &&
          box.left >= 0 &&
          box.right <= innerWidth &&
          !box.clipped,
      ),
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
      fit.count >= 4 &&
      fit.typeOk &&
      fit.text.includes("On the bench: Sturdy props") &&
      fit.text.includes("left") &&
      fit.text.includes("Level 1 of 2") &&
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
  if (!fit.boxesOk || !still) {
    console.log("workshop fit", size, fit);
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
    await shot(page, "workshop-cancel-confirm-390x844");
    await page.tap(".workshop-cancel");
    const freed = await page.$eval(
      ".workshop-bench",
      (bench) => bench.textContent ?? "",
    );
    check(
      freed.includes("The bench is free"),
      `${size} cancel clears the bench`,
    );
    await shot(page, "workshop-free-390x844");
    if ((await page.$(".workshop-craft.is-short")) === null) {
      const more = await page.$(".workshop-more:not([hidden])");
      if (more !== null) {
        await more.tap();
      }
    }
    const short = await page.$(".workshop-craft.is-short");
    const shortText = await page.$eval(".workshop-dialog", (sheet) =>
      [...sheet.querySelectorAll(".workshop-craft.is-short")].map(
        (button) => button.textContent ?? "",
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
    await shot(page, "workshop-shake-390x844");
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
    await shot(page, "workshop-hammer-390x844");
  }
  await close();
}

{
  const now = Date.now();
  const { page, close } = await open([360, 560], {
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
      locked.text.includes("Locked · The Granite") &&
      !locked.text.includes("?") &&
      openHidden,
    "360x560 workshop is a locked silhouette before the Granite",
  );
  await shot(page, "workshop-locked-360x560");
  check(await noScroll(page), "360x560 locked menu has no page scroll");
  await close();
}

/**
 * Layer card, folded welcome, craft-done notice, and the four-chip line (#200).
 * Same sizes as the workshop check.
 */
const NOTICE_SIZES = [
  [390, 844],
  [360, 640],
  [360, 560],
];

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
        if (node.hidden) {
          return false;
        }
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };
      const buttons = [...root.querySelectorAll("button")].filter(shown);
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
        fit.body.includes("Tough on carts. Drills love it.") &&
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
        fit.body.includes("Tough on carts. Drills love it.") &&
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
    const cart = rates.find((line) => line.includes("166"));
    const borer = rates.find((line) => line.includes("595"));
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
        borer.includes("Needs 8 workers"),
      `${size} cart shows +N and the borer says how many workers`,
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
}

// One writer tab. The other shows a card and does not scroll at 360×560.
{
  const context = await browser.createBrowserContext();
  const [width, height] = [360, 560];
  const first = await context.newPage();
  const second = await context.newPage();
  for (const page of [first, second]) {
    page.on("pageerror", (error) => {
      failures.push(`other tab: ${String(error)}`);
    });
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
  }
  await first.goto(BASE, { waitUntil: "networkidle0" });
  await second.goto(BASE, { waitUntil: "networkidle0" });
  await second.waitForSelector(".other-tab:not([hidden])", { timeout: 5_000 });
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
    "360x560 other tab card is gentle and fat",
  );
  check(
    await coversViewport(second, ".other-tab"),
    "360x560 other tab card is laid over the game",
  );
  check(await noScroll(second), "360x560 other tab has no scroll");
  await shot(second, "other-tab-360x560");
  await first.bringToFront();
  await first.tap(".mountain");
  const kept = await first.$eval(".pocket", (element) => element.textContent);
  await second.bringToFront();
  await second.tap(".other-tab-play");
  await second.waitForSelector(".other-tab[hidden]", { timeout: 5_000 });
  await first.bringToFront();
  await first.waitForSelector(".other-tab:not([hidden])", { timeout: 5_000 });
  const moved = await second.$eval(".pocket", (element) => element.textContent);
  check(
    kept === "1 stone" && moved === "1 stone",
    "360x560 Play here keeps the stone",
  );
  check(await noScroll(second), "360x560 after Play here has no scroll");
  check(
    await noScroll(first),
    "360x560 the tab that stepped aside has no scroll",
  );
  await shot(first, "other-tab-stepped-aside-360x560");
  await shot(second, "other-tab-playing-here-360x560");
  await context.close();
}

// Two saves found. The real sheet, no scrollbar at 360×560.
{
  const { page, close } = await open([360, 560], {}, { search: "?saves=two" });
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
  check(title === "Two saves found", "360x560 conflict sheet is titled");
  check(
    (body ?? "").includes("nothing is lost") && !(body ?? "").includes("?"),
    "360x560 conflict sheet has no placeholder question",
  );
  check(
    cards.some((card) => card.includes("Granite, 12.4M deep")) &&
      cards.some((card) => card.includes("This phone")) &&
      cards.some((card) => card.includes("Other device")),
    "360x560 conflict cards name both saves",
  );
  check(
    play.text === "Play this one" && play.height >= 48,
    "360x560 Play this one is a 48px target",
  );
  check(sheetFits, "360x560 conflict sheet does not scroll inside");
  check(
    await coversViewport(page, ".save-conflict"),
    "360x560 conflict sheet is laid over the game",
  );
  check(await noScroll(page), "360x560 conflict sheet has no scroll");
  await shot(page, "save-conflict-real-360x560");
  await page.click(".save-conflict-play");
  const confirm = await page.$eval(
    ".save-conflict-confirm",
    (element) => element.hidden !== true && (element.textContent ?? ""),
  );
  check(
    confirm.includes("saved for 7 days"),
    "360x560 Play this one asks before switching",
  );
  check(await noScroll(page), "360x560 conflict confirm has no scroll");
  await shot(page, "save-conflict-real-press-360x560");
  await close();
}

// The shelf is centred on the screen and the rock. Locked thumb buttons
// stay quiet. The last Buys and Upgrades card clears the footer.
const SHELF_VIEWS = [
  [360, 560],
  [390, 844],
  [412, 915],
  [430, 932],
  [1280, 800],
];
const PHONE_SHOTS = new Set(["360x560", "390x844", "412x915"]);
const EMPTY_WORKSHOP = {
  materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
  recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
};
/** A v6 save. lastSeen is now so the welcome card stays shut. */
function freshMountain() {
  return {
    version: 6,
    lastSeen: Date.now(),
    mountain: { remaining: 240_000_000, pocket: 0, helpers: 0 },
    workshop: EMPTY_WORKSHOP,
  };
}
// Hammer depth, so three relics glow. Granite is open and a borer is owned,
// so Workshop and Engineers open too.
function openMountain() {
  return {
    version: 6,
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 25_000_000,
      pocket: 5_000_000,
      helpers: 20,
      carts: 5,
      drills: 2,
      borers: 1,
      staffed: 2,
    },
    workshop: {
      ...EMPTY_WORKSHOP,
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  };
}

async function shelfCentre(page) {
  return page.evaluate(() => {
    const shelf = document.querySelector(".relic-shelf");
    const rock = document.querySelector(".mountain-stage");
    if (shelf === null || rock === null) {
      return { ok: false, delta: 999, rockDelta: 999 };
    }
    const box = shelf.getBoundingClientRect();
    const rockBox = rock.getBoundingClientRect();
    const mid = (box.left + box.right) / 2;
    const view = innerWidth / 2;
    const rockMid = (rockBox.left + rockBox.right) / 2;
    const delta = mid - view;
    const rockDelta = mid - rockMid;
    return {
      ok: Math.abs(delta) <= 2 && Math.abs(rockDelta) <= 2,
      delta,
      rockDelta,
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
      return {
        disabled: button.disabled,
        border: style.borderTopColor,
        color: style.color,
        background: style.backgroundColor,
        width: box.width,
        height: box.height,
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

/** A crewed Topsoil, so both lists are long and the crew line is on screen. */
function crewMountain() {
  return {
    version: 6,
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 500_000,
      pocket: 6_854,
      helpers: 18,
      carts: 6,
      staffed: 2,
    },
    workshop: EMPTY_WORKSHOP,
  };
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
    const header = sheet?.querySelector("h2");
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
    const topGap = firstBox.top - head.bottom;
    const lastEl = bottommost();
    lastEl.scrollIntoView({ block: "end", inline: "nearest" });
    const lastBox = lastEl.getBoundingClientRect();
    const foot = footer.getBoundingClientRect();
    const portEnd = element.getBoundingClientRect();
    const endGap = foot.top - lastBox.bottom;
    const overflows = element.scrollHeight > element.clientHeight + 1;
    const crew = document.querySelector(".crew-posts");
    const crewBox = crew?.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    const crewClear =
      crew === null ||
      crew.hidden ||
      (crewBox?.height ?? 0) < 1 ||
      sheetBox.top >= crewBox.bottom - 1;
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
      firstBox.top >= portTop.top + 7 && firstBox.bottom <= portTop.bottom + 1;
    const lastIn =
      lastBox.top >= portEnd.top - 1 && lastBox.bottom <= portEnd.bottom - 7;
    const clip = (node) =>
      (node.textContent ?? "").replaceAll(/\s+/g, " ").slice(0, 42);
    return {
      ok:
        pageStill &&
        crewClear &&
        firstIn &&
        lastIn &&
        firstBox.top >= head.bottom &&
        lastBox.bottom <= foot.top &&
        gapOk(topGap) &&
        gapOk(endGap),
      topGap: Math.round(topGap * 10) / 10,
      endGap: Math.round(endGap * 10) / 10,
      overflows,
      crewClear,
      first: clip(firstEl),
      last: clip(lastEl),
    };
  }, scroller);
}

for (const viewport of SHELF_VIEWS) {
  const size = `${String(viewport[0])}x${String(viewport[1])}`;
  const shotThis = PHONE_SHOTS.has(size);
  {
    const { page, close } = await open(viewport, freshMountain());
    await page.waitForSelector(".relic-shelf");
    const centre = await shelfCentre(page);
    check(
      centre.ok && (await noScroll(page)),
      `${size} relic shelf is centred and the screen does not scroll`,
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
    await page.waitForSelector(".relic-shelf");
    const centre = await shelfCentre(page);
    check(
      centre.ok && (await noScroll(page)),
      `${size} relic shelf with finds is centred and the screen does not scroll`,
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
    const found = await page.$$eval(".shelf-slot", (slots) =>
      slots.map((slot) => slot.getAttribute("data-found")),
    );
    check(
      found.filter((flag) => flag === "true").length >= 3,
      `${size} save with relics shows found slots`,
    );
    if (shotThis) {
      await shot(page, `mountain-relics-${size}`);
    }
    await close();
  }
}

// Long Buys and Upgrades lists. The first card clears the header, the last
// card clears the footer, and the sheet stays below the crew line.
const SHEET_SHOTS = new Set(["360x560", "412x915"]);
for (const viewport of [
  [360, 560],
  [390, 844],
  [412, 915],
]) {
  const size = `${String(viewport[0])}x${String(viewport[1])}`;
  const shotThis = SHEET_SHOTS.has(size);
  const { page, close } = await open(viewport, crewMountain());
  await page.waitForSelector(".relic-shelf");
  for (const [name, scroller, openSelector] of [
    ["buys", ".buys-dialog .tier-grid", ".buys-button"],
    ["upgrades", ".upgrades-scroll", ".upgrades-button"],
  ]) {
    await page.tap(openSelector);
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
}

// The pocket must stay clear of the menu at every realistic length, and a
// four-part crew line must not leave one chip alone on the next row.
const PILL_VIEWS = [
  [360, 560],
  [390, 844],
  [412, 915],
  [430, 932],
];
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
    const pill = document.querySelector(".pocket-row");
    const menu = document.querySelector(".menu-button");
    const app = document.querySelector("#app");
    if (pill === null || menu === null || app === null) {
      return { ok: false };
    }
    const a = pill.getBoundingClientRect();
    const b = menu.getBoundingClientRect();
    const apart =
      a.right <= b.left + 0.5 ||
      a.left >= b.right - 0.5 ||
      a.bottom <= b.top + 0.5 ||
      a.top >= b.bottom - 0.5;
    const mid = (a.left + a.right) / 2;
    const centred = Math.abs(mid - innerWidth / 2) <= 2;
    const rows = [...document.querySelectorAll(".crew-row")];
    const counts = rows.map((row) => row.querySelectorAll(".crew-bit").length);
    const balanced = counts.length === 1 || counts.every((count) => count >= 2);
    const pageStill =
      scrollY === 0 &&
      app.scrollTop === 0 &&
      document.documentElement.scrollHeight ===
        document.documentElement.clientHeight &&
      app.scrollHeight === app.clientHeight;
    return {
      ok: apart && centred && balanced && pageStill,
      apart,
      centred,
      balanced,
      pageStill,
      counts,
      pocket: pill.textContent?.replace(/\s+/g, " ").slice(0, 80),
    };
  });
}

for (const viewport of PILL_VIEWS) {
  const size = `${String(viewport[0])}x${String(viewport[1])}`;
  for (const pocket of [32_500, 999_900_000_000_000, 1_000_000_000_000_000]) {
    const { page, close } = await open(viewport, crewSave(pocket));
    await page.waitForSelector(".pocket-row");
    const clear = await pillClear(page);
    check(clear.ok, `${size} pocket ${String(pocket)} stays clear of the menu`);
    if (!clear.ok) {
      console.log("pill", size, pocket, clear);
    }
    if (pocket === 32_500 && (size === "360x560" || size === "412x915")) {
      await shot(page, `pocket-crew-${size}`);
    }
    await close();
  }
}

// Buys, Workshop, and Upgrades: affordable, too expensive, and locked.
for (const viewport of [
  [360, 560],
  [412, 915],
]) {
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
      machineWhy: shown("machine", ".tier-why"),
    };
  });
  check(
    buys.drillName === "Steam drill" &&
      buys.drillGain &&
      buys.drillWhy &&
      buys.machineLocked &&
      !buys.machineGain &&
      !buys.machineWhy,
    `${size} unaffordable drill keeps its lines and the machine stays locked`,
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
      roadsLocked:
        card("drillSyn")?.querySelector(".upgrade-buy")?.textContent ===
        "Locked",
      roadsEffect: shown("drillSyn", ".upgrade-effect"),
    };
  });
  check(
    upgrades.armsDear &&
      upgrades.armsEffect &&
      upgrades.armsWhy &&
      upgrades.roadsLocked &&
      !upgrades.roadsEffect,
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
}

// Active effects stay in their row: 0, 1, 3, and more than fit.
const EFFECT_VIEWS = [
  [360, 560],
  [412, 915],
];
function effectSave(count) {
  const now = Date.now();
  // 0, 1, and 3 are that many chips. 8 is a crowded row: both boosts and five trips.
  const names = ["Ada", "Nils", "Ruth", "Otto", "Mae"];
  const tripCount = count >= 8 ? 5 : count >= 3 ? 1 : 0;
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
    },
  };
}

for (const viewport of EFFECT_VIEWS) {
  const size = `${String(viewport[0])}x${String(viewport[1])}`;
  for (const count of [0, 1, 3, 8]) {
    const { page, close } = await open(viewport, effectSave(count));
    await page.waitForSelector(".effect-row");
    const placed = await page.evaluate((count) => {
      const row = document.querySelector(".effect-row");
      const shelf = document.querySelector(".relic-shelf");
      const pocket = document.querySelector(".pocket-row");
      const menu = document.querySelector(".menu-button");
      const crew = document.querySelector(".crew");
      const bar = document.querySelector(".thumb-bar");
      const rock = document.querySelector(".mountain-stage");
      if (row === null) {
        return { ok: false };
      }
      const rowBox = row.getBoundingClientRect();
      const hits = (other) => {
        if (other === null) {
          return false;
        }
        const box = other.getBoundingClientRect();
        if (box.height < 1 || box.width < 1) {
          return false;
        }
        return !(
          rowBox.right <= box.left + 0.5 ||
          rowBox.left >= box.right - 0.5 ||
          rowBox.bottom <= box.top + 0.5 ||
          rowBox.top >= box.bottom - 0.5
        );
      };
      const chips = [...row.querySelectorAll(".effect-chip")];
      const active = chips.filter((chip) => !chip.hidden);
      const visible = active.filter(
        (chip) => !chip.classList.contains("is-overflow"),
      );
      const more = row.querySelector(".effect-more");
      const moreShown = more !== null && !more.hidden;
      const welcome = document.querySelector(".welcome-back");
      const welcomeShut = welcome === null || welcome.hidden;
      const expected = count >= 8 ? 7 : count;
      const packed =
        count === 0
          ? visible.length === 0 && !moreShown
          : count === 1
            ? visible.length === 1 &&
              !moreShown &&
              (visible[0]?.textContent ?? "").includes("×")
            : count === 3
              ? active.length === 3 &&
                (visible.length === 3 || moreShown) &&
                visible.length >= 1
              : moreShown &&
                active.length === expected &&
                visible.length < active.length;
      const app = document.querySelector("#app");
      const still =
        app !== null &&
        app.scrollHeight === app.clientHeight &&
        document.documentElement.scrollHeight ===
          document.documentElement.clientHeight;
      return {
        ok:
          still &&
          welcomeShut &&
          packed &&
          Math.round(rowBox.height) >= 20 &&
          Math.round(rowBox.height) <= 28 &&
          !hits(shelf) &&
          !hits(pocket) &&
          !hits(menu) &&
          !hits(crew) &&
          !hits(bar) &&
          !hits(rock),
        height: Math.round(rowBox.height),
        shown: visible.length,
        active: active.length,
        more: moreShown,
        welcomeShut,
        packed,
        still,
        shelf: hits(shelf),
        rock: hits(rock),
      };
    }, count);
    check(
      placed.ok,
      `${size} ${String(count)} active effects stay in their row`,
    );
    if (!placed.ok) {
      console.log("effects", size, count, placed);
    }
    if (count <= 3) {
      await shot(page, `effects-${String(count)}-${size}`);
    }
    await close();
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
