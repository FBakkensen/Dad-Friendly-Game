/* global console, document, localStorage, getComputedStyle, HTMLImageElement, MutationObserver */
/** Gauge row sections: the gauge row and the vein, per save and band, and its moving parts. */
import {
  crewMountain,
  openMountain,
  crystalMountain,
  heartMountain,
  SAVE_KEY,
  lastStoneSave,
} from "../../tools/browser/fixtures.ts";
import {
  undersizedTargets,
  WINDOW_SCENE_PARTS,
} from "../../src/ui-audit-measure.ts";
import { check, section, table } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  press,
  openScreen,
  noScroll,
  MINE_WINDOW_RULES,
  framesPainted,
} from "./kit.mjs";
import {
  boardTargets,
  boardGaps,
  boardTextSizes,
  boardArtAt2x,
  boardContrast,
  boardFontsLoaded,
} from "./measure.mjs";

// The gauge row (#371): the output gauge, the mine window down No. 2 Shaft
// with its vein and Legacy plate, and the crew plate, at the phone, in each
// band. The bars are the board's: no scroll, 48px
// targets 8px apart (the vein exempt from its gap to the window only), 13px
// text, art at exactly 2x, 4.5:1 contrast at p10/p90, and the crew plate's
// words on the plate. These pages keep the bundled faces (Barlow Condensed,
// Share Tech Mono): the plate is sized for them, and the check proves they
// loaded rather than measuring a fallback face.
const GAUGE_SAVES = [
  { name: "early", save: () => crewMountain(), band: "topsoil" },
  { name: "mid", save: () => openMountain(), band: "granite" },
  { name: "crystal", save: () => crystalMountain(), band: "crystal" },
  { name: "heart", save: () => heartMountain(), band: "heart" },
];
/** The vein's range: veinSpot at x 0.35/0.65 and y 0.4/0.8. */
const VEIN_CORNERS = [
  [0.35, 0.4],
  [0.65, 0.4],
  [0.35, 0.8],
  [0.65, 0.8],
];

/** Each corner's spot in the window, from the game's own veinSpot. */
async function veinSpots(page, corners) {
  return page.evaluate(
    async (at, rules) => {
      const { veinSpot } = await import(rules);
      return at.map(([x, y]) => veinSpot(x, y));
    },
    corners,
    MINE_WINDOW_RULES,
  );
}

/** Shows the vein at a corner of its range, as board-window.ts places it; undefined hides it. */
async function placeVein(page, corner) {
  const [spot] =
    corner === undefined ? [undefined] : await veinSpots(page, [corner]);
  await page.evaluate((at) => {
    globalThis.__showVein(at);
  }, spot ?? null);
}

/**
 * The crew plate's words (legend, figure, free count) measured as drawn
 * glyph runs, not boxes: a flex item can shrink under its words and let them
 * spill, so each run's range must sit inside the plate.
 */
async function crewPlateWords(page) {
  return page.evaluate(() => {
    const plate = document.querySelector(".board-crew");
    if (plate === null) {
      return { ok: false, runs: [] };
    }
    const box = plate.getBoundingClientRect();
    const runs = [
      ...plate.querySelectorAll(
        ".board-crew-legend, .board-crew-n, .board-crew-free",
      ),
    ].map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return {
        text: el.textContent ?? "",
        ok:
          r.width > 0 &&
          r.left >= box.left - 0.5 &&
          r.right <= box.right + 0.5 &&
          r.top >= box.top - 0.5 &&
          r.bottom <= box.bottom + 0.5,
        run: [r.left, r.right].map((side) => Math.round(side - box.left)),
      };
    });
    // Neither run overlaps the next: the words push along, never over.
    const apart = runs.every(
      (run, index) => index === 0 || runs[index - 1].run[1] <= run.run[0] + 0.5,
    );
    return {
      ok: runs.length === 3 && apart && runs.every((run) => run.ok),
      plate: Math.round(box.width),
      runs,
    };
  });
}

