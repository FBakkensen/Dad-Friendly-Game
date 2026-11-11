/* global console, document, innerWidth, innerHeight, getComputedStyle, setTimeout */
/** Main screen sections: the board fits, the tier cards and the standalone shell. */
import { crewV4Save, buysFitSave } from "../../tools/browser/fixtures.ts";
import { check, section } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  press,
  KEY,
  OPEN_SHEET,
  openSheet,
  closeSheet,
  openShelf,
  openScreen,
  coversBoard,
  noScroll,
  MINE_WINDOW_RULES,
} from "./kit.mjs";
import { drawerFacts } from "./measure.mjs";

/**
 * The seeded crew has one engineer. The sheet's title and the way back both
 * sit on screen, and the page itself does not scroll.
 */
async function engineersSheetFits(page, { top = 0, bottom = 0 } = {}) {
  await press(page, KEY("engineers"));
  const covered = await coversBoard(page, ".engineers-dialog");
  const detail = await page.$eval(
    ".engineers-dialog",
    (sheet, insets) => {
      // The board's box: the sheet's buttons sit above the save line.
      const board = globalThis.__board();
      const floor = Math.min(board.saveTop, board.bottom - insets.bottom);
      const buttons = [...sheet.querySelectorAll("button")].filter(
        (button) => !button.hidden && button.getClientRects().length > 0,
      );
      const boxes = buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return {
          height: box.height / board.scale,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          clipped: button.scrollWidth > button.clientWidth + 1,
          text: button.textContent,
        };
      });
      const title =
        sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      const close =
        sheet.querySelector(".engineers-close")?.getBoundingClientRect()
          .bottom ?? Infinity;
      // Only what shows: How it works cards stay hidden until "i" (#246).
      const text = sheet.innerText;
      // A first visit swaps the act buttons for one guided button: the
      // first trip, or later the first tend.
      const guided =
        sheet.querySelector(".engineer-first-trip:not([hidden])") !== null;
      const promote = sheet.querySelector(".engineer-promote");
      const promoteLines = (() => {
        if (promote === null || promote.hidden) {
          return 0;
        }
        const range = document.createRange();
        range.selectNodeContents(promote);
        return range.getClientRects().length;
      })();
      return {
        boxesOk: boxes.every(
          (box) =>
            box.height >= 44 &&
            box.left >= board.left &&
            box.right <= board.right &&
            box.top >= board.top + insets.top &&
            box.bottom <= floor &&
            !box.clipped,
        ),
        count: boxes.length,
        title,
        close,
        titleOk: title >= board.top + insets.top,
        closeOk: close <= floor,
        words:
          (text.includes("Tend a machine") ||
            (guided &&
              (text.includes("exploring") || text.includes("Tend the")))) &&
          text.includes("stones/sec") &&
          text.includes("Promote:") &&
          text.includes("Promote a worker") &&
          promoteLines >= 1 &&
          promoteLines <= 2 &&
          !text.includes("?") &&
          !text.includes("%"),
      };
    },
    { top, bottom },
  );
  const pageStill = await noScroll(page);
  await page.$eval(".engineers-close", (button) => {
    button.click();
  });
  const closed = await page.$eval(
    ".engineers-dialog",
    (element) => element.hidden,
  );
  const ok =
    covered &&
    detail.boxesOk &&
    detail.count >= 4 &&
    detail.titleOk &&
    detail.closeOk &&
    detail.words &&
    pageStill &&
    closed;
  if (!ok) {
    console.log("engineers sheet", { covered, detail, pageStill, closed });
  }
  return ok;
}

/**
 * The vein at each corner of its range (veinSpot at x 0.35/0.65, y 0.4/0.8),
 * placed as board-window.ts places it: inline, 7 art px in from the window's
 * corner to the view. Each glint must sit inside .board-window-view and be
 * what a finger at its centre meets (#371).
 */
