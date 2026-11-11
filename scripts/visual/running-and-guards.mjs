/* global console, document, setTimeout */
/** Running-now effects and the guards on each screen. */
import {
  effectSave,
  freshMountain,
  guardSave,
  lastStoneSave,
} from "../../tools/browser/fixtures.ts";
import { check, section } from "./registry.mjs";
import {
  SCREENS,
  press,
  KEY,
  SHELF_KEY,
  openScreen,
  noScroll,
  shot,
} from "./kit.mjs";

// The running countdowns (0, 1, 3, and every one at once) are lines in the
// Running now note the boost dial opens, and the note stays on the board (#370).
const EFFECT_VIEWS = SCREENS;

for (const viewport of EFFECT_VIEWS) {
  section(`section 23 (Running now) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    for (const count of [0, 1, 3, 12]) {
      const { page, close } = await openScreen(viewport, effectSave(count));
      await page.waitForSelector(".board-dial");
      await press(page, ".board-dial");
      await page
        .waitForSelector(".board-note.on .board-running", { timeout: 2_000 })
        .catch(() => undefined);
      const placed = await page.evaluate((count) => {
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
        const none =
          note.querySelector(".board-running-none")?.textContent ?? "";
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
      check(
        placed.ok,
        `${size} ${String(count)} running countdowns sit in the Running now note`,
      );
      if (!placed.ok) {
        console.log("running now", size, count, placed);
      }
      if (count === 1 || count === 3 || count >= 12) {
        await shot(page, `effects-${String(count)}-${size}`);
      }
      await close();
    }
  });
}

// #238: no screen moves the page. Lists inside a sheet may scroll; the page never does.
const GUARD_SIZES = SCREENS;
const GUARD_SCREENS = [
  ["main, fresh", () => freshMountain(), []],
  ["main, mid-game", () => guardSave(Date.now()), []],
  // Each door by its key on the rail (#373).
  ["buys", () => guardSave(Date.now()), [KEY("buys")]],
  ["upgrades", () => guardSave(Date.now()), [KEY("upgrades")]],
  ["workshop", () => guardSave(Date.now()), [KEY("workshop")]],
  ["engineers", () => guardSave(Date.now()), [KEY("engineers")]],
  ["relic shelf", () => guardSave(Date.now()), [".board-socket", SHELF_KEY]],
  ["save drawer", () => guardSave(Date.now()), [".save-status"]],
  ["menu", () => guardSave(Date.now()), [KEY("ledger")]],
  // A bay opens Buys; the Ready now plate buys the pick (#372).
  ["bays", () => guardSave(Date.now()), [".board-bay"]],
  ["ready", () => guardSave(Date.now()), [".board-ready"]],
  ["welcome", () => guardSave(Date.now() - 3 * 3_600_000), []],
  [
    "legacy",
    () => lastStoneSave(),
    [
      ".board-window",
      ".relic-reveal:not(.legend) .reveal-continue",
      ".legend .legend-pass",
    ],
  ],
];
for (const viewport of GUARD_SIZES) {
  // One section per screen: each opens its own page.
  for (const [name, save, taps] of GUARD_SCREENS) {
    section(
      `section 24 (no page scroll) ${JSON.stringify(viewport)} ${name}`,
      async () => {
        const size = `${String(viewport[0])}x${String(viewport[1])}`;
        {
          const { page, close } = await openScreen(viewport, save());
          let opened = true;
          for (const selector of taps) {
            opened = await page
              .waitForSelector(selector, { visible: true, timeout: 5_000 })
              .then(() => press(page, selector))
              .then(
                () => true,
                () => false,
              );
            await new Promise((resolve) => setTimeout(resolve, 300));
            if (!opened) {
              break;
            }
          }
          check(
            opened && (await noScroll(page)),
            `${size} ${name} opens without scrolling the page`,
          );
          await close();
        }
      },
    );
  }
}
