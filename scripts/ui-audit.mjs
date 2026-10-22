/* global console, process, document, getComputedStyle, innerWidth, innerHeight, HTMLElement, Element, navigator, localStorage, URL */
/**
 * Screen audit capture. Not part of `npm run check`.
 *
 * Same browser setup as scripts/visual-check.mjs: Vite, puppeteer-core, and
 * a localStorage save planted before boot. Shots are 390×844, 360×640 and
 * 360×560 at device scale 2. Dev-only preview params (`?saves=two`,
 * `?save=loading`, `?save=error`, `?copies=shelf`, `?trouble=cave-in`) seed
 * the save screens.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import {
  contrastRatio,
  isLargeText,
  passesContrast,
  scrollOverflows,
  targetsCloserThan,
  undersizedTargets,
} from "../src/ui-audit-measure.ts";

const OUT = "docs/ui-audit";
const SAVE_KEY = "dad-friendly-session";
const VIEWPORTS = [
  [390, 844],
  [360, 640],
  [360, 560],
];
const RECIPES = [
  "iron-rails",
  "sturdy-props",
  "blasting-charge",
  "reinforce",
  "axle-grease",
  "diamond-bits",
  "crystal-flare",
  "crystal-lamp",
  "engineers-kit",
  "heartstone-core",
  "heartstone-ember",
];
const MOUNTAIN = 240_000_000;

const server = await createServer({
  server: { host: "127.0.0.1", port: 4175, strictPort: false },
  logLevel: "error",
}).then((dev) => dev.listen());
const BASE = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:4175/";
const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome"].find((path) =>
    existsSync(path),
  ) ??
  "/usr/bin/google-chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--hide-scrollbars", "--font-render-hinting=none"],
});

/** @type {object[]} */
const shots = [];

mkdirSync(OUT, { recursive: true });

/**
 * A late-game save. Real pocket, crew and materials. Spread `mountain` /
 * `workshop` over the defaults when a shot needs a different moment.
 */
function late(now, mined, mountain = {}, workshop = {}) {
  const deep = mined >= 70_000_000;
  const built = mined >= 25_000_000;
  return {
    version: 6,
    lastSeen: now,
    mountain: {
      remaining: MOUNTAIN - mined,
      pocket: 80_000_000,
      helpers: 80,
      kids: deep ? 4 : 0,
      carts: 24,
      drills: 8,
      borers: 3,
      machines: built ? 2 : 0,
      staffed: 2,
      startedAt: now - 86_400_000,
      engineers: [
        {
          name: "Ada",
          rank: 0,
          trips: 0,
          post: built ? "machine" : "borer",
        },
        { name: "Nils", rank: 0, trips: 0, post: "drill" },
      ],
      upgrades: { tap: 3, boots: 1, steady: 1, cartSyn: 1 },
      finds: ["pick", "lamp", "drawing"],
      ...mountain,
    },
    workshop: {
      materials: { clay: 40, iron: 28, crystal: 12, heartstone: 3 },
      recipes: RECIPES,
      ...workshop,
    },
  };
}

function quietCrew(extra = {}) {
  return {
    helpers: 8,
    kids: 0,
    carts: 2,
    drills: 0,
    borers: 0,
    machines: 0,
    engineers: undefined,
    finds: undefined,
    upgrades: undefined,
    ...extra,
  };
}

/**
 * @param {[number, number]} viewport
 * @param {object | undefined} save
 * @param {{ search?: string }} [options]
 */
async function open(viewport, save, { search = "" } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(String(error));
  });
  await page.setViewport({
    width: viewport[0],
    height: viewport[1],
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.evaluateOnNewDocument(() => {
    const realNow = Date.now.bind(Date);
    globalThis.__skewMs = 0;
    Date.now = () => realNow() + globalThis.__skewMs;
  });
  await page.evaluateOnNewDocument(
    (key, value) => {
      if (value === null) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, value);
    },
    SAVE_KEY,
    save === undefined ? null : JSON.stringify(save),
  );
  await page.goto(new URL(search, BASE).href, { waitUntil: "networkidle0" });
  await page.waitForSelector(".mountain", { timeout: 8_000 });
  await page.evaluate(() => document.fonts.ready);
  return {
    page,
    errors,
    close: () => context.close(),
  };
}

/** @param {import("puppeteer-core").Page} page */
async function press(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 8_000 });
  const handle = await page.$(selector);
  if (handle === null) {
    throw new Error(`missing ${selector}`);
  }
  await handle.tap().catch(async () => {
    await handle.click();
  });
}

/** @param {import("puppeteer-core").Page} page */
async function bodyText(page) {
  return page.evaluate(() => document.body.innerText ?? "");
}

/**
 * @param {import("puppeteer-core").Page} page
 * @param {RegExp} pattern
 * @param {string} label
 */
async function expectText(page, pattern, label) {
  const text = await bodyText(page);
  if (!pattern.test(text)) {
    throw new Error(`${label}\n---\n${text.slice(0, 900)}`);
  }
}

