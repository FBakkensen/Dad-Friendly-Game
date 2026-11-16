/* global document, getComputedStyle, setTimeout */
/**
 * Slice 1's frame (#659, switched on for everyone in #664): the order strip, the
 * top row with the one hire key, the mine (#660) and the city (#662), Next,
 * the site bar and the save line, and the workforce sheet over them, at the
 * phone and at a shorter phone. Its cards (#663): the shift report after a
 * night, and the end card behind the report of the night the Light Tower's
 * roof went on. The start (#703): the first evening's card, then the mine's
 * pile lines. Part 2 (#671): the refinery, two stockpiles on the top row, and
 * the report of a night the stockyard stopped, with its second key. Part 3
 * (#681, switched on in #682): the factory, idle, delivering and
 * done, and a blueprint dragged onto the station; and the mine with two
 * levels (#680), its machine card, and the two levels the Sink key opens,
 * behind the card that says the Granite is reached (#754).
 */
import {
  DEV_BACKUP_KEY,
  sliceBusySave,
  sliceDoneSave,
  sliceFactoryDoneSave,
  sliceFactoryOrderSave,
  sliceFactorySave,
  sliceGraniteUnsunkSave,
  sliceListSave,
  sliceNightSave,
  sliceOrderedSave,
  sliceRefinerySave,
  sliceRoofSave,
  sliceStartSave,
  sliceStructureSave,
  sliceTwoLevelsSave,
  sliceWarehouseRoofSave,
  sliceFoundryRoofSave,
  sliceFoundrySave,
  sliceWarehouseSave,
  sliceWarehouseTrucksSave,
  sliceYardFullSave,
} from "../../tools/browser/fixtures.ts";
import { targetsCloserThan } from "../../src/ui-audit-measure.ts";
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
  { name: "warehouse", save: () => sliceWarehouseSave(Date.now()) },
  { name: "foundry", save: () => sliceFoundrySave(Date.now()) },
  { name: "done", save: () => sliceDoneSave(Date.now()) },
  { name: "list", save: () => sliceListSave(Date.now()) },
];

/**
 * The workforce's jobs: five, the kilns once the refinery is open (part 2,
 * #672), and with the shaft sunk the Granite's drilling and haulage and the
 * saws too (part 3, #682).
 */
const JOBS = { warehouse: 6, foundry: 9, done: 9 };
const jobsOf = (name) => JOBS[name] ?? 5;

/**
 * The machines in each stage's list: since part 3 (#682) the borer and the
 * locomotive are in play from the first evening, locked until the shaft is
 * sunk; the winding engine waits for a later slice.
 */
const STAGE_MACHINES = { face: 2, haul: 2, lift: 1 };

/** The Light Tower's picture, in board px: it has to fit between the plate and the road. */
const TOWER_H = 182;
/**
 * The keys a finger can reach inside `roots` (the frame and the save line, or
 * an open sheet), each as the part in view (`__reach`, the UI audit's own
 * measure), in board px.
 */
async function keyBoxes(page, roots) {
  return page.evaluate((selector) => {
    const board = globalThis.__board();
    const keys = [...document.querySelectorAll(selector)].flatMap((root) => [
      ...root.querySelectorAll("button, a, [role='button']"),
    ]);
    return keys
      .filter(
        (el) =>
          el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility !== "hidden",
      )
      .map((el) => {
        // The harness's in-page helper, the one the UI audit measures with.
        const { top, bottom, left, right } = globalThis.__reach(el);
        const name = [el.tagName.toLowerCase(), ...el.classList].join(".");
        const at = el.dataset.stage ?? el.dataset.job ?? el.dataset.site ?? "";
        return {
          selector: `${name}${at === "" ? "" : `[${at}]`}`,
          top: top / board.scale,
          left: left / board.scale,
          width: Math.max(0, right - left) / board.scale,
          height: Math.max(0, bottom - top) / board.scale,
        };
      })
      .filter((box) => box.width > 0 && box.height > 0);
  }, roots);
}

/**
 * Keys closer than 8 board px (#719), as `boardGaps` held the board's. A
 * scaled frame snaps each box to device pixels, so an 8px gap can read 7.99
 * on a shorter phone: allow a tenth of a pixel.
 */
async function keyGaps(page, roots) {
  return targetsCloserThan(await keyBoxes(page, roots), 7.9).map(
    (pair) => `${pair.a} ${pair.b} ${String(Math.round(pair.gap * 10) / 10)}`,
  );
}

