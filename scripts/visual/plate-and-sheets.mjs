/* global console, document, scrollY */
/** Plate and sheet sections: the relic plate, the long sheets, the odometer and the pills. */
import {
  freshMountain,
  openMountain,
  crewMountain,
  crewSave,
} from "../../tools/browser/fixtures.ts";
import { check, section } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  KEY,
  OPEN_SHEET,
  openSheet,
  closeSheet,
  openScreen,
  noScroll,
  shot,
  keyState,
  keyOpen,
} from "./kit.mjs";

// The relic plate is centred on the board, and the gauge row spans the board
// clear below its top, with a fat mine window (#370, #371). Locked keys
// stay quiet (#373).
const SHELF_VIEWS = SCREENS;
const PHONE_SHOTS = new Set(["424x924"]);

async function shelfCentre(page) {
  return page.evaluate(() => {
    const board = globalThis.__board();
    const plate = document.querySelector(".board-relics");
    const top = document.querySelector(".board-top");
    const row = document.querySelector(".board-gauge-row");
    const win = document.querySelector(".board-window");
    if (plate === null || top === null || row === null || win === null) {
      return { ok: false, delta: 999 };
    }
    const box = plate.getBoundingClientRect();
    const topBox = top.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const winBox = win.getBoundingClientRect();
    const mid = (box.left + box.right) / 2;
    const view = (board.left + board.right) / 2;
    // In board px, so a PC fit reads the same as the phone.
    const delta = (mid - view) / board.scale;
    const spanLeft = (rowBox.left - board.left) / board.scale;
    const spanRight = (board.right - rowBox.right) / board.scale;
    const spans = Math.abs(spanLeft) <= 2 && Math.abs(spanRight) <= 2;
    const clear = rowBox.top >= topBox.bottom - 0.5 && rowBox.height > 1;
    const fat =
      winBox.width / board.scale >= 96 && winBox.height / board.scale >= 96;
    return {
      ok: Math.abs(delta) <= 2 && spans && clear && fat,
      delta,
      spanLeft,
      spanRight,
      clear,
      fat,
      window: [winBox.width, winBox.height].map((side) =>
        Math.round(side / board.scale),
      ),
    };
  });
}

/**
 * Scrolls an open drawer's list (#373) to its first or last item: a section
 * legend, the crew line, a row or the footnote. The spare plate is not one.
 */
async function scrollSheet(page, name, edge) {
  await page.$eval(
    `${OPEN_SHEET(name)} .board-sheet-list`,
    (list, which) => {
      list.scrollTop = which === "start" ? 0 : list.scrollHeight;
    },
    edge,
  );
}