/** @param {import("puppeteer-core").Page} page */
async function showRecipe(page, name) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const has = await page.$eval(
      ".workshop-recipes",
      (el, wanted) => (el.textContent ?? "").includes(wanted),
      name,
    );
    if (has) {
      return;
    }
    const more = await page.$(".workshop-more:not([hidden])");
    if (more === null) {
      break;
    }
    await more.tap().catch(async () => {
      await more.click();
    });
  }
  throw new Error(`recipe not visible: ${name}`);
}

/** @param {import("puppeteer-core").Page} page */
async function openMenu(page) {
  await press(page, ".menu-button");
  await page.waitForSelector(".game-menu:not([hidden])", { timeout: 8_000 });
}

/** @param {import("puppeteer-core").Page} page */
async function openWorkshop(page) {
  await openMenu(page);
  await press(page, ".workshop-open");
  await page.waitForSelector(".workshop-dialog:not([hidden])", {
    timeout: 8_000,
  });
}

/** @param {string} file */
function compress(file) {
  const temp = join(tmpdir(), `audit-${process.pid}.png`);
  try {
    execFileSync(
      "pngquant",
      ["--quality=60-85", "--force", "--skip-if-larger", "-o", temp, file],
      { stdio: "ignore" },
    );
    execFileSync("mv", [temp, file]);
  } catch {
    // The original screenshot stays when quantizing would grow it.
  }
}