/** The frame's own keys and the save line, with no sheet or card open. */
const FRAME_KEYS = ".frame, .board-saveline";

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
      // A closed site's group is built but hidden (the refinery in part 1, #671).
      rows: [...sheet.querySelectorAll(".frame-job")].filter(
        (row) => row.closest("[hidden]") === null,
      ).length,
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
            facts.hires.length === 1 &&
              facts.hires[0].split(" ").includes("frame-top"),
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
          const close = await keyGaps(page, FRAME_KEYS);
          check(
            close.length === 0,
            `${at} ${site}: every key stands at least 8px from the next (${close.join("; ")})`,
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
            list.open && list.inside && list.machines === STAGE_MACHINES[stage],
            `${at} ${stage}'s list opens above the save line with its ${String(STAGE_MACHINES[stage])} machines (${String(list.machines)})`,
          );
          check(
            list.small.length === 0,
            `${at} ${stage}'s list: every key is at least 48px (${JSON.stringify(list.small)})`,
          );
          check(
            list.cut.length === 0,
            `${at} ${stage}'s list: no key's words are cut (${list.cut.join(", ")})`,
          );
          const listClose = await keyGaps(page, ".stage-sheet:not([hidden])");
          check(
            listClose.length === 0,
            `${at} ${stage}'s list: every key stands at least 8px from the next (${listClose.join("; ")})`,
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
        const sheetClose = await keyGaps(
          page,
          ".frame-sheet:not(.stage-sheet):not([hidden])",
        );
        check(
          sheetClose.length === 0,
          `${at} the workforce: every key stands at least 8px from the next (${sheetClose.join("; ")})`,
        );
        const sheet = await sheetFacts(page);
        await shot(page, `slice-workforce-${name}-${label}`);
        check(
          sheet.open && sheet.inside && sheet.rows === jobsOf(name),
          `${at} the workforce opens above the save line with its ${String(jobsOf(name))} jobs`,
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
        ".frame-card-title, .frame-card-line, .frame-card-labels span, .frame-card-key, .frame-card-mark, .frame-card-yard",
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

/**
 * The night saves, and the card behind each night's report: the Light
 * Tower's roof opens the refinery (#672), the Warehouse's opens trucks, and
 * the Foundry's is the end of the slice (#682).
 */
const NIGHTS = [
  { name: "night", save: () => sliceNightSave(Date.now()) },
  {
    name: "roof",
    save: () => sliceRoofSave(Date.now()),
    building: "The Light Tower",
    behind: "opens",
  },
  {
    name: "warehouse roof",
    save: () => sliceWarehouseRoofSave(Date.now()),
    building: "The Warehouse",
    behind: "built",
  },
  {
    name: "foundry roof",
    save: () => sliceFoundryRoofSave(Date.now()),
    building: "The Foundry",
    behind: "end",
  },
];

/** What each card behind a report must say, and must not promise. */
const BEHIND_SAYS = {
  opens: (words) =>
    words.includes("New site: the refinery.") &&
    !words.includes("later update"),
  built: (words) =>
    words.includes("Opens trucks.") && !words.includes("later update"),
  end: (words) => words.includes("later update"),
};

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  for (const { name, save, building, behind } of NIGHTS) {
    section(`${label} slice frame ${name}`, async () => {
      const { page, close } = await openScreen(size, save(), {
        search: "?memorySave=1",
        seedKey: DEV_BACKUP_KEY,
      });
      try {
        await page.waitForSelector(".frame-card:not([hidden])");
        const at = `${label} slice frame ${name}:`;
        const report = await cardFacts(page);
        const shotName = name.replace(" ", "-");
        await shot(page, `slice-card-report-${shotName}-${label}`);
        checkCard(report, at, "report");
        check(
          await noScroll(page),
          `${at} the report does not scroll the page`,
        );
        if (building !== undefined) {
          check(
            report.words.includes(`${building}: operational.`),
            `${at} the report says ${building} is operational`,
          );
        }
        await tap(page, ".frame-card-key");
        const after = await cardFacts(page);
        if (behind !== undefined) {
          await shot(page, `slice-card-${behind}-${label}`);
          checkCard(after, at, behind);
          check(
            BEHIND_SAYS[behind](after.words),
            `${at} the ${behind} card says what is live, and promises nothing more`,
          );
          check(
            await noScroll(page),
            `${at} the ${behind} card does not scroll the page`,
          );
          await tap(page, ".frame-card-key");
          check(
            !(await cardFacts(page)).shown,
            `${at} Continue closes the ${behind} card`,
          );
          if (behind === "opens") {
            check(
              await page.$eval(
                '.frame-site[data-site="refinery"]',
                (el) => el.getClientRects().length > 0,
              ),
              `${at} the refinery's tab is in the site bar`,
            );
          }
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

/**
 * The transport plate's row (#754): each shown key's and the trucks' hint's
 * box in board px, the hint's words, and whether any of them is cut.
 */
async function truckRowFacts(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const row = document.querySelector(".city-plate-keys");
    const cells = [...(row?.children ?? [])]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name: el.dataset.vehicle ?? el.dataset.way ?? el.className,
          button: el.tagName === "BUTTON",
          t: (r.top - board.top) / board.scale,
          l: (r.left - board.left) / board.scale,
          w: r.width / board.scale,
          h: r.height / board.scale,
          cut:
            el.scrollWidth > el.clientWidth + 1 ||
            el.scrollHeight > el.clientHeight + 1,
        };
      });
    const hint = document.querySelector(".city-hint");
    return {
      cells,
      hint: hint === null || hint.hidden ? undefined : (hint.textContent ?? ""),
    };
  });
}

/** Every cell of the row on one line, at least 48px, none cut, in this order. */
function truckRowFits(facts, names) {
  const { cells } = facts;
  return (
    cells.length === names.length &&
    cells.every(
      (cell, at) =>
        cell.name.split(" ").includes(names[at]) &&
        Math.abs(cell.t - cells[0].t) < 0.5 &&
        cell.w >= 47.5 &&
        cell.h >= 47.5 &&
        !cell.cut,
    )
  );
}

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  // Part 3 (#754): the truck key beside the wagon's, and before it the hint.
  section(`${label} slice city trucks`, async () => {
    const rows = [
      {
        name: "key",
        save: sliceWarehouseTrucksSave(Date.now()),
        cells: ["free", "place", "horseWagon", "truck"],
        hint: undefined,
      },
      {
        name: "hint",
        save: sliceWarehouseSave(Date.now()),
        cells: ["free", "place", "horseWagon", "city-hint"],
        hint: "Trucks: after the Warehouse",
      },
    ];
    for (const row of rows) {
      const { page, close } = await openScreen(size, row.save, {
        search: "?memorySave=1",
        seedKey: DEV_BACKUP_KEY,
      });
      try {
        await page.waitForSelector(".frame-next-line");
        await tap(page, '.frame-site[data-site="city"]');
        const at = `${label} slice city trucks ${row.name}:`;
        const facts = await truckRowFacts(page);
        const frame = await frameFacts(page);
        await shot(page, `slice-city-trucks-${row.name}-${label}`);
        check(
          truckRowFits(facts, row.cells),
          `${at} − + wagon and the ${row.name} on one row, each at least 48px and none cut (${JSON.stringify(facts.cells)})`,
        );
        check(
          facts.hint === row.hint,
          `${at} the hint reads ${JSON.stringify(row.hint)} (${JSON.stringify(facts.hint)})`,
        );
        check(
          facts.cells.every(
            (cell) => cell.button !== (cell.name === "city-hint"),
          ),
          `${at} every cell but the hint is a key`,
        );
        check(
          cityFits(frame),
          `${at} the plate on top, the tags over the card at the foot (${JSON.stringify(frame.city)})`,
        );
        check(
          frame.small.length === 0 && frame.cut.length === 0,
          `${at} every key is at least 48px and no word is cut (${JSON.stringify([frame.small, frame.cut])})`,
        );
        const close8 = await keyGaps(page, FRAME_KEYS);
        check(
          close8.length === 0,
          `${at} every key stands at least 8px from the next (${close8.join("; ")})`,
        );
        check(await noScroll(page), `${at} the page does not scroll`);
      } finally {
        await close();
      }
    }
  });
}

/** The city's no-free-worker note: whether it is up, and the plot names it covers. */
async function cityNoteFacts(page) {
  return page.evaluate(() => {
    const note = document.querySelector(".city-note");
    const box = note?.getBoundingClientRect();
    const shown = note !== null && !note.hasAttribute("hidden");
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

/**
 * The refinery in board px (#671): its scene, its panel (the kilns' plate
 * and the stockyard) inside it, every shown key's size, the words that must
 * stay whole, and its words.
 */
async function refineryFacts(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const px = (el) => {
      const r = el.getBoundingClientRect();
      return {
        t: (r.top - board.top) / board.scale,
        b: (r.bottom - board.top) / board.scale,
        l: (r.left - board.left) / board.scale,
        r: (r.right - board.left) / board.scale,
        w: r.width / board.scale,
        h: r.height / board.scale,
      };
    };
    const shown = (el) =>
      el.getClientRects().length > 0 && el.closest("[hidden]") === null;
    const scene = document.querySelector(".refinery:not([hidden])");
    const plates = [...(scene?.querySelectorAll(".refinery-plate") ?? [])].map(
      (el) => ({
        name: el.querySelector(".mine-stage-name")?.textContent ?? "",
        ...px(el),
      }),
    );
    const labels = [
      ...(scene?.querySelectorAll(".refinery-in, .refinery-bypass") ?? []),
    ]
      .filter(shown)
      .map((el) => ({ name: el.className, ...px(el) }));
    const panel = scene?.querySelector(".refinery-panel");
    const small = [...(scene?.querySelectorAll("button") ?? [])]
      .filter(shown)
      .map((el) => ({ name: el.className, ...px(el) }))
      .filter((b) => b.w < 47.5 || b.h < 47.5);
    const cut = [
      ...document.querySelectorAll(
        ".frame-pile-words, .frame-pile-room, .refinery:not([hidden]) :is(.refinery-recipe, .mine-stage-head, .refinery-machines, .mine-stage-pile, .mine-key-face, .mine-key-small, .refinery-bay, .refinery-expand-words b, .refinery-expand-words small, .refinery-in, .refinery-bypass span)",
      ),
    ]
      .filter(shown)
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className);
    const hires = [
      ...(document.querySelector(".frame")?.querySelectorAll("button") ?? []),
    ].filter((el) =>
      /^Hire\b/.test(el.getAttribute("aria-label") ?? el.textContent ?? ""),
    );
    return {
      scene: scene === null ? undefined : px(scene),
      panel: panel === null || panel === undefined ? undefined : px(panel),
      plates,
      labels,
      piles: [
        ...document.querySelectorAll(".frame-top.two-piles .frame-pile"),
      ].filter(shown).length,
      bays: [...(scene?.querySelectorAll(".refinery-bay") ?? [])]
        .filter(shown)
        .map((el) => el.textContent ?? ""),
      small,
      cut,
      hires: hires.map((el) => el.parentElement?.className ?? ""),
      words: scene?.textContent ?? "",
    };
  });
}

/** What the refinery has to meet at any size, with one plate or two. */
async function checkRefinery(page, at, facts) {
  check(await noScroll(page), `${at} the page does not scroll`);
  check(
    facts.scene !== undefined &&
      facts.panel !== undefined &&
      facts.panel.t >= facts.scene.t - 0.5 &&
      facts.panel.b <= facts.scene.b + 0.5,
    `${at} the makers' plates and the stockyard sit inside the refinery (${JSON.stringify([facts.scene, facts.panel])})`,
  );
  check(
    facts.hires.length === 1 && facts.hires[0].split(" ").includes("frame-top"),
    `${at} one hire key, in the top row (${facts.hires.join(", ")})`,
  );
  check(
    facts.small.length === 0,
    `${at} every key is at least 48px (${JSON.stringify(facts.small)})`,
  );
  check(
    facts.cut.length === 0,
    `${at} no word is cut (${facts.cut.join(", ")})`,
  );
  check(
    !/\bhands?\b|by hand|bottleneck|\blimit|best buy|\bface\b/i.test(
      facts.words,
    ),
    `${at} no hands, no face, and no bottleneck, limit or best buy named`,
  );
  const near = await keyGaps(page, FRAME_KEYS);
  check(
    near.length === 0,
    `${at} every key stands at least 8px from the next (${near.join("; ")})`,
  );
}

/** Two boxes in board px that share any point. */
const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  section(`${label} slice refinery`, async () => {
    const { page, close } = await openScreen(
      size,
      sliceRefinerySave(Date.now()),
      { search: "?memorySave=1", seedKey: DEV_BACKUP_KEY },
    );
    try {
      await page.waitForSelector('.frame-site[data-site="refinery"]');
      await tap(page, '.frame-site[data-site="refinery"]');
      const at = `${label} slice refinery:`;
      const facts = await refineryFacts(page);
      await shot(page, `slice-refinery-${label}`);
      await checkRefinery(page, at, facts);
      check(
        facts.piles === 2,
        `${at} the top row shows the two stockpiles (${String(facts.piles)})`,
      );
      check(
        facts.plates.length === 1 && facts.plates[0].name === "Kilns",
        `${at} the kilns' plate alone (${JSON.stringify(facts.plates)})`,
      );
    } finally {
      await close();
    }
  });

  // Part 3 (#754): the saws' plate beside the kilns', the Granite's hopper over it.
  section(`${label} slice refinery two levels`, async () => {
    const { page, close } = await openScreen(
      size,
      sliceTwoLevelsSave(Date.now()),
      { search: "?memorySave=1", seedKey: DEV_BACKUP_KEY },
    );
    try {
      await page.waitForSelector('.frame-site[data-site="refinery"]');
      await tap(page, '.frame-site[data-site="refinery"]');
      const at = `${label} slice refinery two levels:`;
      const facts = await refineryFacts(page);
      await shot(page, `slice-refinery-two-levels-${label}`);
      await checkRefinery(page, at, facts);
      const [kilns, saws] = facts.plates;
      check(
        facts.plates.length === 2 &&
          kilns.name === "Kilns" &&
          saws.name === "Saws" &&
          Math.abs(kilns.t - saws.t) < 0.5 &&
          kilns.r <= saws.l,
        `${at} the kilns' and the saws' plates side by side (${JSON.stringify(facts.plates)})`,
      );
      check(
        facts.scene !== undefined &&
          facts.plates.length === 2 &&
          kilns.l >= facts.scene.l - 0.5 &&
          saws.r <= facts.scene.r + 0.5,
        `${at} both plates sit inside the refinery from side to side (${JSON.stringify([facts.scene, facts.plates])})`,
      );
      // The saws' good has its stockpile (#754): the top row's third, and the stockyard's third bay.
      check(
        facts.piles === 3,
        `${at} the top row shows stone, brick and cut stone (${String(facts.piles)})`,
      );
      check(
        facts.bays.length === 3 && /^Cut stone /.test(facts.bays[2] ?? ""),
        `${at} the stockyard has a bay for cut stone (${JSON.stringify(facts.bays)})`,
      );
      const names = facts.labels.map((each) => each.name).join(", ");
      check(
        facts.labels.length === 3,
        `${at} the Topsoil, the Granite and the bypass are named (${names})`,
      );
      const crossed = facts.labels.flatMap((a, i) =>
        facts.labels
          .slice(i + 1)
          .filter((b) => overlap(a, b))
          .map((b) => `${a.name} / ${b.name}`),
      );
      check(
        crossed.length === 0,
        `${at} the names over the hoppers and the chute do not cover each other (${crossed.join("; ")})`,
      );
      check(
        facts.labels.every((each) => each.b <= (facts.panel?.t ?? 0)),
        `${at} the names sit above the plates (${JSON.stringify(facts.labels)})`,
      );
    } finally {
      await close();
    }
  });

  section(`${label} slice refinery night`, async () => {
    const { page, close } = await openScreen(
      size,
      sliceYardFullSave(Date.now()),
      { search: "?memorySave=1", seedKey: DEV_BACKUP_KEY },
    );
    try {
      await page.waitForSelector(".frame-card:not([hidden])");
      const at = `${label} slice refinery night:`;
      const report = await cardFacts(page);
      await shot(page, `slice-card-report-yard-${label}`);
      checkCard(report, at, "report");
      check(
        report.words.includes("Stockyard full: production stopped.") &&
          /Brick full at/.test(report.words) &&
          /Stone full at/.test(report.words),
        `${at} the report says the stockyard stopped it, and when each stockpile filled`,
      );
      const yard = await page.$eval(".frame-card-yard", (el) => {
        const board = globalThis.__board();
        const r = el.getBoundingClientRect();
        return {
          shown: el.getClientRects().length > 0,
          w: r.width / board.scale,
          h: r.height / board.scale,
        };
      });
      check(
        yard.shown && yard.w >= 47.5 && yard.h >= 47.5,
        `${at} "To the stockyard" is up beside Resume, at least 48px (${JSON.stringify(yard)})`,
      );
      const near = await keyGaps(page, ".frame-card:not([hidden])");
      check(
        near.length === 0,
        `${at} the card's keys stand at least 8px apart (${near.join("; ")})`,
      );
      check(await noScroll(page), `${at} the report does not scroll the page`);
      await tap(page, ".frame-card-yard");
      const after = await cardFacts(page);
      const site = await page.$eval(".frame-scene", (el) => el.dataset.site);
      await shot(page, `slice-refinery-full-${label}`);
      check(
        !after.shown && site === "refinery",
        `${at} To the stockyard closes the report and opens the refinery (${String(site)})`,
      );
    } finally {
      await close();
    }
  });
}

