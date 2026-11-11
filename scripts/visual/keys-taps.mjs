/* global console, document, localStorage, requestAnimationFrame */
/** Key and drawer taps section: the tap rules and the drawer's motion. */
import {
  crewMountain,
  SAVE_KEY,
  savingMountain,
  openMountain,
} from "../../tools/browser/fixtures.ts";
import { stepTapClock } from "../../tools/browser/harness.ts";
import { check, section } from "./registry.mjs";
import {
  SCREENS,
  desks,
  press,
  KEY,
  SHEET,
  OPEN_SHEET,
  SHEET_BACK,
  openSheet,
  openScreen,
  storedMountain,
  framesPainted,
  noteAway,
  buysOpen,
  LAMP_X,
  keysDrawn,
  odometer,
} from "./kit.mjs";

/** A step of a held tap clock past a drawer's 400ms settle (board-interaction's DRAWER_SETTLE_MS). */
const PAST_SETTLE_MS = 500;

/** A tap at a board point (board px), the way a finger lands there. */
async function tapBoard(page, x, y) {
  const at = await page.evaluate(
    (bx, by) => {
      const board = globalThis.__board();
      return {
        x: board.left + bx * board.scale,
        y: board.top + by * board.scale,
      };
    },
    x,
    y,
  );
  if (desks.get(page) === true) {
    await page.mouse.click(at.x, at.y);
  } else {
    await page.touchscreen.tap(at.x, at.y);
  }
}

/** Every shown part of an open drawer's list: its top and height in board px. */
const listBoxes = (page, name) =>
  page.$eval(`${OPEN_SHEET(name)} .board-sheet-list`, (list) => {
    const board = globalThis.__board();
    const px = (value) => Math.round((value / board.scale) * 10) / 10;
    return [...list.children]
      .filter((child) => !child.hidden && child.getClientRects().length > 0)
      .map((child) => {
        const box = child.getBoundingClientRect();
        return { top: px(box.top - board.top), height: px(box.height) };
      });
  });