async function veinInView(page) {
  return page.evaluate(async (rules) => {
    const { veinSpot } = await import(rules);
    const vein = document.querySelector(".golden-vein");
    const view = document.querySelector(".board-window-view");
    if (vein === null || view === null) {
      return { ok: false, spots: [] };
    }
    const { left, top } = vein.style;
    const wasHidden = vein.hidden;
    vein.hidden = false;
    const spots = [];
    for (const [x, y] of [
      [0.35, 0.4],
      [0.65, 0.4],
      [0.35, 0.8],
      [0.65, 0.8],
    ]) {
      const spot = veinSpot(x, y);
      vein.style.left = `${String((7 + spot.left) * 2)}px`;
      vein.style.top = `${String((7 + spot.top) * 2)}px`;
      const v = vein.getBoundingClientRect();
      const w = view.getBoundingClientRect();
      const hit = document.elementFromPoint(
        (v.left + v.right) / 2,
        (v.top + v.bottom) / 2,
      );
      spots.push({
        x,
        y,
        ok:
          getComputedStyle(vein).position === "absolute" &&
          v.width > 0 &&
          v.left >= w.left - 0.5 &&
          v.right <= w.right + 0.5 &&
          v.top >= w.top - 0.5 &&
          v.bottom <= w.bottom + 0.5 &&
          hit !== null &&
          vein.contains(hit),
        vein: [v.left, v.top, v.right, v.bottom].map(Math.round),
        view: [w.left, w.top, w.right, w.bottom].map(Math.round),
      });
    }
    vein.hidden = wasHidden;
    vein.style.left = left;
    vein.style.top = top;
    return { ok: spots.every((spot) => spot.ok), spots };
  }, MINE_WINDOW_RULES);
}

