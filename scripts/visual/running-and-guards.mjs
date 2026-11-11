/* global console, document */
/** Running-now and no-scroll sections: the countdowns in the Running now note, and no screen scrolling the page. */
import {
  effectSave,
  freshMountain,
  guardSave,
  lastStoneSave,
} from "../../tools/browser/fixtures.ts";
import { table } from "./registry.mjs";
import {
  SCREENS,
  press,
  KEY,
  SHELF_KEY,
  openScreen,
  noScroll,
  shot,
  sheetSettled,
  clickHandled,
} from "./kit.mjs";

// The running countdowns (0, 1, 3, and every one at once) are lines in the
// Running now note the boost dial opens, and the note stays on the board (#370).
const EFFECT_VIEWS = SCREENS;

/** The Running now note's countdown chips: packed, labelled, inside the note, the note on the board. */
async function runningFacts(page, count) {
  return page.evaluate((count) => {
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
    const none = note.querySelector(".board-running-none")?.textContent ?? "";
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
}

table({
  per: "screen",
  screens: EFFECT_VIEWS,
  scenarios: [0, 1, 3, 12],
  section: (viewport) => `section 23 (Running now) ${JSON.stringify(viewport)}`,
  prefix: ({ size }) => size,
  open: async (viewport, count) => {
    const opened = await openScreen(viewport, effectSave(count));
    await opened.page.waitForSelector(".board-dial");
    await press(opened.page, ".board-dial");
    await opened.page
      .waitForSelector(".board-note.on .board-running", { timeout: 2_000 })
      .catch(() => undefined);
    return opened;
  },
  expect: [
    {
      run: async ({ page, size, scenario: count }) => {
        const placed = await runningFacts(page, count);
        if (!placed.ok) {
          console.log("running now", size, count, placed);
        }
        if (count === 1 || count === 3 || count >= 12) {
          await shot(page, `effects-${String(count)}-${size}`);
        }
        return [
          [
            placed.ok,
            `${String(count)} running countdowns sit in the Running now note`,
          ],
        ];
      },
    },
  ],
});

// #238: no screen moves the page. Lists inside a sheet may scroll; the page never does.
const GUARD_SIZES = SCREENS;
/** What a tap opened, once it has finished opening; false when it never does. */
const shown = (selector) => (page) =>
  page
    .waitForSelector(`${selector}:not([hidden])`, {
      visible: true,
      timeout: 5_000,
    })
    .then(
      () => true,
      () => false,
    );
const drawer = (name) => (page) => sheetSettled(page, name);
const saveDrawerOpen = (page) =>
  page
    .waitForFunction(
      () => {
        const sheet = document.querySelector(".board-save-drawer");
        return (
          sheet !== null &&
          sheet.classList.contains("is-open") &&
          sheet.getAnimations().length === 0
        );
      },
      { timeout: 5_000 },
    )
    .then(
      () => true,
      () => false,
    );
/**
 * Each screen, its save, the taps that open it, and what shows once it is
 * open. A row with no `shows` (Ready now buys and opens nothing) waits only
 * for its last tap to be handled.
 */
const GUARD_SCREENS = [
  { name: "main, fresh", save: () => freshMountain(), taps: [] },
  { name: "main, mid-game", save: () => guardSave(Date.now()), taps: [] },
  // Each door by its key on the rail (#373).
  {
    name: "buys",
    save: () => guardSave(Date.now()),
    taps: [KEY("buys")],
    shows: drawer("buys"),
  },
  {
    name: "upgrades",
    save: () => guardSave(Date.now()),
    taps: [KEY("upgrades")],
    shows: drawer("upgrades"),
  },
  {
    name: "workshop",
    save: () => guardSave(Date.now()),
    taps: [KEY("workshop")],
    shows: shown(".workshop-dialog"),
  },
  {
    name: "engineers",
    save: () => guardSave(Date.now()),
    taps: [KEY("engineers")],
    shows: shown(".engineers-dialog"),
  },
  {
    name: "relic shelf",
    save: () => guardSave(Date.now()),
    taps: [".board-socket", SHELF_KEY],
    shows: shown(".shelf-dialog"),
  },
  {
    name: "save drawer",
    save: () => guardSave(Date.now()),
    taps: [".save-status"],
    shows: saveDrawerOpen,
  },
  {
    name: "menu",
    save: () => guardSave(Date.now()),
    taps: [KEY("ledger")],
    shows: shown(".game-menu"),
  },
  // A bay opens Buys; the Ready now plate buys the pick (#372).
  {
    name: "bays",
    save: () => guardSave(Date.now()),
    taps: [".board-bay"],
    shows: drawer("buys"),
  },
  { name: "ready", save: () => guardSave(Date.now()), taps: [".board-ready"] },
  {
    name: "welcome",
    save: () => guardSave(Date.now() - 3 * 3_600_000),
    taps: [],
  },
  {
    name: "legacy",
    save: () => lastStoneSave(),
    taps: [
      ".board-window",
      ".relic-reveal:not(.legend) .reveal-continue",
      ".legend .legend-pass",
    ],
    shows: shown(".legacy-dialog"),
  },
];

/**
 * Taps through to a screen: each tap waits for its target, the last for the
 * tap to be handled and for what it opens. False when any of it never comes.
 */
async function tapThrough(page, { taps, shows }) {
  for (const [index, selector] of taps.entries()) {
    const found = await page
      .waitForSelector(selector, { visible: true, timeout: 5_000 })
      .then(
        () => true,
        () => false,
      );
    if (!found) {
      return false;
    }
    const handled =
      index === taps.length - 1 ? await clickHandled(page) : undefined;
    await press(page, selector);
    if (handled !== undefined && !(await handled())) {
      return false;
    }
  }
  return taps.length === 0 || shows === undefined || shows(page);
}

table({
  screens: GUARD_SIZES,
  scenarios: GUARD_SCREENS,
  section: (viewport, { name }) =>
    `section 24 (no page scroll) ${JSON.stringify(viewport)} ${name}`,
  prefix: ({ size, scenario }) => `${size} ${scenario.name}`,
  open: (viewport, scenario) => openScreen(viewport, scenario.save()),
  expect: [
    {
      run: async ({ page, scenario }) => [
        [
          (await tapThrough(page, scenario)) && (await noScroll(page)),
          "opens without scrolling the page",
        ],
      ],
    },
  ],
});
