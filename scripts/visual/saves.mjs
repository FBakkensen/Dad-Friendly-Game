/* global console, document, localStorage */
/**
 * The save on the frame (#664): the save line in each of its words and its
 * drawer, and the cards that keep the save safe (#707): two saves, an
 * update, a later build's save, and the other tab, at both phone heights.
 * The frame's saves are the dev account's phone backup, on a memory save.
 */
import {
  asGuest,
  DEV_BACKUP_KEY,
  DEV_UID,
  newerSave,
  sliceBusySave,
} from "../../tools/browser/fixtures.ts";
import { openPair } from "../../tools/browser/harness.ts";
import { undersizedTargets } from "../../src/ui-audit-measure.ts";
import { failures, check, section, table } from "./registry.mjs";
import {
  BASE,
  PHONE,
  press,
  cardRisen,
  browser,
  boardProbe,
  openScreen,
  coversBoard,
  noScroll,
  saveDrawerSettled,
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

const MEMORY = "?memorySave=1";

const CARD_SCENARIOS = [
  {
    name: "slice conflict",
    card: "conflict",
    focus: "save-conflict-play",
    seed: () => sliceBusySave(Date.now()),
    seedKey: DEV_BACKUP_KEY,
    search: `${MEMORY}&saves=two`,
  },
  {
    name: "slice update",
    card: "update",
    focus: "update-reload",
    seed: () => sliceBusySave(Date.now()),
    seedKey: DEV_BACKUP_KEY,
    search: `${MEMORY}&update=shown`,
  },
  {
    name: "slice newer save",
    card: "update",
    focus: "update-reload",
    seed: () => ({ uid: DEV_UID, save: newerSave(Date.now()) }),
    seedKey: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  {
    name: "slice other tab",
    card: "other-tab",
    focus: "other-tab-play",
    pair: true,
    search: MEMORY,
  },
];

/**
 * The save line's words: a guest on a first open, a guest's save on this
 * phone, the dev account, a save still loading, and one out of reach.
 */
const SAVE_LINES = [
  { name: "sign in", seed: () => ({}), search: "", words: "Sign in to save" },
  {
    name: "this device",
    seed: () => asGuest(sliceBusySave(Date.now())),
    search: "",
    words: "Saved on this device",
  },
  {
    name: "account",
    seed: () => sliceBusySave(Date.now()),
    seedKey: DEV_BACKUP_KEY,
    search: MEMORY,
    words: "Saved to your account",
  },
  {
    name: "loading",
    seed: () => ({}),
    search: "?save=loading",
    words: "Loading your save...",
  },
  {
    name: "unreachable",
    seed: () => ({}),
    search: "?save=error",
    words: "Couldn't reach your save",
  },
];

/** The save drawer slides up over the frame, and the save line stays on top. */
async function saveDrawerFacts(page) {
  await press(page, ".save-status");
  await saveDrawerSettled(page);
  return page.evaluate(() => {
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
    return {
      ok:
        sheet.classList.contains("is-open") &&
        box.top >= board.top - 0.5 &&
        box.bottom <= lineBox.top + 0.5 &&
        lineBox.bottom <= board.bottom + 0.5 &&
        hit !== null &&
        line.contains(hit),
      box: [box.left, box.top, box.right, box.bottom].map(Math.round),
    };
  });
}

for (const viewport of [PHONE, [424, 830]]) {
  const size = `${String(viewport[0])}x${String(viewport[1])}`;
  for (const scenario of SAVE_LINES) {
    section(`slice frame save line ${size} ${scenario.name}`, async () => {
      const at = `${size} save line, ${scenario.name}:`;
      const { page, close } = await openScreen(viewport, scenario.seed(), {
        search: scenario.search,
        seedKey: scenario.seedKey,
      });
      try {
        await page.waitForSelector(".frame-next-line");
        const said = await page
          .waitForFunction(
            (words) =>
              (
                document.querySelector(".save-status")?.textContent ?? ""
              ).includes(words),
            { timeout: 8_000 },
            scenario.words,
          )
          .then(
            () => true,
            () => false,
          );
        check(said, `${at} the save line reads "${scenario.words}"`);
        check(await noScroll(page), `${at} the page does not scroll`);
        await shot(
          page,
          `slice-save-${scenario.name.replace(/\s+/g, "-")}-${size}`,
        );
        const drawer = await saveDrawerFacts(page);
        if (!drawer.ok) {
          console.log(
            "save drawer",
            size,
            scenario.name,
            JSON.stringify(drawer),
          );
        }
        check(
          drawer.ok === true,
          `${at} its drawer opens above the line, and the line stays on top`,
        );
      } finally {
        await close();
      }
    });
  }
}

/** Opens the pair and hands back the second tab, which waits on the first. */
async function openSecondTab([width, height], search = "") {
  const {
    pages: [, second],
    close,
  } = await openPair(browser, BASE, {
    viewport: { width, height, isMobile: true, hasTouch: true },
    seed: { kind: "none" },
    clock: { date: "real", tap: "real" },
    search,
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
        ? await openSecondTab(viewport, scenario.search)
        : await openScreen(viewport, scenario.seed(), {
            search: scenario.search ?? "",
            seedKey: scenario.seedKey,
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
        when: (at) => at.scenario.name.endsWith("newer save"),
        run: async ({ page, scenario }) => {
          const kept = await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
            scenario.seedKey,
          );
          // The dev account's phone backup keeps the save under its uid.
          const stored = kept?.save ?? kept;
          return [
            [
              stored?.version === 10 && stored.game !== undefined,
              `a later build's save is left as it was (${JSON.stringify(stored)})`,
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

cardTable([PHONE, [424, 830]], CARD_SCENARIOS);