async function sheetEdges(page, name) {
  return page.evaluate((selector) => {
    const sheet = document.querySelector(selector);
    const element = sheet?.querySelector(".board-sheet-list");
    // The head holds the title, the kick, the 48px "i" and Buys' amount key
    // (#358); the items clear them all, not just the title text.
    const headParts = [
      ...(sheet?.querySelectorAll(
        ".board-sheet-title, .board-sheet-kick, .board-sheet-info, .buy-amount",
      ) ?? []),
    ].filter((node) => node.getClientRects().length > 0);
    // What stands under the list: Buys' footnote when it shows, else Back.
    const footer = [
      ...(sheet?.querySelectorAll(".board-sheet-footer > *") ?? []),
    ].find((node) => !node.hidden && node.getClientRects().length > 0);
    const cards = () =>
      [...(element?.children ?? [])].filter(
        (node) =>
          !node.hidden &&
          !node.classList.contains("board-spare") &&
          node.getClientRects().length > 0,
      );
    if (
      sheet === null ||
      element === null ||
      element === undefined ||
      headParts.length === 0 ||
      footer === null ||
      footer === undefined ||
      cards().length === 0
    ) {
      return { ok: false, topGap: -1, endGap: -1, first: "", last: "" };
    }
    const scale = globalThis.__board().scale;
    const firstEl = cards()[0];
    element.scrollTop = 0;
    const firstBox = firstEl.getBoundingClientRect();
    const headBottom = Math.max(
      ...headParts.map((node) => node.getBoundingClientRect().bottom),
    );
    const portTop = element.getBoundingClientRect();
    // Gaps in board px, so a PC fit reads the same as the phone.
    const topGap = (firstBox.top - headBottom) / scale;
    const lastEl = cards().at(-1);
    element.scrollTop = element.scrollHeight;
    const lastBox = lastEl.getBoundingClientRect();
    const foot = footer.getBoundingClientRect();
    const portEnd = element.getBoundingClientRect();
    const endGap = (foot.top - lastBox.bottom) / scale;
    const overflows = element.scrollHeight > element.clientHeight + 1;
    // The drawer stops under the odometer's legend, so a buy's spend shows
    // on the board above it (#370).
    const legend = document
      .querySelector(".board-odo-legend")
      ?.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    const odometerClear =
      legend !== undefined && sheetBox.top >= legend.bottom - 1;
    const app = document.querySelector("#app");
    const pageStill =
      scrollY === 0 &&
      (app?.scrollTop ?? 0) === 0 &&
      document.documentElement.scrollHeight ===
        document.documentElement.clientHeight;
    const gapOk = (gap) => {
      const rounded = Math.round(gap);
      return rounded >= 8 && (!overflows || rounded <= 16);
    };
    const firstIn =
      firstBox.top >= portTop.top - 0.5 &&
      firstBox.bottom <= portTop.bottom + 0.5;
    const lastIn =
      lastBox.top >= portEnd.top - 0.5 &&
      lastBox.bottom <= portEnd.bottom + 0.5;
    element.scrollTop = 0;
    const clip = (node) =>
      (node.textContent ?? "").replaceAll(/\s+/g, " ").slice(0, 42);
    return {
      ok:
        pageStill &&
        odometerClear &&
        firstIn &&
        lastIn &&
        firstBox.top >= headBottom &&
        lastBox.bottom <= foot.top &&
        gapOk(topGap) &&
        gapOk(endGap),
      topGap: Math.round(topGap * 10) / 10,
      endGap: Math.round(endGap * 10) / 10,
      overflows,
      odometerClear,
      firstIn,
      lastIn,
      first: clip(firstEl),
      last: clip(lastEl),
    };
  }, OPEN_SHEET(name));
}

for (const viewport of SHELF_VIEWS) {
  section(`section 19 (relic plate) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const shotThis = PHONE_SHOTS.has(size);
    {
      const { page, close } = await openScreen(viewport, freshMountain());
      await page.waitForSelector(".board-relics");
      const centre = await shelfCentre(page);
      check(
        centre.ok && (await noScroll(page)),
        `${size} relic plate is centred and the screen does not scroll`,
      );
      if (!centre.ok) {
        console.log("shelf", size, centre);
      }
      const keys = await keyState(page);
      const freshPaint =
        keys.ok &&
        keyOpen(keys.buys) &&
        keyOpen(keys.upgrades) &&
        keyOpen(keys.ledger) &&
        [keys.workshop, keys.engineers].every(
          (key) => key.disabled && key.locked && key.dim,
        );
      check(
        freshPaint,
        `${size} fresh key rail: Buys, Upgrades and Ledger open, Workshop and Engineers locked`,
      );
      if (!freshPaint) {
        console.log("keys fresh", size, keys);
      }
      if (shotThis) {
        await shot(page, `mountain-fresh-${size}`);
      }
      await close();
    }
    {
      const { page, close } = await openScreen(viewport, openMountain());
      await page.waitForSelector(".board-relics");
      const centre = await shelfCentre(page);
      check(
        centre.ok && (await noScroll(page)),
        `${size} relic plate with finds is centred and the screen does not scroll`,
      );
      if (!centre.ok) {
        console.log("shelf relics", size, centre);
      }
      const keys = await keyState(page);
      const openPaint =
        keys.ok &&
        [
          keys.buys,
          keys.workshop,
          keys.engineers,
          keys.upgrades,
          keys.ledger,
        ].every(keyOpen);
      check(openPaint, `${size} unlocked key rail is all open`);
      if (!openPaint) {
        console.log("keys open", size, keys);
      }
      // A found relic is lit in its socket; the next one is dark (#370).
      const lit = await page.$$eval(
        ".board-socket .board-relic",
        (relics) =>
          relics.filter((relic) => !relic.src.includes("-dark")).length,
      );
      check(lit >= 3, `${size} save with relics lights their sockets`);
      if (shotThis) {
        await shot(page, `mountain-relics-${size}`);
      }
      await close();
    }
  });
}

// Long Buys and Upgrades lists. The first card clears the header, the last
// card clears the footer, and the sheet stays below the odometer.
const SHEET_SHOTS = new Set(["424x924", "1366x768"]);
for (const viewport of SCREENS) {
  section(`section 20 (long sheets) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const shotThis = SHEET_SHOTS.has(size);
    const { page, close } = await openScreen(viewport, crewMountain());
    await page.waitForSelector(".board-relics");
    for (const name of ["buys", "upgrades"]) {
      await openSheet(page, name);
      await scrollSheet(page, name, "start");
      if (shotThis) {
        await shot(page, `${name}-top-${size}`);
      }
      await scrollSheet(page, name, "end");
      if (shotThis) {
        await shot(page, `${name}-end-${size}`);
      }
      const edges = await sheetEdges(page, name);
      check(
        edges.ok,
        `${size} ${name} first card clears the header and last card clears the footer`,
      );
      if (!edges.ok) {
        console.log(name, size, edges);
      }
      await closeSheet(page, name);
    }
    check(
      await noScroll(page),
      `${size} main screen has no scroll after the sheets`,
    );
    await close();
  });
}

