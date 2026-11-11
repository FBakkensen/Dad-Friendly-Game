/* global console, document */
/** Drawer sections: each drawer's rows and legends, per save, and the drawer states. */
import {
  freshMountain,
  crewMountain,
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
} from "../../tools/browser/fixtures.ts";
import { undersizedTargets } from "../../src/ui-audit-measure.ts";
import { check, section } from "./registry.mjs";
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
  ["fresh", () => freshMountain()],
  ["early", () => crewMountain()],
  ["mid", () => openMountain()],
  ["short", () => shortMountain()],
  ["idle", () => idleMountain()],
  ["tools", () => toolsMountain()],
  ["machine", () => machineMountain()],
  ["heir", () => heirMountain()],
  ["crew", () => crewV4Save()],
  ["mid, the borer the pick", () => borerPickMountain()],
  // A full Granite: two rows of crew chips, and Buys still fits (#373).
  ["mid, two chip rows", () => fullGraniteMountain()],
  // The Great Machine the pick, with Ada tending it: the flag gives way.
  ["machine, the Great Machine the pick", () => machinePickMountain()],
];
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
 * Buys on ×10 and on Max (#358): the key's face changes, and every row's
 * counted verb and total price still lie inside it, with no page scroll. A
 * keyboard press is never early. The third press goes back to ×1, so the
 * next section opens as this one did.
 */
async function amountChecks(page, label) {
  const key = `${OPEN_SHEET("buys")} .board-sheet-head .buy-amount`;
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
      check(shown === face, `${label} the amount key goes back to ×1`);
      continue;
    }
    const facts = await drawerFacts(page, "buys");
    const crowded = facts.rows.filter(
      (row) => !row.inside || row.overlaps.length > 0 || row.spills.length > 0,
    );
    check(
      shown === face &&
        crowded.length === 0 &&
        facts.rows.every((row) => Math.abs(row.height - 76) <= 0.5) &&
        (await noScroll(page)),
      `${label} on ${face}, every row's count and total lie inside it, 76 tall, with no page scroll`,
    );
    if (crowded.length > 0) {
      console.log("drawer amount", label, face, JSON.stringify(crowded));
    }
  }
}

