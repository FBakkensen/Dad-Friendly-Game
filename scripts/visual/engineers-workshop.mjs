/* global console, document, innerWidth, innerHeight, getComputedStyle */
/** Engineers and Workshop sections: the expedition chip and sheet, the Engineers sheet and the Workshop drawer's states. */
import {
  awayTripSave,
  campPostsSave,
  chargePayoffSave,
  firstCraftSave,
  heartMountain,
  openMountain,
  unknownBenchSave,
  workshopSave,
} from "../../tools/browser/fixtures.ts";
import { check, section } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  KEY,
  OPEN_SHEET,
  STANDALONE_INSETS,
  openScreen,
  openSheet,
  noScroll,
  noteAway,
  keysDrawn,
  LAMP_X,
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

/** The open Workshop drawer as the dad reads it: bench, rows on the page, plates, kick (#374). */
function workshopFacts(page) {
  return page.$eval(OPEN_SHEET("workshop"), (sheet) => {
    const text = (root, selector) =>
      root.querySelector(selector)?.textContent ?? "";
    const lamp = (root) =>
      root.querySelector(".board-lamp")?.style.backgroundPositionX ?? "";
    const shown = (el) => el.closest("[hidden]") === null;
    const bench = sheet.querySelector(".workshop-bench");
    const bar = bench?.querySelector(".workshop-bar");
    const rows = [
      ...sheet.querySelectorAll(".workshop-recipe, .workshop-sketch"),
    ]
      .filter(shown)
      .map((row) => ({
        id: row.dataset.recipe ?? "sketch",
        classes: [...row.classList],
        name: text(row, ".board-row-name"),
        badge: text(row, ".board-row-badge"),
        need: text(row, ".board-row-need"),
        flag: text(row, ".board-row-flag"),
        verb: text(row, ".board-row-verb"),
        lamp: lamp(row),
      }));
    const box = sheet.getBoundingClientRect();
    const plates = [...sheet.querySelectorAll(".workshop-mat")]
      .filter(shown)
      .map((plate) => {
        const b = plate.getBoundingClientRect();
        const word = plate.querySelector(".workshop-mat-word");
        return {
          id: plate.dataset.material,
          count: text(plate, ".workshop-mat-count"),
          word: word !== null && shown(word) ? (word.textContent ?? "") : "",
          inside:
            b.left >= box.left - 0.5 &&
            b.right <= box.right + 0.5 &&
            b.top >= box.top - 0.5 &&
            b.bottom <= box.bottom + 0.5,
        };
      });
    return {
      kick: text(sheet, ".board-sheet-kick"),
      bench: {
        name: bench === null ? "" : text(bench, ".board-row-name"),
        gain: bench === null ? "" : text(bench, ".board-row-gain"),
        info: bench === null ? "" : text(bench, ".board-row-info"),
        lamp: bench === null ? "" : lamp(bench),
        bar:
          bar === null || bar === undefined || !shown(bar)
            ? -1
            : Number(bar.getAttribute("aria-valuenow") ?? "-1"),
      },
      timers: (() => {
        const line = sheet.querySelector(".workshop-timers");
        return line === null || !shown(line) ? "" : (line.textContent ?? "");
      })(),
      rows,
      more: (() => {
        const more = sheet.querySelector(".workshop-more");
        return more !== null && shown(more);
      })(),
      packed:
        sheet
          .querySelector(".workshop-mats")
          ?.classList.contains("is-packed") === true,
      plates,
    };
  });
}

/** The next page, as a keyboard press does it (never early). */
async function nextWorkshopPage(page) {
  await page.$eval(`${OPEN_SHEET("workshop")} .workshop-more`, (more) => {
    more.click();
  });
}

/** Opens the save on held clocks, then the Workshop drawer by its key. */
async function openWorkshop(viewport, save) {
  const opened = await openScreen(viewport, save, {
    stopClock: true,
    tapClock: "held",
  });
  await keysDrawn(opened.page);
  await noteAway(opened.page);
  await openSheet(opened.page, "workshop");
  return opened;
}

/** A row on the shown page, by its recipe. */
const rowOf = (facts, id) => facts.rows.find((row) => row.id === id);

