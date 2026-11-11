/* global console, document, innerHeight */
/** Card sections: the one-time cards (crew grew, welcome-back, the heir, trouble), found tools, and the relics drawer's shelf, detail, reveal and Legend (#465). */
import {
  staffingNoteSave,
  welcomeBackSave,
  foundBelowSave,
  fullShelfSave,
  mantleSave,
  lastStoneSave,
  crewV4Save,
  toolHomeSave,
} from "../../tools/browser/fixtures.ts";
import { check, section, table } from "./registry.mjs";
import {
  PHONE,
  OPEN_SHEET,
  openSheet,
  closeSheet,
  openShelf,
  RELIC_PAGE,
  pressPage,
  sheetSettled,
  STANDALONE_INSETS,
  openScreen,
  coversBoard,
  PAST_SETTLE_MS,
  noScroll,
  cardRisen,
} from "./kit.mjs";
import { stepTapClock } from "../../tools/browser/harness.ts";

/**
 * The relics drawer is open on `name`'s page, and everything on it sits inside the drawer,
 * above the save line and the bottom inset, with every button at least 44px tall.
 */
async function relicPageFits(page, name, { bottom = 0 } = {}) {
  const shown = await page
    .waitForSelector(RELIC_PAGE(name), { visible: true, timeout: 3_000 })
    .then(
      () => true,
      () => false,
    );
  const settled = shown && (await sheetSettled(page, "relics"));
  if (!settled) {
    console.log(`relics drawer: the ${name} page did not open`);
    return false;
  }
  const result = await page.$eval(
    RELIC_PAGE(name),
    (pageEl, inset) => {
      const sheet = pageEl.closest(".board-sheet")?.getBoundingClientRect();
      const line = document
        .querySelector(".board-saveline")
        ?.getBoundingClientRect();
      if (sheet === undefined || line === undefined) {
        return { ok: false, detail: "no drawer or save line" };
      }
      const floor = Math.min(sheet.bottom, line.top, innerHeight - inset);
      const parts = [...pageEl.querySelectorAll("*")].filter(
        (el) => el.closest("[hidden]") === null && el.getClientRects().length,
      );
      const outside = parts
        .filter((el) => el.closest(".relic-keepsake-list") === null)
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.width > 0 &&
            (b.top < sheet.top - 0.5 ||
              b.bottom > floor + 0.5 ||
              b.left < sheet.left - 0.5 ||
              b.right > sheet.right + 0.5)
          );
        })
        .map((el) => el.className);
      const buttons = [...pageEl.querySelectorAll("button")].map(
        (button) => button.getBoundingClientRect().height,
      );
      return {
        ok: outside.length === 0 && buttons.every((h) => h >= 44),
        detail: JSON.stringify({ outside, buttons }),
      };
    },
    bottom,
  );
  if (!result.ok) {
    console.log(`relics drawer ${name} page`, result.detail);
  }
  return result.ok;
}

/** The phone's cards, in the browser and as the installed PWA with its insets. */
const STANDALONE = [{ standalone: false }, { standalone: true }];
const standaloneLabel = ({ size, scenario }) =>
  `${size}${scenario.standalone ? " standalone" : ""}`;
const insetsOf = ({ standalone }) =>
  standalone ? STANDALONE_INSETS : { top: 0, bottom: 0 };

// A save from before staffing: the one-time "Your crew grew" card, at the
// smallest phone, over the game and dismissable, with no scroll.
table({
  screens: [PHONE],
  scenarios: STANDALONE,
  section: (_viewport, { standalone }) =>
    `section 4 (line 816) ${JSON.stringify(standalone)}`,
  prefix: standaloneLabel,
  open: (viewport, { standalone }) =>
    openScreen(viewport, staffingNoteSave(), { standalone, tapClock: "held" }),
  expect: [
    {
      run: async ({ page }) => {
        const crewText = await page.$eval(
          ".welcome-crew",
          (el) => el.textContent,
        );
        const engineerText = await page.$eval(
          ".welcome-engineer",
          (el) => el.textContent,
        );
        return [
          [
            crewText?.endsWith("joined to run your machines.") === true,
            "crew-grew note shows for an old save",
          ],
          [
            engineerText === "Your best worker steps up as engineer.",
            "engineer note shows for an old save that owns a borer",
          ],
          [
            await coversBoard(page, ".welcome-back"),
            "crew-grew card is laid over the game",
          ],
          [await noScroll(page), "crew-grew card has no scroll"],
        ];
      },
    },
    {
      run: async ({ page }) => {
        await stepTapClock(page, PAST_SETTLE_MS);
        await page.tap(".welcome-continue");
        return [
          [
            await page.$eval(".welcome-back", (el) => el.hidden),
            "crew-grew card closes",
          ],
        ];
      },
    },
  ],
});