/**
 * The factory in board px (#681): its scene, the station and the strip
 * inside it, every shown key's size, the words that must stay whole, and
 * its words.
 */
async function factoryFacts(page) {
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
      el.getClientRects().length > 0 && el.closest("[hidden]") === null;
    const scene = document.querySelector(".factory:not([hidden])");
    const station = scene?.querySelector(".factory-station");
    const strip = scene?.querySelector(".factory-strip");
    const small = [
      ...(scene?.querySelectorAll(".factory-station button") ?? []),
    ]
      .filter(shown)
      .map((el) => ({ name: el.className, ...px(el) }))
      .filter((b) => b.w < 47.5 || b.h < 47.5);
    const cut = [
      ...(scene?.querySelectorAll(
        ".factory-installed, .factory-bin, .factory-station-title, .factory-station-line, .factory-good, .factory-install, .factory-cancel b, .factory-cancel small",
      ) ?? []),
    ]
      .filter(shown)
      .filter(
        (el) =>
          el.scrollWidth > el.clientWidth + 1 ||
          el.scrollHeight > el.clientHeight + 1,
      )
      .map((el) => el.className);
    // A card's words stay inside the card.
    const spill = [...(scene?.querySelectorAll(".factory-card") ?? [])]
      .filter((card) => card.scrollHeight > card.clientHeight + 1)
      .map((card) => card.dataset.blueprint);
    return {
      scene: scene === null ? undefined : px(scene),
      station:
        station === null || station === undefined ? undefined : px(station),
      strip: strip === null || strip === undefined ? undefined : px(strip),
      cards: scene?.querySelectorAll(".factory-card").length ?? 0,
      scrolls:
        strip === null || strip === undefined
          ? false
          : strip.scrollWidth > strip.clientWidth,
      small,
      cut,
      spill,
      kind: station?.getAttribute("data-station") ?? undefined,
      words: scene?.textContent ?? "",
    };
  });
}

