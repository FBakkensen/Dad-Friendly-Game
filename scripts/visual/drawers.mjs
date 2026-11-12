/* global console, document, getComputedStyle, navigator, requestAnimationFrame */
/** Drawer sections: each drawer's rows and legends, per save, and the drawer states. */
import {
  freshMountain,
  crewMountain,
  fleetMountain,
  openMountain,
  shortMountain,
  idleMountain,
  toolsMountain,
  machineMountain,
  heirMountain,
  crewV4Save,
  borerPickMountain,
  fullGraniteMountain,
  machinePickMountain,
  savingMountain,
  workshopSave,
  heartMountain,
  playAwaySave,
  campPostsSave,
  awayTripSave,
} from "../../tools/browser/fixtures.ts";
import { stepTapClock } from "../../tools/browser/harness.ts";
import { undersizedTargets } from "../../src/ui-audit-measure.ts";
import { check, section, table } from "./registry.mjs";
import {
  SCREENS,
  KEY,
  OPEN_SHEET,
  openSheet,
  closeSheet,
  openScreen,
  noScroll,
  noteAway,
  LAMP_X,
  keysDrawn,
  press,
  shot,
  PAST_SETTLE_MS,
} from "./kit.mjs";
import {
  drawerFacts,
  boardTargets,
  boardGaps,
  boardTextSizes,
  boardArtAt2x,
  boardContrast,
} from "./measure.mjs";

const DRAWER_SAVES = [
  { name: "fresh", save: () => freshMountain() },
  { name: "early", save: () => crewMountain() },
  { name: "mid", save: () => openMountain() },
  { name: "short", save: () => shortMountain() },
  { name: "idle", save: () => idleMountain() },
  { name: "tools", save: () => toolsMountain() },
  { name: "machine", save: () => machineMountain() },
  { name: "heir", save: () => heirMountain() },
  { name: "crew", save: () => crewV4Save() },
  { name: "mid, the borer the pick", save: () => borerPickMountain() },
  // A full Granite: two rows of crew chips, and Buys still fits (#373).
  { name: "mid, two chip rows", save: () => fullGraniteMountain() },
  // The Great Machine the pick, with Ada tending it: the flag gives way.
  {
    name: "machine, the Great Machine the pick",
    save: () => machinePickMountain(),
  },
  // The Workshop's bench busy, with axle grease running, and free (#374).
  { name: "workshop", save: () => workshopSave(Date.now(), true) },
  { name: "workshop, free", save: () => workshopSave(Date.now(), false) },
  // Five engineers with two keepsakes home, Otto out; and Ada out alone (#455).
  { name: "engineers, five", save: () => campPostsSave(Date.now()) },
  { name: "engineers, out", save: () => awayTripSave(Date.now()) },
];
/**
 * The DRAWER_SAVES whose Workshop key is locked (`workshopUnlocked` false; checked on each
 * fixture): its drawer is skipped there, as openSheet would wait on a disabled key.
 */
const WORKSHOP_LOCKED = new Set(["fresh", "early", "idle", "heir"]);
/**
 * The DRAWER_SAVES with no borer, so no engineer (checked on each fixture): the Engineers key is
 * locked there, and its drawer is skipped (#455).
 */
const ENGINEERS_LOCKED = new Set([
  "fresh",
  "early",
  "idle",
  "heir",
  "workshop",
  "workshop, free",
]);
/**
 * A full Engineers crew with keepsakes home scrolls inside its drawer (C1, the spec's "a full
 * Engineers crew"): five engineers, Brought home and Promote are seven rows (#455).
 */
const FULL_ENGINEERS_ROWS = 7;
/**
 * Late-game Buys runs longer than the drawer and scrolls inside it (C1): the
 * Great Machine's era, with the Kid row. Up to the borer it fits, its
 * footnote stepping aside when it would push the list into a scroll (#373).
 */
const LONG_BUYS = new Set(["machine", "machine, the Great Machine the pick"]);
/**
 * A full Upgrades scrolls inside its drawer too (C1, the spec's "a full
 * Upgrades"): from six rows, more than the drawer holds at 76px each.
 */
const FULL_UPGRADES_ROWS = 6;
/** Words a drawer row shows, read against its frame at 4.5:1. */
const ROW_LEGENDS = (name) =>
  [
    ".board-row-name",
    ".board-row-info",
    ".board-row-need",
    ".board-row-why",
    ".board-row-flag",
    ".board-row-gain",
    ".board-row-price",
    ".board-row-verb",
    // Buys' footnote over Back, and Upgrades' at the list's end, when shown.
    ".board-sheet-foot",
    // The Workshop's plates and its timers line (#374).
    ".workshop-mat-count",
    ".workshop-mat-word",
    ".workshop-timers",
    // The Ledger's Tonight lines (#375).
    ".ledger-log-time",
    ".ledger-log-text",
  ]
    .map((part) => `${OPEN_SHEET(name)} ${part}`)
    .join(", ");