// Welcome-back, then the relic it uncovered.
section("section 5 (line 856)", async () => {
  {
    const viewport = PHONE;
    const { page, close } = await openScreen(viewport, welcomeBackSave(), {
      tapClock: "held",
    });
    check(
      await coversBoard(page, ".welcome-back"),
      "welcome-back is laid over the game",
    );
    await stepTapClock(page, PAST_SETTLE_MS);
    await page.tap(".welcome-continue");
    check(
      await relicPageFits(page, "reveal"),
      "the relic's reveal opens the relics drawer, and fits it",
    );
    await close();
  }
});

// Found tools on the Upgrades sheet, and keepsakes on a relic's detail (#148).
async function foundSheetsFit(page, { top = 0, bottom = 0 } = {}) {
  await openSheet(page, "upgrades");
  const tools = await page.$eval(
    OPEN_SHEET("upgrades"),
    (sheet, insets) => {
      const rows = [...sheet.querySelectorAll(".found-tool")].filter(
        (row) => row.closest("[hidden]") === null,
      );
      const text = rows.map((row) => row.textContent ?? "").join(" ");
      const list = sheet.querySelector(".board-sheet-list");
      if (list !== null) {
        list.scrollTop = 0;
      }
      const titleTop =
        sheet.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      if (list !== null) {
        list.scrollTop = list.scrollHeight;
      }
      const close = sheet
        .querySelector(".board-sheet-back")
        ?.getBoundingClientRect();
      if (list !== null) {
        list.scrollTop = 0;
      }
      return {
        count: rows.length,
        found: text.includes("Found") && text.includes("Grandfather's pick"),
        clean: !text.includes("?") && !/\d/.test(text),
        titleOk: titleTop >= insets.top,
        closeOk:
          close !== undefined &&
          close.height >= 44 &&
          close.bottom <= innerHeight - insets.bottom,
      };
    },
    { top, bottom },
  );
  const toolsStill = await noScroll(page);
  await closeSheet(page, "upgrades");
  await openShelf(page);
  await sheetSettled(page, "relics");
  await page.$$eval(`${OPEN_SHEET("relics")} .relic-row`, (rows) => {
    rows[2]?.click();
  });
  const fits = await relicPageFits(page, "detail", { bottom });
  const detail = await page.$eval(RELIC_PAGE("detail"), (card) => {
    const list = card.querySelector(".relic-keepsake-list");
    const stories = [...card.querySelectorAll(".relic-keepsake-story")].filter(
      (row) => row.closest("li")?.hidden !== true,
    );
    const text = stories.map((row) => row.textContent ?? "").join(" ");
    const icons = [...card.querySelectorAll(".relic-keepsake-art")].filter(
      (img) => img.closest("li")?.hidden !== true,
    );
    return {
      // Five stories fit without the list scrolling inside its well.
      whole: list !== null && list.scrollHeight <= list.clientHeight + 1,
      stories: stories.length,
      icons: icons.every((img) => img.complete && img.naturalWidth === 16),
      clean: text.length > 0 && !text.includes("?") && !/\d/.test(text),
    };
  });
  if (!detail.whole) {
    console.log("keepsakes: the five stories scroll inside their well");
  }
  const detailStill = await noScroll(page);
  const ok =
    tools.count === 4 &&
    tools.found &&
    tools.clean &&
    tools.titleOk &&
    tools.closeOk &&
    toolsStill &&
    fits &&
    detail.whole &&
    detail.stories === 5 &&
    detail.icons &&
    detail.clean &&
    detailStill;
  return ok;
}

table({
  screens: [PHONE],
  scenarios: STANDALONE,
  section: (_viewport, { standalone }) =>
    `section 6 (line 977) ${JSON.stringify(standalone)}`,
  prefix: standaloneLabel,
  open: (viewport, { standalone }) =>
    openScreen(viewport, foundBelowSave(), { standalone }),
  expect: [
    {
      run: async ({ page, scenario }) => [
        [
          await foundSheetsFit(page, insetsOf(scenario)),
          "found tools and keepsakes fit",
        ],
      ],
    },
  ],
});