for (const viewport of SCREENS) {
  section(`keys and drawers ${JSON.stringify(viewport)} taps`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} keys and drawers:`;
    // The tap rules (a key's double tap, a second tap inside the Done hold,
    // rows that hold their places, no red under reduced motion) are unit tests
    // on the mounted screen. Here each family of controls is wired once, in
    // Chrome. The board's tap clock is held, and the check steps it past the
    // settle where a finger would wait.

    // Rows: a finger tap on the cart row after the settle buys one and shows
    // Done. The "i" shows the how cards; their Back brings the list back.
    {
      const { page, close } = await openScreen(viewport, crewMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await keysDrawn(page);
      await noteAway(page);
      await openSheet(page, "buys");
      await stepTapClock(page, PAST_SETTLE_MS);
      const before = await storedMountain(page);
      const boxesBefore = await listBoxes(page, "buys");
      const cart = `${OPEN_SHEET("buys")} .tier[data-tier="cart"]`;
      await press(page, cart);
      const done = await page
        .waitForFunction(
          (selector) => {
            const row = document.querySelector(selector);
            return (
              row?.classList.contains("is-held") === true &&
              row.querySelector(".board-row-verb")?.textContent === "Done"
            );
          },
          { timeout: 2_000 },
          cart,
        )
        .then(
          () => true,
          () => false,
        );
      const bought = await page
        .waitForFunction(
          (key, carts) =>
            JSON.parse(localStorage.getItem(key) ?? "{}").mountain?.carts ===
            carts,
          { timeout: 2_000 },
          SAVE_KEY,
          before.carts + 1,
        )
        .then(
          () => true,
          () => false,
        );
      check(
        done && bought,
        `${label} early: a finger tap on the cart row after the settle buys one cart and shows Done`,
      );
      // Read once Done is painted: no row's top or height moved under the finger.
      const boxesAfter = await listBoxes(page, "buys");
      const moved = JSON.stringify(boxesAfter) !== JSON.stringify(boxesBefore);
      check(
        done && boxesBefore.length >= 3 && !moved,
        `${label} early: the buy moves no row in the drawer (${String(boxesBefore.length)} parts, tops and heights unchanged)`,
      );
      if (moved) {
        console.log("moved rows", size, boxesBefore, boxesAfter);
      }
      await press(page, `${OPEN_SHEET("buys")} .board-sheet-info`);
      const cards = await page
        .waitForSelector(`${OPEN_SHEET("buys")} .teach-how`, {
          visible: true,
          timeout: 2_000,
        })
        .then(
          () => true,
          () => false,
        );
      // The cards settle as they come in, as the drawer did.
      await stepTapClock(page, PAST_SETTLE_MS);
      await press(
        page,
        `${OPEN_SHEET("buys")} .board-sheet-how .teach-how-back:not([hidden])`,
      );
      const restored = await page
        .waitForFunction(
          (selector) => {
            const sheet = document.querySelector(selector);
            return (
              sheet?.querySelector(".board-sheet-list")?.hidden === false &&
              sheet.querySelector(".board-sheet-how")?.hidden === true
            );
          },
          { timeout: 2_000 },
          OPEN_SHEET("buys"),
        )
        .then(
          () => true,
          () => false,
        );
      check(
        cards && restored,
        `${label} early: the "i" shows the how cards, and their Back restores the list`,
      );
      await close();
    }

    // Saving: a tap on a row he cannot afford spends nothing and its lamp
    // reads red within 200ms. Timed on the browser's own stamps (the click's
    // and each frame's), since the tap clock is held.
    {
      const { page, close } = await openScreen(viewport, savingMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await keysDrawn(page);
      await noteAway(page);
      await openSheet(page, "buys");
      await stepTapClock(page, PAST_SETTLE_MS);
      const odoBefore = await odometer(page);
      const before = await storedMountain(page);
      const dear = `${OPEN_SHEET("buys")} .tier.is-dear[data-tier="cart"]`;
      const watch = page.evaluate(
        (selector, red) =>
          new Promise((resolve) => {
            const row = document.querySelector(selector);
            const lamp = row?.querySelector(".board-lamp");
            let started;
            let at;
            row?.addEventListener(
              "click",
              (event) => {
                at = event.timeStamp;
              },
              { once: true },
            );
            const look = (frame) => {
              started ??= frame;
              if (at !== undefined && lamp?.style.backgroundPositionX === red) {
                resolve(frame - at);
                return;
              }
              if (frame - started > 3_000) {
                resolve(Infinity);
                return;
              }
              requestAnimationFrame(look);
            };
            requestAnimationFrame(look);
          }),
        dear,
        LAMP_X.red,
      );
      await press(page, dear);
      const redAfter = await watch;
      const after = await storedMountain(page);
      check(
        redAfter <= 200 &&
          after.pocket === before.pocket &&
          after.carts === before.carts &&
          (await odometer(page)) === odoBefore,
        `${label} saving: a tap on a dear row spends nothing and its lamp reads red within 200ms (${String(Math.round(redAfter))}ms)`,
      );
      await close();
    }

    // The ways out: a scrim tap, a scrim tap over a relic socket (which then
    // shows the relic's note), and Escape.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await keysDrawn(page);
      await noteAway(page);
      await openSheet(page, "buys");
      await stepTapClock(page, PAST_SETTLE_MS);
      // A spot on the board above the drawer, off every socket: under the
      // odometer, at the left.
      await tapBoard(page, 24, 170);
      await page
        .waitForSelector(`${SHEET("buys")}:not(.is-open)`, { timeout: 2_000 })
        .catch(() => undefined);
      const shut = !(await buysOpen(page));
      const noNote = (await page.$(".board-note.on")) === null;
      check(shut && noNote, `${label} a scrim tap closes the drawer`);

      await openSheet(page, "buys");
      await stepTapClock(page, PAST_SETTLE_MS);
      const socket = await page.$eval(".board-socket", (el) => {
        const board = globalThis.__board();
        const b = el.getBoundingClientRect();
        return {
          x: ((b.left + b.right) / 2 - board.left) / board.scale,
          y: ((b.top + b.bottom) / 2 - board.top) / board.scale,
        };
      });
      await tapBoard(page, socket.x, socket.y);
      const note = await page
        .waitForSelector(".board-note.on", { timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      check(
        !(await buysOpen(page)) && note,
        `${label} a scrim tap on a socket closes the drawer and shows the relic's note`,
      );
      await noteAway(page);

      await openSheet(page, "upgrades");
      await page.keyboard.press("Escape");
      const escaped = await page
        .waitForSelector(`${SHEET("upgrades")}:not(.is-open)`, {
          timeout: 2_000,
        })
        .then(
          () => true,
          () => false,
        );
      check(escaped, `${label} Escape closes the drawer`);
      await close();
    }

    // A finger that shuts Buys by its Back and taps again at once, at the
    // same spot, meets the key under Back, which waits out the settle the
    // close started; past it, a tap there opens that key.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await keysDrawn(page);
      await noteAway(page);
      await openSheet(page, "buys");
      await stepTapClock(page, PAST_SETTLE_MS);
      const back = await page.$eval(SHEET_BACK("buys"), (el) => {
        const board = globalThis.__board();
        const b = el.getBoundingClientRect();
        return {
          x: ((b.left + b.right) / 2 - board.left) / board.scale,
          y: ((b.top + b.bottom) / 2 - board.top) / board.scale,
        };
      });
      await press(page, SHEET_BACK("buys"));
      const shut = await page
        .waitForFunction(
          (selector) => {
            const sheet = document.querySelector(selector);
            return (
              sheet !== null &&
              !sheet.classList.contains("is-open") &&
              sheet.getAnimations().length === 0
            );
          },
          { timeout: 2_000 },
          SHEET("buys"),
        )
        .then(
          () => true,
          () => false,
        );
      const under = await page.evaluate(({ x, y }) => {
        const board = globalThis.__board();
        return (
          document
            .elementFromPoint(
              board.left + x * board.scale,
              board.top + y * board.scale,
            )
            ?.closest(".board-key")
            ?.getAttribute("data-key") ?? "nothing"
        );
      }, back);
      const engineersShown = () =>
        page.$eval(".engineers-dialog", (dialog) => !dialog.hidden);
      await tapBoard(page, back.x, back.y);
      await framesPainted(page, 2);
      const early =
        (await page.$(".board-sheet.is-open")) === null &&
        !(await engineersShown());
      await stepTapClock(page, PAST_SETTLE_MS);
      await tapBoard(page, back.x, back.y);
      const opened = await page
        .waitForSelector(".engineers-dialog:not([hidden])", { timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      check(
        shut && under === "engineers" && early && opened,
        `${label} a finger tap at once where Buys' Back was opens nothing; past the settle it opens the key under it (${under})`,
      );
      if (!shut || !early || !opened) {
        console.log("tap under Back", size, { shut, under, early, opened });
      }
      await close();
    }

    // Reduced motion: a drawer is all the way open in the first frame after
    // the tap. Without it, the drawer is still sliding in that frame.
    for (const reducedMotion of [false, true]) {
      const { page, close } = await openScreen(viewport, savingMountain(), {
        reducedMotion,
        stopClock: true,
      });
      await keysDrawn(page);
      await noteAway(page);
      const firstFrame = await page.evaluate(
        (key, sheetSelector) =>
          new Promise((resolve) => {
            document.querySelector(key)?.click();
            requestAnimationFrame(() => {
              const board = globalThis.__board();
              const sheet = document.querySelector(sheetSelector);
              const top = sheet?.getBoundingClientRect().top ?? 0;
              resolve((top - board.top) / board.scale);
            });
          }),
        KEY("buys"),
        SHEET("buys"),
      );
      if (reducedMotion) {
        check(
          Math.abs(firstFrame - 178) <= 0.5,
          `${label} under reduced motion the drawer is fully open in the first frame (${String(Math.round(firstFrame))})`,
        );
      } else {
        check(
          firstFrame > 178.5,
          `${label} without reduced motion the drawer is still sliding in the first frame (${String(Math.round(firstFrame))})`,
        );
      }
      await close();
    }
  });
}
