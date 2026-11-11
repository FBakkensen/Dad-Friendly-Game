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
import { check, section } from "./registry.mjs";
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
// the phone and the three PC sizes. The rail: five keys at the mockup's x
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
const RAIL_SAVES = [
  ["fresh", () => freshMountain()],
  ["early", () => crewMountain()],
  ["mid", () => openMountain()],
  ["heart", () => heartMountain()],
  // The bench clock under the Workshop key.
  ["workshop", () => workshopSave(Date.now(), true)],
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

for (const viewport of SCREENS) {
  section(`keys and drawers ${JSON.stringify(viewport)} rail`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    for (const [name, save] of RAIL_SAVES) {
      const label = `${size} key rail, ${name}:`;
      const { page, close } = await openScreen(viewport, save());
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
      const keys = await railFacts(page);
      check(
        drawn && keys.every((key) => key.ok),
        `${label} five keys at x 16 + 80i and top 768, each cap, dot and sub-line as key-rail.ts says`,
      );
      if (!keys.every((key) => key.ok)) {
        console.log("rail keys", size, name, JSON.stringify(keys));
      }
      const art = await boardArtAt2x(page, ".board-rail", ".board-rail");
      check(
        art.misses.length === 0 && art.count >= 10,
        `${label} ${String(art.count)} caps, icons and dots at exactly 2x`,
      );
      if (art.misses.length > 0) {
        console.log("rail 2x", size, name, JSON.stringify(art.misses));
      }
      const text = await boardTextSizes(page, ".board-rail");
      check(
        text.small.length === 0 && text.count >= 5,
        `${label} names and sub-lines are 13px or more (${String(text.count)} runs)`,
      );
      if (text.small.length > 0) {
        console.log("rail text", size, name, JSON.stringify(text.small));
      }
      const contrast = await boardContrast(
        page,
        ".board-key-name, .board-key-sub",
      );
      const dim = contrast.filter((row) => row.pct < 4.5);
      check(
        contrast.length >= 5 && dim.length === 0,
        `${label} ${String(contrast.length)} names and sub-lines at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
      );
      if (dim.length > 0) {
        console.log("rail contrast", size, name, JSON.stringify(contrast));
      }
      const state = await keyState(page);
      if (name === "fresh") {
        const subs = Object.fromEntries(keys.map((key) => [key.id, key.sub]));
        check(
          state.ok &&
            [state.workshop, state.engineers].every(
              (key) => key.disabled && key.locked && key.dim,
            ) &&
            subs.workshop === "With the clay" &&
            subs.engineers === "With 1st borer",
          `${label} Workshop and Engineers are locked, with their unlock lines`,
        );
      }
      if (name === "mid" || name === "heart") {
        check(
          state.ok &&
            [
              state.buys,
              state.workshop,
              state.engineers,
              state.upgrades,
              state.ledger,
            ].every(keyOpen),
          `${label} every key is open`,
        );
      }
      if (name === "mid") {
        // Upgrades lights where today's glow was, and the red lamps sit on
        // the keys whose systems are still to be taught.
        const lit = keys.find((key) => key.id === "upgrades");
        check(
          lit?.lit === true &&
            lit.cap === CAP_X.lit &&
            keys.some((key) => key.dot),
          `${label} the Upgrades cap is lit and the red lamps show`,
        );
      }
      if (name === "workshop") {
        const bench = keys.find((key) => key.id === "workshop");
        check(
          /^\d+:\d\d$/.test(bench?.sub ?? ""),
          `${label} the bench clock reads under the Workshop key (${String(bench?.sub)})`,
        );
      }
      const foot = await railFoot(page);
      check(
        foot.ok,
        `${label} the rail ends at least 8px above the save line (${String(foot.gap)})`,
      );
      check(await noScroll(page), `${label} no page scroll`);
      await close();
    }
  });
}
