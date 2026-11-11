/* global console, document, innerWidth, innerHeight, getComputedStyle */
/** Engineers and Workshop sections: the sheets for the Engineers, the crew and the Workshop. */
import {
  awayTripSave,
  campPostsSave,
  workshopSave,
  lockedWorkshopSave,
} from "../../tools/browser/fixtures.ts";
import { check, section } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  press,
  KEY,
  STANDALONE_INSETS,
  openScreen,
  coversBoard,
  noScroll,
  shot,
} from "./kit.mjs";

// An expedition still out: the chip shows in the Running now note, and the
// sheet (Recall, posts, the way back) fits the phone, including the PWA.
for (const standalone of [false, true]) {
  section(`section 11 (line 1191) ${JSON.stringify(standalone)}`, async () => {
    const viewport = PHONE;
    const label = `424x924${standalone ? " standalone" : ""}`;
    const now = Date.now();
    const { page, close } = await openScreen(viewport, awayTripSave(now), {
      standalone,
    });
    const insets = standalone ? STANDALONE_INSETS : { top: 0, bottom: 0 };
    // The trip's clock lives in the Running now note the dial opens (#370).
    await page.tap(".board-dial");
    await page
      .waitForSelector(".board-note.on .effect-row", { timeout: 2_000 })
      .catch(() => undefined);
    const chip = await page.evaluate(() => {
      const board = globalThis.__board();
      const note = document.querySelector(".board-note.on");
      const row = note?.querySelector(".board-running .effect-row");
      const shown = [...(row?.querySelectorAll(".expedition-chip") ?? [])].find(
        (el) => !el.hidden,
      );
      if (note === null || shown === undefined) {
        return { ok: false, text: "" };
      }
      const box = shown.getBoundingClientRect();
      const host = note.getBoundingClientRect();
      const text = shown.textContent ?? "";
      return {
        ok:
          box.width > 0 &&
          box.top >= host.top - 1 &&
          box.bottom <= host.bottom + 1 &&
          box.left >= host.left - 1 &&
          box.right <= host.right + 1 &&
          host.left >= board.left &&
          host.right <= board.right &&
          host.top >= board.top &&
          host.bottom <= board.saveTop &&
          text.includes("Ada") &&
          /\d+:\d{2}|\dh\d{2}/.test(text),
        text,
      };
    });
    check(
      chip.ok,
      `${label} expedition chip sits in the Running now note (${chip.text})`,
    );
    check(await noScroll(page), `${label} expedition chip has no scroll`);
    await page.tap(KEY("engineers"));
    const sheet = await page.$eval(
      ".engineers-dialog",
      (dialog, pad) => {
        const buttons = [...dialog.querySelectorAll("button")].filter(
          (button) => !button.hidden && button.getClientRects().length > 0,
        );
        const boxesOk = buttons.every((button) => {
          const box = button.getBoundingClientRect();
          return (
            box.height >= 44 &&
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.top >= pad.top &&
            box.bottom <= innerHeight - pad.bottom &&
            button.scrollWidth <= button.clientWidth + 1
          );
        });
        const close =
          dialog.querySelector(".engineers-close")?.getBoundingClientRect()
            .bottom ?? Infinity;
        const title =
          dialog.querySelector("h2")?.getBoundingClientRect().top ?? -1;
        // Only what shows: How it works cards stay hidden until "i" (#246).
        const text = dialog.innerText;
        const recall = dialog.querySelector(".engineer-recall");
        return {
          boxesOk,
          count: buttons.length,
          titleOk: title >= pad.top,
          closeOk: close <= innerHeight - pad.bottom,
          recall: recall !== null && !recall.hidden,
          words:
            text.includes("Call her back") &&
            text.includes("exploring the old shaft") &&
            !text.includes("?") &&
            !text.includes("%"),
          discovery: [...dialog.querySelectorAll(".engineer-trip")]
            .filter((node) => !node.hidden && node.closest("[hidden]") === null)
            .map((node) => node.textContent ?? "")
            .every((line) => line.length > 0 && !/\d|\?/.test(line)),
        };
      },
      insets,
    );
    check(
      sheet.boxesOk &&
        sheet.count >= 3 &&
        sheet.titleOk &&
        sheet.closeOk &&
        sheet.recall &&
        sheet.words &&
        sheet.discovery,
      `${label} engineers sheet fits with an expedition out`,
    );
    if (!(sheet.boxesOk && sheet.closeOk && sheet.recall)) {
      console.log("expedition sheet", sheet);
    }
    check(await noScroll(page), `${label} expedition sheet has no scroll`);
    await close();
  });
}

