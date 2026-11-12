/* global console, document */
/** Bays and Ready sections: the bays, the machine tiers and the Ready plate, per save and in three scenarios. */
import {
  crewMountain,
  openMountain,
  crystalMountain,
  heartMountain,
  fleetMountain,
  savingMountain,
} from "../../tools/browser/fixtures.ts";
import { undersizedTargets } from "../../src/ui-audit-measure.ts";
import { check, section, table } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  openScreen,
  noScroll,
  baysDrawn,
  railFoot,
  framesPainted,
  noteAway,
} from "./kit.mjs";
import {
  BAY_LEGENDS,
  boardTargets,
  boardGaps,
  boardTextSizes,
  boardArtAt2x,
  boardContrast,
  boardFontsLoaded,
} from "./measure.mjs";

// The machine bays and the Ready row (#372): the band tag and three bays
// under the gauge row, then the Ready now plate and the red DIG button, at
// the phone. In each band the tag reads the layer's
// words and the bays are C2's tiers; every bay's words, flaps and price stay
// in its button; the bars are the board's (48px targets 8px apart, 13px text,
// art at exactly 2x, 4.5:1 contrast at p10/p90); the page never scrolls and
// the key rail ends at least 8px above the save line. Then three scenarios:
// reduced motion holds the bays still, a mined-out mountain says so, and a
// loading save shows art and no save words. The bays' taps are in controls.mjs.
const BAYS_UI = "/src/board-bays.ts";
const EARLY_TIERS = ["cart", "drill", "borer"];
const MACHINE_TIERS = ["drill", "borer", "machine"];
/** The bays' saves and the tiers each shows; fleet also has 120 carts. */
const BAY_SAVES = [
  { name: "early", save: () => crewMountain(), tiers: EARLY_TIERS },
  { name: "mid", save: () => openMountain(), tiers: EARLY_TIERS },
  { name: "crystal", save: () => crystalMountain(), tiers: EARLY_TIERS },
  { name: "heart", save: () => heartMountain(), tiers: MACHINE_TIERS },
  {
    name: "fleet",
    save: () => fleetMountain(),
    tiers: EARLY_TIERS,
    flaps: true,
  },
  { name: "saving", save: () => savingMountain(), tiers: EARLY_TIERS },
];
const BAYS_AND_READY = ".board-bays, .board-ready-row";

/**
 * The band tag and each bay's parts. Words are measured by their glyph runs
 * across (a clipped name spills past its box) and by their line boxes down.
 */
async function baysLayout(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom };
    };
    const words = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const run = range.getBoundingClientRect();
      const line = el.getBoundingClientRect();
      return { l: run.left, t: line.top, r: run.right, b: line.bottom };
    };
    const round = (b) => [b.l, b.t, b.r, b.b].map(Math.round);
    const inside = (a, b) =>
      a.l >= b.l - 0.5 &&
      a.r <= b.r + 0.5 &&
      a.t >= b.t - 0.5 &&
      a.b <= b.b + 0.5;
    const overlap = (a, b) =>
      a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
    const root = document.querySelector(".board-bays");
    const band = document.querySelector(".board-band");
    const gauge = document.querySelector(".board-gauge-row");
    if (root === null || band === null || gauge === null) {
      return { ok: false, band: "", tiers: [], bays: [] };
    }
    const rootBox = box(root);
    const bandBox = box(band);
    const bandText = band.querySelector(".board-lg");
    const bandWordsBox = bandText === null ? undefined : words(bandText);
    // The tag rises onto the bays' top edge (420), clear of the gauge row.
    const bandOk =
      bandWordsBox !== undefined &&
      bandBox.l >= rootBox.l - 0.5 &&
      bandBox.r <= rootBox.r + 0.5 &&
      bandBox.t >= box(gauge).b - 0.5 &&
      bandBox.b <= rootBox.b + 0.5 &&
      inside(bandWordsBox, bandBox);
    const bays = [...root.querySelectorAll(".board-bay")].map((bay) => {
      const own = box(bay);
      const name = bay.querySelector(".board-bay-name");
      const sub = bay.querySelector(".board-bay-sub");
      const flap = bay.querySelector(".board-flap");
      const price = bay.querySelector(".board-bay-price");
      const legend = bay.querySelector(".board-bay-price-lg");
      const tag = bay.querySelector(".board-bay-tag");
      const tagText = bay.querySelector(".board-bay-tag-text");
      const parts = {
        name: words(name),
        sub: words(sub),
        flap: box(flap),
        price: box(price),
      };
      const names = Object.keys(parts);
      const overlaps = [];
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          if (overlap(parts[names[i]], parts[names[j]])) {
            overlaps.push(`${names[i]}/${names[j]}`);
          }
        }
      }
      const outside = names.filter((part) => !inside(parts[part], own));
      // The price's legend and figure stay in the price column.
      const priceWords = [legend, ...(tag.hidden ? [] : [tagText])].filter(
        (el) => (el.textContent ?? "") !== "",
      );
      const priceOut = priceWords
        .filter((el) => !inside(words(el), parts.price))
        .map((el) => el.textContent);
      return {
        tier: bay.dataset.tier ?? "",
        name: name.textContent ?? "",
        sub: sub.textContent ?? "",
        flaps: [...flap.querySelectorAll(".board-flap-d")].map(
          (digit) => digit.textContent ?? "",
        ),
        legend: legend.textContent ?? "",
        price: tag.hidden ? "" : (tagText.textContent ?? ""),
        ok:
          name.textContent !== "" &&
          sub.textContent !== "" &&
          overlaps.length === 0 &&
          outside.length === 0 &&
          priceOut.length === 0,
        overlaps,
        outside,
        priceOut,
        boxes: Object.fromEntries(
          [["bay", own], ...Object.entries(parts)].map(([key, b]) => [
            key,
            round(b),
          ]),
        ),
      };
    });
    return {
      ok: bandOk && bays.length === 3 && bays.every((bay) => bay.ok),
      bandOk,
      band: bandText?.textContent ?? "",
      bandBox: round(bandBox),
      tiers: bays.map((bay) => bay.tier),
      bays,
    };
  });
}