/** @param {import("puppeteer-core").Page} page */
async function collect(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!(el instanceof Element) || el.closest("[hidden]")) {
        return false;
      }
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const classBit = (el) => {
      const classes = [...el.classList].filter(
        (name) => !name.startsWith("is-"),
      );
      if (classes.length > 0) {
        return `.${classes.slice(0, 2).join(".")}`;
      }
      return el.tagName.toLowerCase();
    };
    const selectorOf = (el) => {
      if (el.id) {
        return `#${el.id}`;
      }
      const host = el.closest(
        "[data-tier], [data-boost], [data-upgrade], [data-recipe], [data-side]",
      );
      const own = classBit(el);
      if (host instanceof HTMLElement && host !== el) {
        const key = ["tier", "boost", "upgrade", "recipe", "side"].find(
          (name) => host.dataset[name],
        );
        if (key !== undefined) {
          return `[data-${key}="${host.dataset[key] ?? ""}"] ${own}`;
        }
      }
      return own;
    };
    const parseRgb = (value) => {
      const match = /rgba?\(([^)]+)\)/.exec(value);
      if (match === null || match[1] === undefined) {
        return undefined;
      }
      const parts = match[1]
        .split(/[\s,/]+/)
        .filter((part) => part !== "")
        .map(Number);
      const red = parts[0];
      const green = parts[1];
      const blue = parts[2];
      if (red === undefined || green === undefined || blue === undefined) {
        return undefined;
      }
      const alpha = parts[3] ?? 1;
      if (alpha <= 0) {
        return undefined;
      }
      return { rgb: [red, green, blue], alpha };
    };
    const backgroundOf = (el) => {
      /** @type {{ rgb: number[], alpha: number }[]} */
      const layers = [];
      let gradient = false;
      let node = el;
      while (node instanceof Element) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") {
          gradient = true;
        }
        const parsed = parseRgb(style.backgroundColor);
        if (parsed !== undefined) {
          layers.push(parsed);
          if (parsed.alpha >= 0.98) {
            break;
          }
        }
        node = node.parentElement;
      }
      let rgb = [18, 12, 10];
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];
        if (layer === undefined) {
          continue;
        }
        rgb = rgb.map((channel, channelIndex) =>
          Math.round(
            channel * (1 - layer.alpha) +
              (layer.rgb[channelIndex] ?? channel) * layer.alpha,
          ),
        );
      }
      return { rgb, gradient };
    };
    const ownText = (el) =>
      [...el.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();

    const type = [];
    const spacing = [];
    const contrast = [];
    const radii = [];
    const borders = [];
    const questions = [];
    const targets = [];
    // A modal covers the mountain. Measure the sheet the player can actually
    // use, not the controls sitting underneath it.
    const dialogs = [
      ...document.querySelectorAll("[role='dialog'], [role='alertdialog']"),
    ].filter(visible);
    const layer =
      dialogs.length > 0 ? dialogs[dialogs.length - 1] : document.body;
    for (const el of layer.querySelectorAll("*")) {
      if (!visible(el)) {
        continue;
      }
      const selector = selectorOf(el);
      const style = getComputedStyle(el);
      const text =
        ownText(el) ||
        (el.children.length === 0 ? (el.textContent ?? "").trim() : "");
      if (text !== "") {
        const size = Number.parseFloat(style.fontSize);
        type.push({
          selector,
          size,
          weight: style.fontWeight,
          lineHeight: style.lineHeight,
          text: text.slice(0, 80),
        });
        if (text.includes("?")) {
          questions.push({ selector, text: text.slice(0, 120) });
        }
        const fg = parseRgb(style.color);
        const bg = backgroundOf(el);
        if (fg !== undefined) {
          const control =
            el.closest(
              "button, a, input, textarea, select, [role='button']",
            ) !== null;
          contrast.push({
            selector,
            fg: fg.rgb,
            bg: bg.rgb,
            size,
            weight: style.fontWeight,
            control,
            gradient: bg.gradient,
            text: text.slice(0, 60),
          });
        }
      }
      for (const prop of [
        "marginTop",
        "marginRight",
        "marginBottom",
        "marginLeft",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "gap",
        "rowGap",
        "columnGap",
      ]) {
        const raw = style[prop];
        if (typeof raw !== "string" || raw === "normal") {
          continue;
        }
        for (const part of raw.split(" ")) {
          const value = Number.parseFloat(part);
          if (!Number.isFinite(value) || value === 0) {
            continue;
          }
          spacing.push({ selector, prop, value });
        }
      }
      if (style.borderRadius !== "0px") {
        radii.push({ selector, value: style.borderRadius });
      }
      const borderWidth = Number.parseFloat(style.borderTopWidth);
      if (borderWidth > 0 && style.borderTopStyle !== "none") {
        borders.push({
          selector,
          value: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        });
      }
      const interactive =
        el.matches("button, a, input, textarea, select, [role='button']") &&
        el.getClientRects().length > 0;
      if (interactive) {
        const box = el.getBoundingClientRect();
        targets.push({
          selector,
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        });
      }
    }

    const scrollers = [];
    const remember = (el, selector) => {
      if (!(el instanceof Element)) {
        return;
      }
      scrollers.push({
        selector,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
    };
    remember(document.documentElement, "html");
    remember(document.querySelector("#app"), "#app");
    for (const el of document.querySelectorAll(
      "[role='dialog'], [role='alertdialog'], .sheet, .workshop-sheet, .upgrades-card, .engineers-card, .menu-card, .shelf-card, .save-conflict-sheet",
    )) {
      if (visible(el)) {
        remember(el, selectorOf(el));
      }
    }

    const primarySelectors = [
      ".mountain",
      ".go",
      ".upgrade-buy",
      ".workshop-craft",
      ".welcome-continue",
      ".layer-dig",
      ".reveal-continue",
      ".craft-accept",
      ".legacy-confirm",
      ".other-tab-play",
      ".update-reload",
      ".engineer-promote",
      ".menu-pass",
      ".start-over-confirm",
      ".save-conflict-play",
      ".save-conflict-commit",
    ];
    const primary = [];
    for (const selector of primarySelectors) {
      for (const el of layer.querySelectorAll(selector)) {
        if (!visible(el)) {
          continue;
        }
        const box = el.getBoundingClientRect();
        primary.push({
          selector,
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
          top: box.top,
          centerY: box.top + box.height / 2,
          height: box.height,
        });
      }
    }

    const sheets = [];
    for (const el of document.querySelectorAll(
      "[role='dialog'], [role='alertdialog']",
    )) {
      if (!visible(el)) {
        continue;
      }
      const buttons = [...el.querySelectorAll("button")].filter(visible);
      const main = buttons[buttons.length - 1];
      const box = main?.getBoundingClientRect();
      sheets.push({
        selector: selectorOf(el),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        mainText: (main?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60),
        mainCenterY: box === undefined ? 0 : box.top + box.height / 2,
      });
    }

    const scope = layer;
    const groups = {
      card: [
        ".tier",
        ".upgrade",
        ".workshop-card",
        ".save-card",
        ".saved-copy",
        ".welcome-card",
        ".menu-card",
        ".reveal-card",
        ".layer-card",
        ".notice-card",
        ".other-tab-card",
        ".update-card",
        ".start-over-card",
        ".engineer",
        ".shelf-card",
        ".legacy-card",
      ],
      chip: [
        ".boost-chip",
        ".material-bit",
        ".expedition-chip",
        ".float-chip",
        ".cost-bit",
      ],
      timer: [".workshop-timers", ".workshop-bar", ".boost"],
      notice: [
        ".craft-notice",
        ".vein-note",
        ".welcome-back",
        ".layer-arrival",
        ".trouble-thanks",
      ],
      badge: [
        ".legacy-badge",
        ".tier-count",
        ".engineer-badge",
        ".engineer-mark",
      ],
    };
    const components = {};
    for (const [group, selectors] of Object.entries(groups)) {
      components[group] = {};
      for (const selector of selectors) {
        const count = [...layer.querySelectorAll(selector)].filter(
          visible,
        ).length;
        if (count > 0) {
          components[group][selector] = count;
        }
      }
    }
    components.button = {};
    for (const el of scope.querySelectorAll("button")) {
      if (!visible(el)) {
        continue;
      }
      const key = el.className.trim() || "button";
      components.button[key] = (components.button[key] ?? 0) + 1;
    }

    return {
      text: (document.body.innerText ?? "").slice(0, 1800),
      width: innerWidth,
      height: innerHeight,
      type,
      spacing,
      contrast,
      radii,
      borders,
      questions,
      targets,
      scrollers,
      primary,
      sheets,
      components,
    };
  });
}

