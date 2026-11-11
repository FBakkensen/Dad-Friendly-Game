/* global console, document, setTimeout */
/** Board sections: the board's targets, type, contrast and exact 2x art, per save. */
import {
  freshMountain,
  openMountain,
  overtimeSave,
} from "../../tools/browser/fixtures.ts";
import { undersizedTargets } from "../../src/ui-audit-measure.ts";
import { check, section } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  isDesk,
  press,
  SHELF_KEY,
  openScreen,
  coversBoard,
  noScroll,
} from "./kit.mjs";
import {
  boardTargets,
  boardGaps,
  boardTextSizes,
  boardArtAt2x,
  boardContrast,
} from "./measure.mjs";

// The board itself (#370): the relic plate, the stock row, the save line and
// its drawer, at the phone and the three PC sizes, on a fresh save, a mid save,
// one with Overtime running, and the save line in its error words.
const BOARD_SAVES = [
  ["fresh", () => freshMountain(), ""],
  ["mid", () => openMountain(), ""],
  ["Overtime", () => overtimeSave(), ""],
  ["save error", () => openMountain(), "?save=error"],
];
/**
 * Legends every board shows at rest: the nine of the top, the gauge row and
 * the save line, then the band tag, three names, three sub-lines, three price
 * legends, the plate's three lines and the red button's legend (#372), and
 * the five key names on the rail (#373).
 */
const LEGENDS_AT_REST = 9 + 14 + 5;
/** The drawer slides in steps(6) over 240ms. */
const DRAWER_MS = 400;

/**
 * A note's skins paint once their art has loaded (src/board-skin.ts), a frame
 * or two after it opens: wait for that before measuring them.
 */
async function notePainted(page) {
  await page
    .waitForFunction(
      () =>
        [
          ...document.querySelectorAll(".board-note.on canvas.board-skin"),
        ].every((canvas) => canvas.style.width !== ""),
      { timeout: 2_000 },
    )
    .catch(() => undefined);
}

