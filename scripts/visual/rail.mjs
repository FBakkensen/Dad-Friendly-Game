/* global console, document, localStorage, HTMLElement */
/** Key rail section: the rail's keys, per size and save. */
import {
  freshMountain,
  crewMountain,
  openMountain,
  heartMountain,
  workshopSave,
  SAVE_KEY,
} from "../../tools/browser/fixtures.ts";
import { table } from "./registry.mjs";
import {
  SCREENS,
  openScreen,
  noScroll,
  keyState,
  keyOpen,
  railFoot,
  keysDrawn,
} from "./kit.mjs";
import { boardTextSizes, boardArtAt2x, boardContrast } from "./measure.mjs";

// Keys and drawers (#373): the key rail and the Buys and Upgrades drawers, at
// the phone. The rail: five keys at the mockup's x
// (16 + 80i) and top 768, caps, icons and dots at exactly 2x, names and
// sub-lines at 13px and 4.5:1, each key's lock, lit cap, dot and timer as
// key-rail.ts says, and the rail's foot 8px above the save line. Each drawer,
// opened by its key on nine saves: its box (178..864 by 8..416) with the
// odometer and the save line in view, no page scroll, its list scrolling only
// where C1 allows, rows 76 tall and 10 apart with every part inside and
// apart, 48px targets 8px apart, 13px text, art at 2x, row legends at 4.5:1,
// the spare plate's tier, and the "i" cards fitting with no scroll. Then the
// rows' states, each control wired once (a row's buy and Done, the red blink,
// the scrim, Escape, the "i" and its Back) and reduced motion's first frame.
const KEY_IDS = ["buys", "workshop", "engineers", "upgrades", "ledger"];
const KEY_RULES = "/src/key-rail.ts";
const SAVE_RULES = "/src/persist.ts";
/** One key cap frame is 32 art px: rest 0, down 1, locked 2, lit 3. */
const CAP_X = { rest: "0px", locked: "-128px", lit: "-192px" };
/**
 * The rail's saves. The flags pick the save-only checks: Workshop and
 * Engineers locked, every key open, the Upgrades cap lit, the bench clock.
 */
const RAIL_SAVES = [
  { name: "fresh", save: () => freshMountain(), locked: true },
  { name: "early", save: () => crewMountain() },
  { name: "mid", save: () => openMountain(), open: true, lit: true },
  { name: "heart", save: () => heartMountain(), open: true },
  // The bench clock under the Workshop key.
  { name: "workshop", save: () => workshopSave(Date.now(), true), bench: true },
];

/** Each key's place, size and face, beside what key-rail.ts says it shows. */
async function railFacts(page) {
  return page.evaluate(
    async (keyRules, saveRules, saveKey, ids, capX) => {
      const { keyViews } = await import(keyRules);
      const { parseSaveValue } = await import(saveRules);
      const parsed = parseSaveValue(
        JSON.parse(localStorage.getItem(saveKey) ?? "null"),
      );
      const views =
        parsed === undefined
          ? undefined
          : keyViews(parsed.mountain, Date.now(), undefined);
      const board = globalThis.__board();
      const clock = /^\d+:\d\d(:\d\d)?$/;
      return ids.map((id, index) => {
        const key = document.querySelector(`.board-key[data-key="${id}"]`);
        if (key === null) {
          return { id, ok: false };
        }
        const box = key.getBoundingClientRect();
        const left = (box.left - board.left) / board.scale;
        const top = (box.top - board.top) / board.scale;
        const cap = key.querySelector(".board-key-cap");
        const dot = key.querySelector(".board-key-dot");
        const sub = key.querySelector(".board-key-sub");
        const view = views?.[id];
        const subText = sub?.hidden === false ? (sub.textContent ?? "") : "";
        const capShown =
          cap instanceof HTMLElement
            ? cap.style.backgroundPositionX || "0px"
            : "";
        const face =
          view !== undefined &&
          capShown === capX[view.cap] &&
          key.classList.contains("is-lit") === (view.cap === "lit") &&
          key.classList.contains("is-locked") === (view.cap === "locked") &&
          key.disabled === (view.cap === "locked") &&
          (dot?.hidden === false) === view.dot &&
          (clock.test(view.sub)
            ? clock.test(subText) && sub.classList.contains("board-num")
            : subText === view.sub);
        return {
          id,
          ok:
            Math.abs(left - (16 + 80 * index)) <= 0.5 &&
            Math.abs(top - 768) <= 0.5 &&
            face,
          left: Math.round(left * 10) / 10,
          top: Math.round(top * 10) / 10,
          face,
          cap: capShown,
          want: view,
          sub: subText,
          dot: dot?.hidden === false,
          locked: key.classList.contains("is-locked"),
          lit: key.classList.contains("is-lit"),
        };
      });
    },
    KEY_RULES,
    SAVE_RULES,
    SAVE_KEY,
    KEY_IDS,
    CAP_X,
  );
}

