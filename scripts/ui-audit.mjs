/* global console, process, document, getComputedStyle, innerWidth, innerHeight, HTMLElement, Element, setTimeout */
/**
 * Screen audit capture. Not part of `npm run check`.
 *
 * Opens its pages through the browser harness (tools/browser/harness.ts): Vite,
 * Chrome, and a localStorage save planted before boot. Shots are 424×924, the installed app
 * and the board's own size (#370), at device scale 2. The frame's saves are the dev account's
 * phone backup on a memory save (#664). Dev-only preview params (`?saves=two`,
 * `?save=loading`, `?save=error`, `?copies=shelf`, `?update=shown`) seed the save screens.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cardRisen,
  launchChrome,
  open as openHarness,
  openPair,
  SAVE_KEY,
  startServer,
} from "../tools/browser/harness.ts";
import {
  contrastRatio,
  isLargeText,
  passesContrast,
  scrollOverflows,
  targetsCloserThan,
  undersizedTargets,
} from "../src/ui-audit-measure.ts";
import {
  DEV_BACKUP_KEY,
  sliceBusySave,
  sliceDoneSave,
  sliceListSave,
  sliceNightSave,
  sliceRefinerySave,
  sliceFactoryOrderSave,
  sliceGraniteUnsunkSave,
  sliceTwoLevelsSave,
  sliceRoofSave,
  sliceStartSave,
  sliceWarehouseRoofSave,
  sliceWarehouseSave,
  sliceWarehouseTrucksSave,
  sliceYardFullSave,
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
 * @param {{ search?: string, seedKey?: string }} [options]
 */
async function openAuditPage(
  viewport,
  save,
  { search = MEMORY, seedKey = DEV_BACKUP_KEY } = {},
) {
  const errors = [];
  const { page, close } = await openHarness(browser, BASE, {
    viewport: {
      width: viewport[0],
      height: viewport[1],
      deviceScaleFactor: 2,
      // The game is phone-only: touch.
      isMobile: true,
      hasTouch: true,
    },
    seed:
      save === undefined
        ? { kind: "remove" }
        : { kind: "everyLoad", json: JSON.stringify(save) },
    seedKey,
    clock: { date: "skewable", tap: "real" },
    search,
    onPageError: (error) => {
      errors.push(String(error));
    },
  });
  await page.waitForSelector(".frame-next-line", { timeout: 8_000 });
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
    // An upgrade or a side names its parts, and itself: a stage list's
    // upgrade and a save card's side are each a keyed host, so each is its
    // own target and a part reads as its host's.
    const KEYS = ["upgrade", "side"];
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
      const host = el.closest("[data-upgrade], [data-side]");
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
        // The harness's in-page helper (tools/browser/harness.ts).
        const raw = el.getBoundingClientRect();
        const { top, bottom, left, right } = globalThis.__reach(el);
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
      "[role='dialog'], [role='alertdialog'], .board-sheet-list, .board-sheet-how, .board-card-face",
    )) {
      if (visible(el)) {
        remember(el, selectorOf(el));
      }
    }

    const primarySelectors = [
      ".go",
      ".other-tab-play",
      ".update-reload",
      ".ledger-yes",
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
        ".save-card",
        ".saved-copy",
        ".other-tab .board-card-face",
        ".update-prompt .board-card-face",
        ".saved-copies .board-card-face",
      ],
      notice: [".board-sheet-kick.is-done"],
      badge: [".board-row-badge", ".board-row-flag"],
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

/**
 * Shoots and measures one view at each size.
 * @param {string} id
 */
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

/** The frame's saves are the dev account's phone backup, played on a memory save (#664). */
const MEMORY = "?memorySave=1";