// The main screen and its sheets, at the phone and on the PC.
for (const viewport of SCREENS) {
  section(`section 1 (main screen) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await openScreen(viewport, crewV4Save());
    check(await noScroll(page), `${size} main screen has no scroll`);
    // A dig's "+N" rises inside the window; the page stays still (#371).
    await press(page, ".board-window");
    check(await noScroll(page), `${size} no scroll with a dig's +N rising`);
    // The tier rows live in the Buys drawer (#373): each one, brought into its
    // list's view, sits wholly above the save line and below the drawer's top.
    const buysUp = await openSheet(page, "buys");
    const tiersVisible = await page.$eval(OPEN_SHEET("buys"), (sheet) => {
      const board = globalThis.__board();
      const list = sheet.querySelector(".board-sheet-list");
      const rows = [...sheet.querySelectorAll(".tier")].filter(
        (tier) => tier.closest("[hidden]") === null,
      );
      const ok =
        list !== null &&
        rows.length >= 4 &&
        rows.every((tier) => {
          // Scroll the list alone, never the clip or the page.
          const port = list.getBoundingClientRect();
          const at = tier.getBoundingClientRect();
          if (at.bottom > port.bottom) {
            list.scrollTop += at.bottom - port.bottom;
          } else if (at.top < port.top) {
            list.scrollTop -= port.top - at.top;
          }
          const box = tier.getBoundingClientRect();
          return (
            box.top >= port.top - 0.5 &&
            box.bottom <= port.bottom + 0.5 &&
            box.bottom <= board.saveTop &&
            box.bottom <= board.bottom
          );
        });
      if (list !== null) {
        list.scrollTop = 0;
      }
      return ok;
    });
    check(buysUp && tiersVisible, `${size} every tier row is above the fold`);
    await closeSheet(page, "buys");

    // The vein lives inside the window's view and on top of it, at every
    // corner of its range (#371).
    const veinInside = await veinInView(page);
    check(
      veinInside.ok,
      `${size} golden vein sits inside the window's view, on top, at each end of its range`,
    );
    if (!veinInside.ok) {
      console.log("vein in view", size, JSON.stringify(veinInside));
    }

    // A socket's note holds the shelf's key; the tag is a label (#370).
    await openShelf(page);
    check(
      await coversBoard(page, ".shelf-dialog"),
      `${size} relic shelf is laid over the game`,
    );
    await press(page, ".shelf-close");
    await press(page, KEY("ledger"));
    check(
      await coversBoard(page, ".game-menu"),
      `${size} menu is laid over the game`,
    );
    const fieldLogRow = await page.$eval(".game-menu", (menu) => {
      const copy = [...menu.querySelectorAll("button")].find(
        (button) => button.textContent === "Copy field log",
      );
      if (copy === undefined) {
        return false;
      }
      const board = globalThis.__board();
      const box = copy.getBoundingClientRect();
      const fat =
        box.height / board.scale >= 44 &&
        box.left >= board.left &&
        box.right <= board.right;
      menu.scrollTop = menu.scrollHeight;
      const closeBottom =
        menu.querySelector(".menu-close")?.getBoundingClientRect().bottom ??
        Infinity;
      menu.scrollTop = 0;
      return fat && closeBottom <= board.saveTop;
    });
    check(fieldLogRow, `${size} field log menu row is tappable`);
    await press(page, ".start-over-link");
    check(
      await coversBoard(page, ".start-over"),
      `${size} start-over confirm is laid over the game`,
    );
    await press(page, ".start-over-cancel");
    // Upgrades is a drawer now (#373): it slides up under the odometer to the
    // save line, and the save line stays on top of the board.
    const upgradesUp = await openSheet(page, "upgrades");
    const upgradesBox = await drawerFacts(page, "upgrades");
    check(
      upgradesUp &&
        upgradesBox.placed &&
        upgradesBox.odometerClear &&
        upgradesBox.saveLineClear,
      `${size} upgrades drawer is laid over the board, under the odometer and over the save line`,
    );
    if (!upgradesBox.placed || !upgradesBox.saveLineClear) {
      console.log("upgrades drawer", size, JSON.stringify(upgradesBox));
    }
    // Every row, the "i" and the way back can be reached, scrolling if it must.
    const sheetReachable = await page.$eval(OPEN_SHEET("upgrades"), (sheet) => {
      const board = globalThis.__board();
      // Rows not yet nearly affordable are hidden (#245); check what shows.
      const buttons = [...sheet.querySelectorAll("button")].filter(
        (button) =>
          button.closest("[hidden]") === null &&
          button.getClientRects().length > 0,
      );
      const wide = buttons.every((button) => {
        const box = button.getBoundingClientRect();
        return (
          box.height / board.scale >= 44 &&
          box.left >= board.left &&
          box.right <= board.right
        );
      });
      const list = sheet.querySelector(".board-sheet-list");
      if (list !== null) {
        list.scrollTop = 0;
      }
      const titleTop =
        sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      if (list !== null) {
        list.scrollTop = list.scrollHeight;
      }
      const closeBottom =
        sheet.querySelector(".board-sheet-back")?.getBoundingClientRect()
          .bottom ?? Infinity;
      if (list !== null) {
        list.scrollTop = 0;
      }
      return (
        buttons.length >= 2 &&
        wide &&
        titleTop >= board.top &&
        closeBottom <= board.saveTop
      );
    });
    check(sheetReachable, `${size} upgrades drawer buttons are tappable`);
    const sheetFit = await page.$eval(OPEN_SHEET("upgrades"), (sheet) => {
      const shown = (el) =>
        el.closest("[hidden]") === null && el.getClientRects().length > 0;
      // The drawer is the board's riveted frame: its skin is painted, edge to
      // edge, so nothing of the board shows through (#373).
      const skinOf = sheet.querySelector(":scope > canvas.board-skin");
      const box = sheet.getBoundingClientRect();
      const skinBox = skinOf?.getBoundingClientRect();
      const opaque =
        skinOf !== null &&
        skinOf.width > 0 &&
        skinBox !== undefined &&
        Math.abs(skinBox.width - box.width) <= 1 &&
        Math.abs(skinBox.height - box.height) <= 1;
      const list = sheet.querySelector(".board-sheet-list");
      const text = [
        ...sheet.querySelectorAll(
          ".board-row-name, .board-row-info, .board-row-price, .board-row-verb",
        ),
      ].filter((node) => shown(node) && (node.textContent ?? "") !== "");
      // The board's bar: 13px or more (#370).
      const typeOk = text.every(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 13,
      );
      const lasting = [
        ...sheet.querySelectorAll(".upgrade:not(.boost):not([hidden])"),
      ];
      const priceRight = lasting.every((row) => {
        const name = row.querySelector(".board-row-name");
        const tag = row.querySelector(".board-row-tag");
        if (name === null || tag === null) {
          return false;
        }
        const price = tag.getBoundingClientRect();
        const label = name.getBoundingClientRect();
        const rowRight = row.getBoundingClientRect().right;
        const scale = globalThis.__board().scale;
        // The price tag sits at the right of its own row, past the name.
        return (
          price.left + 1 >= label.right - 1 &&
          rowRight - price.right <= 16 * scale &&
          rowRight - price.right >= -1
        );
      });
      const lineCount = (node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length;
      };
      const buyLinesOk = [...sheet.querySelectorAll(".board-row-verb")]
        .filter(shown)
        .every((verb) => lineCount(verb) <= 1);
      const boosts = [...sheet.querySelectorAll(".upgrade.boost")].filter(
        (row) => !row.hidden,
      );
      const stacked =
        boosts.length < 2 ||
        boosts[1].getBoundingClientRect().top >=
          boosts[0].getBoundingClientRect().bottom - 1;
      const effectsOk = [
        ...sheet.querySelectorAll(".upgrade:not([hidden]) .board-row-info"),
      ]
        .filter(shown)
        .every((node) => lineCount(node) <= 2);
      // A full Upgrades runs longer than the drawer and scrolls inside it,
      // its spare plate off (C1); a shorter one fits.
      const spare = sheet.querySelector(".board-spare");
      const scrolls =
        list !== null && list.scrollHeight > list.clientHeight + 1;
      return {
        fits:
          list !== null &&
          (!scrolls ||
            (spare?.classList.contains("is-off") === true &&
              lasting.length + boosts.length >= 6)),
        scroll: list?.scrollHeight,
        client: list?.clientHeight,
        opaque,
        typeOk,
        lasting: lasting.length,
        priceRight,
        buyLinesOk,
        stacked,
        effectsOk,
      };
    });
    check(
      sheetFit.fits &&
        sheetFit.opaque &&
        sheetFit.typeOk &&
        sheetFit.priceRight &&
        sheetFit.buyLinesOk &&
        sheetFit.stacked &&
        sheetFit.effectsOk,
      `${size} upgrades drawer fits, on its painted frame`,
    );
    if (
      !sheetFit.fits ||
      !sheetFit.opaque ||
      !sheetFit.typeOk ||
      !sheetFit.priceRight ||
      !sheetFit.buyLinesOk ||
      !sheetFit.stacked ||
      !sheetFit.effectsOk
    ) {
      console.log(`upgrades detail ${size} ${JSON.stringify(sheetFit)}`);
    }
    await closeSheet(page, "upgrades");
    const engineersFat = await page.$eval(KEY("engineers"), (button) => {
      const board = globalThis.__board();
      const box = button.getBoundingClientRect();
      return (
        !button.hidden &&
        !button.disabled &&
        /^Engineers\b/.test(button.getAttribute("aria-label") ?? "") &&
        box.height / board.scale >= 44 &&
        box.width / board.scale >= 44 &&
        box.left >= board.left &&
        box.right <= board.right
      );
    });
    check(engineersFat, `${size} engineers key is tappable`);
    check(
      await engineersSheetFits(page),
      `${size} engineers sheet fits with no scroll`,
    );
    await close();
  });
}