// The pocket's odometer stays in its housing and clear of the dial and the
// menu at every length (#370), and a four-part crew line must not leave one
// chip alone on the next row.
const PILL_VIEWS = [PHONE];

async function pillClear(page) {
  return page.evaluate(() => {
    const pill = document.querySelector(".board-odo");
    // The menu's door is the Ledger key on the rail now (#373).
    const menu = document.querySelector('.board-key[data-key="ledger"]');
    const dial = document.querySelector(".board-dial");
    const app = document.querySelector("#app");
    if (pill === null || menu === null || dial === null || app === null) {
      return { ok: false };
    }
    const a = pill.getBoundingClientRect();
    const misses = (other) => {
      const b = other.getBoundingClientRect();
      return (
        a.right <= b.left + 0.5 ||
        a.left >= b.right - 0.5 ||
        a.bottom <= b.top + 0.5 ||
        a.top >= b.bottom - 0.5
      );
    };
    const apart = misses(menu) && misses(dial);
    // Five drums, each face inside its drum: nothing spills at any length.
    const drums = [...pill.querySelectorAll(".board-drum")];
    const housed =
      drums.length === 5 &&
      drums.every((drum) => drum.scrollWidth <= drum.clientWidth + 1) &&
      pill.scrollWidth <= pill.clientWidth + 1;
    const pageStill =
      scrollY === 0 &&
      app.scrollTop === 0 &&
      document.documentElement.scrollHeight ===
        document.documentElement.clientHeight &&
      app.scrollHeight === app.clientHeight;
    return {
      ok: apart && housed && pageStill,
      apart,
      housed,
      pageStill,
      pocket: pill.getAttribute("aria-label"),
    };
  });
}

/**
 * The crew line's chips, in the Crew section at the top of Buys (#371): Buys
 * lays them out as it opens, in even rows, never one chip alone.
 */
async function crewRowsBalanced(page) {
  await openSheet(page, "buys");
  const counts = await page.$$eval(
    `${OPEN_SHEET("buys")} .crew .crew-row`,
    (rows) => rows.map((row) => row.querySelectorAll(".crew-bit").length),
  );
  await closeSheet(page, "buys");
  return {
    ok: counts.length > 0 && Math.max(...counts) - Math.min(...counts) <= 1,
    counts,
  };
}

for (const viewport of PILL_VIEWS) {
  section(`section 21 (odometer) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    for (const pocket of [32_500, 999_900_000_000_000, 1_000_000_000_000_000]) {
      const { page, close } = await openScreen(viewport, crewSave(pocket));
      await page.waitForSelector(".board-odo");
      const clear = await pillClear(page);
      check(
        clear.ok,
        `${size} pocket ${String(pocket)} stays in the odometer, clear of the dial and the menu`,
      );
      if (!clear.ok) {
        console.log("pill", size, pocket, clear);
      }
      const rows = await crewRowsBalanced(page);
      check(
        rows.ok,
        `${size} pocket ${String(pocket)}: Buys' crew chips sit in even rows`,
      );
      if (!rows.ok) {
        console.log("crew rows", size, pocket, rows);
      }
      if (pocket === 32_500) {
        await shot(page, `pocket-crew-${size}`);
      }
      await close();
    }
  });
}