/** A blueprint pressed and dragged up onto the station's middle, with the mouse. */
async function dragOntoStation(page, blueprint) {
  const from = await page.$eval(
    `.factory-card[data-blueprint="${blueprint}"]`,
    (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
  );
  const to = await page.$eval(".factory-station", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 20, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  // The copy under the finger is the card's size, and sits on the finger.
  const held = await page.evaluate(
    (card, at) => {
      const ghost = document.querySelector(".factory-ghost");
      const home = document.querySelector(card);
      if (ghost === null || home === null) {
        return undefined;
      }
      const g = ghost.getBoundingClientRect();
      const c = home.getBoundingClientRect();
      return {
        height: g.height / c.height,
        width: g.width / c.width,
        onFinger:
          at.x >= g.left - 8 &&
          at.x <= g.right + 8 &&
          at.y >= g.top - 8 &&
          at.y <= g.bottom + 8,
      };
    },
    `.factory-card[data-blueprint="${blueprint}"]`,
    to,
  );
  await page.mouse.up();
  return held;
}

const FACTORY_SAVES = [
  { name: "idle", save: () => sliceFactorySave(Date.now()), kind: "idle" },
  {
    name: "order",
    save: () => sliceFactoryOrderSave(Date.now()),
    kind: "delivering",
  },
  { name: "done", save: () => sliceFactoryDoneSave(Date.now()), kind: "done" },
];

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  for (const { name, save, kind } of FACTORY_SAVES) {
    section(`${label} slice factory ${name}`, async () => {
      const { page, close } = await openScreen(size, save(), {
        search: "?memorySave=1",
        seedKey: DEV_BACKUP_KEY,
      });
      try {
        await page.waitForSelector('.frame-site[data-site="factory"]');
        await tap(page, '.frame-site[data-site="factory"]');
        const at = `${label} slice factory ${name}:`;
        const facts = await factoryFacts(page);
        await shot(page, `slice-factory-${name}-${label}`);
        check(await noScroll(page), `${at} the page does not scroll`);
        check(
          facts.kind === kind,
          `${at} the station is ${kind} (${String(facts.kind)})`,
        );
        check(
          facts.scene !== undefined &&
            facts.station !== undefined &&
            facts.strip !== undefined &&
            facts.station.t >= facts.scene.t - 0.5 &&
            facts.station.b <= facts.strip.t + 0.5 &&
            facts.strip.b <= facts.scene.b + 0.5,
          `${at} the station and the blueprints sit inside the factory, the station above (${JSON.stringify([facts.scene, facts.station, facts.strip])})`,
        );
        check(
          facts.cards === 4 && facts.scrolls,
          `${at} four blueprints in a strip that scrolls sideways (${String(facts.cards)}, ${String(facts.scrolls)})`,
        );
        check(
          facts.small.length === 0,
          `${at} every key is at least 48px (${JSON.stringify(facts.small)})`,
        );
        check(
          facts.cut.length === 0 && facts.spill.length === 0,
          `${at} no word is cut (${[...facts.cut, ...facts.spill].join(", ")})`,
        );
        check(
          !/\bhands?\b|by hand|bottleneck|\blimit|best buy|\bface\b|waiting/i.test(
            facts.words,
          ),
          `${at} no hands, no face, and no bottleneck, limit, best buy or waiting named`,
        );
        const near = await keyGaps(page, FRAME_KEYS);
        check(
          near.length === 0,
          `${at} every key stands at least 8px from the next (${near.join("; ")})`,
        );
        if (name === "idle") {
          // The strip's far end: the last blueprint is whole in its box.
          const last = await page.$eval(".factory-strip", (strip) => {
            strip.scrollLeft = strip.scrollWidth;
            const box = strip.getBoundingClientRect();
            const card = strip.lastElementChild?.getBoundingClientRect();
            return (
              card !== undefined &&
              card.left >= box.left - 0.5 &&
              card.right <= box.right + 0.5
            );
          });
          await shot(page, `slice-factory-strip-end-${label}`);
          check(last, `${at} the strip scrolls to its last blueprint, whole`);
          await page.$eval(".factory-strip", (strip) => {
            strip.scrollLeft = 0;
          });
          const held = await dragOntoStation(page, "blasting-charge");
          check(
            held !== undefined &&
              Math.abs(held.height - 1) < 0.1 &&
              Math.abs(held.width - 1) < 0.1 &&
              held.onFinger,
            `${at} the dragged blueprint's copy is the card's size, on the finger (${JSON.stringify(held)})`,
          );
          const after = await factoryFacts(page);
          check(
            after.kind === "delivering" && /Blasting charge/i.test(after.words),
            `${at} a blueprint dragged onto the station places its work order (${String(after.kind)})`,
          );
        }
      } finally {
        await close();
      }
    });
  }
}

/**
 * The mine with two levels in board px (#680): each level's rows and its
 * piles line under its gallery, top down, the keys, Hoisting's row and the
 * strip under them, and the mine's words.
 */
async function levelsFacts(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const px = (el) => {
      const r = el.getBoundingClientRect();
      return {
        t: (r.top - board.top) / board.scale,
        b: (r.bottom - board.top) / board.scale,
      };
    };
    const mine = document.querySelector(".mine:not([hidden])");
    const shown = (el) => el.closest("[hidden]") === null;
    const all = (selector) =>
      [...(mine?.querySelectorAll(selector) ?? [])].filter(shown).map(px);
    const one = (selector) => {
      const found = mine?.querySelector(selector);
      return found === null || found === undefined ? undefined : px(found);
    };
    return {
      scene: mine === null ? undefined : px(mine),
      panel: one(".mine-panel"),
      rows: all(".mine-level-rows"),
      piles: all(".mine-piles"),
      strip: all(".mine-strip-cell").length,
      words: mine?.textContent ?? "",
    };
  });
}