/** A drawer's "i" cards: shown in its place, inside it, with no scroll. */
async function howFacts(page, name) {
  return page.$eval(OPEN_SHEET(name), (sheet) => {
    const how = sheet.querySelector(".board-sheet-how");
    const list = sheet.querySelector(".board-sheet-list");
    if (how === null || how.hidden) {
      return { ok: false, shown: false };
    }
    const box = sheet.getBoundingClientRect();
    const port = how.getBoundingClientRect();
    const cards = [...how.querySelectorAll(".teach-how")].filter(
      (card) => card.closest("[hidden]") === null,
    );
    const backs = [...how.querySelectorAll(".teach-how-back")].filter(
      (back) =>
        back.closest("[hidden]") === null && back.getClientRects().length > 0,
    );
    const within = (el) => {
      const b = el.getBoundingClientRect();
      return (
        b.top >= port.top - 0.5 &&
        b.bottom <= port.bottom + 0.5 &&
        b.left >= box.left - 0.5 &&
        b.right <= box.right + 0.5
      );
    };
    return {
      ok:
        cards.length >= 1 &&
        backs.length === 1 &&
        how.scrollHeight <= how.clientHeight + 1 &&
        cards.every(within) &&
        backs.every(within) &&
        list?.hidden === true,
      shown: true,
      cards: cards.length,
      backs: backs.length,
      scroll: [how.scrollHeight, how.clientHeight],
    };
  });
}

/**
 * The drawers each save opens, one row each, with its own scroll rule:
 * `mayScroll` lets the list scroll inside the drawer, `mustScroll` fails it
 * for fitting.
 *
 * Workshop (#374) and Engineers (#455) have a `when` that skips the saves
 * where their key is locked (openSheet waits 30 s on a disabled key). A
 * `how: false` flag skips the "i" expectation on a drawer with no "i".
 * `amount: true` marks the drawer with the ×1/×10/Max key (#358).
 * @public
 */
export const DRAWERS = [
  {
    name: "buys",
    amount: true,
    mayScroll: ({ scenario }) => LONG_BUYS.has(scenario.name),
    mustScroll: ({ scenario }) => LONG_BUYS.has(scenario.name),
  },
  {
    name: "upgrades",
    mayScroll: ({ facts }) => facts.rows.length >= FULL_UPGRADES_ROWS,
    mustScroll: () => false,
  },
  {
    name: "workshop",
    when: ({ name }) => !WORKSHOP_LOCKED.has(name),
    mayScroll: () => false,
    mustScroll: () => false,
  },
  {
    name: "engineers",
    when: ({ name }) => !ENGINEERS_LOCKED.has(name),
    mayScroll: ({ facts }) => facts.rows.length >= FULL_ENGINEERS_ROWS,
    mustScroll: ({ facts }) => facts.rows.length >= FULL_ENGINEERS_ROWS,
  },
  // The Ledger (#375): its key is never locked, and its list always fits.
  { name: "ledger", mayScroll: () => false, mustScroll: () => false },
].map((drawer) => ({
  ...drawer,
  // Opens the drawer by its key; every row's art has loaded before it is
  // measured. `up` and `facts` ride on `at` for the expectations.
  enter: async (at) => {
    at.up = await openSheet(at.page, drawer.name);
    await at.page.evaluate(() =>
      Promise.all(
        [...document.querySelectorAll(".board-sheet.is-open img")].map((img) =>
          img.decode().catch(() => undefined),
        ),
      ),
    );
    at.facts = await drawerFacts(at.page, drawer.name);
  },
  leave: (at) => closeSheet(at.page, drawer.name),
}));

/** Opens a save with the clock held, the keys drawn and the note away. */
async function openDrawerSave(viewport, { save }) {
  const opened = await openScreen(viewport, save(), { stopClock: true });
  try {
    await keysDrawn(opened.page);
    await opened.page.evaluate(() => document.fonts.ready.then(() => true));
    await noteAway(opened.page);
    return opened;
  } catch (error) {
    await opened.close();
    throw error;
  }
}

