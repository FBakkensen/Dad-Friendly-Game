/* global console, innerWidth, innerHeight, getComputedStyle, document */
/** Notice and save sections: the welcome fold and craft notice, the other-tab card and the two-saves conflict sheet. */
import {
  noticeSave,
  playAwaySave,
  playCraftSave,
  toolHomeSave,
} from "../../tools/browser/fixtures.ts";
import { openPair } from "../../tools/browser/harness.ts";
import { undersizedTargets } from "../../src/ui-audit-measure.ts";
import { failures, check, section, table } from "./registry.mjs";
import {
  BASE,
  PHONE,
  PCS,
  press,
  cardRisen,
  pastSettle,
  browser,
  OPEN_SHEET,
  openSheet,
  boardProbe,
  openScreen,
  coversBoard,
  noScroll,
  shot,
} from "./kit.mjs";
import {
  CARD_LEGENDS,
  boardArtAt2x,
  boardContrast,
  boardGaps,
  boardTargets,
  boardTextSizes,
  cardFacts,
} from "./measure.mjs";

/**
 * Layer card, folded welcome, craft-done notice, and the four-chip line (#200).
 * Same sizes as the workshop check.
 */
const NOTICE_SIZES = [[424, 924]];

/**
 * Section 16's fold: a band crossed and a craft fitted while away, both on the welcome card.
 */