/** The levels stack top down, each pile line under its rows, and the last above the keys. */
function levelsFit(facts) {
  const { scene, panel, rows, piles } = facts;
  if (scene === undefined || panel === undefined) {
    return false;
  }
  if (rows.length !== 2 || piles.length !== 2) {
    return false;
  }
  const order = [rows[0], piles[0], rows[1], piles[1]];
  return (
    order.every(
      (part, index) =>
        part.t >= scene.t - 0.5 &&
        (index === 0 || part.t >= order[index - 1].b - 0.5),
    ) &&
    piles[1].b <= panel.t + 0.5 &&
    panel.b <= scene.b + 0.5
  );
}

/** The machine card in board px: inside the board above the save line, and its keys. */
async function machineCardFacts(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const card = document.querySelector(".machine-card");
    const box = card?.querySelector(".machine-card-box");
    const line = document.querySelector(".board-saveline");
    if (card === null || box === null || line === null) {
      return { open: false };
    }
    const r = box.getBoundingClientRect();
    const keys = [...card.querySelectorAll("button")].filter(
      (el) => el.getClientRects().length > 0,
    );
    return {
      open: !card.hidden,
      inside:
        r.top >= board.top - 0.5 &&
        r.bottom <= line.getBoundingClientRect().top + 0.5,
      levels: card.querySelectorAll(".machine-card-level").length,
      small: keys
        .map((el) => {
          const b = el.getBoundingClientRect();
          return {
            name: el.className,
            w: b.width / board.scale,
            h: b.height / board.scale,
          };
        })
        .filter((b) => b.w < 47.5 || b.h < 47.5),
      words: card.textContent ?? "",
    };
  });
}