// The Workshop drawer's states (#374), each on its own save with the clocks held: busy, free,
// the first craft's New row, the first charge's payoff, a craft this build cannot name, and
// the plates on two and four materials. Its rows, fit and art are the DRAWERS row's checks.
for (const viewport of SCREENS) {
  section(
    `keys and drawers ${JSON.stringify(viewport)} workshop states`,
    async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      const now = Date.now();
      {
        const { page, close } = await openWorkshop(
          viewport,
          workshopSave(now, true),
        );
        const busy = await workshopFacts(page);
        const onBench = rowOf(busy, "sturdy-props");
        const others = busy.rows.filter(
          (row) => row.id !== "sturdy-props" && row.id !== "sketch",
        );
        await shot(page, `workshop-busy-${size}`);
        await nextWorkshopPage(page);
        const second = await workshopFacts(page);
        const reinforce =
          rowOf(busy, "reinforce") ?? rowOf(second, "reinforce");
        check(
          busy.bench.name === "Sturdy props" &&
            /^\d+:\d\d$/.test(busy.bench.gain) &&
            busy.bench.info.startsWith("Cancel · ") &&
            busy.bench.lamp === LAMP_X.amber &&
            busy.bench.bar > 0 &&
            onBench?.verb === "On the bench" &&
            onBench.lamp === LAMP_X.amber &&
            others.length >= 1 &&
            others.every((row) => row.verb === "Bench busy") &&
            busy.timers.startsWith("Axle grease · ") &&
            /^Lv \d+\/\d+$/.test(reinforce?.badge ?? ""),
          `${size} workshop busy: the bench row names Sturdy props with its clock, refund and bar, its row is On the bench, the others Bench busy, the timers line and Reinforce's level`,
        );
        if (busy.bench.name !== "Sturdy props" || busy.bench.bar <= 0) {
          console.log("workshop busy", size, JSON.stringify(busy));
        }
        await close();
      }
      {
        const { page, close } = await openWorkshop(
          viewport,
          workshopSave(now, false),
        );
        const free = await workshopFacts(page);
        await shot(page, `workshop-free-${size}`);
        const axle = rowOf(free, "axle-grease");
        const charge = rowOf(free, "blasting-charge");
        await nextWorkshopPage(page);
        const second = await workshopFacts(page);
        check(
          free.bench.name === "The bench is free" &&
            free.bench.lamp === LAMP_X.green &&
            free.bench.bar === -1 &&
            axle?.classes.includes("is-ready") === true &&
            axle.verb === "Craft" &&
            charge?.classes.includes("is-short") === true &&
            charge.need === "Need 2 more clay" &&
            free.more &&
            second.rows.some((row) => row.id === "sketch") &&
            free.kick === "Turn your clay into gear for the crew.",
          `${size} workshop free: a green free bench, axle grease to craft, the charge short by 2 clay, More to make with the sketch on page 2, and the teach intro`,
        );
        if (!free.more || axle === undefined || charge === undefined) {
          console.log("workshop free", size, JSON.stringify(free));
        }
        await close();
      }
      {
        const { page, close } = await openWorkshop(
          viewport,
          firstCraftSave(now),
        );
        const first = await workshopFacts(page);
        check(
          first.rows[0]?.id === "blasting-charge" &&
            first.rows[0].classes.includes("teach-new") &&
            first.rows[0].flag === "New",
          `${size} workshop first craft: the blasting charge leads, flagged New`,
        );
        await close();
      }
      {
        const { page, close } = await openWorkshop(
          viewport,
          chargePayoffSave(now),
        );
        const payoff = await workshopFacts(page);
        const flag = rowOf(payoff, "blasting-charge")?.flag ?? "";
        check(
          /\/s now$/.test(flag) || flag === "Your crew feels it now",
          `${size} workshop payoff: the charge's row shows what it pays (${flag})`,
        );
        await close();
      }
      {
        const { page, close } = await openWorkshop(
          viewport,
          unknownBenchSave(now),
        );
        const unknown = await workshopFacts(page);
        const recipes = unknown.rows.filter((row) => row.id !== "sketch");
        check(
          unknown.bench.name === "Something is on the bench" &&
            !unknown.bench.info.includes("Cancel ·") &&
            recipes.length >= 1 &&
            recipes.every((row) => row.verb === "Bench busy"),
          `${size} workshop unknown: something is on the bench, with no cancel, and every recipe waits`,
        );
        await close();
      }
      for (const [name, save, want] of [
        ["mid", openMountain(), 2],
        ["heart", heartMountain(), 4],
      ]) {
        const { page, close } = await openWorkshop(viewport, save);
        const plates = await workshopFacts(page);
        const packed = want > 2;
        check(
          plates.plates.length === want &&
            plates.packed === packed &&
            plates.plates.every(
              (plate) =>
                plate.inside &&
                plate.count !== "" &&
                (packed ? plate.word === "" : plate.word === plate.id),
            ) &&
            (packed ||
              plates.plates.map((plate) => plate.id).join() === "clay,iron") &&
            (await noScroll(page)),
          `${size} workshop plates on ${name}: ${String(want)} plates${packed ? ", packed with no word" : ", clay and iron with their words"}, inside the drawer, no page scroll`,
        );
        await close();
      }
    },
  );
}