// Tier cards keep one fixed height and never truncate, even at x999 and huge prices.
for (const viewport of [PHONE]) {
  section(`section 2 (tier cards) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    for (const [crew, font] of [
      [
        {
          helpers: 999,
          carts: 999,
          drills: 999,
          borers: 999,
          machines: 999,
          kids: 999,
        },
        undefined,
      ],
      [{ helpers: 120, carts: 85, drills: 40, borers: 0 }, undefined],
      [{ helpers: 120, carts: 85 }, undefined],
      [{ helpers: 1, carts: 0 }, undefined],
      // A long pocket (888,888) stays inside the odometer.
      [{ helpers: 24, carts: 12, pocket: 888_888 }, "DejaVu Sans"],
      // CI's fallback font is wide; it must fit there too.
      [{ helpers: 999, carts: 999 }, "DejaVu Sans"],
      [
        {
          helpers: 999,
          carts: 999,
          drills: 999,
          borers: 999,
          machines: 999,
          kids: 999,
        },
        "DejaVu Sans",
      ],
      // Short of helpers: idle machines on every card, the longest crew line.
      [
        {
          helpers: 1,
          carts: 999,
          drills: 999,
          borers: 999,
          machines: 999,
          kids: 0,
        },
        "DejaVu Sans",
      ],
      // Every crew synergy bought: "↑999%" joins the rate line.
      [
        {
          helpers: 999,
          carts: 999,
          drills: 999,
          borers: 999,
          machines: 999,
          upgrades: {
            boots: 1,
            cartSyn: 1,
            drillSyn: 1,
            borerSyn: 1,
            machineSyn: 1,
          },
        },
        "DejaVu Sans",
      ],
      [
        {
          helpers: 120,
          carts: 85,
          drills: 40,
          borers: 7,
          upgrades: {
            boots: 1,
            cartSyn: 1,
            drillSyn: 1,
            borerSyn: 1,
            machineSyn: 1,
          },
        },
        "DejaVu Sans",
      ],
      // Before the Hammer: the Great Machine card is locked.
      [
        { helpers: 9, carts: 9, drills: 9, borers: 9, remaining: 80_000_000 },
        "DejaVu Sans",
      ],
    ]) {
      const { page, close } = await openScreen(viewport, buysFitSave(crew), {
        stopClock: true,
      });
      if (font !== undefined) {
        await page.addStyleTag({
          content: `* { font-family: "${font}" !important; }`,
        });
      }
      await openSheet(page, "buys");
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll(".tier")]
          .filter((card) => !card.hidden)
          .map((card) => ({
            height: Math.round(card.getBoundingClientRect().height),
            // The name, the price and the gain show in full. The name keeps
            // its whole width on its line, so a name too long for the row
            // runs past the words' column, which clips it: its right edge is
            // read against that column's. The info line falls back through
            // its options and may end in its ellipsis, inside the row (#373,
            // the plan's Review Focus 5).
            clipped: [
              ...card.querySelectorAll(
                ".board-row-name, .board-row-price, .board-row-info, .board-row-gain",
              ),
            ]
              .filter((line) => {
                if (line.closest("[hidden]") !== null) {
                  return false;
                }
                if (line.classList.contains("board-row-name")) {
                  const mid = line.closest(".board-row-mid");
                  return (
                    mid === null ||
                    line.getBoundingClientRect().right >
                      mid.getBoundingClientRect().right + 0.5
                  );
                }
                if (line.classList.contains("board-row-gain")) {
                  return (
                    line.scrollWidth > line.clientWidth + 1 ||
                    line.getBoundingClientRect().right >
                      card.getBoundingClientRect().right + 0.5
                  );
                }
                return (
                  line.scrollWidth > line.clientWidth + 1 &&
                  !(
                    line.classList.contains("board-row-info") &&
                    getComputedStyle(line).textOverflow === "ellipsis" &&
                    line.getBoundingClientRect().right <=
                      card.getBoundingClientRect().right
                  )
                );
              })
              .map((line) => line.textContent),
          })),
      );
      const label = `${size} tier cards with ${String(crew.helpers)} helpers, ${String(crew.carts)} carts${font === undefined ? "" : ` in ${font}`}`;
      check(
        cards.every((card) => card.height >= 48),
        `${label} are at least 48px tall`,
      );
      const clipped = cards.flatMap((card) => card.clipped);
      check(
        clipped.length === 0,
        `${label} show every name, price and gain in full, and each info line whole or cut by its ellipsis ${clipped.join(" | ")}`,
      );
      check(await noScroll(page), `${label} have no scroll`);
      // The pocket is the odometer now (#370): five drums in their housing.
      const odometerFits = await page.evaluate(() => {
        const board = globalThis.__board();
        const odometer = document.querySelector(".board-odo");
        if (odometer === null) {
          return false;
        }
        const box = odometer.getBoundingClientRect();
        return (
          (odometer.getAttribute("aria-label") ?? "").startsWith("Stones ") &&
          box.left >= board.left &&
          box.right <= board.right &&
          odometer.scrollWidth <= odometer.clientWidth + 1 &&
          [...odometer.querySelectorAll(".board-drum")].every(
            (drum) => drum.scrollWidth <= drum.clientWidth + 1,
          )
        );
      });
      check(odometerFits, `${label} keep the odometer in its housing`);
      // The crew line lives in the Crew section at the top of Buys (#371).
      const crewLineFits = await page.evaluate(() => {
        const line = document.querySelector(
          '.board-sheet[data-sheet="buys"].is-open .crew .crew-status',
        );
        if (line === null) return false;
        const box = line.getBoundingClientRect();
        const height = parseFloat(getComputedStyle(line).lineHeight) || 24;
        return (
          line.scrollWidth <= line.clientWidth + 1 &&
          box.left >= 0 &&
          box.right <= innerWidth &&
          box.height <= height * 1.5
        );
      });
      check(crewLineFits, `${label} keep the crew line on one line`);
      if (
        font === "DejaVu Sans" &&
        crew.helpers === 999 &&
        crew.borers === 999 &&
        crew.machines === 999 &&
        crew.upgrades === undefined
      ) {
        await closeSheet(page, "buys");
        check(
          await engineersSheetFits(page),
          `${label} engineers sheet fits with no scroll`,
        );
      }
      await close();
    }
  });
}

// Installed PWA (standalone), with status and gesture bar insets. The board
// is the measured 424x924 installed-app viewport and pads no insets (#370,
// Task 1 ruling), so only the page staying still and the vein are checked.
for (const viewport of [PHONE]) {
  section(`section 3 (standalone) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await openScreen(viewport, crewV4Save(), {
      standalone: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    check(
      await noScroll(page),
      `${size} standalone PWA with insets has no scroll`,
    );

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
      `${size} standalone golden vein appears on top of the window`,
    );
    if (veinOnTop) {
      await page.tap(".golden-vein");
      // The payout shows in the board note under the window (#371).
      await page
        .waitForSelector(".board-note.on .vein-note", { timeout: 2_000 })
        .catch(() => undefined);
      const note = await page
        .$eval(".board-note.on .vein-note", (element) => element.textContent)
        .catch(() => undefined);
      check(
        note?.startsWith("Golden vein!") === true,
        `${size} standalone golden vein pays when tapped`,
      );
    }
    await close();
  });
}
