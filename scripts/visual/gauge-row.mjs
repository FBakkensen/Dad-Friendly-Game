/* global console, document, localStorage, getComputedStyle, setTimeout, HTMLImageElement */
/** Gauge row sections: the gauge row and the vein, per save and band. */
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
import { check, section } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  press,
  openScreen,
  noScroll,
  MINE_WINDOW_RULES,
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
// with its vein and Legacy plate, and the crew plate, at the phone and the
// three PC sizes, in each band. The bars are the board's: no scroll, 48px
// targets 8px apart (the vein exempt from its gap to the window only), 13px
// text, art at exactly 2x, 4.5:1 contrast at p10/p90, and the crew plate's
// words on the plate. These pages keep the bundled faces (Barlow Condensed,
// Share Tech Mono): the plate is sized for them, and the check proves they
// loaded rather than measuring a fallback face.
const GAUGE_SAVES = [
  ["early", () => crewMountain(), "topsoil"],
  ["mid", () => openMountain(), "granite"],
  ["crystal", () => crystalMountain(), "crystal"],
  ["heart", () => heartMountain(), "heart"],
];
/** The vein's range: veinSpot at x 0.35/0.65 and y 0.4/0.8. */
const VEIN_CORNERS = [
  [0.35, 0.4],
  [0.65, 0.4],
  [0.35, 0.8],
  [0.65, 0.8],
];

/** Shows the vein at a corner of its range, as board-window.ts places it; undefined hides it. */
async function placeVein(page, corner) {
  await page.evaluate(
    async (at, rules) => {
      const vein = document.querySelector(".golden-vein");
      if (vein === null) {
        return;
      }
      if (at === undefined) {
        vein.hidden = true;
        return;
      }
      const { veinSpot } = await import(rules);
      const spot = veinSpot(at[0], at[1]);
      vein.style.left = `${String((7 + spot.left) * 2)}px`;
      vein.style.top = `${String((7 + spot.top) * 2)}px`;
      vein.hidden = false;
    },
    corner,
    MINE_WINDOW_RULES,
  );
}

/**
 * The board's targets with the vein placed at a corner of its range. The
 * screen's own second tick hides a vein that is not really glinting, and under
 * the full gate's load that tick can land between placing and measuring, so
 * place and measure again until the vein is in the measurement.
 */
