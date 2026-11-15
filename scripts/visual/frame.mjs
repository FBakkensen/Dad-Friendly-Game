/* global document, getComputedStyle, setTimeout */
/**
 * Slice 1's frame (#659, switched on for everyone in #664): the order strip, the
 * top row with the one hire key, the mine (#660) and the city (#662), Next,
 * the site bar and the save line, and the workforce sheet over them, at the
 * phone and at a shorter phone. Its cards (#663): the shift report after a
 * night, and the end card behind the report of the night the Light Tower's
 * roof went on. The start (#703): the first evening's card, then the mine's
 * pile lines.
 */
import {
  DEV_BACKUP_KEY,
  sliceBusySave,
  sliceDoneSave,
  sliceListSave,
  sliceNightSave,
  sliceOrderedSave,
  sliceRoofSave,
  sliceStartSave,
  sliceStructureSave,
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
  { name: "structure", save: () => sliceStructureSave(Date.now()) },
  { name: "done", save: () => sliceDoneSave(Date.now()) },
  { name: "list", save: () => sliceListSave(Date.now()) },
];

/** The Light Tower's picture, in board px: it has to fit between the plate and the road. */
const TOWER_H = 182;
/** The road under the ground line, in board px (city-scene's CITY_FOOT.road). */
const ROAD_H = 22;

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
        ".frame-order-name, .frame-order-step, .frame-order-line, .frame-next-head, .frame-workers-free, .frame-hire, .mine:not([hidden]) :is(.mine-stage-sum, .mine-stage-pile, .mine-key, .mine-deep, .mine-stage-name), .city:not([hidden]) :is(.city-plate-head, .city-fleet, .city-key, .city-tag, .city-card-head, .city-bar-line, .city-order, .city-crew-line, .city-completion)",
      ),
    ]
      .filter(
        (el) =>
          el.scrollWidth > el.clientWidth + 1 ||
          (el.classList.contains("wrap") &&
            el.scrollHeight > el.clientHeight + 1),
      )
      .map((el) => el.className);
    const mine = document.querySelector(".mine:not([hidden])");
    // Each stage row's words (its head, sum and pile line) stay inside the row.
    const spill = [...(mine?.querySelectorAll(".mine-stage") ?? [])]
      .filter((row) => {
        const r = row.getBoundingClientRect();
        return [
          ...row.querySelectorAll(
            ".mine-stage-head, .mine-stage-sum, .mine-stage-pile",
          ),
        ]
          .filter(shown)
          .some((el) => {
            const b = el.getBoundingClientRect();
            return b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5;
          });
      })
      .map((row) => row.dataset.stage);
    const piles = [...(mine?.querySelectorAll(".mine-stage-pile") ?? [])]
      .filter(shown)
      .map((el) => el.textContent ?? "");
    const box = (selector) => {
      const found = mine?.querySelector(selector);
      return found === null || found === undefined ? undefined : px(found);
    };
    const city = document.querySelector(".city:not([hidden])");
    const part = (selector) => {
      const found = city?.querySelector(selector);
      return found === null || found === undefined ? undefined : px(found);
    };
    return {
      city:
        city === null
          ? undefined
          : {
              scene: px(city),
              plate: part(".city-plate"),
              tags: part(".city-tags"),
              card: part(".city-card"),
            },
      mine:
        mine === null
          ? undefined
          : {
              scene: px(mine),
              zones: box(".mine-zones"),
              deep: box(".mine-deep"),
              panel: box(".mine-panel"),
              spill,
              piles,
            },
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

/** The mine's keys and rows sit in its scene, under the gallery and the line under it. */
function mineFits(facts) {
  const mine = facts.mine;
  if (mine === undefined) {
    return false;
  }
  const { scene, zones, deep, panel } = mine;
  return (
    [scene, zones, deep, panel].every((part) => part !== undefined) &&
    mine.spill.length === 0 &&
    panel.t >= zones.b - 0.5 &&
    panel.t >= deep.b - 0.5 &&
    panel.b <= scene.b + 0.5
  );
}

/**
 * The city's plate sits on top, the tags over the card, the card at the
 * scene's foot, and the Light Tower's whole picture fits between the plate
 * and the road.
 */
function cityFits(facts) {
  const city = facts.city;
  if (city === undefined) {
    return false;
  }
  const { scene, plate, tags, card } = city;
  return (
    [scene, plate, tags, card].every((part) => part !== undefined) &&
    plate.t >= scene.t - 0.5 &&
    tags.b <= card.t + 0.5 &&
    card.b <= scene.b + 0.5 &&
    plate.b + TOWER_H <= tags.t - ROAD_H + 0.5
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

/**
 * A sheet's keys and words (#661): a stage's list, or the workforce. Open,
 * inside the board above the save line, its machines, every key at least
 * 48px, and no key's or number's words cut.
 */
async function stageSheetFacts(page, selector = ".stage-sheet") {
  return page.evaluate((selector) => {
    const board = globalThis.__board();
    const sheet = document.querySelector(selector);
    const box = sheet?.querySelector(".frame-sheet-box");
    const line = document.querySelector(".board-saveline");
    if (sheet === null || box === null || line === null) {
      return { open: false };
    }
    const r = box.getBoundingClientRect();
    const lineTop = line.getBoundingClientRect().top;
    const page = sheet.querySelector(".stage-page:not([hidden])");
    const small = [...sheet.querySelectorAll("button")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return {
          name: el.className,
          w: b.width / board.scale,
          h: b.height / board.scale,
        };
      })
      .filter((b) => b.w < 47.5 || b.h < 47.5);
    const cut = [
      ...sheet.querySelectorAll(
        ".mine-key-face, .mine-key-small, .stage-buy, .stage-total, .stage-part-name, .stage-part-moves",
      ),
    ]
      .filter(
        (el) =>
          el.getClientRects().length > 0 && el.scrollWidth > el.clientWidth + 1,
      )
      .map((el) => el.className);
    return {
      open: !sheet.hidden,
      inside: r.top >= board.top - 0.5 && r.bottom <= lineTop + 0.5,
      machines: page?.querySelectorAll("[data-machine]").length ?? 0,
      small,
      cut,
      words: sheet.textContent ?? "",
    };
  }, selector);
}

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  for (const { name, save } of SAVES) {
    section(`${label} slice frame ${name}`, async () => {
      const { page, close } = await openScreen(size, save(), {
        search: "?memorySave=1",
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
          if (site === "mine") {
            check(
              mineFits(facts),
              `${at} mine: the keys and the stage rows sit under the gallery and the line under it (${JSON.stringify(facts.mine)})`,
            );
          } else {
            check(
              cityFits(facts),
              `${at} city: the plate on top, the tags over the card at the foot, and room for the Light Tower between (${JSON.stringify(facts.city)})`,
            );
          }
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
        await tap(page, '.frame-site[data-site="mine"]');
        for (const stage of ["face", "haul", "lift"]) {
          await tap(
            page,
            `.mine-stage[data-stage="${stage}"] .mine-stage-info`,
          );
          const list = await stageSheetFacts(page);
          await shot(page, `slice-stage-${stage}-${name}-${label}`);
          check(
            list.open && list.inside && list.machines === 1,
            `${at} ${stage}'s list opens above the save line with its machine`,
          );
          check(
            list.small.length === 0,
            `${at} ${stage}'s list: every key is at least 48px (${JSON.stringify(list.small)})`,
          );
          check(
            list.cut.length === 0,
            `${at} ${stage}'s list: no key's words are cut (${list.cut.join(", ")})`,
          );
          check(
            !/\bhands?\b|by hand|bottleneck|limit|best buy/i.test(list.words),
            `${at} ${stage}'s list: no "hands", and no limit or best buy named`,
          );
          check(
            await noScroll(page),
            `${at} ${stage}'s list does not scroll the page`,
          );
          await tap(page, ".stage-sheet .frame-sheet-close");
        }
        await tap(page, ".frame-workers");
        const workforce = await stageSheetFacts(
          page,
          ".frame-sheet:not(.stage-sheet)",
        );
        check(
          workforce.small.length === 0 && workforce.cut.length === 0,
          `${at} the workforce: every key is at least 48px, and no key's words are cut (${JSON.stringify([workforce.small, workforce.cut])})`,
        );
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
          await tap(
            page,
            '.frame-sheet .frame-step[data-job="drilling"][data-way="place"]',
          );
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

/**
 * The card over the frame in board px: shown, its kind, its box inside the
 * board and above the save line, its words all in view (nothing cut, nothing
 * scrolled away), and its key's size.
 */
async function cardFacts(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const card = document.querySelector(".frame-card");
    const box = card?.querySelector(".frame-card-box");
    const body = card?.querySelector(".frame-card-body");
    const key = card?.querySelector(".frame-card-key");
    const line = document.querySelector(".board-saveline");
    if (card === null || box === null || body === null || key === null) {
      return { shown: false };
    }
    const r = box.getBoundingClientRect();
    const k = key.getBoundingClientRect();
    const cut = [
      ...card.querySelectorAll(
        ".frame-card-title, .frame-card-line, .frame-card-labels span, .frame-card-key",
      ),
    ]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className);
    return {
      shown: !card.hidden,
      kind: card.dataset.card,
      inside:
        r.top >= board.top - 0.5 &&
        line !== null &&
        r.bottom <= line.getBoundingClientRect().top + 0.5,
      allInView: body.scrollHeight <= body.clientHeight + 1,
      key: { w: k.width / board.scale, h: k.height / board.scale },
      cut,
      words: card.textContent ?? "",
    };
  });
}

/** One card's checks: in view above the save line, a fat key, every word whole. */
function checkCard(facts, at, kind) {
  check(
    facts.shown && facts.kind === kind,
    `${at} the ${kind} card is up (${String(facts.kind)})`,
  );
  check(facts.inside, `${at} the ${kind} card sits above the save line`);
  check(facts.allInView, `${at} every line of the ${kind} card is in view`);
  check(
    facts.key.w >= 47.5 && facts.key.h >= 47.5,
    `${at} the ${kind} card's key is at least 48px (${JSON.stringify(facts.key)})`,
  );
  check(
    facts.cut.length === 0,
    `${at} no word on the ${kind} card is cut (${facts.cut.join(", ")})`,
  );
  check(
    !/\bhands?\b|by hand|bottleneck|\blimit|best buy/i.test(facts.words),
    `${at} the ${kind} card names no hands, no bottleneck, no limit and no best buy`,
  );
}

const NIGHTS = [
  { name: "night", save: () => sliceNightSave(Date.now()) },
  { name: "roof", save: () => sliceRoofSave(Date.now()) },
];

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  for (const { name, save } of NIGHTS) {
    section(`${label} slice frame ${name}`, async () => {
      const { page, close } = await openScreen(size, save(), {
        search: "?memorySave=1",
        seedKey: DEV_BACKUP_KEY,
      });
      try {
        await page.waitForSelector(".frame-card:not([hidden])");
        const at = `${label} slice frame ${name}:`;
        const report = await cardFacts(page);
        await shot(page, `slice-card-report-${name}-${label}`);
        checkCard(report, at, "report");
        check(
          await noScroll(page),
          `${at} the report does not scroll the page`,
        );
        if (name === "roof") {
          check(
            report.words.includes("The Light Tower: operational."),
            `${at} the report says the Light Tower is operational`,
          );
        }
        await tap(page, ".frame-card-key");
        const after = await cardFacts(page);
        if (name === "roof") {
          await shot(page, `slice-card-end-${label}`);
          checkCard(after, at, "end");
          check(
            await noScroll(page),
            `${at} the end card does not scroll the page`,
          );
          await tap(page, ".frame-card-key");
          check(
            !(await cardFacts(page)).shown,
            `${at} Continue closes the end card`,
          );
        } else {
          check(
            !after.shown,
            `${at} Resume closes the report, and no card follows`,
          );
        }
      } finally {
        await close();
      }
    });
  }
}

/**
 * The open Ledger on the frame (#708), in board px: its box between the top
 * and the save line, every shown key at least 48px, no row's or plate's
 * words cut, and its words.
 */
async function ledgerFacts(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const sheet = document.querySelector(
      '.board-sheet[data-sheet="ledger"].is-open',
    );
    const line = document.querySelector(".board-saveline");
    if (sheet === null || line === null) {
      return { open: false };
    }
    const r = sheet.getBoundingClientRect();
    const shown = (el) =>
      el.getClientRects().length > 0 && el.closest("[hidden]") === null;
    const small = [...sheet.querySelectorAll("button")]
      .filter(shown)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return {
          name: el.className,
          w: b.width / board.scale,
          h: b.height / board.scale,
        };
      })
      .filter((b) => b.w < 47.5 || b.h < 47.5);
    const cut = [
      ...sheet.querySelectorAll(
        ".board-row-name, .board-row-info, .board-platebtn-text, .ledger-page-title, .ledger-page-line",
      ),
    ]
      .filter(shown)
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className);
    const words = sheet.innerText.replace(/\s+/g, " ");
    return {
      open: true,
      inside:
        r.top >= board.top - 0.5 &&
        r.bottom <= line.getBoundingClientRect().top + 0.5,
      small,
      cut,
      words,
    };
  });
}