/** The band's view behind the glass, and what the save owns in it. */
async function windowScene(page) {
  return page.evaluate(async () => {
    const mine = document.querySelector(".board-mine");
    const art = document.querySelector(".board-window-art");
    if (art instanceof HTMLImageElement && !art.complete) {
      await art.decode().catch(() => undefined);
    }
    const shown = (selector) => {
      const el = document.querySelector(selector);
      return (
        el !== null &&
        el.closest("[hidden]") === null &&
        el.getClientRects().length > 0
      );
    };
    return {
      band: mine?.getAttribute("data-band") ?? "",
      art: art?.getAttribute("src") ?? "",
      artWidth: art?.naturalWidth ?? 0,
      machine: shown(".board-window-machine"),
      kid: shown(".board-window-kid"),
      plate: shown(".board-legacy"),
      badge: document.querySelector(".board-legacy .legacy-badge")?.textContent,
    };
  });
}

/**
 * The New sign (#373): in the band between the plate's words and the key
 * rail, clear of the DIG legend, and a tap at its middle goes through.
 */
async function newSign(page) {
  return page.evaluate(() => {
    const slot = document.querySelector(".board-sign-slot:not([hidden])");
    const face = slot?.querySelector(".board-sign");
    if (face === null || face === undefined) {
      return { shown: false };
    }
    const r = face.getBoundingClientRect();
    const box = (selector) =>
      document.querySelector(selector)?.getBoundingClientRect();
    const apart = (b) =>
      b === undefined ||
      r.right <= b.left + 0.5 ||
      r.left >= b.right - 0.5 ||
      r.bottom <= b.top + 0.5 ||
      r.top >= b.bottom - 0.5;
    const words = box(".board-ready-text");
    const legend = box(".board-dig-lg");
    const rail = box(".board-rail");
    const hit = document.elementFromPoint(
      (r.left + r.right) / 2,
      (r.top + r.bottom) / 2,
    );
    return {
      shown: true,
      key: slot?.getAttribute("data-key") ?? "",
      text: face.textContent ?? "",
      clearOfWords: apart(words),
      clearOfLegend: apart(legend),
      aboveRail: rail !== undefined && r.bottom <= rail.top + 0.5,
      passes: hit !== null && !face.contains(hit) && hit !== slot,
      size: Number.parseFloat(
        getComputedStyle(face.querySelector(".board-sign-text") ?? face)
          .fontSize,
      ),
      rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
    };
  });
}

async function openGauge(viewport, scenario) {
  const opened = await openScreen(viewport, scenario.save());
  await opened.page.waitForSelector(".board-mine[data-band]");
  const fonts = await boardFontsLoaded(opened.page);
  return { ...opened, fonts };
}