// Every relic found: the shelf scrolls inside itself, and a tapped relic's
// detail page (art, virtue, "Your power") fits the relics drawer (#465).
table({
  screens: [PHONE],
  scenarios: [{}],
  section: (viewport) => `section 7 (line 997) ${JSON.stringify(viewport)}`,
  prefix: ({ size }) => size,
  open: async (viewport) => {
    const opened = await openScreen(viewport, fullShelfSave());
    await openShelf(opened.page);
    await sheetSettled(opened.page, "relics");
    return opened;
  },
  expect: [
    {
      run: async ({ page }) => [
        [await noScroll(page), "full shelf has no page scroll"],
      ],
    },
    {
      run: async ({ page }) => {
        await page.$$eval(`${OPEN_SHEET("relics")} .relic-row`, (rows) => {
          rows[4]?.click();
        });
        const fits = await relicPageFits(page, "detail");
        const still = await noScroll(page);
        return [
          [fits, "relic detail fits the relics drawer"],
          [still, "relic detail has no scroll"],
        ];
      },
    },
    {
      run: async ({ page }) => {
        await pressPage(page, "detail", "shelf");
        const back = await page.$eval(
          OPEN_SHEET("relics"),
          (sheet) =>
            sheet.querySelector(".relic-detail-page") === null &&
            sheet.querySelector(".board-sheet-list")?.hidden === false,
        );
        return [[back, "relic detail goes back to the shelf"]];
      },
    },
  ],
});

// Mantle of the Hero: reveal, then the Legend finale over the game (#103).
// Version 5: one stone left on the 240M mountain, so the tap finds the Mantle.
for (const viewport of [[424, 924]]) {
  section(`section 8 (line 1045) ${JSON.stringify(viewport)}`, async () => {
    const label = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await openScreen(viewport, mantleSave());
    await page.tap(".board-window");
    check(
      await relicPageFits(page, "reveal"),
      `${label} the Mantle's reveal fits the relics drawer`,
    );
    await pressPage(page, "reveal", "carry");
    check(
      await relicPageFits(page, "legend"),
      `${label} Legend finale fits the relics drawer`,
    );
    check(await noScroll(page), `${label} Legend finale has no scroll`);
    await pressPage(page, "legend", "stand");
    check(
      await page
        .waitForSelector(`.board-sheet[data-sheet="relics"]:not(.is-open)`, {
          timeout: 2_000,
        })
        .then(
          () => true,
          () => false,
        ),
      `${label} Legend finale closes`,
    );
    await close();
  });
}

// Pass the mine to your kid (#131): the confirm, then the new run's header.
for (const viewport of [[424, 924]]) {
  section(`section 9 (line 1087) ${JSON.stringify(viewport)}`, async () => {
    const label = `${String(viewport[0])}x${String(viewport[1])}`;
    const { page, close } = await openScreen(viewport, lastStoneSave());
    await page.tap(".board-window");
    await page.waitForSelector(RELIC_PAGE("reveal"), { visible: true });
    await pressPage(page, "reveal", "carry");
    await page.waitForSelector(RELIC_PAGE("legend"), { visible: true });
    await pressPage(page, "legend", "pass");
    check(
      await coversBoard(page, ".legacy-dialog"),
      `${label} pass-the-mine confirm is laid over the game`,
    );
    check(await noScroll(page), `${label} pass-the-mine confirm has no scroll`);
    // The card is a board card (#466): its face, risen, inside the screen.
    await cardRisen(page, "legacy");
    const fits = await page.$eval(".legacy-dialog .board-card-face", (card) => {
      const box = card.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    });
    check(fits, `${label} pass-the-mine card fits the screen`);
    // A keyboard press is never early: the card's settle does not keep it.
    await page.$eval(".legacy-confirm", (button) => {
      button.click();
    });
    check(
      await page.$eval(".legacy-dialog", (el) => el.hidden),
      `${label} pass-the-mine confirm closes`,
    );
    check(
      await page.$eval(
        ".legacy-badge",
        (el) => !el.hidden && el.textContent === "Legacy ×2",
      ),
      `${label} Legacy badge shows ×2`,
    );
    // Let the window tap's "+N" finish rising first.
    await page
      .waitForFunction(
        () => document.querySelector(".board-dig-plus")?.hidden !== false,
        { timeout: 2_000 },
      )
      .catch(() => {
        console.log("pass the mine: the tap's +N still shows after 2 s");
      });
    check(await noScroll(page), `${label} new run has no scroll`);
    // The badge's words sit on the Legacy plate, inside the window and
    // above the crew plate (#371).
    const badgeFits = await page.$eval(".legacy-badge", (badge) => {
      const box = badge.getBoundingClientRect();
      const mine = document.querySelector(".board-mine");
      const crew = document.querySelector(".board-crew");
      if (mine === null || crew === null) {
        return { ok: false };
      }
      const inside = mine.getBoundingClientRect();
      const below = crew.getBoundingClientRect();
      return {
        ok:
          box.width > 0 &&
          badge.closest(".board-legacy") !== null &&
          box.left >= inside.left &&
          box.right <= inside.right &&
          box.top >= inside.top &&
          box.bottom <= inside.bottom &&
          box.bottom <= below.top,
        badge: [box.left, box.top, box.right, box.bottom].map(Math.round),
        mine: [inside.left, inside.top, inside.right, inside.bottom].map(
          Math.round,
        ),
        crewTop: Math.round(below.top),
      };
    });
    check(
      badgeFits.ok,
      `${label} Legacy badge sits inside the window, above the crew plate`,
    );
    if (!badgeFits.ok) {
      console.log("legacy badge", label, JSON.stringify(badgeFits));
    }
    await close();
  });
}