/** What the mine with two levels has to meet at a size: the frame's checks, and its own. */
async function checkTwoLevels(page, at) {
  const facts = await frameFacts(page);
  const levels = await levelsFacts(page);
  check(await noScroll(page), `${at} the page does not scroll`);
  check(
    stacked(facts),
    `${at} the order strip, the top row, the ground, Next and the site bar stack above the save line`,
  );
  check(
    levelsFit(levels),
    `${at} each level's rows and piles sit on it, top down, above the keys (${JSON.stringify(levels)})`,
  );
  check(
    levels.strip === 3,
    `${at} the strip has the Topsoil, the Granite and both in turn (${String(levels.strip)})`,
  );
  check(
    facts.mine !== undefined && facts.mine.spill.length === 0,
    `${at} every row's words stay inside it (${JSON.stringify(facts.mine?.spill)})`,
  );
  check(
    facts.small.length === 0,
    `${at} every key is at least 48px (${JSON.stringify(facts.small)})`,
  );
  check(
    facts.cut.length === 0,
    `${at} no word in the frame is cut (${facts.cut.join(", ")})`,
  );
  check(
    !/\bhands?\b|by hand|bottleneck|\blimit|best buy|\bface\b/i.test(
      levels.words,
    ),
    `${at} no hands, no face, and no bottleneck, limit or best buy named`,
  );
  const near = await keyGaps(page, FRAME_KEYS);
  check(
    near.length === 0,
    `${at} every key stands at least 8px from the next (${near.join("; ")})`,
  );
}

