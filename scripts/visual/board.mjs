/* global console, document */
/** Board sections: the board's targets, type, contrast and exact 2x art, per save. */
import {
  freshMountain,
  openMountain,
  overtimeSave,
} from "../../tools/browser/fixtures.ts";
import { undersizedTargets } from "../../src/ui-audit-measure.ts";
import { table } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  isDesk,
  press,
  SHELF_KEY,
  openScreen,
  coversBoard,
  noScroll,
  keysDrawn,
  noteAway,
  saveDrawerSettled,
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
  { name: "fresh", save: () => freshMountain(), search: "" },
  { name: "mid", save: () => openMountain(), search: "" },
  { name: "Overtime", save: () => overtimeSave(), search: "" },
  { name: "save error", save: () => openMountain(), search: "?save=error" },
];
/**
 * Legends every board shows at rest: the nine of the top, the gauge row and
 * the save line, then the band tag, three names, three sub-lines, three price
 * legends, the plate's three lines and the red button's legend (#372), and
 * the five key names on the rail (#373).
 */
const LEGENDS_AT_REST = 9 + 14 + 5;

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

/**
 * Opens the board on a save and reads it at rest: no scroll first, then the
 * controls once the save is in and any note that shows by itself is put away.
 * What later checks combine is kept on `seen`.
 */
async function openBoard(viewport, scenario) {
  const { page, close } = await openScreen(viewport, scenario.save(), {
    search: scenario.search,
  });
  await page.waitForSelector(".board-relics");
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const still = await noScroll(page);
  const loaded = await keysDrawn(page);
  await noteAway(page);
  const rest = await boardTargets(page);
  return { page, close, seen: { still: still && loaded, rest } };
}