/** Opens the save with the clock held, and reads the bays' tag and layout. */
async function openBays(viewport, { save }) {
  const seed = save();
  const { page, close } = await openScreen(viewport, seed, {
    stopClock: true,
  });
  try {
    const drawn = await baysDrawn(page);
    const fonts = await boardFontsLoaded(page);
    // The tag reads the band's words, and the bays are C2's tiers.
    const expectedBand = await page.evaluate(
      async (ui, remaining) => (await import(ui)).bandWords({ remaining }),
      BAYS_UI,
      seed.mountain.remaining,
    );
    const layout = await baysLayout(page);
    return { page, close, drawn, fonts, expectedBand, layout };
  } catch (error) {
    await close();
    throw error;
  }
}

/** What the bays and the Ready row show on each save. */
const BAYS_EXPECT = [
  {
    run: ({ drawn, fonts }) => [
      [drawn && fonts, "the bays are drawn in the bundled faces"],
    ],
  },
  {
    run: ({ layout, expectedBand, size, scenario }) => {
      const { tiers } = scenario;
      if (
        !layout.ok ||
        layout.band !== expectedBand ||
        layout.tiers.join(",") !== tiers.join(",")
      ) {
        console.log("bays layout", size, scenario.name, JSON.stringify(layout));
      }
      return [
        [
          layout.band === expectedBand &&
            layout.tiers.join(",") === tiers.join(","),
          `the tag reads "${expectedBand}" over the ${tiers.join(", ")} bays`,
        ],
        [
          layout.ok,
          "each bay's name, sub-line, flaps and price lie inside it and apart, and the tag sits on the bays",
        ],
      ];
    },
  },
  {
    when: ({ scenario }) => scenario.flaps === true,
    run: ({ layout }) => {
      const cart = layout.bays.find((bay) => bay.tier === "cart");
      return [
        [
          cart?.flaps.join("") === "120" && cart.flaps.length === 3,
          "120 carts show on three flaps",
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario }) => {
      // Targets and gaps: the three bays, the plate and the red button. A
      // note may show over the Ready row; put it away first, so what it
      // covers is measured too.
      await noteAway(page);
      const targets = await boardTargets(page);
      const mine = targets.own.filter((target) =>
        /^\.board-(bay|ready|dig-button) /.test(target.selector),
      );
      const under = undersizedTargets(targets.own);
      const close8 = boardGaps(targets);
      if (mine.length !== 5 || under.length > 0 || close8.length > 0) {
        console.log(
          "bays targets",
          size,
          scenario.name,
          JSON.stringify({
            mine: mine.map((target) => [
              target.selector,
              Math.round(target.width * 10) / 10,
              Math.round(target.height * 10) / 10,
            ]),
            under: under.map((target) => target.selector),
            close: close8.map((pair) => [pair.a, pair.b, pair.gap]),
          }),
        );
      }
      return [
        [
          mine.length === 5 && under.length === 0 && close8.length === 0,
          "the bays, the plate and the red button are 48x48 board px, 8px from the next",
        ],
      ];
    },
  },
  {
    run: async ({ page, layout, size, scenario }) => {
      // Contrast at rest: the tag, the sub-lines, the price legends, the
      // plate and the red button's legend.
      const contrast = await boardContrast(page, BAY_LEGENDS.join(", "));
      const dim = contrast.filter((row) => row.pct < 4.5);
      const subs = layout.bays.map((bay) => bay.sub.trim().slice(0, 28));
      const legends = layout.bays.map((bay) => bay.legend);
      const read =
        contrast.length >= 14 &&
        [...subs, ...legends].every((words) =>
          contrast.some((row) => row.text === words),
        );
      if (!read || dim.length > 0) {
        console.log(
          "bays contrast",
          size,
          scenario.name,
          JSON.stringify(contrast),
        );
      }
      return [
        [
          read && dim.length === 0,
          `${String(contrast.length)} legends at 4.5:1 or more, sub-lines and price legends among them (lowest ${String(Math.min(...contrast.map((row) => row.pct)))}:1 at p10/p90)`,
        ],
      ];
    },
  },
  {
    run: async ({ page, size, scenario }) => {
      const text = await boardTextSizes(page, BAYS_AND_READY);
      if (text.small.length > 0) {
        console.log(
          "bays text",
          size,
          scenario.name,
          JSON.stringify(text.small),
        );
      }
      return [
        [
          text.small.length === 0 && text.count >= 14,
          `the bays' and the plate's text is 13px or more (${String(text.count)} runs)`,
        ],
      ];
    },
  },
  {
    // Art is measured at the phone, where the board is drawn at scale 1.
    when: ({ viewport }) => viewport === PHONE,
    run: async ({ page, size, scenario }) => {
      const art = await boardArtAt2x(page, BAYS_AND_READY, BAYS_AND_READY);
      if (art.misses.length > 0) {
        console.log("bays 2x", size, scenario.name, JSON.stringify(art.misses));
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
    run: async ({ page }) => {
      const noPageScroll = await noScroll(page);
      const foot = await railFoot(page);
      return [
        [noPageScroll, "no page scroll"],
        [
          foot.ok,
          `the rail ends at least 8px above the save line (${String(foot.gap)})`,
        ],
      ];
    },
  },
];

const registerReducedMotion = (viewport) => {
  section(
    `bays and ready ${JSON.stringify(viewport)} reduced motion`,
    async () => {
      const size = `${String(viewport[0])}x${String(viewport[1])}`;
      const label = `${size} bays and ready:`;
      // Reduced motion: two shots of the bays, painted frames covering four of
      // the drill's 0.18s steps apart, are the same. As a control, without it
      // the drill bay's icon steps.
      for (const reducedMotion of [false, true]) {
        const { page, close } = await openScreen(viewport, heartMountain(), {
          reducedMotion,
          stopClock: true,
        });
        await baysDrawn(page);
        const icon = '.board-bay[data-tier="drill"] .board-bay-icon';
        if (reducedMotion) {
          const clip = await page.$eval(".board-bays", (bays) => {
            const box = bays.getBoundingClientRect();
            return {
              x: Math.ceil(box.left),
              y: Math.ceil(box.top),
              width: Math.floor(box.width),
              height: Math.floor(box.height),
            };
          });
          // Still art first: the faces, the images and the skins are in.
          await boardFontsLoaded(page);
          await page.waitForFunction(
            () =>
              [...document.querySelectorAll(".board-bays img")].every(
                (img) => img.complete,
              ) &&
              [
                ...document.querySelectorAll(".board-bays canvas.board-skin"),
              ].every((canvas) => canvas.style.width !== ""),
            { timeout: 5_000 },
          );
          const first = await page.screenshot({ clip, encoding: "base64" });
          await framesPainted(page, 44);
          const later = await page.screenshot({ clip, encoding: "base64" });
          check(
            later === first,
            `${label} under reduced motion the bays hold still`,
          );
        } else {
          const from = await page.$eval(
            icon,
            (el) => el.style.backgroundPositionX,
          );
          const stepped = await page
            .waitForFunction(
              (selector, was) =>
                document.querySelector(selector)?.style.backgroundPositionX !==
                was,
              { timeout: 3_000 },
              icon,
              from,
            )
            .then(
              () => true,
              () => false,
            );
          check(
            stepped,
            `${label} without reduced motion the drill bay's icon steps`,
          );
        }
        await close();
      }
    },
  );
};

const registerMinedOut = (viewport) => {
  section(`bays and ready ${JSON.stringify(viewport)} mined out`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} bays and ready:`;
    // Mined out: the plate says so and buys nothing; the red button rests,
    // with no legend.
    {
      const start = openMountain();
      const { page, close } = await openScreen(
        viewport,
        { ...start, mountain: { ...start.mountain, remaining: 0 } },
        { stopClock: true },
      );
      await baysDrawn(page);
      const out = await page.evaluate(() => ({
        main: document.querySelector(".board-ready-main")?.textContent,
        kick: document.querySelector(".board-ready-kick")?.textContent,
        plate: document.querySelector(".board-ready")?.disabled,
        dig: document.querySelector(".board-dig-button")?.disabled,
        legend: (
          document.querySelector(".board-dig-lg")?.textContent ?? ""
        ).trim(),
        tiers: [...document.querySelectorAll(".board-bay")].map(
          (bay) => bay.dataset.tier,
        ),
      }));
      check(
        out.main === "The mountain is mined out" &&
          out.kick === "" &&
          out.plate === true &&
          out.dig === true &&
          out.legend === "" &&
          out.tiers.join(",") === MACHINE_TIERS.join(","),
        `${label} mined out, the plate says so, the red button rests without a legend, and the bays are drill, borer and machine`,
      );
      if (out.main !== "The mountain is mined out" || out.legend !== "") {
        console.log("mined out", size, out);
      }
      check(await noScroll(page), `${label} mined out does not scroll`);
      await close();
    }
  });
};

const registerLoading = (viewport) => {
  section(`bays and ready ${JSON.stringify(viewport)} loading`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} bays and ready:`;
    // While a save loads, the bays, the plate and the red button are their
    // frames and art alone: no words or numbers from a save not yet read.
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
      const seen = await page.evaluate(() => {
        const drawn = (selector) =>
          [...document.querySelectorAll(selector)].filter(
            (el) => el.getClientRects().length > 0,
          ).length;
        const words = [
          ".board-band .board-lg",
          ".board-bay-name",
          ".board-bay-sub",
          ".board-bay-price-lg",
          ".board-bay-tag-text",
          ".board-flap-d",
          ".board-ready-kick",
          ".board-ready-main",
          ".board-ready-why",
          ".board-dig-lg",
        ].flatMap((selector) =>
          [...document.querySelectorAll(selector)]
            .map((el) => (el.textContent ?? "").trim())
            .filter((text) => text !== ""),
        );
        return {
          words,
          disabled: [
            ...document.querySelectorAll(
              ".board-bay, .board-ready, .board-dig-button",
            ),
          ].every((button) => button.disabled),
          art: {
            icons: drawn(".board-bay-icon"),
            lamps: drawn(".board-bay .board-lamp"),
            plate: drawn(".board-ready-plate"),
            guard: drawn(".board-ready-guard"),
            dig: drawn(".board-dig-sprite"),
          },
          tiers: [...document.querySelectorAll(".board-bay")].map(
            (bay) => bay.dataset.tier,
          ),
        };
      });
      check(
        loading &&
          seen.words.length === 0 &&
          seen.disabled &&
          seen.art.icons === 3 &&
          seen.art.lamps === 3 &&
          seen.art.plate === 1 &&
          seen.art.guard === 1 &&
          seen.art.dig === 1 &&
          seen.tiers.join(",") === EARLY_TIERS.join(","),
        `${label} while the save loads the bays, the plate and the red button show their art and no save words`,
      );
      if (seen.words.length > 0 || !loading) {
        console.log("loading bays", size, { loading, ...seen });
      }
      await close();
    }
  });
};

table({
  screens: SCREENS,
  scenarios: BAY_SAVES,
  section: (viewport, scenario) =>
    `bays and ready ${JSON.stringify(viewport)} ${scenario.name}`,
  prefix: ({ size, scenario }) => `${size} bays and ready, ${scenario.name}:`,
  open: openBays,
  expect: BAYS_EXPECT,
  after: (viewport) => {
    registerReducedMotion(viewport);
    registerMinedOut(viewport);
    registerLoading(viewport);
  },
});