/**
 * @param {Awaited<ReturnType<typeof collect>>} sample
 * @param {string} id
 * @param {string} size
 */
function analyse(sample, id, size) {
  const census = size === "360x560" || size === "390x844";
  const phone = size === "360x560";
  const thumb = size === "360x640";
  const undersized = phone ? undersizedTargets(sample.targets) : [];
  const close = phone
    ? targetsCloserThan(sample.targets).map((pair) => ({
        ...pair,
        gap: Math.round(pair.gap * 10) / 10,
      }))
    : [];
  const scroll = sample.scrollers.map((box) => ({
    selector: box.selector,
    ...scrollOverflows(box),
    scrollHeight: box.scrollHeight,
    clientHeight: box.clientHeight,
  }));
  const scrolling = phone ? scroll.filter((box) => box.scrolls) : [];
  const topThird = thumb
    ? sample.primary.filter((item) => item.centerY < sample.height / 3)
    : [];
  const sheetMains = sample.sheets.map((sheet) => ({
    ...sheet,
    inBottomHalf: sheet.mainCenterY >= sample.height / 2,
    ...scrollOverflows(sheet),
  }));
  const under14 = sample.type.filter((item) => item.size < 14).length;
  let contrastFails = 0;
  for (const item of sample.contrast) {
    if (item.gradient) {
      continue;
    }
    const ratio = contrastRatio(item.fg, item.bg);
    const kind = item.control
      ? "control"
      : isLargeText(item.size, item.weight)
        ? "large"
        : "body";
    if (!passesContrast(ratio, kind)) {
      contrastFails += 1;
    }
  }
  return {
    id,
    size,
    file: `${OUT}/${id}-${size}.png`,
    text: size === "360x560" ? sample.text : "",
    under14,
    contrastFails,
    undersized: undersized.map((target) => ({
      selector: target.selector,
      width: Math.round(target.width * 10) / 10,
      height: Math.round(target.height * 10) / 10,
      text: target.text,
    })),
    close,
    scrolling,
    topThird,
    sheets: phone ? sheetMains : [],
    scrollNote: phone ? scroll : [],
    type: census ? sample.type : [],
    spacing: census ? sample.spacing : [],
    contrast: census ? sample.contrast : [],
    radii: census ? sample.radii : [],
    borders: census ? sample.borders : [],
    questions: sample.questions,
    components: sample.components,
    primary: thumb ? sample.primary : [],
    score:
      undersized.length * 3 +
      under14 +
      contrastFails * 2 +
      scrolling.length * 25 +
      close.length * 2 +
      topThird.length * 4,
  };
}

/** @param {string} id */
async function capture(id, prepare) {
  for (const viewport of VIEWPORTS) {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    console.log(`shot ${id} ${size}`);
    const opened = await prepare(viewport);
    try {
      if (opened.errors.length > 0) {
        throw new Error(opened.errors.join("\n"));
      }
      const sample = await collect(opened.page);
      const file = `${OUT}/${id}-${size}.png`;
      await opened.page.screenshot({ path: file });
      compress(file);
      shots.push(analyse(sample, id, size));
    } finally {
      await opened.close();
    }
  }
}

