/* global document, getComputedStyle */
/**
 * Slice 1's frame (#659), on the `?slice=1` dev preview: the order strip, the
 * top row with the one hire key, Next, the site bar and the save line, and
 * the workforce sheet over them, at the phone and at a shorter phone.
 */
import {
  DEV_BACKUP_KEY,
  sliceBusySave,
  sliceOrderedSave,
} from "../../tools/browser/fixtures.ts";
import { check, section } from "./registry.mjs";
import { openScreen, noScroll, shot } from "./kit.mjs";

const SIZES = [
  [424, 924],
  [424, 830],
];

const SAVES = [
  { name: "ordered", save: () => sliceOrderedSave(Date.now()) },
  { name: "busy", save: () => sliceBusySave(Date.now()) },
];

/**
 * The frame's parts in board px: each row's box, every shown button's size,
 * the hire keys in the frame, and its words.
 */
async function frameFacts(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const px = (el) => {
      const r = el.getBoundingClientRect();
      return {
        t: (r.top - board.top) / board.scale,
        b: (r.bottom - board.top) / board.scale,
        w: r.width / board.scale,
        h: r.height / board.scale,
      };
    };
    const shown = (el) =>
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== "hidden";
    const frame = document.querySelector(".frame");
    const rows = [
      ".frame-order",
      ".frame-top",
      ".frame-scene",
      ".frame-next",
      ".frame-sites",
    ].map((selector) => {
      const el = document.querySelector(selector);
      return el === null ? undefined : { selector, ...px(el) };
    });
    const line = document.querySelector(".board-saveline");
    const buttons = [...document.querySelectorAll("#app button")].filter(shown);
    const small = buttons
      .map((el) => ({ name: el.className, ...px(el) }))
      .filter((b) => b.w < 47.5 || b.h < 47.5);
    const hires = [...(frame?.querySelectorAll("button") ?? [])].filter((el) =>
      /^Hire\b/.test(el.getAttribute("aria-label") ?? el.textContent ?? ""),
    );
    const cut = [
      ...document.querySelectorAll(
        ".frame-order-name, .frame-order-step, .frame-next-head, .frame-workers-free, .frame-hire",
      ),
    ]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className);
    return {
      rows,
      saveTop: line === null ? undefined : px(line).t,
      small,
      hires: hires.map((el) => el.parentElement?.className ?? ""),
      cut,
      words: document.querySelector("#app")?.textContent ?? "",
    };
  });
}

/** The rows stack from the top down, each inside the board, and the last above the save line. */
function stacked(facts) {
  const rows = facts.rows;
  if (rows.some((row) => row === undefined) || facts.saveTop === undefined) {
    return false;
  }
  return rows.every(
    (row, index) =>
      row.h > 0 &&
      (index === 0 ? row.t >= -0.5 : row.t >= rows[index - 1].b - 0.5) &&
      row.b <= facts.saveTop + 0.5,
  );
}

async function tap(page, selector) {
  await page.$eval(selector, (el) => {
    el.click();
  });
}

async function sheetFacts(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const sheet = document.querySelector(".frame-sheet");
    const box = sheet?.querySelector(".frame-sheet-box");
    const line = document.querySelector(".board-saveline");
    if (sheet === null || box === null || line === null) {
      return { open: false };
    }
    const r = box.getBoundingClientRect();
    const lineTop = line.getBoundingClientRect().top;
    const note = sheet.querySelector(".frame-sheet-note");
    return {
      open: !sheet.hidden,
      inside: r.top >= board.top - 0.5 && r.bottom <= lineTop + 0.5,
      rows: sheet.querySelectorAll(".frame-job").length,
      note: note !== null && !note.hidden ? (note.textContent ?? "") : "",
    };
  });
}

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  for (const { name, save } of SAVES) {
    section(`${label} slice frame ${name}`, async () => {
      const { page, close } = await openScreen(size, save(), {
        search: "?slice=1",
        seedKey: DEV_BACKUP_KEY,
      });
      try {
        await page.waitForSelector(".frame-next-line");
        const at = `${label} slice frame ${name}:`;
        check(await noScroll(page), `${at} the page does not scroll`);
        for (const site of ["mine", "city"]) {
          await tap(page, `.frame-site[data-site="${site}"]`);
          const facts = await frameFacts(page);
          await shot(page, `slice-frame-${name}-${site}-${label}`);
          check(
            stacked(facts),
            `${at} ${site}: the order strip, the top row, the ground, Next and the site bar stack above the save line`,
          );
          check(
            facts.hires.length === 1 && facts.hires[0] === "frame-top",
            `${at} ${site}: one hire key, in the top row (${facts.hires.join(", ")})`,
          );
          check(
            facts.small.length === 0,
            `${at} ${site}: every key is at least 48px (${JSON.stringify(facts.small)})`,
          );
          check(
            facts.cut.length === 0,
            `${at} ${site}: no word in the frame is cut (${facts.cut.join(", ")})`,
          );
          check(
            !/\bhands?\b|by hand/i.test(facts.words),
            `${at} ${site}: no "hands" and no "by hand"`,
          );
        }
        await tap(page, ".frame-workers");
        const sheet = await sheetFacts(page);
        await shot(page, `slice-workforce-${name}-${label}`);
        check(
          sheet.open && sheet.inside && sheet.rows === 5,
          `${at} the workforce opens above the save line with its five jobs`,
        );
        check(
          await noScroll(page),
          `${at} the workforce does not scroll the page`,
        );
        if (name === "ordered") {
          await tap(page, '.frame-step[data-job="drilling"][data-way="place"]');
          const after = await sheetFacts(page);
          check(
            after.note ===
              "No free worker. Hire one, or take one off another job.",
            `${at} a + with no free worker says where one comes from`,
          );
        }
      } finally {
        await close();
      }
    });
  }
}