for (const viewport of SCREENS) {
  for (const [name, save, search] of BOARD_SAVES) {
    section(`board ${JSON.stringify(viewport)} ${name}`, async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      const label = `${size} board, ${name}:`;
      const desk = isDesk(viewport);
      const { page, close } = await openScreen(viewport, save(), { search });
      await page.waitForSelector(".board-relics");
      await page.evaluate(() => document.fonts.ready.then(() => true));
      check(await noScroll(page), `${label} no page scroll`);
      // The controls at rest, before any note or drawer opens. A New note
      // that shows by itself above its key is put away first (#372).
      await putNoteAway(page);
      const rest = await boardTargets(page);

      // Gated on the 10th/90th percentile of the background: the enamel is
      // textured, and a lone scratch should not fail a legend. The strict
      // darkest/lightest ratio is printed beside it.
      const contrast = await boardContrast(page);
      const dim = contrast.filter((row) => row.pct < 4.5);
      check(
        contrast.length >= LEGENDS_AT_REST && dim.length === 0,
        `${label} ${String(contrast.length)} legends at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90, ${String(Math.min(...contrast.map((row) => row.ratio)))}:1 at the extremes)`,
      );
      if (dim.length > 0 || contrast.length < LEGENDS_AT_REST) {
        console.log("board contrast", size, name, JSON.stringify(contrast));
      }

      // A socket's note ends in the Relic shelf key, and the key opens the
      // shelf over the board (#370).
      await press(page, ".board-socket");
      await page
        .waitForSelector(SHELF_KEY, { visible: true, timeout: 2_000 })
        .catch(() => undefined);
      await notePainted(page);
      const keyTargets = await boardTargets(page);
      const keyText = await boardTextSizes(page);
      const keyArt = PHONE === viewport ? await boardArtAt2x(page) : undefined;
      const keyShown = keyTargets.own.some((target) =>
        target.selector.startsWith(".board-platebtn Relic shelf"),
      );
      if (keyShown) {
        await press(page, SHELF_KEY);
      }
      check(
        keyShown && (await coversBoard(page, ".shelf-dialog")),
        `${label} a socket's note opens the shelf from its Relic shelf key`,
      );
      await press(page, ".shelf-close");
      await page
        .waitForSelector(".shelf-dialog[hidden]", { timeout: 2_000 })
        .catch(() => undefined);

      // The Running now note opens under the dial and stays on the board.
      await press(page, ".board-dial");
      await page
        .waitForSelector(".board-note.on", { timeout: 2_000 })
        .catch(() => undefined);
      await notePainted(page);
      const note = await page.evaluate(() => {
        const board = globalThis.__board();
        const box = document
          .querySelector(".board-note.on")
          ?.getBoundingClientRect();
        if (box === undefined) {
          return { ok: false, box: [] };
        }
        return {
          ok:
            box.width > 0 &&
            box.left >= board.left - 0.5 &&
            box.right <= board.right + 0.5 &&
            box.top >= board.top - 0.5 &&
            box.bottom <= board.saveTop + 0.5,
          box: [box.left, box.top, box.right, box.bottom].map(Math.round),
          board: [board.left, board.top, board.right, board.saveTop].map(
            Math.round,
          ),
        };
      });
      check(note.ok, `${label} the Running now note opens inside the board`);
      if (!note.ok) {
        console.log("board note", size, name, JSON.stringify(note));
      }
      const noteText = await boardTextSizes(page);
      const noteArt = PHONE === viewport ? await boardArtAt2x(page) : undefined;

      // The save drawer slides up over the board; the save line stays.
      await press(page, ".save-status");
      // Wait for the slide to end, not a fixed time: under the full gate's
      // load a fixed wait caught the drawer mid-slide.
      await page
        .waitForFunction(
          () => {
            const sheet = document.querySelector(".board-save-drawer");
            return (
              sheet !== null &&
              sheet.classList.contains("is-open") &&
              sheet.getAnimations().length === 0
            );
          },
          { timeout: DRAWER_MS * 10 },
        )
        .catch(() => undefined);
      const drawer = await page.evaluate(() => {
        const board = globalThis.__board();
        const sheet = document.querySelector(".board-save-drawer");
        const line = document.querySelector(".board-saveline");
        if (sheet === null || line === null) {
          return { ok: false };
        }
        const box = sheet.getBoundingClientRect();
        const lineBox = line.getBoundingClientRect();
        const hit = document.elementFromPoint(
          (lineBox.left + lineBox.right) / 2,
          (lineBox.top + lineBox.bottom) / 2,
        );
        const buttons = [...sheet.querySelectorAll("button")].filter(
          (button) => button.getClientRects().length > 0,
        );
        return {
          ok:
            sheet.classList.contains("is-open") &&
            box.top >= board.top - 0.5 &&
            box.bottom <= lineBox.top + 0.5 &&
            lineBox.top >= board.top &&
            lineBox.bottom <= board.bottom + 0.5 &&
            hit !== null &&
            line.contains(hit) &&
            buttons.length === 2 &&
            buttons.every((button) => {
              const at = button.getBoundingClientRect();
              return at.bottom <= box.bottom + 0.5 && at.top >= box.top - 0.5;
            }),
          box: [box.left, box.top, box.right, box.bottom].map(Math.round),
          line: [lineBox.left, lineBox.top, lineBox.right, lineBox.bottom].map(
            Math.round,
          ),
          buttons: buttons.length,
        };
      });
      check(
        drawer.ok,
        `${label} the save drawer opens and leaves the save line visible`,
      );
      if (!drawer.ok) {
        console.log("board drawer", size, name, JSON.stringify(drawer));
      }
      check(
        await noScroll(page),
        `${label} no page scroll with the drawer open`,
      );

      // Targets with the drawer open: its buttons and the save line.
      const drawerTargets = await boardTargets(page);
      const targets = [
        ...rest.own,
        ...keyTargets.own.filter((target) =>
          target.selector.startsWith(".board-platebtn"),
        ),
        ...drawerTargets.own.filter((target) =>
          target.selector.startsWith(".board-platebtn"),
        ),
      ];
      const under = undersizedTargets(targets);
      // The plate and the stock row show in both states: name each pair once.
      const close8 = [
        ...new Map(
          [
            ...boardGaps(rest),
            ...boardGaps(keyTargets),
            ...boardGaps(drawerTargets),
          ].map((pair) => [`${pair.a}|${pair.b}`, pair]),
        ).values(),
      ];
      // On a PC, say how big the smallest control is drawn on the desk.
      const smallest = targets.reduce(
        (least, target) =>
          Math.min(...target.rendered) < Math.min(...least.rendered)
            ? target
            : least,
        targets[0] ?? { rendered: [0, 0] },
      );
      const rendered = desk
        ? ` (smallest drawn ${smallest.rendered.map((side) => side.toFixed(1)).join("x")})`
        : "";
      check(
        // The top's, the window, three bays, the plate and the red button.
        rest.own.length >= 14 &&
          rest.own.some((target) =>
            target.selector.startsWith(".board-window "),
          ) &&
          keyShown &&
          drawerTargets.own.length >= 3 &&
          under.length === 0 &&
          close8.length === 0,
        `${label} controls are 48x48 board px, 8px from the next${rendered}`,
      );
      if (under.length > 0 || close8.length > 0) {
        console.log(
          "board targets",
          size,
          name,
          JSON.stringify({
            under: under.map((target) => [
              target.selector,
              Math.round(target.width * 10) / 10,
              Math.round(target.height * 10) / 10,
            ]),
            close: close8.map((pair) => [
              pair.a,
              pair.b,
              Math.round(pair.gap * 10) / 10,
            ]),
          }),
        );
      }

      const drawerText = await boardTextSizes(page);
      const small = [...keyText.small, ...noteText.small, ...drawerText.small];
      check(
        small.length === 0,
        `${label} board text is 13px or more (${String(keyText.count + noteText.count + drawerText.count)} runs)`,
      );
      if (small.length > 0) {
        console.log("board text", size, name, JSON.stringify(small));
      }

      if (noteArt !== undefined) {
        const drawerArt = await boardArtAt2x(page);
        const misses = [
          ...(keyArt?.misses ?? []),
          ...noteArt.misses,
          ...drawerArt.misses,
        ];
        check(
          misses.length === 0 && noteArt.count >= 8,
          `${label} ${String((keyArt?.count ?? 0) + noteArt.count + drawerArt.count)} images, sprites and skins at exactly 2x`,
        );
        if (misses.length > 0) {
          console.log("board 2x", size, name, JSON.stringify(misses));
        }
      }
      await close();
    });
  }
}

/**
 * The New note shows once the save is in, on the first render or the next
 * second's tick; wait that out, then put any board note away with Escape.
 */
async function putNoteAway(page) {
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  for (let tries = 0; tries < 3; tries += 1) {
    if ((await page.$(".board-note.on")) === null) {
      return;
    }
    await page.keyboard.press("Escape");
  }
}