for (const viewport of SCREENS) {
  for (const [saveName, save] of DRAWER_SAVES) {
    section(
      `keys and drawers ${JSON.stringify(viewport)} ${saveName}`,
      async () => {
        const size = `${String(viewport[0])}x${String(viewport[1])}`;
        const { page, close } = await openScreen(viewport, save(), {
          stopClock: true,
        });
        await keysDrawn(page);
        await page.evaluate(() => document.fonts.ready.then(() => true));
        await noteAway(page);
        for (const name of ["buys", "upgrades"]) {
          const label = `${size} ${name} drawer, ${saveName}:`;
          const up = await openSheet(page, name);
          // Every row's art has loaded before it is measured.
          await page.evaluate(() =>
            Promise.all(
              [...document.querySelectorAll(".board-sheet.is-open img")].map(
                (img) => img.decode().catch(() => undefined),
              ),
            ),
          );
          const facts = await drawerFacts(page, name);
          check(
            up && facts.placed && facts.odometerClear && facts.saveLineClear,
            `${label} stands at 178..864 by 8..416, with the odometer and the save line in view`,
          );
          if (!facts.placed || !facts.odometerClear || !facts.saveLineClear) {
            const clip = await page.$eval(
              ".board-sheet-clip",
              (el) => el.scrollTop,
            );
            console.log(
              "drawer box",
              size,
              saveName,
              name,
              JSON.stringify({ box: facts.box, clipScrollTop: clip }),
            );
          }
          check(await noScroll(page), `${label} no page scroll`);
          const mayScroll =
            name === "buys"
              ? LONG_BUYS.has(saveName)
              : facts.rows.length >= FULL_UPGRADES_ROWS;
          const mustScroll = name === "buys" && LONG_BUYS.has(saveName);
          check(
            facts.scrolls
              ? mayScroll && facts.spareClass === "is-off"
              : !mustScroll,
            `${label} its list ${facts.scrolls ? "scrolls inside the drawer (C1) with the spare off" : "fits with no scroll"}`,
          );
          if (facts.scrolls !== mustScroll && !(facts.scrolls && mayScroll)) {
            const sizes = await page.$eval(
              `${OPEN_SHEET(name)} .board-sheet-list`,
              (list) => [list.scrollHeight, list.clientHeight],
            );
            console.log("drawer scroll", size, saveName, name, sizes);
          }
          check(
            facts.spareClass === facts.spareWant,
            `${label} the spare plate is ${facts.spareClass}, as its height asks (${facts.spareWant})`,
          );
          const rowsOk =
            facts.rows.every((row) => Math.abs(row.height - 76) <= 0.5) &&
            facts.gaps.every((gap) => Math.abs(gap - 10) <= 0.5);
          check(
            rowsOk,
            `${label} ${String(facts.rows.length)} rows are 76 tall and 10 apart`,
          );
          const crowded = facts.rows.filter(
            (row) =>
              !row.inside || row.overlaps.length > 0 || row.spills.length > 0,
          );
          check(
            crowded.length === 0,
            `${label} every row's name, info, need, flag, gain, tag and verb lie inside it and apart`,
          );
          if (!rowsOk || crowded.length > 0) {
            console.log(
              "drawer rows",
              size,
              saveName,
              name,
              JSON.stringify({
                gaps: facts.gaps,
                crowded,
                rows: facts.rows.map((row) => [row.id, row.height]),
              }),
            );
          }
          const targets = await boardTargets(page);
          const inSheet = (target) =>
            /^\.(board-row|board-platebtn|board-sheet-info) /.test(
              target.selector,
            );
          const own = targets.own.filter(inSheet);
          // A scaled board snaps boxes to device pixels: allow a tenth of a pixel.
          const under = undersizedTargets(own, 47.9);
          const close8 = boardGaps(targets);
          check(
            own.length >= 2 && under.length === 0 && close8.length === 0,
            `${label} ${String(own.length)} targets are 48x48 board px, 8px from the next`,
          );
          if (under.length > 0 || close8.length > 0) {
            console.log(
              "drawer targets",
              size,
              saveName,
              name,
              JSON.stringify({
                under: under.map((target) => target.selector),
                close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
              }),
            );
          }
          const text = await boardTextSizes(page, OPEN_SHEET(name));
          check(
            text.small.length === 0 && text.count >= 3,
            `${label} text is 13px or more (${String(text.count)} runs)`,
          );
          if (text.small.length > 0) {
            console.log(
              "drawer text",
              size,
              saveName,
              name,
              JSON.stringify(text.small),
            );
          }
          const art = await boardArtAt2x(
            page,
            OPEN_SHEET(name),
            OPEN_SHEET(name),
          );
          check(
            art.misses.length === 0 && art.count >= 3,
            `${label} ${String(art.count)} images, sprites and skins at exactly 2x`,
          );
          if (art.misses.length > 0) {
            console.log(
              "drawer 2x",
              size,
              saveName,
              name,
              JSON.stringify(art.misses),
            );
          }
          const contrast = await boardContrast(page, ROW_LEGENDS(name));
          const dim = contrast.filter((row) => row.pct < 4.5);
          check(
            dim.length === 0,
            `${label} ${String(contrast.length)} row legends at 4.5:1 or more (lowest ${String(contrast.length === 0 ? "-" : Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
          );
          if (dim.length > 0) {
            console.log(
              "drawer contrast",
              size,
              saveName,
              name,
              JSON.stringify(dim),
            );
          }
          if (name === "buys") {
            await amountChecks(page, label);
          }
          // The "i": its cards take the list's place, fit, and go back. A
          // keyboard press is never early, so the drawer's settle does not
          // swallow it (the finger's "i" is wired in the taps section).
          await page.$eval(`${OPEN_SHEET(name)} .board-sheet-info`, (info) => {
            info.click();
          });
          await page
            .waitForSelector(
              `${OPEN_SHEET(name)} .board-sheet-how:not([hidden])`,
              {
                timeout: 2_000,
              },
            )
            .catch(() => undefined);
          // The cards' art and any face the list did not use load as they
          // show: wait for both before measuring. (The 708/660 overflow once
          // blamed on fonts was a skin canvas at its default size, #403.)
          await page.evaluate(() =>
            Promise.all([
              ...[
                ...document.querySelectorAll(
                  ".board-sheet.is-open .teach-how img",
                ),
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
          check(
            how.ok && howArt.misses.length === 0 && howText.small.length === 0,
            `${label} the "i" cards fit the drawer with no scroll, one Back, art at 2x and 13px text`,
          );
          if (!how.ok || howArt.misses.length > 0 || howText.small.length > 0) {
            console.log(
              "drawer how",
              size,
              saveName,
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
          await closeSheet(page, name);
        }
        await close();
      },
    );
  }

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
}
