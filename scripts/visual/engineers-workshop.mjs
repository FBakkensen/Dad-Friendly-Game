/* global console, document, getComputedStyle */
/** Engineers and Workshop sections: the Engineers drawer's states (the expedition chip with them) and the Workshop drawer's. */
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
import { stepTapClock } from "../../tools/browser/harness.ts";
import { check, section } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  OPEN_SHEET,
  PAST_SETTLE_MS,
  openScreen,
  openSheet,
  noScroll,
  noteAway,
  keysDrawn,
  LAMP_X,
  press,
  shot,
} from "./kit.mjs";
import { boardArtAt2x } from "./measure.mjs";

/** The open Engineers drawer as the dad reads it: the kick, the list or the page shown (#455). */
function engineersFacts(page) {
  return page.$eval(OPEN_SHEET("engineers"), (sheet) => {
    const text = (root, selector) =>
      root?.querySelector(selector)?.textContent ?? "";
    const lamp = (root) =>
      root.querySelector(".board-lamp")?.style.backgroundPositionX ?? "";
    const shown = (el) => el.closest("[hidden]") === null;
    // Heights in board px: a standalone phone scales the board.
    const { scale } = globalThis.__board();
    const box = sheet.getBoundingClientRect();
    const inside = (el) => {
      const b = el.getBoundingClientRect();
      return (
        b.left >= box.left - 0.5 &&
        b.right <= box.right + 0.5 &&
        b.top >= box.top - 0.5 &&
        b.bottom <= box.bottom + 0.5
      );
    };
    const rowFacts = (row) => ({
      id:
        row.dataset.engineer ??
        row.dataset.engineers ??
        row.dataset.post ??
        row.dataset.tunnel ??
        "",
      classes: [...row.classList],
      name: text(row, ".board-row-name"),
      badge: text(row, ".board-row-badge"),
      info: text(row, ".board-row-info"),
      why: text(row, ".board-row-why"),
      flag: text(row, ".board-row-flag"),
      gain: text(row, ".board-row-gain"),
      price: text(row, ".board-row-price"),
      verb: text(row, ".board-row-verb"),
      lamp: lamp(row),
      pressed: row.getAttribute("aria-pressed"),
      height: row.getBoundingClientRect().height / scale,
      walk: row.querySelector(".engineer-walk") !== null,
    });
    const list = sheet.querySelector(".board-sheet-list");
    const pageEl = sheet.querySelector(
      ".board-sheet-page:not([hidden]) > .board-page",
    );
    const plates = [...(pageEl?.querySelectorAll(".board-platebtn") ?? [])]
      .filter(shown)
      .map((plate) => ({
        classes: [...plate.classList],
        words: text(plate, ".board-platebtn-text") || plate.textContent || "",
        label: plate.getAttribute("aria-label") ?? "",
        inside: inside(plate),
        height: plate.getBoundingClientRect().height / scale,
      }));
    const stories = [
      ...(pageEl?.querySelectorAll(".engineer-brought-story") ?? []),
    ]
      .filter(shown)
      .map((story) => ({
        text: story.textContent ?? "",
        px: Number.parseFloat(getComputedStyle(story).fontSize),
        inside: inside(story),
      }));
    return {
      kick: text(sheet, ".board-sheet-kick"),
      listShown: list !== null && !list.hidden,
      listScroll:
        list === null ? [0, 0] : [list.scrollHeight, list.clientHeight],
      rows: [...(list?.querySelectorAll(":scope > .board-row") ?? [])]
        .filter(shown)
        .map(rowFacts),
      page: pageEl === null ? "" : pageEl.className,
      pageInside: pageEl !== null && inside(pageEl),
      pageRows: [...(pageEl?.querySelectorAll(".board-row") ?? [])]
        .filter(shown)
        .map(rowFacts),
      title: text(pageEl, ".board-page-title"),
      line: text(pageEl, ".board-page-line"),
      plates,
      stories,
    };
  });
}