// Five engineers, one open card and four rows, plus a keepsake they brought
// home. Short phones and the installed PWA, with no scroll.
for (const viewport of [PHONE]) {
  section(`section 12 (line 1322) ${JSON.stringify(viewport)}`, async () => {
    for (const standalone of [false, true]) {
      const label = `${String(viewport[0])}x${String(viewport[1])}${standalone ? " standalone" : ""}`;
      const now = Date.now();
      const { page, close } = await openScreen(viewport, campPostsSave(now), {
        standalone,
      });
      const insets = standalone ? STANDALONE_INSETS : { top: 0, bottom: 0 };
      await page.tap(KEY("engineers"));
      const crew = await page.$eval(
        ".engineers-dialog",
        (dialog, pad) => {
          const buttons = [...dialog.querySelectorAll("button")].filter(
            (button) => !button.hidden && button.getClientRects().length > 0,
          );
          const boxesOk = buttons.every((button) => {
            const box = button.getBoundingClientRect();
            return (
              box.height >= 44 &&
              box.left >= 0 &&
              box.right <= innerWidth &&
              box.top >= pad.top &&
              box.bottom <= innerHeight - pad.bottom &&
              button.scrollWidth <= button.clientWidth + 1
            );
          });
          const promote = dialog.querySelector(".engineer-promote");
          const promoteBottom =
            promote?.getBoundingClientRect().bottom ?? Infinity;
          const brought = dialog.querySelector(".engineer-brought");
          const broughtSize = brought
            ? Number.parseFloat(getComputedStyle(brought).fontSize)
            : 0;
          const text = dialog.textContent ?? "";
          return {
            boxesOk,
            open: dialog.querySelectorAll(".engineer.is-open").length,
            mini: dialog.querySelectorAll(".engineer.is-mini").length,
            promoteOk: promoteBottom <= innerHeight - pad.bottom,
            brought: brought !== null && !brought.hidden,
            broughtSize,
            story: text.includes("A child's drawing"),
            sheetScroll: dialog.scrollHeight <= dialog.clientHeight + 1,
            words: !text.includes("?"),
            discovery: [
              ...dialog.querySelectorAll(
                ".engineer-trip, .engineer-brought-story, .keepsake-story",
              ),
            ]
              .map((node) => node.textContent ?? "")
              .every((line) => line.length === 0 || !/\d|\?/.test(line)),
          };
        },
        insets,
      );
      check(
        crew.boxesOk &&
          crew.open === 1 &&
          crew.mini === 4 &&
          crew.promoteOk &&
          crew.brought &&
          crew.broughtSize >= 16 &&
          crew.story &&
          crew.sheetScroll &&
          crew.words &&
          crew.discovery &&
          (await noScroll(page)),
        `${label} five engineers and a keepsake fit with no scroll`,
      );
      if (!crew.boxesOk || !crew.sheetScroll || !crew.promoteOk) {
        console.log("five engineers", label, crew);
      }
      await close();
    }
  });
}

/** Workshop sheet (#199): real numbers, no scroll, a dark sketch, a named refund. */
const WORKSHOP_SIZES = SCREENS;