/** The save drawer slides up over the board; the save line stays. */
async function saveDrawerFacts(page) {
  await press(page, ".save-status");
  // Wait for the slide to end, not a fixed time: under the full gate's
  // load a fixed wait caught the drawer mid-slide. A drawer that never opens
  // fails the facts below.
  await saveDrawerSettled(page);
  return page.evaluate(() => {
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
}

/** The open note's box against the board's, down to the save line. */
async function noteInside(page) {
  return page.evaluate(() => {
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
}

/** The board's controls in every state it was read in, against the bars. */
function targetChecks({ seen, drawerTargets, desk }) {
  const { rest, keyTargets, keyShown } = seen;
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
  const ok =
    // The top's, the window, three bays, the plate and the red button.
    rest.own.length >= 14 &&
    rest.own.some((target) => target.selector.startsWith(".board-window ")) &&
    keyShown &&
    drawerTargets.own.length >= 3 &&
    under.length === 0 &&
    close8.length === 0;
  return { ok, rendered, under, close8 };
}

const BOARD_EXPECT = [
  {
    run: ({ seen }) => [[seen.still, "no page scroll"]],
  },
  {
    // Gated on the 10th/90th percentile of the background: the enamel is
    // textured, and a lone scratch should not fail a legend. The strict
    // darkest/lightest ratio is printed beside it.
    run: async ({ page, size, scenario }) => {
      const contrast = await boardContrast(page);
      const dim = contrast.filter((row) => row.pct < 4.5);
      if (dim.length > 0 || contrast.length < LEGENDS_AT_REST) {
        console.log(
          "board contrast",
          size,
          scenario.name,
          JSON.stringify(contrast),
        );
      }
      return [
        [
          contrast.length >= LEGENDS_AT_REST && dim.length === 0,
          `${String(contrast.length)} legends at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90, ${String(Math.min(...contrast.map((row) => row.ratio)))}:1 at the extremes)`,
        ],
      ];
    },
  },
  {
    // A socket's note ends in the Relic shelf key, and the key opens the
    // shelf over the board (#370).
    run: async ({ page, viewport, seen }) => {
      await press(page, ".board-socket");
      await page
        .waitForSelector(SHELF_KEY, { visible: true, timeout: 2_000 })
        .catch(() => undefined);
      await notePainted(page);
      seen.keyTargets = await boardTargets(page);
      seen.keyText = await boardTextSizes(page);
      seen.keyArt = PHONE === viewport ? await boardArtAt2x(page) : undefined;
      seen.keyShown = seen.keyTargets.own.some((target) =>
        target.selector.startsWith(".board-platebtn Relic shelf"),
      );
      if (seen.keyShown) {
        await press(page, SHELF_KEY);
      }
      const ok = seen.keyShown && (await coversBoard(page, ".shelf-dialog"));
      await press(page, ".shelf-close");
      await page
        .waitForSelector(".shelf-dialog[hidden]", { timeout: 2_000 })
        .catch(() => undefined);
      return [[ok, "a socket's note opens the shelf from its Relic shelf key"]];
    },
  },
  {
    // The Running now note opens under the dial and stays on the board.
    run: async ({ page, viewport, size, scenario, seen }) => {
      await press(page, ".board-dial");
      await page
        .waitForSelector(".board-note.on", { timeout: 2_000 })
        .catch(() => undefined);
      await notePainted(page);
      const note = await noteInside(page);
      if (!note.ok) {
        console.log("board note", size, scenario.name, JSON.stringify(note));
      }
      seen.noteText = await boardTextSizes(page);
      seen.noteArt = PHONE === viewport ? await boardArtAt2x(page) : undefined;
      return [[note.ok, "the Running now note opens inside the board"]];
    },
  },
  {
    run: async ({ page, size, scenario, seen, viewport }) => {
      const drawer = await saveDrawerFacts(page);
      if (!drawer.ok) {
        console.log(
          "board drawer",
          size,
          scenario.name,
          JSON.stringify(drawer),
        );
      }
      const still = await noScroll(page);
      // Targets with the drawer open: its buttons and the save line.
      const drawerTargets = await boardTargets(page);
      const targets = targetChecks({
        seen,
        drawerTargets,
        desk: isDesk(viewport),
      });
      if (targets.under.length > 0 || targets.close8.length > 0) {
        console.log(
          "board targets",
          size,
          scenario.name,
          JSON.stringify({
            under: targets.under.map((target) => [
              target.selector,
              Math.round(target.width * 10) / 10,
              Math.round(target.height * 10) / 10,
            ]),
            close: targets.close8.map((pair) => [
              pair.a,
              pair.b,
              Math.round(pair.gap * 10) / 10,
            ]),
          }),
        );
      }
      return [
        [drawer.ok, "the save drawer opens and leaves the save line visible"],
        [still, "no page scroll with the drawer open"],
        [
          targets.ok,
          `controls are 48x48 board px, 8px from the next${targets.rendered}`,
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario, seen }) => {
      const drawerText = await boardTextSizes(page);
      const small = [
        ...seen.keyText.small,
        ...seen.noteText.small,
        ...drawerText.small,
      ];
      if (small.length > 0) {
        console.log("board text", size, scenario.name, JSON.stringify(small));
      }
      return [
        [
          small.length === 0,
          `board text is 13px or more (${String(seen.keyText.count + seen.noteText.count + drawerText.count)} runs)`,
        ],
      ];
    },
  },
  {
    // Art is measured at the phone, where the board is drawn at scale 1.
    when: ({ viewport }) => PHONE === viewport,
    run: async ({ page, size, scenario, seen }) => {
      const { keyArt, noteArt } = seen;
      const drawerArt = await boardArtAt2x(page);
      const misses = [
        ...(keyArt?.misses ?? []),
        ...noteArt.misses,
        ...drawerArt.misses,
      ];
      if (misses.length > 0) {
        console.log("board 2x", size, scenario.name, JSON.stringify(misses));
      }
      return [
        [
          misses.length === 0 && noteArt.count >= 8,
          `${String((keyArt?.count ?? 0) + noteArt.count + drawerArt.count)} images, sprites and skins at exactly 2x`,
        ],
      ];
    },
  },
];

table({
  screens: SCREENS,
  scenarios: BOARD_SAVES,
  section: (viewport, scenario) =>
    `board ${JSON.stringify(viewport)} ${scenario.name}`,
  prefix: ({ size, scenario }) => `${size} board, ${scenario.name}:`,
  open: openBoard,
  expect: BOARD_EXPECT,
});