/** Opens the save on held clocks, then the Engineers drawer by its key, past its settle. */
async function openEngineers(viewport, save, { standalone = false } = {}) {
  const opened = await openScreen(viewport, save, {
    stopClock: true,
    tapClock: "held",
    standalone,
  });
  await keysDrawn(opened.page);
  await noteAway(opened.page);
  await openSheet(opened.page, "engineers");
  await stepTapClock(opened.page, PAST_SETTLE_MS);
  return opened;
}

/** A tap on the open drawer, then past the new screen's settle; true once `want` shows. */
async function pressThen(page, selector, want) {
  await press(page, `${OPEN_SHEET("engineers")} ${selector}`);
  const shown = await page
    .waitForSelector(`${OPEN_SHEET("engineers")} ${want}`, {
      visible: true,
      timeout: 2_000,
    })
    .then(
      () => true,
      () => false,
    );
  await stepTapClock(page, PAST_SETTLE_MS);
  return shown;
}

/** A page of the drawer, by its class. */
const ENGINEERS_PAGE = (name) => `.board-sheet-page:not([hidden]) > .${name}`;

/**
 * openMountain past the first trip's lesson (a v6 save keeps `seen` and `taught` on its
 * workshop): Send exploring opens the tunnels page. The pocket pays for Promote.
 */
function pastFirstTrip() {
  const save = openMountain();
  return {
    ...save,
    mountain: { ...save.mountain, pocket: 20_000_000 },
    workshop: {
      ...save.workshop,
      seen: [...(save.workshop.seen ?? []), "engineers"],
      taught: [...(save.workshop.taught ?? []), "engineers"],
    },
  };
}

/** The Running now note's expedition chip, with the trip's engineer and clock (#370). */
async function expeditionChip(page) {
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
  await noteAway(page);
  return chip;
}

/** No digit and no question in a line that tells a discovery. */
const vague = (line) => line.length > 0 && !/\d|\?/.test(line);

/** The first visit and her page, on the mid save (#455). */
async function engineersFirstVisit(viewport, size) {
  const { page, close } = await openEngineers(viewport, openMountain());
  const list = await engineersFacts(page);
  await shot(page, `engineers-list-${size}`);
  const ada = list.rows.find((row) => row.id === "Ada");
  const promote = list.rows.find((row) => row.id === "promote");
  check(
    ada !== undefined &&
      ada.lamp === LAMP_X.amber &&
      ada.flag === "New" &&
      ada.badge === "Apprentice" &&
      ada.info === "Tending the borers" &&
      list.kick === "Ada can explore a side tunnel and bring home a find." &&
      promote !== undefined &&
      /^[\d.]+[KMBT]?$/.test(promote.price) &&
      promote.verb === "Promote" &&
      list.rows.at(-1)?.id === "promote",
    `${size} engineers first visit: Ada's row is the New one (amber, Apprentice, Tending the borers) under the intro kick, and Promote ends the list with its price`,
  );
  if (ada?.flag !== "New" || promote === undefined) {
    console.log("engineers list", size, JSON.stringify(list));
  }
  const opened = await pressThen(
    page,
    '.engineer-row[data-engineer="Ada"]',
    ENGINEERS_PAGE("engineer-page"),
  );
  const hers = await engineersFacts(page);
  await shot(page, `engineers-her-page-${size}`);
  const borers = hers.pageRows.find((row) => row.id === "borer");
  const built = hers.pageRows.filter(
    (row) => row.id !== "camp" && row.gain !== "",
  );
  const [left, right] = hers.plates;
  check(
    opened &&
      hers.pageRows.length === 5 &&
      borers?.name === "The borers · here now" &&
      borers.lamp === LAMP_X.green &&
      borers.pressed === "true" &&
      built.length >= 1 &&
      built.every((row) => /^\+[\d.,]+[KMBT]? stones\/sec$/.test(row.gain)) &&
      left?.classes.includes("teach-new") === true &&
      left.label === "Send Ada exploring · 10 min" &&
      right?.words === "Back to your engineers" &&
      hers.pageInside &&
      hers.plates.every((plate) => plate.inside) &&
      (await noScroll(page)),
    `${size} engineers her page: five posts inside the drawer, the borers here now (green, pressed), real gains, the guided first trip and the way back, no page scroll`,
  );
  if (!opened || hers.pageRows.length !== 5 || left === undefined) {
    console.log("engineers her page", size, JSON.stringify(hers));
  }
  await close();
}

