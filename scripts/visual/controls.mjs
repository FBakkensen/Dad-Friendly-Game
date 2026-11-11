/* global console, document, localStorage, requestAnimationFrame */
/** Controls sections: each family of board controls wired once, in Chrome, and the press look. */
import {
  crewMountain,
  openMountain,
  heartMountain,
  savingMountain,
  SAVE_KEY,
} from "../../tools/browser/fixtures.ts";
import { stepTapClock } from "../../tools/browser/harness.ts";
import { check, section } from "./registry.mjs";
import {
  PHONE,
  PCS,
  SCREENS,
  desks,
  press,
  KEY,
  SHEET,
  OPEN_SHEET,
  SHEET_BACK,
  openSheet,
  openScreen,
  baysDrawn,
  storedMountain,
  holdThrough,
  framesPainted,
  clickHandled,
  noteAway,
  buysOpen,
  LAMP_X,
  keysDrawn,
} from "./kit.mjs";
import { boardTargets } from "./measure.mjs";

// One wiring check per control family (#441), each pressed by a real finger
// (or the mouse) in Chrome: a rail key, a drawer row's buy, the ways out of a
// drawer, the "i" cards, Ready now, an open bay, a troubled bay's fix and the
// red button, and the drawer's first frame under reduced motion. The decisions
// behind them (double taps, holds, settles, blinks) are unit tests. Then the
// press look (#432): a held rail key shows is-down, and its rest frame after
// the lift, at the phone and one PC size.

/** A step of a held tap clock past a drawer's 400ms settle (board-interaction's DRAWER_SETTLE_MS). */
const PAST_SETTLE_MS = 500;
const PRESS_SIZES = [PHONE, PCS[0]];
const KEY_CAP = `${KEY("buys")} .board-key-cap`;

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