/** What each drawer shows on each save, measured with the drawer open. */
const DRAWER_EXPECT = [
  {
    run: async ({ page, up, facts, size, scenario, row }) => {
      if (!facts.placed || !facts.odometerClear || !facts.saveLineClear) {
        const clip = await page.$eval(
          ".board-sheet-clip",
          (el) => el.scrollTop,
        );
        console.log(
          "drawer box",
          size,
          scenario.name,
          row.name,
          JSON.stringify({ box: facts.box, clipScrollTop: clip }),
        );
      }
      return [
        [
          up && facts.placed && facts.odometerClear && facts.saveLineClear,
          "stands at 178..864 by 8..416, with the odometer and the save line in view",
        ],
      ];
    },
  },
  { run: async ({ page }) => [[await noScroll(page), "no page scroll"]] },
  {
    run: async (at) => {
      const { page, facts, size, scenario, row } = at;
      const mayScroll = row.mayScroll(at);
      const mustScroll = row.mustScroll(at);
      if (facts.scrolls !== mustScroll && !(facts.scrolls && mayScroll)) {
        const sizes = await page.$eval(
          `${OPEN_SHEET(row.name)} .board-sheet-list`,
          (list) => [list.scrollHeight, list.clientHeight],
        );
        console.log("drawer scroll", size, scenario.name, row.name, sizes);
      }
      return [
        [
          facts.scrolls
            ? mayScroll && facts.spareClass === "is-off"
            : !mustScroll,
          `its list ${facts.scrolls ? "scrolls inside the drawer (C1) with the spare off" : "fits with no scroll"}`,
        ],
      ];
    },
  },
  {
    run: ({ facts }) => [
      [
        facts.spareClass === facts.spareWant,
        `the spare plate is ${facts.spareClass}, as its height asks (${facts.spareWant})`,
      ],
    ],
  },
  {
    run: ({ facts, size, scenario, row }) => {
      const rowsOk =
        facts.rows.every((one) => Math.abs(one.height - 76) <= 0.5) &&
        facts.gaps.every((gap) => Math.abs(gap - 10) <= 0.5);
      const crowded = facts.rows.filter(
        (one) =>
          !one.inside || one.overlaps.length > 0 || one.spills.length > 0,
      );
      if (!rowsOk || crowded.length > 0) {
        console.log(
          "drawer rows",
          size,
          scenario.name,
          row.name,
          JSON.stringify({
            gaps: facts.gaps,
            crowded,
            rows: facts.rows.map((one) => [one.id, one.height]),
          }),
        );
      }
      return [
        [rowsOk, `${String(facts.rows.length)} rows are 76 tall and 10 apart`],
        [
          crowded.length === 0,
          "every row's name, info, need, flag, gain, tag and verb lie inside it and apart",
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario, row }) => {
      const targets = await boardTargets(page);
      const inSheet = (target) =>
        /^\.(board-row|board-platebtn|board-sheet-info|workshop-mat) /.test(
          target.selector,
        );
      const own = targets.own.filter(inSheet);
      // A scaled board snaps boxes to device pixels: allow a tenth of a pixel.
      const under = undersizedTargets(own, 47.9);
      const close8 = boardGaps(targets);
      if (under.length > 0 || close8.length > 0) {
        console.log(
          "drawer targets",
          size,
          scenario.name,
          row.name,
          JSON.stringify({
            under: under.map((target) => target.selector),
            close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
          }),
        );
      }
      return [
        [
          own.length >= 2 && under.length === 0 && close8.length === 0,
          `${String(own.length)} targets are 48x48 board px, 8px from the next`,
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario, row }) => {
      const text = await boardTextSizes(page, OPEN_SHEET(row.name));
      if (text.small.length > 0) {
        console.log(
          "drawer text",
          size,
          scenario.name,
          row.name,
          JSON.stringify(text.small),
        );
      }
      return [
        [
          text.small.length === 0 && text.count >= 3,
          `text is 13px or more (${String(text.count)} runs)`,
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario, row }) => {
      const art = await boardArtAt2x(
        page,
        OPEN_SHEET(row.name),
        OPEN_SHEET(row.name),
      );
      if (art.misses.length > 0) {
        console.log(
          "drawer 2x",
          size,
          scenario.name,
          row.name,
          JSON.stringify(art.misses),
        );
      }
      return [
        [
          art.misses.length === 0 && art.count >= 3,
          `${String(art.count)} images, sprites and skins at exactly 2x`,
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario, row }) => {
      const contrast = await boardContrast(page, ROW_LEGENDS(row.name));
      const dim = contrast.filter((one) => one.pct < 4.5);
      if (dim.length > 0) {
        console.log(
          "drawer contrast",
          size,
          scenario.name,
          row.name,
          JSON.stringify(dim),
        );
      }
      return [
        [
          dim.length === 0,
          `${String(contrast.length)} row legends at 4.5:1 or more (lowest ${String(contrast.length === 0 ? "-" : Math.min(...contrast.map((one) => one.pct)))}:1 at p10/p90)`,
        ],
      ];
    },
  },
  {
    // Buys on ×10 and on Max (#358): the key's face changes, and every row's
    // counted verb and total price still lie inside it, with no page scroll. A
    // keyboard press is never early. The third press goes back to ×1, so the
    // next section opens as this one did.
    when: ({ row }) => row.amount === true,
    run: async ({ page, size, scenario }) => {
      const key = `${OPEN_SHEET("buys")} .board-sheet-head .buy-amount`;
      const results = [];
      for (const face of ["×10", "Max", "×1"]) {
        await page.$eval(key, (button) => {
          button.click();
        });
        // A tag's skin repaints on its ResizeObserver, before the next paint:
        // measure what the player sees, a frame on.
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            }),
        );
        const shown = await page.$eval(key, (button) => button.textContent);
        if (face === "×1") {
          results.push([shown === face, "the amount key goes back to ×1"]);
          continue;
        }
        const facts = await drawerFacts(page, "buys");
        const crowded = facts.rows.filter(
          (row) =>
            !row.inside || row.overlaps.length > 0 || row.spills.length > 0,
        );
        results.push([
          shown === face &&
            crowded.length === 0 &&
            facts.rows.every((row) => Math.abs(row.height - 76) <= 0.5) &&
            (await noScroll(page)),
          `on ${face}, every row's count and total lie inside it, 76 tall, with no page scroll`,
        ]);
        if (crowded.length > 0) {
          console.log(
            "drawer amount",
            `${size} buys drawer, ${scenario.name}:`,
            face,
            JSON.stringify(crowded),
          );
        }
      }
      return results;
    },
  },
  {
    // The "i": its cards take the list's place, fit, and go back. A
    // keyboard press is never early, so the drawer's settle does not
    // swallow it (the finger's "i" is wired in the taps section).
    when: ({ row }) => row.how !== false,
    run: async ({ page, size, scenario, row }) => {
      const name = row.name;
      await page.$eval(`${OPEN_SHEET(name)} .board-sheet-info`, (info) => {
        info.click();
      });
      await page
        .waitForSelector(`${OPEN_SHEET(name)} .board-sheet-how:not([hidden])`, {
          timeout: 2_000,
        })
        .catch(() => undefined);
      // The cards' art and any face the list did not use load as they
      // show: wait for both before measuring. (The 708/660 overflow once
      // blamed on fonts was a skin canvas at its default size, #403.)
      await page.evaluate(() =>
        Promise.all([
          ...[
            ...document.querySelectorAll(".board-sheet.is-open .teach-how img"),
          ].map((img) => img.decode().catch(() => undefined)),
          document.fonts.ready,
        ]),
      );
      const how = await howFacts(page, name);
      const howArt = await boardArtAt2x(
        page,
        OPEN_SHEET(name),
        OPEN_SHEET(name),
      );
      const howText = await boardTextSizes(page, OPEN_SHEET(name));
      if (!how.ok || howArt.misses.length > 0 || howText.small.length > 0) {
        console.log(
          "drawer how",
          size,
          scenario.name,
          name,
          JSON.stringify({ how, art: howArt.misses, text: howText.small }),
        );
      }
      await page
        .$eval(
          `${OPEN_SHEET(name)} .board-sheet-how .teach-how-back:not([hidden])`,
          (back) => {
            back.click();
          },
        )
        .catch(() => undefined);
      return [
        [
          how.ok && howArt.misses.length === 0 && howText.small.length === 0,
          `the "i" cards fit the drawer with no scroll, one Back, art at 2x and 13px text`,
        ],
      ];
    },
  },
];

/** The drawer states: each visit's expectation is bespoke, so they stay a flow. */
const registerStates = (viewport) => {
  section(`keys and drawers ${JSON.stringify(viewport)} states`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const rows = (page, name) =>
      page.$$eval(`${OPEN_SHEET(name)} .board-row`, (els) =>
        Object.fromEntries(
          els.map((row) => [
            // A found tool shares its name with an upgrade (boots).
            row.dataset.tool === undefined
              ? (row.dataset.tier ??
                row.dataset.boost ??
                row.dataset.upgrade ??
                "")
              : `tool:${row.dataset.tool}`,
            {
              shown: row.closest("[hidden]") === null,
              classes: [...row.classList],
              lamp:
                row.querySelector(".board-lamp")?.style.backgroundPositionX ??
                "",
              icon:
                row.querySelector(".board-row-icon")?.getAttribute("src") ?? "",
              need: row.querySelector(".board-row-need")?.textContent ?? "",
              flag: row.querySelector(".board-row-flag")?.textContent ?? "",
              badge: row.querySelector(".board-row-badge")?.textContent ?? "",
              price: row.querySelector(".board-row-price")?.textContent ?? "",
              verb: row.querySelector(".board-row-verb")?.textContent ?? "",
              trouble: row.dataset.trouble ?? "",
            },
          ]),
        ),
      );
    const visit = async (save, name, search = "") => {
      const opened = await openScreen(viewport, save(), {
        search,
        stopClock: true,
      });
      await keysDrawn(opened.page);
      await noteAway(opened.page);
      await openSheet(opened.page, name);
      return { ...opened, rows: await rows(opened.page, name) };
    };
    {
      const { close, rows: early } = await visit(() => crewMountain(), "buys");
      check(
        early.cart?.classes.includes("is-pick") === true &&
          early.cart.lamp === LAMP_X.amber &&
          early.drill?.classes.includes("is-dear") === true,
        `${size} early Buys: the cart is the amber pick and the drill is dear`,
      );
      await close();
    }
    {
      // The locked row: the Great Machine under its tarp until 120M.
      const { close, rows: mid } = await visit(() => openMountain(), "buys");
      check(
        mid.machine?.classes.includes("is-locked") === true &&
          mid.machine.price === "Locked" &&
          mid.machine.icon.includes("mach-machine-dim"),
        `${size} mid Buys: the Great Machine row is locked, dim, and reads Locked`,
      );
      await close();
    }
    {
      const { close, rows: short } = await visit(() => shortMountain(), "buys");
      check(
        short.borer?.classes.includes("is-short") === true &&
          short.borer.need === "Needs 8 workers",
        `${size} short Buys: the borer is short of hands and reads Needs 8 workers (${String(short.borer?.need)})`,
      );
      await close();
    }
    // A Buys row's words read whole (#506): the milestone's payoff on two
    // lines, or its short form beside a need line, and the engineer's flag
    // with its number. No info line or flag is cut.
    for (const [name, save, drill] of [
      ["mid", openMountain, /^2 of 10 · Every drill mines twice as fast\.$/],
      ["fleet", fleetMountain, /^30 of 50 · Twice as fast again\.$/],
      ["heart", heartMountain, /^10 of 25 · Twice as fast/],
      ["short", shortMountain, /^4 of 10 · Every drill mines twice as fast\.$/],
    ]) {
      const { page, close } = await visit(() => save(), "buys");
      const lines = await page.$$eval(
        `${OPEN_SHEET("buys")} .board-row:not([hidden]) :is(.board-row-info, .board-row-flag):not([hidden])`,
        (els) =>
          els.map((el) => ({
            tier: el.closest(".board-row")?.dataset.tier ?? "",
            line: el.classList.contains("board-row-flag") ? "flag" : "info",
            text: el.textContent,
            cut:
              el.scrollWidth > el.clientWidth + 1 ||
              el.scrollHeight > el.clientHeight + 1,
          })),
      );
      const cut = lines.filter((line) => line.cut);
      const drillInfo =
        lines.find((line) => line.tier === "drill" && line.line === "info")
          ?.text ?? "";
      check(
        lines.length >= 5 && cut.length === 0 && drill.test(drillInfo),
        `${size} ${name} Buys: no info line or flag is cut, and the drill shows its payoff (${drillInfo})`,
      );
      if (cut.length > 0) {
        console.log("cut Buys lines", size, name, cut);
      }
      await close();
    }
    {
      const { close, rows: saving } = await visit(
        () => savingMountain(),
        "buys",
      );
      check(
        saving.cart?.flag === "Saving for",
        `${size} saving Buys: the cart row is flagged Saving for (${String(saving.cart?.flag)})`,
      );
      await close();
    }
    {
      const {
        page,
        close,
        rows: idle,
      } = await visit(() => idleMountain(), "buys");
      // The staffing New row is brought into the list's view, and only the
      // list moves for it: the drawer stays where it opens.
      const seen = await page.$eval(OPEN_SHEET("buys"), (sheet) => {
        const row = sheet.querySelector(".board-row.teach-new");
        const list = sheet.querySelector(".board-sheet-list");
        const clip = sheet.closest(".board-sheet-clip");
        const board = globalThis.__board();
        if (row === null || list === null) {
          return { ok: false };
        }
        const box = row.getBoundingClientRect();
        const port = list.getBoundingClientRect();
        const top =
          (sheet.getBoundingClientRect().top - board.top) / board.scale;
        return {
          ok:
            box.top >= port.top - 0.5 &&
            box.bottom <= port.bottom + 0.5 &&
            Math.abs(top - 178) <= 0.5 &&
            (clip?.scrollTop ?? 0) === 0,
          sheetTop: Math.round(top),
          clipScrollTop: clip?.scrollTop,
        };
      });
      check(
        idle.cart?.classes.includes("teach-new") === true &&
          idle.cart.flag === "New" &&
          seen.ok,
        `${size} idle Buys: the cart row is the staffing New row, in view, and the drawer stays at 178 (${JSON.stringify(seen)})`,
      );
      await close();
    }
    {
      // The Great Machine the pick, Ada tending it: its flag shares the name's
      // line, falls back to "Ready now" where the joined words do not fit,
      // and the name shows in full.
      const {
        page,
        close,
        rows: pick,
      } = await visit(() => machinePickMountain(), "buys");
      const name = await page.$eval(
        `${OPEN_SHEET("buys")} .tier[data-tier="machine"]`,
        (row) => {
          const mid = row.querySelector(".board-row-mid");
          const words = row.querySelector(".board-row-name");
          const flag = row.querySelector(".board-row-flag");
          return {
            full:
              mid !== null &&
              words !== null &&
              words.getBoundingClientRect().right <=
                mid.getBoundingClientRect().right + 0.5,
            flagInside:
              mid !== null &&
              flag !== null &&
              flag.getBoundingClientRect().right <=
                mid.getBoundingClientRect().right + 0.5,
          };
        },
      );
      const flag = pick.machine?.flag ?? "";
      check(
        pick.machine?.classes.includes("is-pick") === true &&
          (flag === "Ready now" || flag.startsWith("Ready now · Ada tends")) &&
          name.full &&
          name.flagInside,
        `${size} the Great Machine as the pick with Ada tending it: the name in full and the flag "${flag}" beside it`,
      );
      await close();
    }
    {
      const { close, rows: machine } = await visit(
        () => machineMountain(),
        "buys",
      );
      check(
        machine.kid?.shown === true &&
          machine.kid.classes.includes("is-locked") &&
          machine.kid.icon.includes("mach-kid-dim"),
        `${size} machine Buys: the Kid worker row is locked and drawn dim`,
      );
      await close();
    }
    {
      const {
        page,
        close,
        rows: machine,
      } = await visit(() => machineMountain(), "buys", "?trouble=cave-in");
      const dot = await page.$eval(
        `${KEY("buys")} .board-key-dot`,
        (el) => !el.hidden,
      );
      check(
        dot && machine.cart?.trouble === "cave-in",
        `${size} machine with a cave-in on the cart: the Buys key's red lamp shows and the cart row has the trouble`,
      );
      await close();
    }
    {
      const { page, close } = await visit(() => heirMountain(), "buys");
      const chips = await page.$$eval(
        `${OPEN_SHEET("buys")} .crew-bit`,
        (els) => els.map((chip) => chip.textContent ?? ""),
      );
      check(
        chips.some((chip) => chip.startsWith("Grandpa")),
        `${size} heir Buys: Grandpa's chip is on the crew line (${chips.join(" | ")})`,
      );
      await close();
    }
    {
      const { close, rows: tools } = await visit(
        () => toolsMountain(),
        "upgrades",
      );
      check(
        tools.tap?.badge === "Lv 2/10" &&
          tools.boots?.price === "Owned" &&
          tools["tool:pick"]?.price === "Found" &&
          tools["tool:lamp"]?.price === "Found",
        `${size} tools Upgrades: Strong arms at Lv 2/10, Better boots Owned, the pick and the lamp Found`,
      );
      if (tools.tap?.badge !== "Lv 2/10" || tools.boots?.price !== "Owned") {
        console.log("tools upgrades", size, JSON.stringify(tools));
      }
      await close();
    }
    {
      const { close, rows: crew } = await visit(() => crewV4Save(), "upgrades");
      check(
        ["sharper", "overtime"].every(
          (id) =>
            crew[id]?.classes.includes("is-running") === true &&
            crew[id].verb === "Running" &&
            /^\d+:\d\d$/.test(crew[id].price),
        ),
        `${size} crew Upgrades: both boosts are Running with their clocks`,
      );
      await close();
    }
  });
};