function foldSave(now) {
  return noticeSave({
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
  });
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
      // The board's floors (#464): text 13px or more, targets 48 tall.
      const typeOk =
        labels.length > 0 &&
        labels.every(
          (node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 13,
        );
      return {
        boxesOk:
          boxes.length > 0 &&
          boxes.every(
            (box) =>
              box.height >= 48 &&
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
      const { page, close } = await openScreen(
        viewport,
        noticeSave({ mined: 9_999_999, lastSeen: now }),
      );
      await page.tap(".board-window");
      await page.waitForSelector(".relic-reveal:not([hidden])", {
        timeout: 3_000,
      });
      await page.tap(".reveal-continue");
      await cardRisen(page, "layer");
      const fit = await fitOf(
        page,
        ".layer-arrival .board-card-face",
        "h2, p, button",
      );
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
      const { page, close } = await openScreen(viewport, foldSave(now));
      await page.waitForSelector(".welcome-layer", { timeout: 3_000 });
      await page.waitForSelector(".welcome-craft", { timeout: 3_000 });
      await cardRisen(page, "welcome");
      const fit = await fitOf(
        page,
        ".welcome-back .board-card-face",
        "h2, p, button",
      );
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
      const { page, close } = await openScreen(
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
      await cardRisen(page, "craft");
      const fit = await fitOf(
        page,
        ".craft-notice .board-card-face",
        "h2, button",
      );
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
      const { page, close } = await openScreen(
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
      // The material line is the Ledger's stones row (#375): its chips are read where he
      // sees them, in the open drawer, one line inside the row at 13px or more.
      await openSheet(page, "ledger");
      const fit = await page.$eval(
        `${OPEN_SHEET("ledger")} .ledger-stones`,
        (row) => {
          const info = row.querySelector(".board-row-info");
          if (info === null) {
            return { line: "", boxesOk: false, typeOk: false };
          }
          const box = info.getBoundingClientRect();
          const outer = row.getBoundingClientRect();
          const style = getComputedStyle(info);
          return {
            line: info.textContent ?? "",
            boxesOk:
              box.left >= outer.left - 0.5 &&
              box.right <= outer.right + 0.5 &&
              box.top >= outer.top - 0.5 &&
              box.bottom <= outer.bottom + 0.5 &&
              (info.scrollWidth <= info.clientWidth + 1 ||
                style.textOverflow === "ellipsis"),
            // In board px, as the board's own text check reads it.
            typeOk: Number.parseFloat(style.fontSize) >= 13,
          };
        },
      );
      const { line } = fit;
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
      const { page, close } = await openScreen(
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
    const [width, height] = PHONE;
    const {
      pages: [first, second],
      close,
    } = await openPair(browser, BASE, {
      viewport: { width, height, isMobile: true, hasTouch: true },
      seed: { kind: "none" },
      clock: { date: "real", tap: "real" },
      onPageError: (error) => {
        failures.push(`other tab: ${String(error)}`);
      },
      beforeLoad: boardProbe,
    });
    await second.waitForSelector(".other-tab:not([hidden])", {
      timeout: 5_000,
    });
    await cardRisen(second, "other-tab");
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
    // Past the card's settle: a finger in its first 400ms is the tap that opened it (#464).
    await pastSettle();
    await second.tap(".other-tab-play");
    await second.waitForSelector(".other-tab[hidden]", { timeout: 5_000 });
    await first.bringToFront();
    await first.waitForSelector(".other-tab:not([hidden])", { timeout: 5_000 });
    await cardRisen(first, "other-tab");
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
    await close();
  }
});

// Two saves found. The real sheet, no scrollbar in Chrome on the phone.
section("section 18 (line 2148)", async () => {
  {
    const { page, close } = await openScreen(
      PHONE,
      {},
      { search: "?saves=two" },
    );
    await page.waitForSelector(".save-conflict:not([hidden])", {
      timeout: 5_000,
    });
    await cardRisen(page, "conflict");
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
      ".save-conflict .board-card-face",
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
    await pastSettle();
    await page.click(".save-conflict-play");
    // The confirm is a new screen that settles again: a click on it at once commits nothing.
    await page.click(".save-conflict-commit");
    const stays = await page.$eval(
      ".save-conflict",
      (element) => element.hidden !== true,
    );
    check(stays, "424x924 a click on the confirm at once keeps the card up");
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

/**
 * The board cards (#464): each card that opens by itself, on the board card shell. The face
 * sits in the drawer's box and never scrolls, its plates are fat and focused as it opens, and
 * its words, art and contrast meet the board's floors.
 */
const CARD_SCENARIOS = [
  {
    name: "welcome",
    card: "welcome",
    focus: "welcome-continue",
    seed: playAwaySave,
  },
  {
    name: "welcome fold",
    card: "welcome",
    focus: "welcome-continue",
    seed: () => foldSave(Date.now()),
  },
  {
    name: "welcome find",
    card: "welcome",
    focus: "welcome-continue",
    seed: () => toolHomeSave(Date.now()),
  },
  {
    name: "layer",
    card: "layer",
    focus: "layer-dig",
    seed: () => noticeSave({ mined: 9_999_999, lastSeen: Date.now() }),
    // Through the dig that breaks into the Granite and the relic it uncovers.
    enter: async (page) => {
      await press(page, ".board-window");
      await page.waitForSelector(".relic-reveal:not([hidden])", {
        timeout: 3_000,
      });
      await press(page, ".reveal-continue");
    },
  },
  { name: "craft", card: "craft", focus: "craft-accept", seed: playCraftSave },
  // The cards that open when something happens: two saves, and a newer build (dev hooks).
  {
    name: "conflict",
    card: "conflict",
    focus: "save-conflict-play",
    seed: () => ({}),
    search: "?saves=two",
  },
  {
    name: "update",
    card: "update",
    focus: "update-reload",
    seed: () => ({}),
    search: "?update=shown",
  },
];

/** The other tab, at the phone only: a pair of tabs, the second shows the card (as section 17). */
const OTHER_TAB_SCENARIOS = [
  { name: "other tab", card: "other-tab", focus: "other-tab-play", pair: true },
];

/** Opens the pair and hands back the second tab, which waits on the first. */
async function openSecondTab([width, height]) {
  const {
    pages: [, second],
    close,
  } = await openPair(browser, BASE, {
    viewport: { width, height, isMobile: true, hasTouch: true },
    seed: { kind: "none" },
    clock: { date: "real", tap: "real" },
    onPageError: (error) => {
      failures.push(`other tab card: ${String(error)}`);
    },
    beforeLoad: boardProbe,
  });
  return { page: second, close };
}

/** The conflict's two sides: inside the face, 8px apart, fat, and no line spills. */
async function conflictSides(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const face = document.querySelector(
      ".board-card[data-card=conflict]:not([hidden]) .board-card-face",
    );
    const sides = [
      ...document.querySelectorAll(
        ".board-card[data-card=conflict]:not([hidden]) .save-card",
      ),
    ];
    if (face === null || sides.length !== 2) {
      return { ok: false, count: sides.length };
    }
    const px = (rect) => ({
      l: (rect.left - board.left) / board.scale,
      t: (rect.top - board.top) / board.scale,
      r: (rect.right - board.left) / board.scale,
      b: (rect.bottom - board.top) / board.scale,
    });
    const box = px(face.getBoundingClientRect());
    const [a, b] = sides.map((side) => px(side.getBoundingClientRect()));
    const inside = [a, b].every(
      (side) =>
        side.l >= box.l - 0.5 &&
        side.r <= box.r + 0.5 &&
        side.t >= box.t - 0.5 &&
        side.b <= box.b + 0.5,
    );
    const spills = sides.flatMap((side) =>
      [...side.querySelectorAll(".board-card-line")]
        .filter((line) => line.scrollWidth > line.clientWidth + 1)
        .map((line) => line.textContent),
    );
    return {
      ok: true,
      inside,
      gap: Math.round((b.l - a.r) * 10) / 10,
      heights: [a, b].map((side) => Math.round(side.b - side.t)),
      spills,
    };
  });
}
const OPEN_CARD = (card) => `.board-card[data-card="${card}"]:not([hidden])`;
const slug = (name) => name.replace(/\s+/g, "-");

const cardTable = (screens, scenarios) =>
  table({
    screens,
    scenarios,
    section: (viewport, scenario) =>
      `board cards ${JSON.stringify(viewport)} ${scenario.name}`,
    prefix: ({ size, scenario }) => `${size} ${scenario.name} card:`,
    open: async (viewport, scenario) => {
      const opened = scenario.pair
        ? await openSecondTab(viewport)
        : await openScreen(viewport, scenario.seed(), {
            search: scenario.search ?? "",
          });
      await scenario.enter?.(opened.page);
      await cardRisen(opened.page, scenario.card);
      return opened;
    },
    expect: [
      {
        run: async ({ page, size, scenario }) => {
          const facts = await cardFacts(page, scenario.card);
          if (!facts.ok || !facts.placed || !facts.fits || !facts.platesOk) {
            console.log(
              "card facts",
              size,
              scenario.name,
              JSON.stringify(facts),
            );
          }
          await shot(page, `card-${slug(scenario.name)}-${size}`);
          return [
            [
              await coversBoard(page, OPEN_CARD(scenario.card)),
              "shades the board down to the save line, the line on top",
            ],
            [await noScroll(page), "has no page scroll"],
            [
              facts.ok === true && facts.placed && facts.fits,
              `face sits in the drawer's box and does not scroll inside (${JSON.stringify(facts.box)})`,
            ],
            [
              facts.ok === true && facts.plates.length > 0 && facts.platesOk,
              "plates are 48 tall, inside the face",
            ],
            [
              facts.ok === true &&
                facts.focus.split(" ").includes(scenario.focus),
              `focuses .${scenario.focus} as it opens`,
            ],
          ];
        },
      },
      {
        run: async ({ page, size, scenario }) => {
          const targets = await boardTargets(page);
          // The plates, and the conflict's two sides.
          const own = targets.own.filter(
            (target) =>
              target.selector.startsWith(".board-platebtn ") ||
              target.selector.startsWith(".save-card "),
          );
          const under = undersizedTargets(own, 47.9);
          const close8 = boardGaps(targets);
          if (under.length > 0 || close8.length > 0) {
            console.log(
              "card targets",
              size,
              scenario.name,
              JSON.stringify({
                under: under.map((target) => target.selector),
                close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
              }),
            );
          }
          return [
            [
              own.length >= 1 && under.length === 0 && close8.length === 0,
              `${String(own.length)} targets are 48x48 board px, 8px from the next`,
            ],
          ];
        },
      },
      {
        run: async ({ page, size, scenario }) => {
          const text = await boardTextSizes(page, OPEN_CARD(scenario.card));
          const art = await boardArtAt2x(
            page,
            OPEN_CARD(scenario.card),
            OPEN_CARD(scenario.card),
          );
          if (text.small.length > 0 || art.misses.length > 0) {
            console.log(
              "card text and art",
              size,
              scenario.name,
              JSON.stringify({ small: text.small, misses: art.misses }),
            );
          }
          return [
            [
              text.small.length === 0 && text.count >= 2,
              `text is 13px or more (${String(text.count)} runs)`,
            ],
            [
              art.misses.length === 0 && art.count >= 2,
              `${String(art.count)} images and skins at exactly 2x`,
            ],
          ];
        },
      },
      {
        run: async ({ page, size, scenario }) => {
          const contrast = await boardContrast(page, CARD_LEGENDS.join(", "));
          const dim = contrast.filter((one) => one.pct < 4.5);
          if (dim.length > 0) {
            console.log(
              "card contrast",
              size,
              scenario.name,
              JSON.stringify(dim),
            );
          }
          return [
            [
              contrast.length >= 2 && dim.length === 0,
              `${String(contrast.length)} legends at 4.5:1 or more (lowest ${String(contrast.length === 0 ? "-" : Math.min(...contrast.map((one) => one.pct)))}:1 at p10/p90)`,
            ],
          ];
        },
      },
      {
        when: (at) => at.scenario.card === "conflict",
        run: async ({ page, size }) => {
          const sides = await conflictSides(page);
          if (!sides.ok || sides.spills.length > 0) {
            console.log("conflict sides", size, JSON.stringify(sides));
          }
          return [
            [
              sides.ok === true &&
                sides.inside &&
                Math.abs(sides.gap - 8) <= 0.5 &&
                sides.heights.every((height) => height >= 48) &&
                sides.spills.length === 0,
              `both sides sit inside the face, 8px apart, 48 tall, no line spilling (${JSON.stringify(sides.ok ? { gap: sides.gap, heights: sides.heights } : sides)})`,
            ],
          ];
        },
      },
    ],
  });

cardTable([PHONE, ...PCS], CARD_SCENARIOS);
cardTable([PHONE], OTHER_TAB_SCENARIOS);