/** The tunnels page, past the first trip; then Promote's ask (#455). */
async function engineersTunnelsAndPromote(viewport, size) {
  {
    const { page, close } = await openEngineers(viewport, pastFirstTrip());
    await pressThen(
      page,
      '.engineer-row[data-engineer="Ada"]',
      ENGINEERS_PAGE("engineer-page"),
    );
    const opened = await pressThen(
      page,
      ".engineer-explore",
      ENGINEERS_PAGE("engineer-tunnels-page"),
    );
    const tunnels = await engineersFacts(page);
    await shot(page, `engineers-tunnels-${size}`);
    const deep = tunnels.pageRows.find((row) => row.id === "deep-dark");
    check(
      opened &&
        tunnels.pageRows.length === 3 &&
        deep?.classes.includes("is-locked") === true &&
        deep.info === "The deep dark waits for a Journeyman." &&
        tunnels.kick === "While she explores, her machine works without her." &&
        tunnels.pageInside &&
        (await noScroll(page)),
      `${size} engineers tunnels: three tunnels inside the drawer, the deep dark locked for a Journeyman, the aside in the kick`,
    );
    if (!opened || deep === undefined) {
      console.log("engineers tunnels", size, JSON.stringify(tunnels));
    }
    await close();
  }
  {
    const { page, close } = await openEngineers(viewport, pastFirstTrip());
    const opened = await pressThen(
      page,
      ".engineer-promote",
      ENGINEERS_PAGE("engineer-promote-page"),
    );
    const ask = await engineersFacts(page);
    await shot(page, `engineers-promote-${size}`);
    check(
      opened &&
        !ask.listShown &&
        ask.title === "Promote a worker" &&
        / steps up as engineer\. One worker fewer at the machines\.$/.test(
          ask.line,
        ) &&
        ask.plates.map((plate) => plate.words).join() === "Not yet,Step up" &&
        ask.pageInside &&
        (await noScroll(page)),
      `${size} engineers promote: the ask names who steps up, with Not yet and Step up, inside the drawer`,
    );
    if (!opened) {
      console.log("engineers promote", size, JSON.stringify(ask));
    }
    await close();
  }
}

/** Ada out: the chip, her row walking home, her page, and the recall's ask (#455). */
async function engineersOut(viewport, size) {
  const now = Date.now();
  const opened = await openScreen(viewport, awayTripSave(now), {
    stopClock: true,
    tapClock: "held",
  });
  const { page, close } = opened;
  await keysDrawn(page);
  await noteAway(page);
  // s11's chip check, as it was: the trip's clock in the Running now note.
  const chip = await expeditionChip(page);
  check(
    chip.ok,
    `${size} engineers out: the expedition chip sits in the Running now note (${chip.text})`,
  );
  await openSheet(page, "engineers");
  await stepTapClock(page, PAST_SETTLE_MS);
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll(".board-sheet.is-open img")].map((img) =>
        img.decode().catch(() => undefined),
      ),
    ),
  );
  const list = await engineersFacts(page);
  const art = await boardArtAt2x(
    page,
    `${OPEN_SHEET("engineers")} .engineer-walk`,
    OPEN_SHEET("engineers"),
  );
  await shot(page, `engineers-out-${size}`);
  const ada = list.rows.find((row) => row.id === "Ada");
  check(
    ada?.walk === true &&
      ada.info === "Exploring the old shaft · gone about an hour" &&
      art.misses.length === 0 &&
      art.count >= 1,
    `${size} engineers out: Ada's row walks home in its icon cell, art at 2x, and says where she is`,
  );
  if (ada?.walk !== true || art.misses.length > 0) {
    console.log("engineers out", size, JSON.stringify({ list, art }));
  }
  await pressThen(
    page,
    '.engineer-row[data-engineer="Ada"]',
    ENGINEERS_PAGE("engineer-page"),
  );
  const hers = await engineersFacts(page);
  check(
    vague(hers.kick) && hers.plates[0]?.words === "Call her back",
    `${size} engineers out: her page's kick tells the trip with no number (${hers.kick}), and its left plate is Call her back`,
  );
  const asked = await pressThen(
    page,
    ".engineer-recall",
    ENGINEERS_PAGE("engineer-recall-page"),
  );
  const ask = await engineersFacts(page);
  await shot(page, `engineers-recall-${size}`);
  check(
    asked &&
      ask.title === "Call her back" &&
      ask.line === "Ada comes home empty-handed." &&
      ask.plates.map((plate) => plate.words).join() ===
        "Keep exploring,Call back" &&
      ask.pageInside &&
      (await noScroll(page)),
    `${size} engineers recall: the ask reads Call her back / Ada comes home empty-handed., with Keep exploring and Call back, inside the drawer`,
  );
  await close();
}

