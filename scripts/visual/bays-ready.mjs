/* global console, document, localStorage */
/** Bays and Ready sections: the bays, the machine tiers and the Ready plate, per save, and their taps. */
import {
  crewMountain,
  openMountain,
  crystalMountain,
  heartMountain,
  fleetMountain,
  savingMountain,
  SAVE_KEY,
} from "../../tools/browser/fixtures.ts";
import { undersizedTargets } from "../../src/ui-audit-measure.ts";
import { check, section, table } from "./registry.mjs";
import {
  PHONE,
  SCREENS,
  press,
  OPEN_SHEET,
  openScreen,
  noScroll,
  baysDrawn,
  railFoot,
  storedMountain,
  holdThrough,
  framesPainted,
  noteAway,
  buysOpen,
  odometer,
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
// the phone and the three PC sizes. In each band the tag reads the layer's
// words and the bays are C2's tiers; every bay's words, flaps and price stay
// in its button; the bars are the board's (48px targets 8px apart, 13px text,
// art at exactly 2x, 4.5:1 contrast at p10/p90); the page never scrolls and
// the key rail ends at least 8px above the save line. Then each control wired
// once: a tap on Ready now buys exactly one, Saving for and an open bay open
// Buys, a troubled bay fixes with five taps or a hold, and the red button digs
// exactly the tap's yield.
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
/** One lamp frame is 20 art px: red, the fourth frame, sits at -120 CSS px. */
const LAMP_RED_X = "-120px";

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

/** The words a bay, the plate or the red button shows, by selector. */
async function textOf(page, selector) {
  return page
    .$eval(selector, (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .catch(() => undefined);
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

const registerTaps = (viewport) => {
  section(`bays and ready ${JSON.stringify(viewport)} taps`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} bays and ready:`;
    const cartFlaps = (page) =>
      page.$eval('.board-bay[data-tier="cart"]', (bay) =>
        Number(
          [...bay.querySelectorAll(".board-flap-d")]
            .map((digit) => digit.textContent ?? "")
            .join(""),
        ),
      );

    // The tap rules (a double tap on the plate, a bay or Saving for, the Done
    // hold, a tap inside a drawer's settle) are unit tests on the board's model
    // and the mounted screen. Here each family of controls is wired once, in
    // Chrome, with the board's tap clock held so no press is early by load.

    // Ready now: a tap buys exactly one cart for one price and paints Done.
    {
      const { page, close } = await openScreen(viewport, crewMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      await noteAway(page);
      const kickBefore = await textOf(page, ".board-ready-kick");
      const mainBefore = (await textOf(page, ".board-ready-main")) ?? "";
      // "Buy a cart · 5,868": the price the plate offers, in whole stones.
      const price = Number(
        (mainBefore.split(" · ")[1] ?? "").replaceAll(",", ""),
      );
      const flapsBefore = await cartFlaps(page);
      const storedBefore = await storedMountain(page);
      await press(page, ".board-ready");
      const done = await page
        .waitForFunction(
          () =>
            (
              document.querySelector(".board-ready-kick")?.textContent ?? ""
            ).trim() === "Done",
          { timeout: 2_000 },
        )
        .then(
          () => true,
          () => false,
        );
      await page
        .waitForFunction(
          (key, carts) =>
            JSON.parse(localStorage.getItem(key) ?? "{}").mountain?.carts ===
            carts,
          { timeout: 2_000 },
          SAVE_KEY,
          storedBefore.carts + 1,
        )
        .catch(() => undefined);
      const flapsAfter = await cartFlaps(page);
      const storedAfter = await storedMountain(page);
      const spent = storedBefore.pocket - storedAfter.pocket;
      check(
        kickBefore === "Ready now" &&
          flapsAfter - flapsBefore === 1 &&
          storedAfter.carts - storedBefore.carts === 1 &&
          Number.isFinite(price) &&
          price > 0 &&
          spent === price &&
          done,
        `${label} a tap on Ready now buys exactly one cart for one price (${String(spent)} of ${String(price)}) and shows Done`,
      );
      if (flapsAfter - flapsBefore !== 1 || !done || spent !== price) {
        console.log("plate tap", size, {
          kickBefore,
          mainBefore,
          flapsBefore,
          flapsAfter,
          storedBefore,
          storedAfter,
          done,
        });
      }
      await close();
    }

    // Saving for: the time shows, and a tap opens Buys and spends nothing.
    {
      const { page, close } = await openScreen(viewport, savingMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      await noteAway(page);
      const main = await textOf(page, ".board-ready-main");
      const odoBefore = await odometer(page);
      const storedBefore = await storedMountain(page);
      await press(page, ".board-ready");
      const opened = await page
        .waitForSelector(OPEN_SHEET("buys"), { timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      const odoAfter = await odometer(page);
      const storedAfter = await storedMountain(page);
      check(
        (main ?? "").startsWith("Saving for a cart · in ") &&
          opened &&
          odoAfter === odoBefore &&
          storedAfter.pocket === storedBefore.pocket &&
          storedAfter.helpers === storedBefore.helpers,
        `${label} Saving for reads "${String(main)}", and a tap opens Buys with the pocket and odometer unchanged`,
      );
      await close();
    }

    // An open bay: a tap opens Buys and spends nothing.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      await noteAway(page);
      const storedBefore = await storedMountain(page);
      await press(page, '.board-bay[data-tier="cart"]');
      const opened = await page
        .waitForSelector(OPEN_SHEET("buys"), { timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      const storedAfter = await storedMountain(page);
      const kept = ["pocket", "carts", "drills", "borers", "helpers"].every(
        (field) => storedAfter[field] === storedBefore[field],
      );
      check(
        opened && kept,
        `${label} a tap on an open bay opens Buys and spends nothing`,
      );
      if (!opened || !kept) {
        console.log(
          "bay tap",
          size,
          JSON.stringify({ opened, storedBefore, storedAfter }),
        );
      }
      await close();
    }

    // Trouble on the cart bay: a red lamp and Hold to fix. Five taps fix it
    // with Buys shut, and the thanks note lets taps through to the bay
    // under it. On a fresh page a hold fixes it too.
    {
      const troubled = '.board-bay[data-tier="cart"][data-trouble="cave-in"]';
      const { page, close } = await openScreen(viewport, openMountain(), {
        search: "?trouble=cave-in",
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      const shown = await page
        .waitForSelector(troubled, { timeout: 3_000 })
        .then(
          () => true,
          () => false,
        );
      const lamp = await page
        .$eval(`${troubled} .board-lamp`, (el) => el.style.backgroundPositionX)
        .catch(() => "");
      const sub = await textOf(page, `${troubled} .board-bay-sub`);
      check(
        shown && lamp === LAMP_RED_X && (sub ?? "").endsWith("Hold to fix"),
        `${label} the troubled cart bay shows its red lamp and Hold to fix`,
      );
      for (let tap = 0; tap < 5; tap += 1) {
        await press(page, '.board-bay[data-tier="cart"]');
      }
      const fixed = await page
        .waitForFunction(
          () =>
            document
              .querySelector('.board-bay[data-tier="cart"]')
              ?.hasAttribute("data-trouble") === false,
          { timeout: 2_000 },
        )
        .then(
          () => true,
          () => false,
        );
      await framesPainted(page, 2);
      const shut = !(await buysOpen(page));
      check(
        fixed && shut,
        `${label} five taps fix the troubled bay with Buys shut`,
      );
      // The thanks note is up; the bays under it are still what a finger meets.
      const thanks = await page.evaluate(() => {
        const note = document.querySelector(".board-note.on");
        const thanked = note?.querySelector(".board-thanks") !== null;
        const reach = [...document.querySelectorAll(".board-bay")].map(
          (bay) => {
            const b = bay.getBoundingClientRect();
            const hit = document.elementFromPoint(
              (b.left + b.right) / 2,
              (b.top + b.bottom) / 2,
            );
            return hit !== null && bay.contains(hit);
          },
        );
        return { thanked: note !== null && thanked, reach };
      });
      const underThanks = await boardTargets(page);
      const baysMeasured = underThanks.own.filter((target) =>
        target.selector.startsWith(".board-bay "),
      ).length;
      check(
        thanks.thanked && thanks.reach.every(Boolean) && baysMeasured === 3,
        `${label} under the thanks note every bay is still in reach and measured`,
      );
      if (!thanks.thanked || baysMeasured !== 3) {
        console.log("thanks note", size, { ...thanks, baysMeasured });
      }
      await close();
    }
    {
      const bay = '.board-bay[data-tier="cart"]';
      const { page, close } = await openScreen(viewport, openMountain(), {
        search: "?trouble=cave-in",
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      await page
        .waitForSelector(`${bay}[data-trouble]`, { timeout: 3_000 })
        .catch(() => undefined);
      const cleared = await holdThrough(
        page,
        bay,
        (selector) =>
          document.querySelector(selector)?.hasAttribute("data-trouble") ===
          false,
      );
      await framesPainted(page, 2);
      check(
        cleared && !(await buysOpen(page)),
        `${label} a hold fixes the troubled bay with Buys shut`,
      );
      await close();
    }

    // The red button digs exactly the tap's yield, and the window shows it.
    {
      const start = heartMountain();
      const { page, close } = await openScreen(
        viewport,
        { ...start, mountain: { ...start.mountain, pocket: 0 } },
        { stopClock: true },
      );
      await page.waitForSelector(".board-dig-button:not(:disabled)");
      const before = (await storedMountain(page)).pocket;
      const yieldWords = await page.$eval(
        ".board-dig-button",
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
      await press(page, ".board-dig-button");
      const after = (await storedMountain(page)).pocket;
      const shown = await page.evaluate(() => ({
        odo: document.querySelector(".board-odo")?.getAttribute("aria-label"),
        legend: (document.querySelector(".board-dig-lg")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        plus: document.querySelector(".board-dig-plus")?.textContent,
      }));
      const plus = `+${match?.[2] ?? "1"}`;
      check(
        Number.isFinite(each) &&
          after - before === each &&
          shown.odo === `Stones ${Math.floor(after).toLocaleString("en-US")}` &&
          shown.legend === `By hand · ${plus}` &&
          shown.plus === plus,
        `${label} the red button digs the tap's ${String(each)}, reads By hand · ${plus}, and the window shows ${plus}`,
      );
      if (after - before !== each || shown.plus !== plus) {
        console.log("red button", size, { yieldWords, before, after, shown });
      }
      await close();
    }
  });
};

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
    registerTaps(viewport);
    registerReducedMotion(viewport);
    registerMinedOut(viewport);
    registerLoading(viewport);
  },
});