// Trouble is never saved, so the dev boot previews a cave-in. The card must
// stay on screen at the smallest phone, including the installed PWA.
/** The cart row in Buys, with the trouble the dev boot previews. */
async function troubleCard(page, bottomInset) {
  await openSheet(page, "buys");
  const card = await page
    .$eval('.tier[data-tier="cart"]', (el) => {
      const box = el.getBoundingClientRect();
      return {
        kind: el.dataset.trouble ?? "",
        rate: el.querySelector(".board-row-info")?.textContent ?? "",
        label: el.getAttribute("aria-label") ?? "",
        height: box.height,
        width: box.width,
      };
    })
    .catch(() => undefined);
  const fits = await page.evaluate((inset) => {
    const el = document.querySelector('.tier[data-tier="cart"]');
    if (el === null) {
      return false;
    }
    const box = el.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight - inset;
  }, bottomInset);
  return { card, fits };
}

table({
  screens: [PHONE],
  scenarios: STANDALONE,
  section: (_viewport, { standalone }) =>
    `section 10 (line 1138) ${JSON.stringify(standalone)}`,
  prefix: standaloneLabel,
  open: (viewport, { standalone }) =>
    openScreen(viewport, crewV4Save(), {
      standalone,
      search: "?trouble=cave-in",
    }),
  expect: [
    {
      run: async ({ page, scenario }) => {
        const { card, fits } = await troubleCard(
          page,
          insetsOf(scenario).bottom,
        );
        return [
          [card?.kind === "cave-in", "trouble card is a cave-in"],
          // The shout leads the row's info line: "Cave-in! · Hold to fix" (#373).
          [
            card?.rate.split(" · ")[0] === "Cave-in!",
            "trouble card says Cave-in!",
          ],
          [
            card !== undefined &&
              !/\d|\?/.test(card.label) &&
              card.label.includes("Cave-in"),
            "trouble card label has no numbers",
          ],
          [
            (card?.height ?? 0) >= 44 && (card?.width ?? 0) >= 44,
            "trouble card is a fat target",
          ],
          [fits, "trouble card sits on screen"],
          [await noScroll(page), "trouble card has no scroll"],
        ];
      },
    },
  ],
});

// Welcome card naming a find, over the game, at the short phone and the PWA.
/** The welcome card's words and where its title and Continue sit. */
async function welcomeCard(page, bottomInset) {
  return page.$eval(
    ".welcome-back",
    (dialog, inset) => {
      const line = dialog.querySelector(".welcome-return")?.textContent ?? "";
      const closeBox = dialog
        .querySelector(".welcome-continue")
        ?.getBoundingClientRect();
      const title =
        dialog.querySelector("h2")?.getBoundingClientRect().top ?? -1;
      return {
        hidden: dialog.hidden,
        line,
        title: dialog.querySelector("h2")?.textContent ?? "",
        titleOk: title >= 0,
        closeOk:
          closeBox !== undefined &&
          closeBox.height >= 48 &&
          closeBox.top >= 0 &&
          closeBox.bottom <= innerHeight - inset,
      };
    },
    bottomInset,
  );
}

table({
  screens: [PHONE],
  scenarios: STANDALONE,
  section: (_viewport, { standalone }) =>
    `section 13 (line 1430) ${JSON.stringify(standalone)}`,
  prefix: standaloneLabel,
  open: (viewport, { standalone }) =>
    openScreen(viewport, toolHomeSave(Date.now()), {
      standalone,
      tapClock: "held",
    }),
  expect: [
    {
      run: async ({ page, scenario }) => {
        const card = await welcomeCard(page, insetsOf(scenario).bottom);
        if (card.hidden || !card.closeOk) {
          console.log("welcome find", card);
        }
        return [
          [
            !card.hidden &&
              card.title === "While you were away" &&
              card.line ===
                "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper." &&
              !/\d|\?/.test(card.line) &&
              card.titleOk &&
              card.closeOk,
            "welcome card names the find",
          ],
          [
            await coversBoard(page, ".welcome-back"),
            "welcome card with a find is laid over the game",
          ],
          [await noScroll(page), "welcome card with a find has no scroll"],
        ];
      },
    },
    {
      run: async ({ page }) => {
        await stepTapClock(page, PAST_SETTLE_MS);
        await page.tap(".welcome-continue");
        return [
          [
            await page.$eval(".welcome-back", (el) => el.hidden),
            "welcome card with a find closes",
          ],
        ];
      },
    },
  ],
});