async function targetsWithVein(page, corner) {
  let set = { own: [] };
  for (let tries = 0; tries < 5; tries += 1) {
    await placeVein(page, corner);
    set = await boardTargets(page);
    if (set.own.some((target) => target.selector.startsWith(".golden-vein "))) {
      return set;
    }
  }
  return set;
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

for (const viewport of SCREENS) {
  for (const [name, save, band] of GAUGE_SAVES) {
    section(`gauge row ${JSON.stringify(viewport)} ${name}`, async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      const label = `${size} gauge row, ${name}:`;
      const { page, close } = await openScreen(viewport, save());
      await page.waitForSelector(".board-mine[data-band]");
      const fonts = await boardFontsLoaded(page);
      check(fonts, `${label} the bundled faces are loaded`);
      check(await noScroll(page), `${label} no page scroll`);

      // The band's view behind the glass, and what the save owns in it.
      const scene = await page.evaluate(async () => {
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
          badge: document.querySelector(".board-legacy .legacy-badge")
            ?.textContent,
        };
      });
      check(
        scene.band === band &&
          scene.art.includes(`mine-view-${band}`) &&
          scene.artWidth === 92,
        `${label} the window shows the ${band} view`,
      );
      const heart = name === "heart";
      check(
        heart
          ? scene.machine &&
              scene.kid &&
              scene.plate &&
              (scene.badge ?? "").startsWith("Legacy ×")
          : !scene.machine && !scene.kid && !scene.plate,
        heart
          ? `${label} the Great Machine, the kid and the Legacy plate show`
          : `${label} no Great Machine, kid or Legacy plate before they are earned`,
      );
      if (scene.band !== band || (heart && !scene.plate)) {
        console.log("gauge row scene", size, name, JSON.stringify(scene));
      }

      // Targets at rest, then with the vein at each end of its range.
      const sets = [await boardTargets(page)];
      for (const corner of VEIN_CORNERS) {
        sets.push(await targetsWithVein(page, corner));
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
      check(
        own.some((target) => target.selector.startsWith(".board-window ")) &&
          veins === VEIN_CORNERS.length &&
          under.length === 0 &&
          close8.length === 0,
        `${label} the window and the vein are 48x48 board px, 8px from the next`,
      );
      if (under.length > 0 || close8.length > 0) {
        console.log(
          "gauge row targets",
          size,
          name,
          JSON.stringify({
            under: under.map((target) => target.selector),
            close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
          }),
        );
      }

      // Contrast first, before a tap puts "+N" over the view.
      const contrast = await boardContrast(page);
      const dim = contrast.filter((row) => row.pct < 4.5);
      const want = [
        "Stones a sec",
        "Crew",
        "free",
        "No. 2 Shaft",
        ...(heart ? ["Legacy ×"] : []),
      ];
      const read = want.every((words) =>
        contrast.some((row) => row.text.includes(words)),
      );
      check(
        read && dim.length === 0,
        `${label} ${String(contrast.length)} legends at 4.5:1 or more (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
      );
      if (!read || dim.length > 0) {
        console.log("gauge row contrast", size, name, JSON.stringify(contrast));
      }

      // The New sign (#373): in the band between the plate's words and the
      // key rail, clear of the DIG legend, and a tap at its middle goes through.
      const sign = await page.evaluate(() => {
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
      if (name === "mid" || sign.shown) {
        check(
          sign.shown &&
            sign.clearOfWords &&
            sign.clearOfLegend &&
            sign.aboveRail &&
            sign.passes &&
            sign.size >= 14,
          `${label} the New sign stands between the plate's words and the rail, clear of the DIG legend, at 14px, and taps go through it`,
        );
        if (
          !sign.shown ||
          !sign.clearOfWords ||
          !sign.clearOfLegend ||
          !sign.aboveRail ||
          !sign.passes ||
          sign.size < 14
        ) {
          console.log("new sign", size, name, JSON.stringify(sign));
        }
      }

      // A dig shows "+N"; its text joins the 13px count.
      await press(page, ".board-window");
      const text = await boardTextSizes(page);
      check(
        text.small.length === 0 && text.count >= 20,
        `${label} board text is 13px or more (${String(text.count)} runs)`,
      );
      if (text.small.length > 0) {
        console.log("gauge row text", size, name, JSON.stringify(text.small));
      }

      // Art is measured at the phone, where the board is drawn at scale 1.
      if (PHONE === viewport) {
        await placeVein(page, VEIN_CORNERS[0]);
        const art = await boardArtAt2x(page);
        await placeVein(page, undefined);
        check(
          art.misses.length === 0 && art.count >= 20,
          `${label} ${String(art.count)} images, sprites and skins at exactly 2x`,
        );
        if (art.misses.length > 0) {
          console.log("gauge row 2x", size, name, JSON.stringify(art.misses));
        }
      }

      const words = await crewPlateWords(page);
      check(
        fonts && words.ok,
        `${label} the crew plate's words stay on the plate`,
      );
      if (!words.ok) {
        console.log("crew plate", size, name, JSON.stringify(words));
      }
      await close();
    });
  }

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
      // let the board's loop step a few frames over the empty window
      await new Promise((resolve) => setTimeout(resolve, 300));
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
      const { page, close } = await openScreen(viewport, heartMountain(), {
        reducedMotion: true,
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
      // Let the first frames land, then compare two shots 600ms apart.
      await new Promise((resolve) => setTimeout(resolve, 300));
      const first = await page.screenshot({ clip, encoding: "base64" });
      await new Promise((resolve) => setTimeout(resolve, 600));
      const second = await page.screenshot({ clip, encoding: "base64" });
      check(
        clip !== undefined && first === second,
        `${label} under reduced motion the window and the needle hold still`,
      );
      await press(page, ".board-window");
      const plusAt = () =>
        page.$eval(".board-dig-plus", (plus) => ({
          shown: !plus.hidden && plus.getClientRects().length > 0,
          top: plus.style.top,
          text: plus.textContent,
        }));
      const up = await plusAt();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const later = await plusAt();
      check(
        up.shown && later.shown && up.top === later.top && up.text !== "",
        `${label} under reduced motion a tap shows +N without rising`,
      );
      if (!up.shown || up.top !== later.top) {
        console.log("reduced plus", size, up, later);
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