async function main() {
  const rest = () => late(Date.now(), 130_000_000);
  const withBoosts = () => {
    const at = Date.now();
    return late(at, 130_000_000, {
      boosts: { sharper: at + 30 * 60_000, overtime: at + 30 * 60_000 },
    });
  };
  const crafting = () => {
    const at = Date.now();
    return late(
      at,
      130_000_000,
      {},
      {
        bench: {
          recipe: "sturdy-props",
          startedAt: at - 60_000,
          endsAt: at + 9 * 60_000,
        },
        axleUntil: at + 12 * 60_000,
      },
    );
  };
  const finished = () =>
    late(Date.now(), MOUNTAIN, {
      legacy: 1,
      remaining: 0,
      pocket: 12_000_000,
    });

  await capture("mountain-rest", (viewport) => open(viewport, rest()));
  await capture("mountain-vein", async (viewport) => {
    const opened = await open(viewport, rest());
    await opened.page.evaluate(() => {
      globalThis.__skewMs = 7 * 60 * 1000;
    });
    await opened.page.waitForSelector(".golden-vein:not([hidden])", {
      timeout: 6_000,
    });
    await expectText(opened.page, /stones/, "mountain-vein");
    return opened;
  });
  await capture("mountain-hazard", async (viewport) => {
    const opened = await open(viewport, rest(), { search: "?trouble=cave-in" });
    await expectText(opened.page, /Cave-in!/, "mountain-hazard");
    return opened;
  });
  await capture("mountain-layer-hint", async (viewport) => {
    const opened = await open(
      viewport,
      late(Date.now(), 30_000_000, { machines: 0, kids: 0 }),
    );
    await expectText(
      opened.page,
      /Deeper on, the walls start to glitter/,
      "mountain-layer-hint",
    );
    return opened;
  });
  await capture("crew-needs-workers", async (viewport) => {
    const opened = await open(viewport, rest());
    await press(opened.page, ".crew-posts");
    await expectText(opened.page, /Needs \d+ workers · \d+ free/, "crew");
    const disabled = await opened.page.$(".tier:disabled");
    if (disabled === null) {
      throw new Error("expected a greyed-out machine card");
    }
    return opened;
  });
  await capture("material-chips", async (viewport) => {
    const opened = await open(viewport, rest());
    await expectText(opened.page, /Clay/, "chips");
    await expectText(opened.page, /Iron/, "chips");
    await expectText(opened.page, /Crystal/, "chips");
    await expectText(opened.page, /Heartstone/, "chips");
    return opened;
  });
  await capture("upgrades-boosts-timer", async (viewport) => {
    const opened = await open(viewport, withBoosts());
    await press(opened.page, ".upgrades-button");
    await opened.page.waitForSelector(".upgrades-dialog:not([hidden])");
    await expectText(opened.page, /Running · \d+:\d\d/, "boost timer");
    return opened;
  });
  await capture("workshop-idle", async (viewport) => {
    const opened = await open(viewport, rest());
    await openWorkshop(opened.page);
    await expectText(
      opened.page,
      /The bench is free|bench is free/,
      "idle bench",
    );
    return opened;
  });
  await capture("workshop-crafting", async (viewport) => {
    const opened = await open(viewport, crafting());
    await openWorkshop(opened.page);
    await expectText(opened.page, /On the bench/, "crafting");
    await expectText(opened.page, /\d:\d\d/, "crafting timer");
    return opened;
  });
  await capture("workshop-cancel", async (viewport) => {
    const opened = await open(viewport, crafting());
    await openWorkshop(opened.page);
    await press(opened.page, ".workshop-cancel");
    await expectText(opened.page, /Tap again to cancel/, "cancel");
    return opened;
  });
  await capture("workshop-reinforce", async (viewport) => {
    const opened = await open(viewport, rest());
    await openWorkshop(opened.page);
    await showRecipe(opened.page, "Reinforce");
    await expectText(opened.page, /Reinforce/, "reinforce");
    return opened;
  });
  await capture("workshop-axle-grease", async (viewport) => {
    const opened = await open(viewport, rest());
    await openWorkshop(opened.page);
    await showRecipe(opened.page, "Axle grease");
    await expectText(opened.page, /Axle grease/, "axle");
    return opened;
  });
  await capture("workshop-need-more", async (viewport) => {
    const opened = await open(
      viewport,
      late(
        Date.now(),
        130_000_000,
        {},
        { materials: { clay: 40, iron: 0, crystal: 12, heartstone: 3 } },
      ),
    );
    await openWorkshop(opened.page);
    await showRecipe(opened.page, "Axle grease");
    await expectText(opened.page, /Need \d+ more iron/, "need more");
    return opened;
  });
  await capture("workshop-craft-done", async (viewport) => {
    const at = Date.now();
    const opened = await open(
      viewport,
      late(at, 20_000_000, quietCrew({ pocket: 2_000_000 }), {
        bench: {
          recipe: "iron-rails",
          startedAt: at - 60_000,
          endsAt: at + 60_000,
        },
      }),
    );
    await opened.page.evaluate(() => {
      globalThis.__skewMs = 120_000;
    });
    await opened.page.waitForSelector(".craft-notice:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(opened.page, /fitted/, "craft done");
    return opened;
  });
  await capture("engineers-promote", async (viewport) => {
    const opened = await open(
      viewport,
      late(Date.now(), 40_000_000, {
        pocket: 8_000_000,
        helpers: 20,
        machines: 0,
        kids: 0,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      }),
    );
    await press(opened.page, ".engineers-button");
    await opened.page.waitForSelector(".engineers-dialog:not([hidden])");
    await expectText(opened.page, /Promote/, "promote");
    return opened;
  });
  await capture("engineers-expedition", async (viewport) => {
    const at = Date.now();
    const opened = await open(
      viewport,
      late(at, 40_000_000, {
        machines: 0,
        kids: 0,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
        expeditions: [
          {
            engineer: "Ada",
            tunnel: "old-shaft",
            sentAt: at - 60_000,
            returnsAt: at + 45 * 60_000,
            home: "borer",
            find: { kind: "tool", id: "pick" },
          },
        ],
      }),
    );
    await press(opened.page, ".engineers-button");
    await opened.page.waitForSelector(".engineers-dialog:not([hidden])");
    await expectText(opened.page, /exploring|will be gone/, "expedition");
    return opened;
  });
  await capture("engineers-homecoming", async (viewport) => {
    const at = Date.now();
    const opened = await open(
      viewport,
      late(at, 40_000_000, {
        machines: 0,
        kids: 0,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
        expeditions: [
          {
            engineer: "Ada",
            tunnel: "old-shaft",
            sentAt: at - 10 * 60_000,
            returnsAt: at - 1_000,
            home: "borer",
            find: { kind: "tool", id: "pick" },
          },
        ],
      }),
    );
    await opened.page.waitForSelector(".welcome-back:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(opened.page, /Welcome home/, "homecoming");
    return opened;
  });
  await capture("relic-tease", async (viewport) => {
    const opened = await open(viewport, late(Date.now(), 223_000_000));
    await expectText(opened.page, /Next: .+Almost there/, "relic tease");
    return opened;
  });
  await capture("relic-reveal", async (viewport) => {
    const opened = await open(
      viewport,
      late(
        Date.now(),
        9_999_999,
        quietCrew({ pocket: 20, helpers: 0, carts: 0 }),
      ),
    );
    await press(opened.page, ".mountain");
    await opened.page.waitForSelector(".relic-reveal:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(opened.page, /Shield of Protection/, "reveal");
    return opened;
  });
  await capture("relic-shelf", async (viewport) => {
    const opened = await open(viewport, rest());
    await press(opened.page, ".relic-shelf");
    await opened.page.waitForSelector(".shelf-dialog:not([hidden])");
    await expectText(opened.page, /A warm light waits|virtue of/, "shelf");
    return opened;
  });
  await capture("legacy-badge", async (viewport) => {
    const opened = await open(
      viewport,
      late(Date.now(), 130_000_000, { legacy: 2 }),
    );
    await expectText(opened.page, /Legacy ×/, "legacy badge");
    return opened;
  });
  await capture("legacy-pass", async (viewport) => {
    const opened = await open(viewport, finished());
    await openMenu(opened.page);
    await expectText(opened.page, /Pass the mine to your kid/, "pass");
    return opened;
  });
  await capture("legacy-confirm", async (viewport) => {
    const opened = await open(viewport, finished());
    await openMenu(opened.page);
    await press(opened.page, ".menu-pass");
    await opened.page.waitForSelector(".legacy-dialog:not([hidden])");
    await expectText(opened.page, /Pass it on/, "legacy confirm");
    return opened;
  });
  await capture("welcome-back", async (viewport) => {
    const away = Date.now() - 3 * 60_000;
    const opened = await open(
      viewport,
      late(away, 20_000_000, quietCrew({ pocket: 40_000 })),
    );
    await opened.page.waitForSelector(".welcome-back:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(opened.page, /While you were away/, "welcome");
    return opened;
  });
  await capture("layer-arrival", async (viewport) => {
    const opened = await open(
      viewport,
      late(
        Date.now(),
        9_999_999,
        quietCrew({ pocket: 20, helpers: 0, carts: 0 }),
      ),
    );
    await press(opened.page, ".mountain");
    await opened.page.waitForSelector(".relic-reveal:not([hidden])", {
      timeout: 8_000,
    });
    await press(opened.page, ".reveal-continue");
    await opened.page.waitForSelector(".layer-arrival:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(opened.page, /broke into the Granite/, "layer");
    return opened;
  });
  await capture("menu-game", async (viewport) => {
    const opened = await open(viewport, rest());
    await openMenu(opened.page);
    await expectText(opened.page, /Sign in with Google/, "menu");
    return opened;
  });
  await capture("field-log", async (viewport) => {
    const opened = await open(viewport, rest());
    await opened.page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        get: () => ({
          writeText: () => Promise.reject(new Error("audit")),
        }),
      });
    });
    await openMenu(opened.page);
    await press(opened.page, ".field-log-copy");
    await opened.page.waitForSelector(".field-log-sheet:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(opened.page, /Field log/, "field log");
    return opened;
  });
  await capture("start-over-confirm", async (viewport) => {
    const opened = await open(viewport, rest());
    await openMenu(opened.page);
    await press(opened.page, ".start-over-link");
    await opened.page.waitForSelector(".start-over:not([hidden])");
    await expectText(opened.page, /Start over\?/, "start over");
    return opened;
  });
  await capture("save-status-unsigned", async (viewport) => {
    const opened = await open(viewport, undefined);
    await expectText(opened.page, /Sign in to save/, "unsigned");
    return opened;
  });
  await capture("save-status-session", async (viewport) => {
    const opened = await open(viewport, rest());
    await expectText(opened.page, /Saved on this device/, "session");
    return opened;
  });
  await capture("save-status-loading", async (viewport) => {
    const opened = await open(viewport, rest(), { search: "?save=loading" });
    await expectText(opened.page, /Loading your save/, "loading");
    return opened;
  });
  await capture("save-status-account", async (viewport) => {
    const opened = await open(viewport, rest(), { search: "?memorySave=1" });
    await opened.page.waitForFunction(
      () =>
        (document.querySelector(".save-status")?.textContent ?? "").includes(
          "Saved to your account",
        ),
      { timeout: 8_000 },
    );
    return opened;
  });
  await capture("save-status-error", async (viewport) => {
    const opened = await open(viewport, rest(), { search: "?save=error" });
    await expectText(opened.page, /Couldn't reach your save/, "error");
    return opened;
  });
  await capture("save-conflict-rest", async (viewport) => {
    const opened = await open(viewport, undefined, { search: "?saves=two" });
    await opened.page.waitForSelector(".save-conflict:not([hidden])");
    await expectText(opened.page, /Two saves found/, "conflict");
    const pressed = await opened.page.$eval(
      ".save-card[data-side='phone']",
      (el) => el.getAttribute("aria-pressed"),
    );
    if (pressed !== "true") {
      throw new Error("phone save should start selected");
    }
    return opened;
  });
  await capture("save-conflict-selected", async (viewport) => {
    const opened = await open(viewport, undefined, { search: "?saves=two" });
    await opened.page.waitForSelector(".save-conflict:not([hidden])");
    await press(opened.page, ".save-card[data-side='other']");
    const pressed = await opened.page.$eval(
      ".save-card[data-side='other']",
      (el) => el.getAttribute("aria-pressed"),
    );
    if (pressed !== "true") {
      throw new Error("other save should be selected");
    }
    return opened;
  });
  await capture("saved-copies-earlier", async (viewport) => {
    const opened = await open(viewport, late(Date.now(), 80_000_000), {
      search: "?memorySave=1&copies=shelf",
    });
    await opened.page.waitForFunction(
      () =>
        (document.querySelector(".save-status")?.textContent ?? "").includes(
          "account",
        ),
      { timeout: 8_000 },
    );
    await openMenu(opened.page);
    await press(opened.page, ".saved-copies-link");
    await opened.page.waitForSelector(".saved-copies:not([hidden])");
    await opened.page.waitForSelector(".is-earlier-run");
    await expectText(opened.page, /earlier run/, "saved copies");
    return opened;
  });
  await capture("other-tab-playing", async (viewport) => {
    const context = await browser.createBrowserContext();
    const [width, height] = viewport;
    const first = await context.newPage();
    const second = await context.newPage();
    const errors = [];
    for (const page of [first, second]) {
      page.on("pageerror", (error) => {
        errors.push(String(error));
      });
      await page.setViewport({
        width,
        height,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      await page.evaluateOnNewDocument(
        (key, value) => {
          localStorage.setItem(key, value);
        },
        SAVE_KEY,
        JSON.stringify(rest()),
      );
    }
    await first.goto(BASE, { waitUntil: "networkidle0" });
    await second.goto(BASE, { waitUntil: "networkidle0" });
    await second.waitForSelector(".other-tab:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(second, /Playing in another tab/, "other tab");
    return {
      page: second,
      errors,
      close: () => context.close(),
    };
  });
  await capture("update-available", async (viewport) => {
    const opened = await open(viewport, rest());
    await opened.page.evaluate(() => {
      const prompt = document.querySelector(".update-prompt");
      if (prompt instanceof HTMLElement) {
        prompt.hidden = false;
      }
    });
    await expectText(opened.page, /Update available/, "update");
    return opened;
  });

  const report = summarise(shots);
  writeFileSync("/tmp/ui-audit-report.json", JSON.stringify(report, null, 2));
  console.log(
    `captured ${String(shots.length)} shots, worst ${report.worst
      .map((row) => row.id)
      .join(", ")}`,
  );
}

function summarise(rows) {
  const typeMap = new Map();
  const spaceMap = new Map();
  const colorMap = new Map();
  /** @type {Map<string, { fg: string, bg: string, ratio: number, kind: string, selector: string, text: string, screen: string, size: number }>} */
  const contrastFails = new Map();
  const radii = new Map();
  const borders = new Map();
  const questions = [];
  const components = {
    card: {},
    chip: {},
    timer: {},
    notice: {},
    badge: {},
    button: {},
  };
  const undersized = [];
  const close = [];
  const scrolling = [];
  const topThird = [];
  const sheetButtons = [];

  const hex = (rgb) =>
    `#${rgb
      .map((channel) =>
        Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"),
      )
      .join("")}`;

  for (const row of rows) {
    const takeType = row.size === "360x560" || row.size === "390x844";
    if (takeType) {
      for (const item of row.type) {
        const key = `${item.size}|${item.weight}|${item.lineHeight}|${item.selector}`;
        const found = typeMap.get(key) ?? {
          size: item.size,
          weight: item.weight,
          lineHeight: item.lineHeight,
          selector: item.selector,
          count: 0,
          under14: item.size < 14,
          sample: item.text,
        };
        found.count += 1;
        typeMap.set(key, found);
      }
      for (const item of row.spacing) {
        const key = `${String(item.value)}|${item.prop}|${item.selector}`;
        const found = spaceMap.get(key) ?? {
          value: item.value,
          prop: item.prop,
          selector: item.selector,
          count: 0,
          offGrid: Math.abs(item.value % 4) > 0.05,
        };
        found.count += 1;
        spaceMap.set(key, found);
      }
      for (const item of row.radii) {
        const key = `${item.value}|${item.selector}`;
        const found = radii.get(key) ?? {
          value: item.value,
          selector: item.selector,
          count: 0,
        };
        found.count += 1;
        radii.set(key, found);
      }
      for (const item of row.borders) {
        const key = `${item.value}|${item.selector}`;
        const found = borders.get(key) ?? {
          value: item.value,
          selector: item.selector,
          count: 0,
        };
        found.count += 1;
        borders.set(key, found);
      }
      for (const item of row.contrast) {
        const fg = hex(item.fg);
        const bg = hex(item.bg);
        colorMap.set(fg, (colorMap.get(fg) ?? 0) + 1);
        colorMap.set(bg, (colorMap.get(bg) ?? 0) + 1);
        if (item.gradient) {
          continue;
        }
        const ratio = contrastRatio(item.fg, item.bg);
        const kind = item.control
          ? "control"
          : isLargeText(item.size, item.weight)
            ? "large"
            : "body";
        if (!passesContrast(ratio, kind)) {
          const key = `${item.selector}|${fg}|${bg}|${kind}`;
          if (!contrastFails.has(key)) {
            contrastFails.set(key, {
              selector: item.selector,
              fg,
              bg,
              ratio: Math.round(ratio * 100) / 100,
              kind,
              text: item.text,
              screen: row.id,
              size: item.size,
            });
          }
        }
      }
    }
    for (const item of row.questions) {
      questions.push({ screen: row.id, size: row.size, ...item });
    }
    if (row.size === "360x560") {
      for (const [group, counts] of Object.entries(row.components)) {
        for (const [selector, count] of Object.entries(counts)) {
          components[group][selector] =
            (components[group][selector] ?? 0) + count;
        }
      }
      undersized.push(
        ...row.undersized.map((item) => ({ screen: row.id, ...item })),
      );
      close.push(...row.close.map((item) => ({ screen: row.id, ...item })));
      scrolling.push(
        ...row.scrolling.map((item) => ({ screen: row.id, ...item })),
      );
      sheetButtons.push(
        ...row.sheets.map((item) => ({ screen: row.id, ...item })),
      );
    }
    if (row.size === "360x640") {
      topThird.push(
        ...row.topThird.map((item) => ({ screen: row.id, ...item })),
      );
    }
  }

  const colors = [...colorMap.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  const near = [];
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const left = colors[i];
      const right = colors[j];
      if (left === undefined || right === undefined) {
        continue;
      }
      const distance = rgbDistance(left.value, right.value);
      if (distance > 0 && distance < 28) {
        near.push({
          a: left.value,
          b: right.value,
          distance: Math.round(distance * 10) / 10,
          count: left.count + right.count,
        });
      }
    }
  }
  near.sort((a, b) => a.distance - b.distance);

  const worst = rows
    .filter((row) => row.size === "360x560")
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      score: row.score,
      file: row.file,
      under14: row.under14,
      contrastFails: row.contrastFails,
      undersized: row.undersized.length,
      close: row.close.length,
      scrolling: row.scrolling.length,
    }));

  const dedupe = (items, keyOf) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyOf(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  return {
    shots: rows.map((row) => ({
      id: row.id,
      size: row.size,
      file: row.file,
      score: row.score,
      text: row.text,
    })),
    worst,
    type: [...typeMap.values()].sort((a, b) => a.size - b.size),
    spacing: [...spaceMap.values()]
      .filter((item) => item.offGrid)
      .sort((a, b) => a.value - b.value),
    colors,
    near: near.slice(0, 40),
    contrast: [...contrastFails.values()].sort((a, b) => a.ratio - b.ratio),
    radii: [...radii.values()].sort((a, b) => b.count - a.count),
    borders: [...borders.values()].sort((a, b) => b.count - a.count),
    questions: dedupe(questions, (item) => `${item.screen}|${item.text}`),
    undersized: dedupe(
      undersized,
      (item) => `${item.screen}|${item.selector}|${item.text}`,
    ),
    close: dedupe(close, (item) => `${item.screen}|${item.a}|${item.b}`),
    scrolling,
    topThird: dedupe(
      topThird,
      (item) => `${item.screen}|${item.selector}|${item.text}`,
    ),
    sheetButtons,
    components,
  };
}

/** @param {string} hexColor */
function rgbOf(hexColor) {
  return [
    Number.parseInt(hexColor.slice(1, 3), 16),
    Number.parseInt(hexColor.slice(3, 5), 16),
    Number.parseInt(hexColor.slice(5, 7), 16),
  ];
}

/** @param {string} left @param {string} right */
function rgbDistance(left, right) {
  const a = rgbOf(left);
  const b = rgbOf(right);
  return Math.hypot(
    (a[0] ?? 0) - (b[0] ?? 0),
    (a[1] ?? 0) - (b[1] ?? 0),
    (a[2] ?? 0) - (b[2] ?? 0),
  );
}

try {
  await main();
} finally {
  await browser.close();
  await server.close();
}