/** What the open Ledger shows: its rows' words, Tonight's lines, its plates and its page. */
async function ledgerFacts(page) {
  return page.$eval(OPEN_SHEET("ledger"), (sheet) => {
    const shown = (el) =>
      el !== null &&
      el.closest("[hidden]") === null &&
      el.getClientRects().length > 0;
    const words = (el) =>
      el === null || !shown(el) ? "" : (el.textContent ?? "");
    const box = sheet.getBoundingClientRect();
    const within = (el, outer) => {
      const b = el.getBoundingClientRect();
      const o = outer.getBoundingClientRect();
      return (
        b.top >= o.top - 0.5 &&
        b.bottom <= o.bottom + 0.5 &&
        b.left >= o.left - 0.5 &&
        b.right <= o.right + 0.5
      );
    };
    const row = (id) => {
      const el = sheet.querySelector(`.board-row[data-ledger="${id}"]`);
      const info = el?.querySelector(".board-row-info") ?? null;
      return {
        name: words(el?.querySelector(".board-row-name") ?? null),
        info: words(info),
        why: words(el?.querySelector(".board-row-why") ?? null),
        verb: words(el?.querySelector(".board-row-verb") ?? null),
        // One line, cut by an ellipsis if it must be, inside its row.
        infoFits:
          info === null ||
          !shown(info) ||
          (within(info, el) &&
            info.getBoundingClientRect().height <=
              Number.parseFloat(getComputedStyle(info).lineHeight) + 1 &&
            (info.scrollWidth <= info.clientWidth + 1 ||
              getComputedStyle(info).textOverflow === "ellipsis")),
      };
    };
    const log = sheet.querySelector(".ledger-log");
    const lines = [...sheet.querySelectorAll(".ledger-log-line")]
      .filter(shown)
      .map((line) => {
        const text = line.querySelector(".ledger-log-text");
        return {
          time: line.querySelector(".ledger-log-time")?.textContent ?? "",
          text: text?.textContent ?? "",
          fits:
            log !== null &&
            within(line, log) &&
            text !== null &&
            (text.scrollWidth <= text.clientWidth + 1 ||
              getComputedStyle(text).textOverflow === "ellipsis"),
        };
      });
    const plates = [...sheet.querySelectorAll(".ledger-doors > button")].map(
      (plate) => ({
        id: [...plate.classList].find((cls) => cls.startsWith("ledger-")) ?? "",
        shown: shown(plate),
      }),
    );
    const pageEl = sheet.querySelector(
      ".board-sheet-page:not([hidden]) > .ledger-page",
    );
    const pageParts =
      pageEl === null
        ? []
        : [
            ...pageEl.querySelectorAll(
              ".ledger-page-title, .ledger-page-line, button, .ledger-field-log-well",
            ),
          ];
    return {
      stones: row("stones"),
      relics: row("relics"),
      account: row("account"),
      tonightShown: log !== null && shown(log),
      lines,
      plates,
      listShown: shown(sheet.querySelector(".board-sheet-list")),
      page: pageEl === null ? "" : [...pageEl.classList].join(" "),
      pageTitle: words(pageEl?.querySelector(".ledger-page-title") ?? null),
      pageLine: words(pageEl?.querySelector(".ledger-page-line") ?? null),
      pageButtons:
        pageEl === null ? 0 : pageEl.querySelectorAll("button").length,
      pageInside:
        pageEl !== null &&
        pageParts.length > 0 &&
        pageParts.every((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.top >= box.top - 0.5 &&
            b.bottom <= box.bottom + 0.5 &&
            b.left >= box.left - 0.5 &&
            b.right <= box.right + 0.5
          );
        }),
      logValue: pageEl?.querySelector(".ledger-field-log-text")?.value ?? "",
    };
  });
}