/** The Granite's plate and the Sink key's words that spill out of their box. */
async function gateCut(page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".mine:not([hidden]) :is(.mine-granite-name, .mine-granite-line, .mine-sink-title, .mine-sink-small, .mine-sink-price)",
      ),
    ]
      .filter(
        (el) =>
          el.getClientRects().length > 0 &&
          (el.scrollWidth > el.clientWidth + 1 ||
            el.scrollHeight > el.clientHeight + 1),
      )
      .map((el) => el.className),
  );
}

/** Each pile line holds no more than its room: "Rock at the shaft: 396 of 300" reads as a bug. */
function pilesOverRoom(piles) {
  const number = (text) => Number(text.replace(/,/g, ""));
  return piles.filter((line) => {
    const found = /: ([\d,.]+[KMB]?) of ([\d,.]+[KMB]?)$/.exec(line);
    return (
      found !== null &&
      !/[KMB]/.test(line) &&
      number(found[1]) > number(found[2])
    );
  });
}

/** The one-level mine with the Granite's plate and the Sink key: the frame's checks, and its own. */
async function checkGate(page, at) {
  const facts = await frameFacts(page);
  check(await noScroll(page), `${at} the page does not scroll before the Sink`);
  check(
    stacked(facts),
    `${at} the order strip, the top row, the ground, Next and the site bar stack above the save line`,
  );
  check(
    mineFits(facts),
    `${at} the mine's keys and rows sit under the gallery and the line under the Granite's plate (${JSON.stringify(facts.mine)})`,
  );
  check(
    facts.small.length === 0,
    `${at} every key is at least 48px (${JSON.stringify(facts.small)})`,
  );
  const cut = [...facts.cut, ...(await gateCut(page))];
  check(
    cut.length === 0,
    `${at} no word in the frame is cut (${cut.join(", ")})`,
  );
  const over = pilesOverRoom(facts.mine?.piles ?? []);
  check(
    over.length === 0,
    `${at} no pile holds more than its room (${over.join("; ")})`,
  );
  const mineWords = await page.$eval(".mine", (el) => el.textContent ?? "");
  check(
    !/\bhands?\b|by hand|bottleneck|\blimit|best buy|\bface\b/i.test(mineWords),
    `${at} no hands, no face, and no bottleneck, limit or best buy named`,
  );
  const near = await keyGaps(page, FRAME_KEYS);
  check(
    near.length === 0,
    `${at} every key stands at least 8px from the next (${near.join("; ")})`,
  );
}

