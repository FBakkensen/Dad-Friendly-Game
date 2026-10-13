/* global console, process, document, innerWidth, innerHeight, scrollBy, scrollY, sessionStorage, localStorage, getComputedStyle, setTimeout */
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

async function open([width, height], save, { standalone = false } = {}) {
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
    // Seeds are current saves (already staffed) unless they say `legacy`.
    JSON.stringify(
      save.legacy || save.mountain === undefined
        ? { ...save, legacy: undefined }
        : { ...save, mountain: { staffed: true, ...save.mountain } },
    ),
  );
  await page.goto(BASE, { waitUntil: "networkidle0" });
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
  return page.evaluate(() => {
    const app = document.querySelector("#app");
    const root = document.documentElement;
    scrollBy(0, 80);
    app?.scrollBy(0, 80);
    const still = scrollY === 0 && (app?.scrollTop ?? 0) === 0;
    return (
      still &&
      root.scrollHeight === root.clientHeight &&
      root.scrollWidth === root.clientWidth &&
      app !== null &&
      app.scrollHeight === app.clientHeight &&
      app.scrollWidth === app.clientWidth
    );
  });
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
          ".tier, .save-status, .menu-button, .upgrades-button",
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

// Every relic found: the shelf scrolls inside itself, and a tapped relic's
// detail card (art, virtue, "Your power") sits over the game and fits.
for (const viewport of [
  [360, 560],
  [390, 844],
]) {
  const label = `${String(viewport[0])}x${String(viewport[1])}`;
  const { page, close } = await open(viewport, {
    version: 4,
    mountain: {
      remaining: 0,
      pocket: 0,
      helpers: 40,
      carts: 10,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
      staffed: true,
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
for (const viewport of [
  [360, 560],
  [390, 844],
]) {
  const label = `${String(viewport[0])}x${String(viewport[1])}`;
  const { page, close } = await open(viewport, {
    version: 4,
    mountain: {
      remaining: 1,
      pocket: 0,
      helpers: 999,
      carts: 999,
      drills: 999,
      borers: 999,
      machines: 999,
      kids: 999,
      staffed: true,
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
    version: 4,
    mountain: {
      remaining: 1,
      pocket: 0,
      helpers: 999,
      kids: 999,
      staffed: true,
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

await browser.close();
await server?.close();
if (failures.length > 0) {
  console.error(
    `\n${String(failures.length)} visual check(s) failed:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log("\nAll visual checks passed.");