/** Opens the save on held clocks, then the Ledger by its key, past its settle. */
async function openLedger(viewport, save, before = async () => undefined) {
  const opened = await openScreen(viewport, save, {
    stopClock: true,
    tapClock: "held",
  });
  await keysDrawn(opened.page);
  await noteAway(opened.page);
  await before(opened.page);
  await openSheet(opened.page, "ledger");
  await stepTapClock(opened.page, PAST_SETTLE_MS);
  return opened;
}

/**
 * The Ledger drawer's states (#375), on held clocks: the mine on a mid save, Tonight's away
 * line, four materials on a kid's run, and the two pages. Its fit, targets, text and art are
 * the DRAWERS row's checks.
 */
const registerLedgerStates = (viewport) => {
  section(
    `keys and drawers ${JSON.stringify(viewport)} ledger states`,
    async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      {
        const { page, close } = await openLedger(viewport, openMountain());
        const mid = await ledgerFacts(page);
        await shot(page, `ledger-mid-${size}`);
        const shownPlates = mid.plates
          .filter((plate) => plate.shown)
          .map((plate) => plate.id);
        check(
          /^[\d.,]+[KMBT]? stones left$/.test(mid.stones.name) &&
            mid.stones.info.includes("Clay") &&
            mid.stones.info.includes("Iron") &&
            /^\d of 6 relics found$/.test(mid.relics.name) &&
            mid.relics.info.startsWith("Next: ") &&
            mid.account.name === "Account" &&
            mid.account.info === "Not signed in" &&
            mid.account.verb === "Sign in" &&
            !mid.tonightShown &&
            mid.plates.length === 4 &&
            JSON.stringify(shownPlates) ===
              JSON.stringify([
                "ledger-saved-copies",
                "ledger-field-log",
                "ledger-start-over",
              ]),
          `${size} ledger mid: the stones left with clay and iron, the relics found with the next one, Account not signed in, no Tonight, and three plates with Pass hidden`,
        );
        if (!mid.stones.info.includes("Clay") || mid.tonightShown) {
          console.log("ledger mid", size, JSON.stringify(mid));
        }
        await close();
      }
      {
        const { page, close } = await openLedger(
          viewport,
          playAwaySave(),
          async (at) => {
            await at.waitForSelector(".welcome-continue", { visible: true });
            await at.$eval(".welcome-continue", (button) => {
              button.click();
            });
          },
        );
        const away = await ledgerFacts(page);
        await shot(page, `ledger-tonight-${size}`);
        const first = away.lines[0];
        check(
          away.tonightShown &&
            first !== undefined &&
            first.text.startsWith("Came back. The crew dug ") &&
            /^\d\d:\d\d$/.test(first.time) &&
            away.lines.every((line) => line.fits),
          `${size} ledger tonight: the first line is the away haul with its time, inside the box with no spill (${first?.time ?? "-"} ${first?.text ?? "-"})`,
        );
        await close();
      }
      {
        const { page, close } = await openLedger(viewport, heartMountain());
        const heart = await ledgerFacts(page);
        const names = ["Clay", "Iron", "Crystal", "Heartstone"];
        check(
          names.every((name) => heart.stones.info.includes(name)) &&
            heart.stones.infoFits &&
            /^\d of 6 relics found$/.test(heart.relics.name) &&
            heart.relics.info !== "",
          `${size} ledger heart: four materials on one line inside the stones row (${heart.stones.info}), and the relics row reads "${heart.relics.info}"`,
        );
        await close();
      }
      {
        const { page, close } = await openLedger(viewport, openMountain());
        await press(page, `${OPEN_SHEET("ledger")} .ledger-start-over`);
        await page
          .waitForSelector(`${OPEN_SHEET("ledger")} .ledger-start-over-page`, {
            visible: true,
            timeout: 2_000,
          })
          .catch(() => undefined);
        const asked = await ledgerFacts(page);
        await shot(page, `ledger-start-over-${size}`);
        check(
          asked.page.includes("ledger-start-over-page") &&
            !asked.listShown &&
            asked.pageTitle === "Start over?" &&
            asked.pageLine.includes("every relic you found") &&
            asked.pageButtons === 2 &&
            asked.pageInside &&
            (await noScroll(page)),
          `${size} ledger start over: the page asks "Start over?" with its detail and both plates inside the drawer, with no page scroll`,
        );
        await stepTapClock(page, PAST_SETTLE_MS);
        await press(page, `${OPEN_SHEET("ledger")} .ledger-keep`);
        const back = await page
          .waitForFunction(
            (selector) =>
              document.querySelector(`${selector} .board-sheet-list`)
                ?.hidden === false,
            { timeout: 2_000 },
            OPEN_SHEET("ledger"),
          )
          .then(
            () => true,
            () => false,
          );
        check(
          back,
          `${size} ledger start over: Keep past the settle brings the list back`,
        );
        await close();
      }
      {
        // The browser refuses the clipboard: stubbed before the press reads it.
        const { page, close } = await openLedger(
          viewport,
          openMountain(),
          async (at) => {
            await at.evaluate(() => {
              Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: {
                  writeText: () => Promise.reject(new Error("refused")),
                },
              });
            });
          },
        );
        await press(page, `${OPEN_SHEET("ledger")} .ledger-field-log`);
        await page
          .waitForSelector(`${OPEN_SHEET("ledger")} .ledger-field-log-page`, {
            visible: true,
            timeout: 2_000,
          })
          .catch(() => undefined);
        const fallback = await ledgerFacts(page);
        await shot(page, `ledger-field-log-${size}`);
        check(
          fallback.page.includes("ledger-field-log-page") &&
            fallback.logValue.startsWith("{") &&
            fallback.pageInside &&
            (await noScroll(page)),
          `${size} ledger field log: where the browser refuses the clipboard, the page shows the log to copy, inside the drawer`,
        );
        await close();
      }
    },
  );
};

table({
  screens: SCREENS,
  scenarios: DRAWER_SAVES,
  rows: DRAWERS,
  section: (viewport, scenario) =>
    `keys and drawers ${JSON.stringify(viewport)} ${scenario.name}`,
  prefix: ({ size, scenario, row }) =>
    `${size} ${row.name} drawer, ${scenario.name}:`,
  open: openDrawerSave,
  expect: DRAWER_EXPECT,
  after: (viewport) => {
    registerStates(viewport);
    registerLedgerStates(viewport);
  },
});