const GAUGE_EXPECT = [
  {
    run: async ({ page, fonts }) => [
      [fonts, "the bundled faces are loaded"],
      [await noScroll(page), "no page scroll"],
    ],
  },
  {
    run: async ({ page, size, scenario }) => {
      const { name, band } = scenario;
      const scene = await windowScene(page);
      const heart = name === "heart";
      if (scene.band !== band || (heart && !scene.plate)) {
        console.log("gauge row scene", size, name, JSON.stringify(scene));
      }
      return [
        [
          scene.band === band &&
            scene.art.includes(`mine-view-${band}`) &&
            scene.artWidth === 92,
          `the window shows the ${band} view`,
        ],
        heart
          ? [
              scene.machine &&
                scene.kid &&
                scene.plate &&
                (scene.badge ?? "").startsWith("Legacy ×"),
              "the Great Machine, the kid and the Legacy plate show",
            ]
          : [
              !scene.machine && !scene.kid && !scene.plate,
              "no Great Machine, kid or Legacy plate before they are earned",
            ],
      ];
    },
  },
  {
    // Targets at rest, then with the vein at each end of its range, each
    // placed in the same page task that measures it.
    run: async ({ page, size, scenario }) => {
      const sets = [await boardTargets(page)];
      for (const vein of await veinSpots(page, VEIN_CORNERS)) {
        sets.push(await boardTargets(page, { vein }));
      }
      await placeVein(page, undefined);
      const own = sets.flatMap((set) => set.own);
      const under = undersizedTargets(own);
      const close8 = [
        ...new Map(
          sets
            .flatMap((set) => boardGaps(set))
            .map((pair) => [`${pair.a}|${pair.b}`, pair]),
        ).values(),
      ];
      const veins = own.filter((target) =>
        target.selector.startsWith(".golden-vein "),
      ).length;
      if (under.length > 0 || close8.length > 0) {
        console.log(
          "gauge row targets",
          size,
          scenario.name,
          JSON.stringify({
            under: under.map((target) => target.selector),
            close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
          }),
        );
      }
      return [
        [
          own.some((target) => target.selector.startsWith(".board-window ")) &&
            veins === VEIN_CORNERS.length &&
            under.length === 0 &&
            close8.length === 0,
          "the window and the vein are 48x48 board px, 8px from the next",
        ],
      ];
    },
  },
  {
    // Contrast first, before a tap puts "+N" over the view.
    run: async ({ page, size, scenario }) => {
      const contrast = await boardContrast(page);
      const dim = contrast.filter((row) => row.pct < 4.5);
      const want = [
        "Stones a sec",
        "Crew",
        "free",
        "No. 2 Shaft",
        ...(scenario.name === "heart" ? ["Legacy ×"] : []),
      ];
      const read = want.every((words) =>
        contrast.some((row) => row.text.includes(words)),
      );
      if (!read || dim.length > 0) {
        console.log(
          "gauge row contrast",
          size,
          scenario.name,
          JSON.stringify(contrast),
        );
      }
      return [
        [
          read && dim.length === 0,
          `${String(contrast.length)} legends at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario }) => {
      const sign = await newSign(page);
      if (scenario.name !== "mid" && !sign.shown) {
        return [];
      }
      const ok =
        sign.shown &&
        sign.clearOfWords &&
        sign.clearOfLegend &&
        sign.aboveRail &&
        sign.passes &&
        sign.size >= 14;
      if (!ok) {
        console.log("new sign", size, scenario.name, JSON.stringify(sign));
      }
      return [
        [
          ok,
          "the New sign stands between the plate's words and the rail, clear of the DIG legend, at 14px, and taps go through it",
        ],
      ];
    },
  },
  {
    // A dig shows "+N"; its text joins the 13px count.
    run: async ({ page, size, scenario }) => {
      await press(page, ".board-window");
      const text = await boardTextSizes(page);
      if (text.small.length > 0) {
        console.log(
          "gauge row text",
          size,
          scenario.name,
          JSON.stringify(text.small),
        );
      }
      return [
        [
          text.small.length === 0 && text.count >= 20,
          `board text is 13px or more (${String(text.count)} runs)`,
        ],
      ];
    },
  },
  {
    // Art is measured at the phone, where the board is drawn at scale 1.
    when: ({ viewport }) => PHONE === viewport,
    run: async ({ page, size, scenario }) => {
      await placeVein(page, VEIN_CORNERS[0]);
      const art = await boardArtAt2x(page);
      await placeVein(page, undefined);
      if (art.misses.length > 0) {
        console.log(
          "gauge row 2x",
          size,
          scenario.name,
          JSON.stringify(art.misses),
        );
      }
      return [
        [
          art.misses.length === 0 && art.count >= 20,
          `${String(art.count)} images, sprites and skins at exactly 2x`,
        ],
      ];
    },
  },
  {
    run: async ({ page, fonts, size, scenario }) => {
      const words = await crewPlateWords(page);
      if (!words.ok) {
        console.log("crew plate", size, scenario.name, JSON.stringify(words));
      }
      return [[fonts && words.ok, "the crew plate's words stay on the plate"]];
    },
  },
];

function movingParts(viewport) {
  section(`gauge row ${JSON.stringify(viewport)} moving parts`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} gauge row:`;

    // While a signed-in save loads, the window is its frame and glass alone:
    // no view, machine, kid, tub or miner from a save it has not read yet.
    // The Deep Heart save owns every machine and the kid, so any leak shows.
    {
      const { page, close } = await openScreen(viewport, heartMountain(), {
        search: "?save=loading",
      });
      const loading = await page
        .waitForFunction(
          () =>
            (
              document.querySelector(".save-status")?.textContent ?? ""
            ).includes("Loading your save"),
          { timeout: 3_000 },
        )
        .then(
          () => true,
          () => false,
        );
      // Let the board's loop step a few frames over the empty window.
      await framesPainted(page, 12);
      const seen = await page.evaluate(
        (parts) => ({
          parts: parts.filter((part) =>
            [...document.querySelectorAll(part)].some(
              (el) => el.getClientRects().length > 0,
            ),
          ),
          glass: [".board-window-frame", ".board-window-glass"].every(
            (part) =>
              (document.querySelector(part)?.getClientRects().length ?? 0) > 0,
          ),
        }),
        [...WINDOW_SCENE_PARTS],
      );
      check(
        loading && seen.glass && seen.parts.length === 0,
        `${label} while the save loads the window is its frame and glass, with no machine, kid, tub or miner`,
      );
      if (seen.parts.length > 0 || !loading) {
        console.log("loading window", size, { loading, ...seen });
      }
      await close();
    }

    // A cave-in shows in the window (the dev boot previews one).
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        search: "?trouble=cave-in",
      });
      await page.waitForSelector(".board-mine[data-band]");
      const caveIn = await page
        .waitForSelector(".board-window-cave-in:not([hidden])", {
          visible: true,
          timeout: 3_000,
        })
        .then(
          () => true,
          () => false,
        );
      check(caveIn, `${label} a cave-in shows in the window`);
      check(await noScroll(page), `${label} no page scroll with the cave-in`);
      await close();
    }

    // Three taps on the window add exactly three times the tap's yield, and
    // the odometer reads it. The clock is stopped, so the crew adds nothing.
    {
      const start = heartMountain();
      const { page, close } = await openScreen(
        viewport,
        { ...start, mountain: { ...start.mountain, pocket: 0 } },
        { stopClock: true },
      );
      await page.waitForSelector(".board-mine[data-band]");
      const pocket = () =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key) ?? "{}").mountain?.pocket,
          SAVE_KEY,
        );
      const before = await pocket();
      const yieldWords = await page.$eval(
        ".board-window",
        (button) => button.getAttribute("aria-label") ?? "",
      );
      const match = /tap to mine (one stone|([\d,.]+) stones)$/.exec(
        yieldWords,
      );
      const each =
        match === null
          ? NaN
          : match[2] === undefined
            ? 1
            : Number(match[2].replace(/,/g, ""));
      for (let tap = 0; tap < 3; tap += 1) {
        await press(page, ".board-window");
      }
      // The three digs are in the stored save before it is read.
      await page
        .waitForFunction(
          (key, want) =>
            JSON.parse(localStorage.getItem(key) ?? "{}").mountain?.pocket ===
            want,
          { timeout: 2_000 },
          SAVE_KEY,
          before + 3 * each,
        )
        .catch(() => undefined);
      const after = await pocket();
      const shown = await page.evaluate(() => ({
        odo: document.querySelector(".board-odo")?.getAttribute("aria-label"),
        plus: document.querySelector(".board-dig-plus")?.textContent,
      }));
      check(
        Number.isFinite(each) &&
          after - before === 3 * each &&
          shown.odo === `Stones ${Math.floor(after).toLocaleString("en-US")}` &&
          shown.plus === `+${match?.[2] ?? "1"}`,
        `${label} three taps on the window add three times the tap's ${String(each)} and the odometer reads it`,
      );
      if (after - before !== 3 * each) {
        console.log("window taps", size, { yieldWords, before, after, shown });
      }
      await close();
    }

    // Reduced motion: the window and the needle hold still; a tap still
    // shows "+N", without rising.
    {
      // The clock is stopped, so the 1s tick cannot change the vein or the
      // crew plate between the shots.
      const { page, close } = await openScreen(viewport, heartMountain(), {
        reducedMotion: true,
        stopClock: true,
      });
      await page.waitForSelector(".board-mine[data-band]");
      const clip = await page.evaluate(() => {
        const row = document.querySelector(".board-gauge-row");
        const box = row?.getBoundingClientRect();
        return box === undefined
          ? undefined
          : {
              x: Math.ceil(box.left),
              y: Math.ceil(box.top),
              width: Math.floor(box.width),
              height: Math.floor(box.height),
            };
      });
      // Still art first: the faces, every image decoded, every skin painted
      // and the gauge's reading in. Then two shots 36 frames (600ms or more
      // at 60 Hz) apart.
      await boardFontsLoaded(page);
      await page.evaluate(() =>
        Promise.all(
          [...document.querySelectorAll(".board-gauge-row img")].map((img) =>
            img.decode().catch(() => undefined),
          ),
        ),
      );
      await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll(".board-gauge-row img")].every(
              (img) => img.complete && img.naturalWidth > 0,
            ) &&
            [
              ...document.querySelectorAll(
                ".board-gauge-row canvas.board-skin",
              ),
            ].every((canvas) => canvas.style.width !== "") &&
            (
              document
                .querySelector(".board-gauge")
                ?.getAttribute("aria-label") ?? ""
            ).startsWith("Output:"),
          { timeout: 5_000 },
        )
        .catch(() => undefined);
      await framesPainted(page, 2);
      const first = await page.screenshot({ clip, encoding: "base64" });
      await framesPainted(page, 36);
      const second = await page.screenshot({ clip, encoding: "base64" });
      check(
        clip !== undefined && first === second,
        `${label} under reduced motion the window and the needle hold still`,
      );
      // The page records each state "+N" shows in, as it changes, so a load
      // that lets the 0.7s hold run out before a read cannot fail the check.
      await page.evaluate(() => {
        const plus = document.querySelector(".board-dig-plus");
        globalThis.__plusSeen = [];
        if (plus === null) return;
        new MutationObserver(() => {
          globalThis.__plusSeen.push({
            shown: !plus.hidden && plus.getClientRects().length > 0,
            top: plus.style.top,
            text: plus.textContent,
          });
        }).observe(plus, {
          attributes: true,
          childList: true,
          characterData: true,
          subtree: true,
        });
      });
      await press(page, ".board-window");
      // Six frames: at least one 70ms rise step at 60 Hz.
      await framesPainted(page, 6);
      const seen = await page.evaluate(() =>
        globalThis.__plusSeen.filter((state) => state.shown),
      );
      check(
        seen.length > 0 &&
          seen.every((state) => state.top === seen[0].top && state.text !== ""),
        `${label} under reduced motion a tap shows +N without rising`,
      );
      if (
        seen.length === 0 ||
        seen.some((state) => state.top !== seen[0].top)
      ) {
        console.log("reduced plus", size, seen);
      }
      await close();
    }

    // The largest crews: the late save's 1,998 with 1,998 free, and a crew
    // past a hundred thousand. The plate's words stay on it.
    for (const [crewName, buildSave] of [
      ["late", () => lastStoneSave()],
      [
        "huge",
        () => ({
          ...openMountain(),
          mountain: { ...openMountain().mountain, helpers: 123_456, carts: 0 },
        }),
      ],
    ]) {
      const { page, close } = await openScreen(viewport, buildSave(), {
        stopClock: true,
      });
      await page.waitForSelector(".board-crew");
      const fonts = await boardFontsLoaded(page);
      const words = await crewPlateWords(page);
      check(
        fonts && words.ok,
        `${label} the ${crewName} crew's plate keeps its words on it (${words.runs
          .map((run) => run.text)
          .join(" ")})`,
      );
      if (!words.ok) {
        console.log("crew plate", size, crewName, JSON.stringify(words));
      }
      check(
        await noScroll(page),
        `${label} the ${crewName} crew does not scroll`,
      );
      await close();
    }
  });
}

table({
  screens: SCREENS,
  scenarios: GAUGE_SAVES,
  section: (viewport, scenario) =>
    `gauge row ${JSON.stringify(viewport)} ${scenario.name}`,
  prefix: ({ size, scenario }) => `${size} gauge row, ${scenario.name}:`,
  open: openGauge,
  expect: GAUGE_EXPECT,
  after: movingParts,
});