/**
 * Taps the Sink and waits for the card that says the Granite is reached
 * (#754), which comes over the frame before the two levels are seen.
 */
async function sinkTheShaft(page) {
  await page.waitForSelector(".mine-sink:not([hidden])");
  await tap(page, ".mine-sink");
  await page.waitForSelector('.frame-card[data-card="level"]:not([hidden])');
  return cardFacts(page);
}

for (const size of SIZES) {
  const label = `${String(size[0])}x${String(size[1])}`;
  section(`${label} slice mine two levels`, async () => {
    const { page, close } = await openScreen(
      size,
      sliceTwoLevelsSave(Date.now()),
      {
        search: "?memorySave=1",
        seedKey: DEV_BACKUP_KEY,
      },
    );
    try {
      await page.waitForSelector(".mine-levels:not([hidden])");
      const at = `${label} slice mine two levels:`;
      await shot(page, `slice-mine-two-levels-${label}`);
      await checkTwoLevels(page, at);
      // A drill's key asks which level (ruling 5).
      await tap(page, '.mine-key[data-stage="face"]');
      await page.waitForSelector(".machine-card:not([hidden])");
      const card = await machineCardFacts(page);
      await shot(page, `slice-mine-machine-card-${label}`);
      check(
        card.open && card.inside && card.levels === 2,
        `${at} the machine card opens above the save line with a key for each level (${JSON.stringify(card)})`,
      );
      check(
        card.small.length === 0,
        `${at} the machine card: every key is at least 48px (${JSON.stringify(card.small)})`,
      );
      const cardNear = await keyGaps(page, ".machine-card:not([hidden])");
      check(
        cardNear.length === 0,
        `${at} the machine card: every key stands at least 8px from the next (${cardNear.join("; ")})`,
      );
      await tap(page, ".machine-card-not-now");
      const shut = await page.$eval(".machine-card", (el) => el.hidden);
      check(shut, `${at} "Not now" closes the machine card`);
    } finally {
      await close();
    }
  });

  section(`${label} slice mine two levels from the Sink`, async () => {
    const { page, close } = await openScreen(
      size,
      sliceGraniteUnsunkSave(Date.now()),
      { search: "?memorySave=1", seedKey: DEV_BACKUP_KEY },
    );
    try {
      await page.waitForSelector(".mine-sink:not([hidden])");
      const at = `${label} slice mine two levels from the Sink:`;
      await shot(page, `slice-mine-granite-unsunk-${label}`);
      await checkGate(page, at);
      await sinkTheShaft(page);
      await tap(page, ".frame-card-key");
      await page.waitForSelector(".mine-levels:not([hidden])");
      await shot(page, `slice-mine-sunk-${label}`);
      await checkTwoLevels(page, at);
    } finally {
      await close();
    }
  });

  section(`${label} slice card granite`, async () => {
    const { page, close } = await openScreen(
      size,
      sliceGraniteUnsunkSave(Date.now()),
      { search: "?memorySave=1", seedKey: DEV_BACKUP_KEY },
    );
    try {
      const at = `${label} slice card granite:`;
      const card = await sinkTheShaft(page);
      await shot(page, `slice-card-granite-${label}`);
      checkCard(card, at, "level");
      check(
        /The Granite: reached/i.test(card.words) &&
          card.words.includes("Continue"),
        `${at} the card says the Granite is reached, with Continue`,
      );
      check(
        await noScroll(page),
        `${at} the Granite's card does not scroll the page`,
      );
      await tap(page, ".frame-card-key");
      check(!(await cardFacts(page)).shown, `${at} Continue closes the card`);
      const levels = await page.$eval(".mine-levels", (el) => !el.hidden);
      check(levels, `${at} the mine shows its two levels behind the card`);
    } finally {
      await close();
    }
  });
}
