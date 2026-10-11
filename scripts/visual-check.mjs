/* global console, process, document, innerWidth, innerHeight, scrollBy, scrollY, sessionStorage, localStorage, getComputedStyle, setTimeout */
/**
 * Real-browser layout guard (jsdom can't see CSS). Run it with:
 *   npm run visual   (starts its own dev server; part of npm run check, so CI runs it)
 * Fails if any phone viewport scrolls, or if an overlay isn't laid over the game.
 */
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
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
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
    JSON.stringify(save),
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
  await page.tap(".start-over-link");
  check(
    await coversViewport(page, ".start-over"),
    `${size} start-over confirm is laid over the game`,
  );
  await page.tap(".start-over-cancel");
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
    [{ helpers: 999, carts: 999, drills: 999, borers: 999 }, undefined],
    [{ helpers: 120, carts: 85, drills: 40, borers: 0 }, undefined],
    [{ helpers: 120, carts: 85 }, undefined],
    [{ helpers: 1, carts: 0 }, undefined],
    // CI's fallback font is wide; it must fit there too.
    [{ helpers: 999, carts: 999 }, "DejaVu Sans"],
    [{ helpers: 999, carts: 999, drills: 999, borers: 999 }, "DejaVu Sans"],
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
      [...document.querySelectorAll(".tier, .save-status, .menu-button")]
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

await browser.close();
await server?.close();
if (failures.length > 0) {
  console.error(
    `\n${String(failures.length)} visual check(s) failed:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log("\nAll visual checks passed.");
