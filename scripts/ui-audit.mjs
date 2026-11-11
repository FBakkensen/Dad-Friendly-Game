/* global console, process, document, getComputedStyle, innerWidth, innerHeight, HTMLElement, Element, navigator, setTimeout */
/**
 * Screen audit capture. Not part of `npm run check`.
 *
 * Opens its pages through the browser harness (tools/browser/harness.ts): Vite,
 * Chrome, and a localStorage save planted before boot. Shots are 424×924, the installed app
 * and the board's own size (#370), at device scale 2. Dev-only preview params (`?saves=two`,
 * `?save=loading`, `?save=error`, `?copies=shelf`, `?trouble=cave-in`) seed
 * the save screens.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  launchChrome,
  open as openHarness,
  openPair,
  startServer,
} from "../tools/browser/harness.ts";
import {
  contrastRatio,
  isLargeText,
  passesContrast,
  scrollOverflows,
  targetsCloserThan,
  undersizedTargets,
  WINDOW_SCENE_PARTS,
} from "../src/ui-audit-measure.ts";
import {
  crewMountain,
  late,
  MOUNTAIN,
  quietCrew,
  seedJson,
  shortMountain,
  toolsMountain,
} from "../tools/browser/fixtures.ts";

const OUT = "docs/ui-audit";
/** The phone: the board's 424x924 stage at scale 1 (#370). */
const PHONE_SIZE = "424x924";
const VIEWPORTS = [[424, 924]];

const server = await startServer({ port: 4175, url: undefined });
const BASE = server.base;

const browser = await launchChrome({
  args: ["--no-sandbox", "--hide-scrollbars", "--font-render-hinting=none"],
});

/** @type {object[]} */
const shots = [];

mkdirSync(OUT, { recursive: true });

// Adapts the audit's (viewport, save, options) call shape onto the harness open.
/**
 * @param {[number, number]} viewport
 * @param {object | undefined} save
 * @param {{ search?: string }} [options]
 */