/** Five engineers and two keepsakes: the full crew scrolls inside the drawer; the stories (#455). */
async function engineersFive(viewport, label, { standalone = false } = {}) {
  const { page, close } = await openEngineers(
    viewport,
    campPostsSave(Date.now()),
    {
      standalone,
    },
  );
  const list = await engineersFacts(page);
  await shot(page, `engineers-five-${label}`);
  const ids = list.rows.map((row) => row.id);
  const brought = list.rows.find((row) => row.id === "brought");
  const promote = list.rows.find((row) => row.id === "promote");
  const otto = list.rows.find((row) => row.id === "Otto");
  const pageStill = await noScroll(page);
  const five =
    ids.join() === "Ada,Nils,Ruth,Otto,Mae,brought,promote" &&
    brought?.info === "A child's drawing, A pocket watch" &&
    promote?.info === "Every named hand is already an engineer." &&
    list.listScroll[0] > list.listScroll[1] + 1 &&
    list.rows.every((row) => Math.abs(row.height - 76) <= 0.5) &&
    otto?.walk === true &&
    pageStill;
  check(
    five,
    `${label} engineers five: five rows, Brought home and a full crew's Promote, 76 tall, the list scrolls inside the drawer and the page does not, and Otto's row walks`,
  );
  if (!five) {
    console.log("engineers five", label, pageStill, JSON.stringify(list));
  }
  if (!standalone) {
    const opened = await pressThen(
      page,
      ".engineer-brought",
      ENGINEERS_PAGE("engineer-brought-page"),
    );
    const stories = await engineersFacts(page);
    await shot(page, `engineers-brought-${label}`);
    check(
      opened &&
        stories.stories.length === 2 &&
        stories.stories.every(
          (story) => story.px >= 16 && story.inside && vague(story.text),
        ) &&
        stories.plates.length === 1 &&
        Math.abs((stories.plates[0]?.height ?? 0) - 54) <= 0.5 &&
        (await noScroll(page)),
      `${label} engineers brought home: two stories at 16px or more with no number, inside the drawer, and one Back at a plate's 54`,
    );
    if (!opened || stories.stories.length !== 2) {
      console.log("engineers brought", label, JSON.stringify(stories));
    }
  }
  await close();
}

// The Engineers drawer's states (#455), on held clocks that step past each settle: the first
// visit and her page, the tunnels, Promote's ask, Ada out with the walk home and the recall's
// ask, and the full crew with its stories (on the phone, and as the installed PWA). Its rows,
// fit, targets and art on each save are the DRAWERS row's checks. Sections 11 and 12, and
// main-screen's engineersSheetFits, checked today's sheet: this flow replaced them.
for (const viewport of SCREENS) {
  section(
    `keys and drawers ${JSON.stringify(viewport)} engineers states`,
    async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      await engineersFirstVisit(viewport, size);
      await engineersTunnelsAndPromote(viewport, size);
      await engineersOut(viewport, size);
      await engineersFive(viewport, size);
      if (viewport === PHONE) {
        await engineersFive(viewport, `${size} standalone`, {
          standalone: true,
        });
      }
    },
  );
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