/** Opens the save and waits for the rail's faces and images. */
async function openRail(viewport, { save }) {
  const { page, close } = await openScreen(viewport, save());
  try {
    const drawn = await keysDrawn(page);
    // The rail's faces and images are in before it is measured.
    await page.waitForFunction(
      () =>
        document.fonts.status === "loaded" &&
        [...document.querySelectorAll(".board-rail img")].every(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      { timeout: 5_000 },
    );
    return { page, close, drawn, keys: await railFacts(page) };
  } catch (error) {
    await close();
    throw error;
  }
}

const RAIL_EXPECT = [
  {
    run: ({ drawn, keys, size, scenario }) => {
      if (!keys.every((key) => key.ok)) {
        console.log("rail keys", size, scenario.name, JSON.stringify(keys));
      }
      return [
        [
          drawn && keys.every((key) => key.ok),
          "five keys at x 16 + 80i and top 768, each cap, dot and sub-line as key-rail.ts says",
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario }) => {
      const art = await boardArtAt2x(page, ".board-rail", ".board-rail");
      if (art.misses.length > 0) {
        console.log("rail 2x", size, scenario.name, JSON.stringify(art.misses));
      }
      return [
        [
          art.misses.length === 0 && art.count >= 10,
          `${String(art.count)} caps, icons and dots at exactly 2x`,
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario }) => {
      const text = await boardTextSizes(page, ".board-rail");
      if (text.small.length > 0) {
        console.log(
          "rail text",
          size,
          scenario.name,
          JSON.stringify(text.small),
        );
      }
      return [
        [
          text.small.length === 0 && text.count >= 5,
          `names and sub-lines are 13px or more (${String(text.count)} runs)`,
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario }) => {
      const contrast = await boardContrast(
        page,
        ".board-key-name, .board-key-sub",
      );
      const dim = contrast.filter((row) => row.pct < 4.5);
      if (dim.length > 0) {
        console.log(
          "rail contrast",
          size,
          scenario.name,
          JSON.stringify(contrast),
        );
      }
      return [
        [
          contrast.length >= 5 && dim.length === 0,
          `${String(contrast.length)} names and sub-lines at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
        ],
      ];
    },
  },
  {
    when: ({ scenario }) => scenario.locked === true,
    run: async ({ page, keys }) => {
      const state = await keyState(page);
      const subs = Object.fromEntries(keys.map((key) => [key.id, key.sub]));
      return [
        [
          state.ok &&
            [state.workshop, state.engineers].every(
              (key) => key.disabled && key.locked && key.dim,
            ) &&
            subs.workshop === "With the clay" &&
            subs.engineers === "With 1st borer",
          "Workshop and Engineers are locked, with their unlock lines",
        ],
      ];
    },
  },
  {
    when: ({ scenario }) => scenario.open === true,
    run: async ({ page }) => {
      const state = await keyState(page);
      return [
        [
          state.ok &&
            [
              state.buys,
              state.workshop,
              state.engineers,
              state.upgrades,
              state.ledger,
            ].every(keyOpen),
          "every key is open",
        ],
      ];
    },
  },
  {
    when: ({ scenario }) => scenario.lit === true,
    run: ({ keys }) => {
      // Upgrades lights where today's glow was, and the red lamps sit on
      // the keys whose systems are still to be taught.
      const lit = keys.find((key) => key.id === "upgrades");
      return [
        [
          lit?.lit === true &&
            lit.cap === CAP_X.lit &&
            keys.some((key) => key.dot),
          "the Upgrades cap is lit and the red lamps show",
        ],
      ];
    },
  },
  {
    when: ({ scenario }) => scenario.bench === true,
    run: ({ keys }) => {
      const bench = keys.find((key) => key.id === "workshop");
      return [
        [
          /^\d+:\d\d$/.test(bench?.sub ?? ""),
          `the bench clock reads under the Workshop key (${String(bench?.sub)})`,
        ],
      ];
    },
  },
  {
    run: async ({ page }) => {
      const foot = await railFoot(page);
      return [
        [
          foot.ok,
          `the rail ends at least 8px above the save line (${String(foot.gap)})`,
        ],
        [await noScroll(page), "no page scroll"],
      ];
    },
  },
];

table({
  per: "screen",
  screens: SCREENS,
  scenarios: RAIL_SAVES,
  section: (viewport) => `keys and drawers ${JSON.stringify(viewport)} rail`,
  prefix: ({ size, scenario }) => `${size} key rail, ${scenario.name}:`,
  open: openRail,
  expect: RAIL_EXPECT,
});