/** A card over the frame has risen: its slide has ended. */
async function frameCardUp(page) {
  await page.waitForSelector(".frame-card:not([hidden])", { timeout: 8_000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/** A sheet over the frame is open and its slide has ended. */
async function sheetUp(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 8_000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/** The frame on a save, its first card (if any) put away, on one site. */
async function openFrame(viewport, save, site = "mine", options = {}) {
  const opened = await openAuditPage(viewport, save, options);
  if (await opened.page.$(".frame-card:not([hidden])")) {
    await frameCardUp(opened.page);
    await press(opened.page, ".frame-card-key");
  }
  await press(opened.page, `.frame-site[data-site="${site}"]`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return opened;
}

async function main() {
  const busy = () => sliceBusySave(Date.now());

  await capture("slice-frame-busy", (viewport) => openFrame(viewport, busy()));
  await capture("slice-mine-busy", (viewport) => openFrame(viewport, busy()));
  await capture("slice-mine-start", async (viewport) =>
    openFrame(viewport, sliceStartSave(Date.now())),
  );
  await capture("slice-city-busy", (viewport) =>
    openFrame(viewport, busy(), "city"),
  );
  await capture("slice-city-warehouse", (viewport) =>
    openFrame(viewport, sliceWarehouseSave(Date.now()), "city"),
  );
  await capture("slice-city-done", (viewport) =>
    openFrame(viewport, sliceDoneSave(Date.now()), "city"),
  );
  await capture("slice-workforce-busy", async (viewport) => {
    const opened = await openFrame(viewport, busy());
    await press(opened.page, ".frame-workers");
    await sheetUp(opened.page, ".frame-sheet:not([hidden])");
    return opened;
  });
  await capture("slice-stage-haul-busy", async (viewport) => {
    const opened = await openFrame(viewport, sliceListSave(Date.now()));
    await press(opened.page, '.mine-stage[data-stage="haul"] .mine-stage-info');
    await sheetUp(opened.page, ".stage-sheet:not([hidden])");
    return opened;
  });
  await capture("slice-card-first", async (viewport) => {
    const opened = await openAuditPage(viewport, sliceStartSave(Date.now()));
    await frameCardUp(opened.page);
    await expectText(opened.page, /The first evening/i, "first evening");
    return opened;
  });
  await capture("slice-card-report-night", async (viewport) => {
    const opened = await openAuditPage(viewport, sliceNightSave(Date.now()));
    await frameCardUp(opened.page);
    await expectText(opened.page, /Shift report/i, "shift report");
    return opened;
  });
  await capture("slice-card-report-roof", async (viewport) => {
    const opened = await openAuditPage(viewport, sliceRoofSave(Date.now()));
    await frameCardUp(opened.page);
    await expectText(opened.page, /Light Tower.s roof/i, "the roof's report");
    return opened;
  });
  // Part 2 (#671, switched on in #672).
  await capture("slice-refinery", (viewport) =>
    openFrame(viewport, sliceRefinerySave(Date.now()), "refinery"),
  );
  // Part 3 on a dev page, before #682 switches it on (#681).
  await capture("slice-factory", (viewport) =>
    openFrame(viewport, sliceFactoryOrderSave(Date.now()), "factory", {
      search: `${MEMORY}&part3=1`,
    }),
  );
  // The mine with two levels, on the same dev page (#680).
  await capture("slice-mine-two-levels", (viewport) =>
    openFrame(viewport, sliceTwoLevelsSave(Date.now()), "mine", {
      search: `${MEMORY}&part3=1`,
    }),
  );
  // The saws, the trucks and the Granite's card, on the same dev page (#754).
  await capture("slice-refinery-two-levels", (viewport) =>
    openFrame(viewport, sliceTwoLevelsSave(Date.now()), "refinery", {
      search: `${MEMORY}&part3=1`,
    }),
  );
  await capture("slice-city-trucks", (viewport) =>
    openFrame(viewport, sliceWarehouseTrucksSave(Date.now()), "city", {
      search: `${MEMORY}&part3=1`,
    }),
  );
  await capture("slice-city-trucks-hint", (viewport) =>
    openFrame(viewport, sliceWarehouseSave(Date.now()), "city", {
      search: `${MEMORY}&part3=1`,
    }),
  );
  await capture("slice-card-granite", async (viewport) => {
    const opened = await openFrame(
      viewport,
      sliceGraniteUnsunkSave(Date.now()),
      "mine",
      { search: `${MEMORY}&part3=1` },
    );
    await press(opened.page, ".mine-sink");
    await opened.page.waitForSelector('.frame-card[data-card="level"]', {
      visible: true,
      timeout: 8_000,
    });
    await frameCardUp(opened.page);
    await expectText(
      opened.page,
      /The Granite: reached/i,
      "the Granite's card",
    );
    return opened;
  });
  await capture("slice-card-report-yard", async (viewport) => {
    const opened = await openAuditPage(viewport, sliceYardFullSave(Date.now()));
    await frameCardUp(opened.page);
    await expectText(opened.page, /Stockyard full/i, "the stockyard's report");
    return opened;
  });
  await capture("slice-card-opens", async (viewport) => {
    const opened = await openAuditPage(viewport, sliceRoofSave(Date.now()));
    await frameCardUp(opened.page);
    await press(opened.page, ".frame-card-key");
    await opened.page.waitForSelector('.frame-card[data-card="opens"]', {
      visible: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expectText(opened.page, /New site: the refinery/i, "refinery card");
    return opened;
  });
  await capture("slice-card-end", async (viewport) => {
    const opened = await openAuditPage(
      viewport,
      sliceWarehouseRoofSave(Date.now()),
    );
    await frameCardUp(opened.page);
    await press(opened.page, ".frame-card-key");
    await opened.page.waitForSelector('.frame-card[data-card="end"]', {
      visible: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expectText(opened.page, /planning its next building/i, "end card");
    return opened;
  });
  await capture("slice-ledger-busy", async (viewport) => {
    const opened = await openFrame(viewport, busy());
    await press(opened.page, ".frame-key");
    await sheetUp(opened.page, ".board-sheet.is-open .board-sheet-back");
    return opened;
  });
  await capture("ledger-start-over", async (viewport) => {
    const opened = await openFrame(viewport, busy());
    await press(opened.page, ".frame-key");
    await sheetUp(opened.page, ".board-sheet.is-open .board-sheet-back");
    await press(opened.page, ".ledger-start-over");
    await opened.page.waitForSelector(".ledger-start-over-page", {
      visible: true,
    });
    await expectText(opened.page, /Keep my mine/i, "start over");
    return opened;
  });
  await capture("saved-copies-earlier", async (viewport) => {
    const opened = await openFrame(viewport, busy(), "mine", {
      search: `${MEMORY}&copies=shelf`,
    });
    await press(opened.page, ".frame-key");
    await sheetUp(opened.page, ".board-sheet.is-open .board-sheet-back");
    await press(opened.page, ".ledger-saved-copies");
    await opened.page.waitForSelector(".saved-copies:not([hidden])");
    await cardRisen(opened.page, "copies");
    await opened.page.waitForFunction(
      () =>
        document.querySelectorAll(".saved-copy .save-conflict-play").length ===
        2,
      { timeout: 8_000 },
    );
    await expectText(opened.page, /Old phone/, "saved copies");
    return opened;
  });
  await capture("save-status-unsigned", async (viewport) => {
    const opened = await openAuditPage(viewport, undefined, {
      search: "",
      seedKey: SAVE_KEY,
    });
    await expectText(opened.page, /Sign in to save/, "unsigned");
    return opened;
  });
  await capture("save-status-session", async (viewport) => {
    const opened = await openAuditPage(viewport, busy().save, {
      search: "",
      seedKey: SAVE_KEY,
    });
    await expectText(opened.page, /Saved on this device/, "session");
    return opened;
  });
  await capture("save-status-loading", async (viewport) => {
    const opened = await openAuditPage(viewport, undefined, {
      search: "?save=loading",
      seedKey: SAVE_KEY,
    });
    await expectText(opened.page, /Loading your save/, "loading");
    return opened;
  });
  await capture("save-status-account", async (viewport) => {
    const opened = await openFrame(viewport, busy());
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
    const opened = await openAuditPage(viewport, undefined, {
      search: "?save=error",
      seedKey: SAVE_KEY,
    });
    await expectText(opened.page, /Couldn't reach your save/, "error");
    return opened;
  });
  await capture("save-drawer-error", async (viewport) => {
    // The save line opens its drawer: the facts, Close, and Try again (#370).
    const opened = await openAuditPage(viewport, undefined, {
      search: "?save=error",
      seedKey: SAVE_KEY,
    });
    await press(opened.page, ".save-status");
    await opened.page.waitForSelector(".board-save-drawer.is-open");
    // The drawer slides in steps(6) over 240ms.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await expectText(opened.page, /Nothing is lost/, "save drawer");
    return opened;
  });
  await capture("slice-card-two-saves", async (viewport) => {
    const opened = await openAuditPage(viewport, busy(), {
      search: `${MEMORY}&saves=two`,
    });
    await cardRisen(opened.page, "conflict");
    await expectText(opened.page, /Two saves found/i, "conflict");
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
      seed: { kind: "everyLoad", json: JSON.stringify(busy()) },
      seedKey: DEV_BACKUP_KEY,
      search: MEMORY,
      clock: { date: "real", tap: "real" },
      onPageError: (error) => {
        errors.push(String(error));
      },
    });
    const second = pages[1];
    await cardRisen(second, "other-tab");
    await expectText(second, /Playing in another tab/i, "other tab");
    return {
      page: second,
      errors,
      close,
    };
  });
  await capture("update-available", async (viewport) => {
    // The dev hook opens the card as a newer service worker would (#464).
    const opened = await openAuditPage(viewport, busy(), {
      search: `${MEMORY}&update=shown`,
    });
    await cardRisen(opened.page, "update");
    await expectText(opened.page, /Update available/i, "update");
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