/** The words a bay, the plate or the red button shows, by selector. */
async function textOf(page, selector) {
  return page
    .$eval(selector, (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .catch(() => undefined);
}

/** The cap's frame offset, as the key wrote it. */
const frameOf = (page, selector) =>
  page.$eval(selector, (el) => el.style.backgroundPositionX);

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

    // The ways out: a scrim tap over a relic socket closes the drawer and
    // then shows the relic's note.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await keysDrawn(page);
      await noteAway(page);
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
      // The tap is handled (its click dispatched, the next frame reached, one
      // more painted) before nothing having opened counts.
      const handled = await clickHandled(page);
      await tapBoard(page, back.x, back.y);
      const landed = await handled();
      await framesPainted(page, 1);
      const early =
        landed &&
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
        console.log("tap under Back", size, {
          shut,
          under,
          landed,
          early,
          opened,
        });
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

for (const viewport of SCREENS) {
  section(`bays and ready ${JSON.stringify(viewport)} taps`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} bays and ready:`;
    const cartFlaps = (page) =>
      page.$eval('.board-bay[data-tier="cart"]', (bay) =>
        Number(
          [...bay.querySelectorAll(".board-flap-d")]
            .map((digit) => digit.textContent ?? "")
            .join(""),
        ),
      );

    // The tap rules (a double tap on the plate, a bay or Saving for, the Done
    // hold, a hold on a troubled bay, a tap inside a drawer's settle) are unit
    // tests on the board's model and the mounted screen. Here each family of
    // controls is wired once, in Chrome, with the board's tap clock held so no
    // press is early by load.

    // Ready now: a tap buys exactly one cart for one price and paints Done.
    {
      const { page, close } = await openScreen(viewport, crewMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      await noteAway(page);
      const kickBefore = await textOf(page, ".board-ready-kick");
      const mainBefore = (await textOf(page, ".board-ready-main")) ?? "";
      // "Buy a cart · 5,868": the price the plate offers, in whole stones.
      const price = Number(
        (mainBefore.split(" · ")[1] ?? "").replaceAll(",", ""),
      );
      const flapsBefore = await cartFlaps(page);
      const storedBefore = await storedMountain(page);
      await press(page, ".board-ready");
      const done = await page
        .waitForFunction(
          () =>
            (
              document.querySelector(".board-ready-kick")?.textContent ?? ""
            ).trim() === "Done",
          { timeout: 2_000 },
        )
        .then(
          () => true,
          () => false,
        );
      await page
        .waitForFunction(
          (key, carts) =>
            JSON.parse(localStorage.getItem(key) ?? "{}").mountain?.carts ===
            carts,
          { timeout: 2_000 },
          SAVE_KEY,
          storedBefore.carts + 1,
        )
        .catch(() => undefined);
      const flapsAfter = await cartFlaps(page);
      const storedAfter = await storedMountain(page);
      const spent = storedBefore.pocket - storedAfter.pocket;
      check(
        kickBefore === "Ready now" &&
          flapsAfter - flapsBefore === 1 &&
          storedAfter.carts - storedBefore.carts === 1 &&
          Number.isFinite(price) &&
          price > 0 &&
          spent === price &&
          done,
        `${label} a tap on Ready now buys exactly one cart for one price (${String(spent)} of ${String(price)}) and shows Done`,
      );
      if (flapsAfter - flapsBefore !== 1 || !done || spent !== price) {
        console.log("plate tap", size, {
          kickBefore,
          mainBefore,
          flapsBefore,
          flapsAfter,
          storedBefore,
          storedAfter,
          done,
        });
      }
      await close();
    }

    // An open bay: a tap opens Buys and spends nothing.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      await noteAway(page);
      const storedBefore = await storedMountain(page);
      await press(page, '.board-bay[data-tier="cart"]');
      const opened = await page
        .waitForSelector(OPEN_SHEET("buys"), { timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      const storedAfter = await storedMountain(page);
      const kept = ["pocket", "carts", "drills", "borers", "helpers"].every(
        (field) => storedAfter[field] === storedBefore[field],
      );
      check(
        opened && kept,
        `${label} a tap on an open bay opens Buys and spends nothing`,
      );
      if (!opened || !kept) {
        console.log(
          "bay tap",
          size,
          JSON.stringify({ opened, storedBefore, storedAfter }),
        );
      }
      await close();
    }

    // Trouble on the cart bay: a red lamp and Hold to fix. Five taps fix it
    // with Buys shut, and the thanks note lets taps through to the bay
    // under it.
    {
      const troubled = '.board-bay[data-tier="cart"][data-trouble="cave-in"]';
      const { page, close } = await openScreen(viewport, openMountain(), {
        search: "?trouble=cave-in",
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      const shown = await page
        .waitForSelector(troubled, { timeout: 3_000 })
        .then(
          () => true,
          () => false,
        );
      const lamp = await page
        .$eval(`${troubled} .board-lamp`, (el) => el.style.backgroundPositionX)
        .catch(() => "");
      const sub = await textOf(page, `${troubled} .board-bay-sub`);
      check(
        shown && lamp === LAMP_X.red && (sub ?? "").endsWith("Hold to fix"),
        `${label} the troubled cart bay shows its red lamp and Hold to fix`,
      );
      for (let tap = 0; tap < 5; tap += 1) {
        await press(page, '.board-bay[data-tier="cart"]');
      }
      const fixed = await page
        .waitForFunction(
          () =>
            document
              .querySelector('.board-bay[data-tier="cart"]')
              ?.hasAttribute("data-trouble") === false,
          { timeout: 2_000 },
        )
        .then(
          () => true,
          () => false,
        );
      await framesPainted(page, 2);
      const shut = !(await buysOpen(page));
      check(
        fixed && shut,
        `${label} five taps fix the troubled bay with Buys shut`,
      );
      // The thanks note is up; the bays under it are still what a finger meets.
      const thanks = await page.evaluate(() => {
        const note = document.querySelector(".board-note.on");
        const thanked = note?.querySelector(".board-thanks") !== null;
        const reach = [...document.querySelectorAll(".board-bay")].map(
          (bay) => {
            const b = bay.getBoundingClientRect();
            const hit = document.elementFromPoint(
              (b.left + b.right) / 2,
              (b.top + b.bottom) / 2,
            );
            return hit !== null && bay.contains(hit);
          },
        );
        return { thanked: note !== null && thanked, reach };
      });
      const underThanks = await boardTargets(page);
      const baysMeasured = underThanks.own.filter((target) =>
        target.selector.startsWith(".board-bay "),
      ).length;
      check(
        thanks.thanked && thanks.reach.every(Boolean) && baysMeasured === 3,
        `${label} under the thanks note every bay is still in reach and measured`,
      );
      if (!thanks.thanked || baysMeasured !== 3) {
        console.log("thanks note", size, { ...thanks, baysMeasured });
      }
      await close();
    }
    // The red button digs exactly the tap's yield, and the window shows it.
    {
      const start = heartMountain();
      const { page, close } = await openScreen(
        viewport,
        { ...start, mountain: { ...start.mountain, pocket: 0 } },
        { stopClock: true },
      );
      await page.waitForSelector(".board-dig-button:not(:disabled)");
      const before = (await storedMountain(page)).pocket;
      const yieldWords = await page.$eval(
        ".board-dig-button",
        (button) => button.getAttribute("aria-label") ?? "",
      );
      const match = /tap to mine (one stone|([\d,.]+) stones)$/.exec(
        yieldWords,
      );
      const each =
        match === null
          ? NaN
          : match[2] === undefined
            ? 1
            : Number(match[2].replace(/,/g, ""));
      await press(page, ".board-dig-button");
      // The dig is in the stored save before it is read.
      await page
        .waitForFunction(
          (key, was) =>
            JSON.parse(localStorage.getItem(key) ?? "{}").mountain?.pocket !==
            was,
          { timeout: 2_000 },
          SAVE_KEY,
          before,
        )
        .catch(() => undefined);
      const after = (await storedMountain(page)).pocket;
      const shown = await page.evaluate(() => ({
        odo: document.querySelector(".board-odo")?.getAttribute("aria-label"),
        legend: (document.querySelector(".board-dig-lg")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        plus: document.querySelector(".board-dig-plus")?.textContent,
      }));
      const plus = `+${match?.[2] ?? "1"}`;
      check(
        Number.isFinite(each) &&
          after - before === each &&
          shown.odo === `Stones ${Math.floor(after).toLocaleString("en-US")}` &&
          shown.legend === `By hand · ${plus}` &&
          shown.plus === plus,
        `${label} the red button digs the tap's ${String(each)}, reads By hand · ${plus}, and the window shows ${plus}`,
      );
      if (after - before !== each || shown.plus !== plus) {
        console.log("red button", size, { yieldWords, before, after, shown });
      }
      await close();
    }
  });
}

for (const viewport of PRESS_SIZES) {
  section(`press looks ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} press looks:`;

    // A rail key: is-down while held, back to its rest frame after the lift.
    const { page, close } = await openScreen(viewport, openMountain(), {
      stopClock: true,
      tapClock: "held",
    });
    await page.waitForSelector(`${KEY("buys")}:not(:disabled)`, {
      visible: true,
    });
    await noteAway(page);
    const restFrame = await frameOf(page, KEY_CAP);
    const held = await holdThrough(
      page,
      KEY("buys"),
      (selector) =>
        document.querySelector(selector)?.classList.contains("is-down") ===
        true,
    );
    const during = held ? "is-down" : "not down";
    // The lift repaints the cap as it takes is-down off.
    const upAfter = await page
      .waitForFunction(
        (selector) =>
          document.querySelector(selector)?.classList.contains("is-down") ===
          false,
        { timeout: 2_000 },
        KEY("buys"),
      )
      .then(
        () => true,
        () => false,
      );
    const restAfter = await frameOf(page, KEY_CAP);
    check(
      held && restFrame === restAfter && upAfter,
      `${label} a held rail key shows ${during}, and is back to its rest frame (${restFrame}) after the lift`,
    );
    await close();
  });
}