async function openAuditPage(viewport, save, { search = "" } = {}) {
  const errors = [];
  const { page, close } = await openHarness(browser, BASE, {
    viewport: {
      width: viewport[0],
      height: viewport[1],
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
    seed:
      save === undefined
        ? { kind: "remove" }
        : { kind: "everyLoad", json: JSON.stringify(save) },
    clock: { date: "skewable", tap: "real" },
    search,
    onPageError: (error) => {
      errors.push(String(error));
    },
  });
  await page.waitForSelector(".board-window", { timeout: 8_000 });
  await page.evaluate(() => document.fonts.ready);
  return {
    page,
    errors,
    close,
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
      `${OPEN_SHEET("workshop")} .board-sheet-list`,
      (list, wanted) =>
        [
          ...list.querySelectorAll(
            ".workshop-recipe:not([hidden]), .workshop-sketch:not([hidden])",
          ),
        ].some((row) => (row.textContent ?? "").includes(wanted)),
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
    // Each page settles as the drawer did (#374): the next tap comes after it.
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  throw new Error(`recipe not visible: ${name}`);
}

/** A key on the rail (#373): buys, workshop, engineers, upgrades or ledger. */
const KEY = (id) => `.board-key[data-key="${id}"]`;
/** An open drawer (#373, #374): buys, upgrades or workshop. */
const OPEN_SHEET = (name) => `.board-sheet[data-sheet="${name}"].is-open`;

/** A play save from tools/browser/fixtures.ts, as the browser's storage holds it. */
const seeded = (save) => JSON.parse(seedJson(save));

/**
 * Opens a drawer by its key and waits for its slide to end, so the shot and
 * the measures see it where it rests.
 * @param {import("puppeteer-core").Page} page
 * @param {"buys" | "upgrades" | "workshop"} name
 */
async function openDrawer(page, name) {
  await press(page, KEY(name));
  await page.waitForSelector(OPEN_SHEET(name), { timeout: 8_000 });
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.getAnimations().length === 0,
    { timeout: 8_000 },
    OPEN_SHEET(name),
  );
  // A finger on the drawer inside its 400ms settle is the double tap's
  // second tap and does nothing (#373): a deliberate tap comes after it.
  await new Promise((resolve) => setTimeout(resolve, 450));
}

/** @param {import("puppeteer-core").Page} page */
async function openMenu(page) {
  // The ☰ menu's door is the Ledger key on the rail until B7 (#373).
  await press(page, KEY("ledger"));
  await page.waitForSelector(".game-menu:not([hidden])", { timeout: 8_000 });
}

/** @param {import("puppeteer-core").Page} page */
async function openWorkshop(page) {
  await openDrawer(page, "workshop");
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
      // A closed board drawer waits out of sight with visibility: hidden.
      if (getComputedStyle(el).visibility === "hidden") {
        return false;
      }
      // A shut Buys or Upgrades drawer waits under the board's edge (#373).
      if (el.closest(".board-sheet:not(.is-open)") !== null) {
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
    // A tier, boost, upgrade, recipe or side names its parts, and itself:
    // the three machine bays (#372) and the Buys rows (#373) are each a
    // [data-tier] host, so each bay and row is its own target and a part
    // reads as the bay's (.board-bay-*) or the row's (.board-row-*).
    const KEYS = ["tier", "boost", "upgrade", "recipe", "side"];
    const keyed = (host) => {
      const key = KEYS.find((name) => host.dataset[name]);
      return key === undefined
        ? undefined
        : `[data-${key}="${host.dataset[key] ?? ""}"]`;
    };
    const selectorOf = (el) => {
      if (el.id) {
        return `#${el.id}`;
      }
      const host = el.closest(
        "[data-tier], [data-boost], [data-upgrade], [data-recipe], [data-side]",
      );
      const own = classBit(el);
      if (host instanceof HTMLElement) {
        const key = keyed(host);
        if (key !== undefined) {
          return host === el ? `${own}${key}` : `${key} ${own}`;
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
        // Only the part a finger can reach: a scrolling list clips the card
        // half under its edge, so that part is not near the next button.
        const raw = el.getBoundingClientRect();
        let top = raw.top;
        let bottom = raw.bottom;
        let left = raw.left;
        let right = raw.right;
        for (let up = el.parentElement; up !== null; up = up.parentElement) {
          const clip = getComputedStyle(up);
          if (clip.overflowX === "visible" && clip.overflowY === "visible") {
            continue;
          }
          const edge = up.getBoundingClientRect();
          top = Math.max(top, edge.top);
          bottom = Math.min(bottom, edge.bottom);
          left = Math.max(left, edge.left);
          right = Math.min(right, edge.right);
        }
        // Scrolled wholly out of view: still sized, never spaced.
        const inView = bottom - top > 0 && right - left > 0;
        targets.push({
          selector,
          top,
          left,
          width: Math.max(0, right - left),
          height: Math.max(0, bottom - top),
          inView,
          // The size check reads the whole button, not the part in view.
          fullWidth: raw.width,
          fullHeight: raw.height,
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
      "[role='dialog'], [role='alertdialog'], .sheet, .workshop-sheet, .board-sheet-list, .board-sheet-how, .engineers-card, .menu-card, .shelf-card, .save-conflict-sheet",
    )) {
      if (visible(el)) {
        remember(el, selectorOf(el));
      }
    }

    const primarySelectors = [
      ".board-window",
      ".board-ready",
      ".board-dig-button",
      ".go",
      ".board-row.upgrade",
      ".workshop-recipe",
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
        ".workshop-recipe",
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
      chip: [".boost-chip", ".material-bit", ".expedition-chip"],
      timer: [".workshop-timers", ".workshop-bar", ".boost"],
      notice: [
        ".craft-notice",
        ".vein-note",
        ".welcome-back",
        ".layer-arrival",
        ".board-sheet-kick.is-done",
      ],
      badge: [
        ".legacy-badge",
        ".board-row-badge",
        ".board-row-flag",
        ".board-key-dot",
        ".engineer-badge",
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
  const census = size === PHONE_SIZE;
  const phone = size === PHONE_SIZE;
  const thumb = size === PHONE_SIZE;
  const undersized = phone
    ? undersizedTargets(
        sample.targets.map((target) => ({
          ...target,
          width: target.fullWidth,
          height: target.fullHeight,
        })),
      )
    : [];
  const close = phone
    ? targetsCloserThan(sample.targets.filter((target) => target.inView)).map(
        (pair) => ({
          ...pair,
          gap: Math.round(pair.gap * 10) / 10,
        }),
      )
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
    text: phone ? sample.text : "",
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
      // A tap in touch emulation can leave a button :active, nudged 2px by
      // its press style. Measure and shoot the layout at rest.
      await opened.page.addStyleTag({
        content: ":active { transform: none !important; }",
      });
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

  await capture("mountain-rest", (viewport) => openAuditPage(viewport, rest()));
  await capture("mountain-vein", async (viewport) => {
    const opened = await openAuditPage(viewport, rest());
    await opened.page.evaluate(() => {
      globalThis.__skewMs = 7 * 60 * 1000;
    });
    await opened.page.waitForSelector(".golden-vein:not([hidden])", {
      timeout: 6_000,
    });
    // The glint is art: its words are its label (#371).
    const vein = await opened.page.$eval(
      ".golden-vein",
      (el) => el.getAttribute("aria-label") ?? "",
    );
    if (!/stones/.test(vein)) {
      throw new Error(`mountain-vein: ${vein}`);
    }
    return opened;
  });
  // The Granite before the Great Machine: the bays are cart, drill and
  // borer, so the cart's cave-in lights a bay (#372).
  const hazard = () => late(Date.now(), 30_000_000, { machines: 0, kids: 0 });
  await capture("mountain-hazard", async (viewport) => {
    const opened = await openAuditPage(viewport, hazard(), {
      search: "?trouble=cave-in",
    });
    // The cave-in comes down in the mine window, on the board (#371).
    await opened.page.waitForSelector(".board-window-cave-in:not([hidden])", {
      visible: true,
    });
    // The cart bay's lamp goes red and its sub-line asks for a hold (#372).
    await opened.page.waitForSelector(
      '.board-bay[data-tier="cart"][data-trouble="cave-in"]',
      { visible: true },
    );
    const lamp = await opened.page.$eval(
      '.board-bay[data-trouble="cave-in"] .board-lamp',
      (el) => el.style.backgroundPositionX,
    );
    if (lamp !== "-120px") {
      throw new Error(`mountain-hazard: the bay's lamp is at ${lamp}, not red`);
    }
    await expectText(opened.page, /Hold to fix/, "mountain-hazard");
    return opened;
  });
  await capture("buys-hazard", async (viewport) => {
    const opened = await openAuditPage(viewport, hazard(), {
      search: "?trouble=cave-in",
    });
    // The bay shows the trouble first; the shout lives on the troubled
    // machine's card, in Buys.
    await opened.page.waitForSelector('[data-trouble="cave-in"]', {
      visible: true,
    });
    await openDrawer(opened.page, "buys");
    await opened.page.waitForSelector('.board-row[data-trouble="cave-in"]', {
      visible: true,
    });
    await expectText(opened.page, /Cave-in!/, "buys-hazard");
    return opened;
  });
  await capture("mountain-layer-hint", async (viewport) => {
    const opened = await openAuditPage(
      viewport,
      late(Date.now(), 30_000_000, { machines: 0, kids: 0 }),
    );
    // The guide (goal, layer hint, bar) moved into the ☰ menu's ledger.
    await openMenu(opened.page);
    await expectText(
      opened.page,
      /Deeper on, the walls start to glitter/,
      "mountain-layer-hint",
    );
    return opened;
  });
  await capture("crew-needs-workers", async (viewport) => {
    // Three hands free: the borer, which the pocket covers, is short of
    // workers, and the Great Machine is dear (#373).
    const opened = await openAuditPage(
      viewport,
      late(Date.now(), 130_000_000, { helpers: 65 }),
    );
    // The crew plate is the only free count (#371); the machine rows (and
    // their "Needs N workers" bill) and the crew line are in the Buys drawer.
    const plate = await opened.page.$eval(
      ".board-crew",
      (el) => el.getAttribute("aria-label") ?? "",
    );
    if (!/^Crew: [\d,]+ workers?, [\d,]+ free$/.test(plate)) {
      throw new Error(`crew plate: ${plate}`);
    }
    await openDrawer(opened.page, "buys");
    await expectText(opened.page, /\d+ workers/, "crew line in Buys");
    await expectText(opened.page, /Needs \d+ workers?/, "crew");
    // A row he cannot afford is dear: its lamp off and its tag dim (#373).
    const dear = await opened.page.$(".tier.is-dear");
    if (dear === null) {
      throw new Error("expected a dear machine row");
    }
    return opened;
  });
  await capture("material-chips", async (viewport) => {
    const opened = await openAuditPage(viewport, rest());
    // The material line lives in the ☰ menu's ledger now.
    await openMenu(opened.page);
    await expectText(opened.page, /Clay/, "chips");
    await expectText(opened.page, /Iron/, "chips");
    await expectText(opened.page, /Crystal/, "chips");
    await expectText(opened.page, /Heartstone/, "chips");
    return opened;
  });
  await capture("upgrades-boosts-timer", async (viewport) => {
    const opened = await openAuditPage(viewport, withBoosts());
    await openDrawer(opened.page, "upgrades");
    // A running boost's row says Running, with its clock on the tag (#373).
    const running = await opened.page.$$eval(
      `${OPEN_SHEET("upgrades")} .upgrade.boost.is-running`,
      (rows) =>
        rows.map((row) => ({
          verb: row.querySelector(".board-row-verb")?.textContent ?? "",
          tag: row.querySelector(".board-row-price")?.textContent ?? "",
        })),
    );
    if (
      running.length === 0 ||
      !running.every(
        (row) => row.verb === "Running" && /^\d+:\d\d$/.test(row.tag),
      )
    ) {
      throw new Error(`boost timer: ${JSON.stringify(running)}`);
    }
    return opened;
  });
  // The key rail (#373): an early save, so Workshop and Engineers stand
  // locked with their unlock lines, and Upgrades shows its lit cap and its
  // red dot lamp.
  await capture("key-rail", async (viewport) => {
    const opened = await openAuditPage(viewport, seeded(crewMountain()));
    await opened.page.waitForSelector(".board-key.is-lit", { timeout: 8_000 });
    const keys = await opened.page.$$eval(".board-rail .board-key", (els) =>
      els.map((key) => ({
        id: key.dataset.key,
        locked: key.classList.contains("is-locked"),
        lit: key.classList.contains("is-lit"),
        dot: key.querySelector(".board-key-dot")?.hidden === false,
        sub: key.querySelector(".board-key-sub")?.textContent ?? "",
      })),
    );
    const byId = Object.fromEntries(keys.map((key) => [key.id, key]));
    if (
      keys.length !== 5 ||
      byId.workshop?.sub !== "With the clay" ||
      byId.engineers?.sub !== "With 1st borer" ||
      !byId.workshop.locked ||
      !byId.engineers.locked ||
      byId.upgrades?.lit !== true ||
      !byId.upgrades.dot
    ) {
      throw new Error(`key-rail: ${JSON.stringify(keys)}`);
    }
    return opened;
  });
  // The Buys drawer (#373): a borer he can afford but not staff, beside the
  // amber pick, dear and locked rows.
  await capture("buys-drawer", async (viewport) => {
    const opened = await openAuditPage(viewport, seeded(shortMountain()));
    await openDrawer(opened.page, "buys");
    await opened.page.waitForSelector(
      `${OPEN_SHEET("buys")} .tier.is-short[data-tier="borer"]`,
    );
    await expectText(opened.page, /Needs 8 workers/, "buys-drawer");
    return opened;
  });
  // Its "i": the Staffing and Layers cards in the drawer's place, one Back.
  await capture("buys-how", async (viewport) => {
    const opened = await openAuditPage(viewport, seeded(shortMountain()));
    await openDrawer(opened.page, "buys");
    await press(opened.page, `${OPEN_SHEET("buys")} .board-sheet-info`);
    await opened.page.waitForSelector(`${OPEN_SHEET("buys")} .teach-how`, {
      visible: true,
    });
    await expectText(opened.page, /How it works/i, "buys-how");
    return opened;
  });
  // Buys on Max (#358): the head's amount key, and each row's real count and
  // total price for as many as the pocket holds.
  await capture("buys-max", async (viewport) => {
    const opened = await openAuditPage(viewport, seeded(shortMountain()));
    await openDrawer(opened.page, "buys");
    const key = `${OPEN_SHEET("buys")} .board-sheet-head .buy-amount`;
    for (let step = 0; step < 2; step += 1) {
      await opened.page.$eval(key, (button) => {
        button.click();
      });
    }
    const face = await opened.page.$eval(key, (button) => button.textContent);
    if (face !== "Max") {
      throw new Error(`buys-max: the key reads ${String(face)}`);
    }
    await expectText(opened.page, /Hire \d+/i, "buys-max");
    return opened;
  });
  // The Upgrades drawer (#373): a levelled upgrade, an owned one, and found
  // tools under Brought home.
  await capture("upgrades-drawer", async (viewport) => {
    const opened = await openAuditPage(viewport, seeded(toolsMountain()));
    await openDrawer(opened.page, "upgrades");
    const words = await opened.page.$eval(OPEN_SHEET("upgrades"), (sheet) => ({
      badge:
        sheet.querySelector('[data-upgrade="tap"] .board-row-badge')
          ?.textContent ?? "",
      owned:
        sheet.querySelector('[data-upgrade="boots"] .board-row-price')
          ?.textContent ?? "",
      found: [...sheet.querySelectorAll(".found-tool")]
        .filter((row) => row.closest("[hidden]") === null)
        .map((row) => row.querySelector(".board-row-price")?.textContent ?? ""),
    }));
    if (
      words.badge !== "Lv 2/10" ||
      words.owned !== "Owned" ||
      words.found.length !== 2 ||
      !words.found.every((word) => word === "Found")
    ) {
      throw new Error(`upgrades-drawer: ${JSON.stringify(words)}`);
    }
    return opened;
  });
  await capture("workshop-idle", async (viewport) => {
    const opened = await openAuditPage(viewport, rest());
    await openWorkshop(opened.page);
    await expectText(
      opened.page,
      /The bench is free|bench is free/,
      "idle bench",
    );
    return opened;
  });
  await capture("workshop-crafting", async (viewport) => {
    const opened = await openAuditPage(viewport, crafting());
    await openWorkshop(opened.page);
    // The verb is uppercased on screen (.board-row-verb), and innerText reads it so.
    await expectText(opened.page, /On the bench/i, "crafting");
    await expectText(opened.page, /\d:\d\d/, "crafting timer");
    return opened;
  });
  await capture("workshop-cancel", async (viewport) => {
    const opened = await openAuditPage(viewport, crafting());
    await openWorkshop(opened.page);
    await press(opened.page, ".workshop-bench");
    await expectText(opened.page, /Tap again to cancel/, "cancel");
    return opened;
  });
  await capture("workshop-reinforce", async (viewport) => {
    const opened = await openAuditPage(viewport, rest());
    await openWorkshop(opened.page);
    await showRecipe(opened.page, "Reinforce");
    await expectText(opened.page, /Reinforce/, "reinforce");
    return opened;
  });
  await capture("workshop-sketch", async (viewport) => {
    // The lamp and the kit not found yet: the one dark Sketch row on the last page.
    const opened = await openAuditPage(
      viewport,
      late(
        Date.now(),
        130_000_000,
        {},
        {
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
      ),
    );
    await openWorkshop(opened.page);
    await showRecipe(opened.page, "Sketch");
    await expectText(opened.page, /Sketch/, "sketch");
    return opened;
  });
  await capture("workshop-need-more", async (viewport) => {
    const opened = await openAuditPage(
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
    const opened = await openAuditPage(
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
    const opened = await openAuditPage(
      viewport,
      late(Date.now(), 40_000_000, {
        pocket: 8_000_000,
        helpers: 20,
        machines: 0,
        kids: 0,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      }),
    );
    await press(opened.page, KEY("engineers"));
    await opened.page.waitForSelector(".engineers-dialog:not([hidden])");
    await expectText(opened.page, /Promote/, "promote");
    return opened;
  });
  await capture("engineers-expedition", async (viewport) => {
    const at = Date.now();
    const opened = await openAuditPage(
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
    await press(opened.page, KEY("engineers"));
    await opened.page.waitForSelector(".engineers-dialog:not([hidden])");
    await expectText(opened.page, /exploring|will be gone/, "expedition");
    return opened;
  });
  await capture("engineers-homecoming", async (viewport) => {
    const at = Date.now();
    const opened = await openAuditPage(
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
    const opened = await openAuditPage(viewport, late(Date.now(), 223_000_000));
    // The relic goal line lives in the ☰ menu's ledger now.
    await openMenu(opened.page);
    await expectText(opened.page, /Next: .+Almost there/, "relic tease");
    return opened;
  });
  await capture("relic-reveal", async (viewport) => {
    const opened = await openAuditPage(
      viewport,
      late(
        Date.now(),
        9_999_999,
        quietCrew({ pocket: 20, helpers: 0, carts: 0 }),
      ),
    );
    await press(opened.page, ".board-window");
    await opened.page.waitForSelector(".relic-reveal:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(opened.page, /Shield of Protection/, "reveal");
    return opened;
  });
  await capture("relic-shelf", async (viewport) => {
    const opened = await openAuditPage(viewport, rest());
    // A socket's note holds the Relic shelf key; the tag is a label (#370).
    await press(opened.page, ".board-socket");
    await press(opened.page, ".board-note.on .board-platebtn");
    await opened.page.waitForSelector(".shelf-dialog:not([hidden])");
    await expectText(opened.page, /A warm light waits|virtue of/, "shelf");
    return opened;
  });
  await capture("legacy-badge", async (viewport) => {
    const opened = await openAuditPage(
      viewport,
      late(Date.now(), 130_000_000, { legacy: 2 }),
    );
    // The plate sets its words in capitals.
    await expectText(opened.page, /Legacy ×/i, "legacy badge");
    return opened;
  });
  await capture("legacy-pass", async (viewport) => {
    const opened = await openAuditPage(viewport, finished());
    await openMenu(opened.page);
    await expectText(opened.page, /Pass the mine to your kid/, "pass");
    return opened;
  });
  await capture("legacy-confirm", async (viewport) => {
    const opened = await openAuditPage(viewport, finished());
    await openMenu(opened.page);
    await press(opened.page, ".menu-pass");
    await opened.page.waitForSelector(".legacy-dialog:not([hidden])");
    await expectText(opened.page, /Pass it on/, "legacy confirm");
    return opened;
  });
  await capture("welcome-back", async (viewport) => {
    // Past the five-minute quiet note (#334), so the card opens.
    const away = Date.now() - 30 * 60_000;
    const opened = await openAuditPage(
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
    const opened = await openAuditPage(
      viewport,
      late(
        Date.now(),
        9_999_999,
        quietCrew({ pocket: 20, helpers: 0, carts: 0 }),
      ),
    );
    await press(opened.page, ".board-window");
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
    const opened = await openAuditPage(viewport, rest());
    await openMenu(opened.page);
    await expectText(opened.page, /Sign in with Google/, "menu");
    return opened;
  });
  await capture("field-log", async (viewport) => {
    const opened = await openAuditPage(viewport, rest());
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
    const opened = await openAuditPage(viewport, rest());
    await openMenu(opened.page);
    await press(opened.page, ".start-over-link");
    await opened.page.waitForSelector(".start-over:not([hidden])");
    await expectText(opened.page, /Start over\?/, "start over");
    return opened;
  });
  await capture("save-status-unsigned", async (viewport) => {
    const opened = await openAuditPage(viewport, undefined);
    await expectText(opened.page, /Sign in to save/, "unsigned");
    return opened;
  });
  await capture("save-status-session", async (viewport) => {
    const opened = await openAuditPage(viewport, rest());
    await expectText(opened.page, /Saved on this device/, "session");
    return opened;
  });
  await capture("save-status-loading", async (viewport) => {
    const opened = await openAuditPage(viewport, rest(), {
      search: "?save=loading",
    });
    await expectText(opened.page, /Loading your save/, "loading");
    // Until the save is in, the window is its frame and glass: nothing drawn
    // from a save it has not read yet (#371).
    const shown = await opened.page.evaluate(
      (parts) =>
        parts.filter((part) =>
          [...document.querySelectorAll(part)].some(
            (el) => el.getClientRects().length > 0,
          ),
        ),
      [...WINDOW_SCENE_PARTS],
    );
    if (shown.length > 0) {
      throw new Error(`loading: the mine window shows ${shown.join(", ")}`);
    }
    return opened;
  });
  await capture("save-status-account", async (viewport) => {
    const opened = await openAuditPage(viewport, rest(), {
      search: "?memorySave=1",
    });
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
    const opened = await openAuditPage(viewport, rest(), {
      search: "?save=error",
    });
    await expectText(opened.page, /Couldn't reach your save/, "error");
    return opened;
  });
  await capture("save-drawer-error", async (viewport) => {
    // The save line opens its drawer: the facts, Close, and Try again (#370).
    const opened = await openAuditPage(viewport, rest(), {
      search: "?save=error",
    });
    await press(opened.page, ".save-status");
    await opened.page.waitForSelector(".board-save-drawer.is-open");
    // The drawer slides in steps(6) over 240ms.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await expectText(opened.page, /Nothing is lost/, "save drawer");
    return opened;
  });
  await capture("running-now", async (viewport) => {
    // The boost dial opens the Running now note: one line per countdown.
    const opened = await openAuditPage(viewport, withBoosts());
    await press(opened.page, ".board-dial");
    await opened.page.waitForSelector(".board-note.on");
    await expectText(opened.page, /Running now/i, "running now");
    return opened;
  });
  await capture("save-conflict-rest", async (viewport) => {
    const opened = await openAuditPage(viewport, undefined, {
      search: "?saves=two",
    });
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
    const opened = await openAuditPage(viewport, undefined, {
      search: "?saves=two",
    });
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
    const opened = await openAuditPage(viewport, late(Date.now(), 80_000_000), {
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
    const [width, height] = viewport;
    const errors = [];
    const { pages, close } = await openPair(browser, BASE, {
      viewport: {
        width,
        height,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
      seed: { kind: "everyLoad", json: JSON.stringify(rest()) },
      clock: { date: "real", tap: "real" },
      onPageError: (error) => {
        errors.push(String(error));
      },
    });
    const second = pages[1];
    await second.waitForSelector(".other-tab:not([hidden])", {
      timeout: 8_000,
    });
    await expectText(second, /Playing in another tab/, "other tab");
    return {
      page: second,
      errors,
      close,
    };
  });
  await capture("update-available", async (viewport) => {
    const opened = await openAuditPage(viewport, rest());
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
    const takeType = row.size === PHONE_SIZE;
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
    if (row.size === PHONE_SIZE) {
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
    if (row.size === PHONE_SIZE) {
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
    .filter((row) => row.size === PHONE_SIZE)
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