// Buys, Workshop, and Upgrades: affordable, too expensive, and locked.
for (const viewport of [PHONE]) {
  section(`section 22 (line 2613) ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await openScreen(viewport, crewSave(32_500));
    await openSheet(page, "buys");
    const buys = await page.evaluate(() => {
      const card = (tier) =>
        document.querySelector(`.tier[data-tier="${tier}"]`);
      const shown = (tier, selector) => {
        const node = card(tier)?.querySelector(selector);
        return (
          node !== null &&
          node !== undefined &&
          !node.hidden &&
          node.textContent !== ""
        );
      };
      const drill = card("drill");
      const machine = card("machine");
      // The Deep Heart's 120M of depth in stones: 10M + 35M x 2.625 + 75M x 6.3
      // is 574.375M, shown as 574.3M (#357). The row shows the long line, or
      // its short form where the long one does not fit (#373).
      const machineLines = [
        "The Great Machine joins your crew at 574.3M stones. Keep digging, Dad!",
        "Machine · 574.3M",
      ];
      return {
        // A row a tap buys now: the worker or the cart.
        readyRow: ["helper", "cart"].some(
          (tier) => card(tier)?.classList.contains("is-ready") === true,
        ),
        drillName:
          drill?.querySelector(".board-row-name")?.firstChild?.textContent,
        drillDear: drill?.classList.contains("is-dear") === true,
        drillGain: shown("drill", ".board-row-gain"),
        drillWhy: shown("drill", ".board-row-info"),
        machineLocked:
          machine?.classList.contains("is-locked") === true &&
          machine.querySelector(".board-row-price")?.textContent === "Locked",
        machineGain: shown("machine", ".board-row-gain"),
        machineWhy: machineLines.includes(
          machine?.querySelector(".board-row-info")?.textContent ?? "",
        ),
      };
    });
    check(
      buys.readyRow &&
        buys.drillName === "Steam drill" &&
        buys.drillDear &&
        buys.drillGain &&
        buys.drillWhy &&
        buys.machineLocked &&
        !buys.machineGain &&
        buys.machineWhy,
      `${size} unaffordable drill keeps its lines and the locked machine says where it opens`,
    );
    if (
      buys.drillName !== "Steam drill" ||
      !buys.drillGain ||
      !buys.machineWhy
    ) {
      console.log("buys mix", size, buys);
    }
    await page.$eval('.tier[data-tier="drill"]', (card) => {
      const list = card.closest(".board-sheet-list");
      if (list !== null) {
        list.scrollTop +=
          card.getBoundingClientRect().top -
          list.getBoundingClientRect().top -
          (list.clientHeight - card.offsetHeight) / 2;
      }
    });
    await shot(page, `buys-mix-${size}`);
    await closeSheet(page, "buys");
    await page.tap(KEY("workshop"));
    await page.waitForSelector(".workshop-dialog:not([hidden])");
    await shot(page, `workshop-mix-${size}`);
    await page.click(".workshop-close");
    await openSheet(page, "upgrades");
    const upgrades = await page.evaluate(() => {
      const card = (id) => document.querySelector(`[data-upgrade="${id}"]`);
      const shown = (id, selector) => {
        const node = card(id)?.querySelector(selector);
        return (
          node !== null &&
          node !== undefined &&
          !node.hidden &&
          node.textContent !== ""
        );
      };
      return {
        armsDear: card("tap")?.classList.contains("is-dear") === true,
        armsEffect: shown("tap", ".board-row-info"),
        armsWhy: shown("tap", ".board-row-why"),
        // A locked row is hidden until open and nearly affordable (#245).
        roadsLocked: card("drillSyn")?.hidden === true,
      };
    });
    check(
      upgrades.armsDear &&
        upgrades.armsEffect &&
        upgrades.armsWhy &&
        upgrades.roadsLocked,
      `${size} unaffordable upgrade keeps its lines and a locked one does not`,
    );
    if (!upgrades.armsEffect || !upgrades.armsWhy) {
      console.log("upgrades mix", size, upgrades);
    }
    await page.$eval('[data-upgrade="tap"]', (card) => {
      const list = card.closest(".board-sheet-list");
      if (list !== null) {
        list.scrollTop +=
          card.getBoundingClientRect().top -
          list.getBoundingClientRect().top -
          (list.clientHeight - card.offsetHeight) / 2;
      }
    });
    await shot(page, `upgrades-mix-${size}`);
    await close();
  });
}