for (const viewport of WORKSHOP_SIZES) {
  section(`section 14 (line 1531) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const now = Date.now();
    const { page, close } = await openScreen(viewport, workshopSave(now, true));
    await press(page, KEY("ledger"));
    await press(page, ".workshop-open");
    const laid = await coversBoard(page, ".workshop-dialog");
    const fit = await page.$eval(".workshop-dialog", (sheet) => {
      const board = globalThis.__board();
      // Crafts sit in a list that may scroll. Every other button stays on screen.
      const buttons = [...sheet.querySelectorAll("button")].filter(
        (button) =>
          !button.hidden &&
          button.getClientRects().length > 0 &&
          button.closest(".workshop-recipes") === null,
      );
      const boxes = buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return {
          height: box.height / board.scale,
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          clipped: button.scrollWidth > button.clientWidth + 1,
          text: button.textContent ?? "",
        };
      });
      const text = sheet.textContent ?? "";
      const sketch = sheet.querySelector(".workshop-card.is-hidden");
      const labels = [
        ...sheet.querySelectorAll(".label, .workshop-craft, .workshop-cancel"),
      ];
      const typeOk = labels.every(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 14.4,
      );
      const misses = boxes.filter(
        (box) =>
          !(
            box.height >= 44 &&
            box.top >= board.top &&
            box.bottom <= board.saveTop &&
            box.left >= board.left &&
            box.right <= board.right &&
            !box.clipped
          ),
      );
      return {
        boxesOk: misses.length === 0,
        misses,
        count: boxes.length,
        text,
        sketch: sketch?.textContent ?? "",
        typeOk,
        cancel: sheet.querySelector(".workshop-cancel")?.textContent ?? "",
      };
    });
    const still = await noScroll(page);
    check(
      laid &&
        still &&
        fit.boxesOk &&
        fit.count >= 3 &&
        fit.typeOk &&
        fit.text.includes("On the bench: Sturdy props") &&
        fit.text.includes("left") &&
        fit.text.includes("Lv 0/2") &&
        fit.text.includes("500K stones") &&
        fit.text.includes("Bench busy") &&
        fit.cancel.includes("250K") &&
        fit.cancel.includes("clay") &&
        fit.cancel.includes("iron") &&
        fit.text.includes("Axle grease") &&
        fit.sketch === "A folded sketch, still in the dark." &&
        !/[?]/.test(fit.text) &&
        !/\d/.test(fit.sketch),
      `${size} workshop sheet fits with real numbers`,
    );
    if (!fit.boxesOk || !still || !fit.typeOk) {
      console.log("workshop fit", size, JSON.stringify(fit.misses), fit);
    }
    const timerSplit = await page.$eval(".workshop-dialog", (sheet) => {
      const bench = sheet.querySelector(".workshop-bench");
      const timers = sheet.querySelector(".workshop-timers");
      return (
        bench !== null &&
        timers !== null &&
        !bench.contains(timers) &&
        !timers.hidden
      );
    });
    check(timerSplit, `${size} the live timer sits apart from the bench`);
    await shot(page, `workshop-busy-${size}`);
    if (viewport[0] === 390) {
      await page.tap(".workshop-cancel");
      const armed = await page.$eval(
        ".workshop-cancel",
        (button) => button.textContent ?? "",
      );
      const stillBusy = await page.$eval(
        ".workshop-bench",
        (bench) => bench.textContent ?? "",
      );
      check(
        armed === "Tap again to cancel" && stillBusy.includes("On the bench"),
        `${size} cancel asks for a second tap`,
      );
      await shot(page, "workshop-cancel-confirm-424x924");
      await page.tap(".workshop-cancel");
      const freed = await page.$eval(
        ".workshop-bench",
        (bench) => bench.textContent ?? "",
      );
      check(
        freed.includes("The bench is free"),
        `${size} cancel clears the bench`,
      );
      await shot(page, "workshop-free-424x924");
      if ((await page.$(".workshop-craft.is-short")) === null) {
        const more = await page.$(".workshop-more:not([hidden])");
        if (more !== null) {
          await more.tap();
        }
      }
      const short = await page.$(".workshop-craft.is-short");
      const shortText = await page.$eval(".workshop-dialog", (sheet) =>
        [...sheet.querySelectorAll(".workshop-need")].map(
          (line) => line.textContent ?? "",
        ),
      );
      check(
        shortText.some(
          (text) => text.startsWith("Need ") && text.includes(" more "),
        ),
        `${size} a short craft says what is missing`,
      );
      if (short !== null) {
        await short.tap();
      }
      const shaking = await page.$eval(
        ".workshop-dialog",
        (sheet) => sheet.querySelector(".is-shaking") !== null,
      );
      check(shaking, `${size} a short craft shakes`);
      await shot(page, "workshop-shake-424x924");
      if (
        (await page.$(
          "[data-recipe='axle-grease'] .workshop-craft:not(.is-short)",
        )) === null
      ) {
        const earlier = await page.$(".workshop-earlier:not([hidden])");
        if (earlier !== null) {
          await earlier.tap();
        }
      }
      const ready = await page.$(
        "[data-recipe='axle-grease'] .workshop-craft:not(.is-short)",
      );
      if (ready !== null) {
        await ready.tap();
      }
      const hammer = await page.$eval(".workshop-bench", (bench) =>
        bench.classList.contains("is-hammer"),
      );
      const floated = await page.$eval(
        ".workshop-floats",
        (host) => host.querySelectorAll(".float-chip").length,
      );
      check(
        hammer && floated > 0,
        `${size} a craft floats materials and taps the hammer`,
      );
      await shot(page, "workshop-hammer-424x924");
    }
    await close();
  });
}

section("section 15 (line 1703)", async () => {
  {
    const now = Date.now();
    const { page, close } = await openScreen(PHONE, lockedWorkshopSave(now));
    await page.tap(KEY("ledger"));
    const locked = await page.$eval(".workshop-locked", (row) => ({
      text: row.textContent ?? "",
      hidden: row.hidden,
    }));
    const openHidden = await page.$eval(
      ".workshop-open",
      (button) => button.hidden,
    );
    check(
      !locked.hidden &&
        locked.text.includes("Workshop · opens as the clay comes in") &&
        !locked.text.includes("?") &&
        openHidden,
      "424x924 workshop is a locked silhouette before the first clay",
    );
    await shot(page, "workshop-locked-424x924");
    check(await noScroll(page), "424x924 locked menu has no page scroll");
    await close();
  }
});