function checkLedger(facts, at, what) {
  check(facts.open, `${at} ${what}: the Ledger is open`);
  check(facts.inside, `${at} ${what}: the Ledger sits above the save line`);
  check(
    facts.small.length === 0,
    `${at} ${what}: every key in the Ledger is at least 48px (${JSON.stringify(facts.small)})`,
  );
  check(
    facts.cut.length === 0,
    `${at} ${what}: no word in the Ledger is cut (${facts.cut.join(", ")})`,
  );
  check(
    !/Infinity|NaN|\bdeep\b|stones left|relic|pocket|mountain|\bface\b|\bhands?\b/i.test(
      facts.words,
    ),
    `${at} ${what}: no depth, relic, mountain, face or hands (${facts.words})`,
  );
}

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  section(`${label} slice frame ledger`, async () => {
    const { page, close } = await openScreen(size, sliceBusySave(Date.now()), {
      search: "?memorySave=1",
      seedKey: DEV_BACKUP_KEY,
    });
    try {
      await page.waitForSelector(".frame-next-line");
      const at = `${label} slice frame ledger:`;
      await tap(page, ".frame-key");
      await page.waitForSelector(".board-sheet.is-open .board-sheet-back");
      // The slide up takes six steps of 40ms.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const list = await ledgerFacts(page);
      await shot(page, `slice-ledger-${label}`);
      checkLedger(list, at, "the list");
      check(
        list.words.includes("stone in the stockpile"),
        `${at} the list reads the stockpile (${list.words})`,
      );
      check(await noScroll(page), `${at} the Ledger does not scroll the page`);
      await tap(page, ".ledger-start-over");
      await page.waitForSelector(".ledger-start-over-page");
      const ask = await ledgerFacts(page);
      await shot(page, `slice-ledger-start-over-${label}`);
      checkLedger(ask, at, "Start over");
      check(await noScroll(page), `${at} Start over does not scroll the page`);
      await tap(page, ".ledger-keep");
      await tap(page, ".ledger-saved-copies");
      await page.waitForSelector(".saved-copies:not([hidden])");
      // The face rises from the save line in six steps of 40ms.
      await new Promise((resolve) => setTimeout(resolve, 400));
      await shot(page, `slice-ledger-saved-copies-${label}`);
      const copies = await page.evaluate(() => {
        const card = document.querySelector(".saved-copies .board-card-face");
        const line = document.querySelector(".board-saveline");
        const r = card?.getBoundingClientRect();
        return (
          r !== undefined &&
          line !== null &&
          r.bottom <= line.getBoundingClientRect().top + 0.5
        );
      });
      check(copies, `${at} Saved copies sits above the save line`);
      check(
        await noScroll(page),
        `${at} Saved copies does not scroll the page`,
      );
    } finally {
      await close();
    }
  });
}

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  section(`${label} slice frame start`, async () => {
    const { page, close } = await openScreen(size, sliceStartSave(Date.now()), {
      search: "?memorySave=1",
      seedKey: DEV_BACKUP_KEY,
    });
    try {
      await page.waitForSelector(".frame-card:not([hidden])");
      const at = `${label} slice frame start:`;
      const first = await cardFacts(page);
      await shot(page, `slice-card-first-${label}`);
      checkCard(first, at, "first");
      check(
        await noScroll(page),
        `${at} the first card does not scroll the page`,
      );
      await tap(page, ".frame-card-key");
      check(!(await cardFacts(page)).shown, `${at} Start closes the card`);
      await tap(page, '.frame-site[data-site="mine"]');
      const facts = await frameFacts(page);
      await shot(page, `slice-frame-start-mine-${label}`);
      check(
        mineFits(facts),
        `${at} mine: the keys and the stage rows sit under the gallery, every row's words inside it (${JSON.stringify(facts.mine)})`,
      );
      const piles = facts.mine?.piles ?? [];
      check(
        piles.length === 2 &&
          /^Drilled rock: \d+ of \d+$/.test(piles[0] ?? "") &&
          /^Rock at the shaft: \d+ of \d+$/.test(piles[1] ?? ""),
        `${at} mine: drilling and haulage say their piles, hoisting none (${JSON.stringify(piles)})`,
      );
      check(
        facts.small.length === 0,
        `${at} mine: every key is at least 48px (${JSON.stringify(facts.small)})`,
      );
      check(
        facts.cut.length === 0,
        `${at} mine: no word in the frame is cut (${facts.cut.join(", ")})`,
      );
      check(await noScroll(page), `${at} the mine does not scroll the page`);
      // No free worker: a builder's + says so, clear of the plots' names (#715).
      await tap(page, '.frame-site[data-site="city"]');
      await tap(
        page,
        '.city .frame-step[data-job="building"][data-way="place"]',
      );
      const note = await cityNoteFacts(page);
      await shot(page, `slice-city-note-${label}`);
      check(
        note.shown && note.over.length === 0,
        `${at} city: the no-free-worker note is up and covers no plot's name (${JSON.stringify(note)})`,
      );
    } finally {
      await close();
    }
  });
}

/** The city's no-free-worker note: whether it is up, and the plot names it covers. */
async function cityNoteFacts(page) {
  return page.evaluate(() => {
    const note = document.querySelector(".city-note");
    const box = note?.getBoundingClientRect();
    const shown = note instanceof HTMLElement && !note.hidden;
    const over = [...document.querySelectorAll(".city-tag")]
      .filter((tag) => {
        const r = tag.getBoundingClientRect();
        return (
          box !== undefined &&
          r.left < box.right &&
          r.right > box.left &&
          r.top < box.bottom &&
          r.bottom > box.top
        );
      })
      .map((tag) => tag.textContent ?? "");
    return { shown, over };
  });
}
