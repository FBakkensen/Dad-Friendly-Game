/* global document */
/** Press looks sections: each board control's pressed look and its rest look (#432). */
import { openMountain, crewMountain } from "../../tools/browser/fixtures.ts";
import { check, section } from "./registry.mjs";
import {
  PHONE,
  PCS,
  KEY,
  OPEN_SHEET,
  SHEET_BACK,
  openSheet,
  openScreen,
  baysDrawn,
  holdThrough,
  framesPainted,
  framesSpanning,
  noteAway,
} from "./kit.mjs";

// press looks (#432): each board control shows its pressed look while a finger (or the mouse
// button) is held on it, and its rest look after the lift. The phone and one PC size, on the
// mid save; the Ready plate needs a ready pick, so it takes the early crew's save.
const PRESS_SIZES = [PHONE, PCS[0]];
const KEY_CAP = `${KEY("buys")} .board-key-cap`;
const DIG_SPRITE = ".board-dig-sprite";
const GUARD = ".board-ready-guard";
const BACK_PLATE = SHEET_BACK("buys");
const BACK_SKIN = `${BACK_PLATE} canvas.board-skin`;
const BUYS_ROW = `${OPEN_SHEET("buys")} .board-row:not(:disabled)`;

/** The cap, guard or sprite's frame offset, as the control wrote it. */
const frameOf = (page, selector) =>
  page.$eval(selector, (el) => el.style.backgroundPositionX);
const hasClass = (page, selector, name) =>
  page.$eval(selector, (el, cls) => el.classList.contains(cls), name);
/** The frames the pages are given time to paint after a lift. */
const afterLift = (page) => framesSpanning(page, 250);

for (const viewport of PRESS_SIZES) {
  section(`press looks ${JSON.stringify(viewport)}`, async () => {
    const size = `${String(viewport[0])}x${String(viewport[1])}`;
    const label = `${size} press looks:`;

    // A rail key: is-down and its cap's down frame while held, back to its rest frame after.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await page.waitForSelector(`${KEY("buys")}:not(:disabled)`, {
        visible: true,
      });
      await noteAway(page);
      const restFrame = await frameOf(page, KEY_CAP);
      const held = await holdThrough(
        page,
        KEY("buys"),
        (selector) =>
          document.querySelector(selector)?.classList.contains("is-down") ===
          true,
      );
      const during = held ? "is-down" : "not down";
      await afterLift(page);
      const upAfter = !(await hasClass(page, KEY("buys"), "is-down"));
      const restAfter = await frameOf(page, KEY_CAP);
      check(
        held && restFrame === restAfter && upAfter,
        `${label} a held rail key shows ${during}, and is back to its rest frame (${restFrame}) after the lift`,
      );
      await close();
    }
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await page.waitForSelector(`${KEY("buys")}:not(:disabled)`, {
        visible: true,
      });
      await noteAway(page);
      const rest = await frameOf(page, KEY_CAP);
      await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        el.addEventListener("pointerdown", () => {
          globalThis.__capDown = document.querySelector(
            `${selector} .board-key-cap`,
          ).style.backgroundPositionX;
        });
      }, KEY("buys"));
      await holdThrough(page, KEY("buys"), (selector) =>
        document.querySelector(selector)?.classList.contains("is-down"),
      );
      const down = await page.evaluate(() => globalThis.__capDown);
      check(
        down === "-64px" && rest !== "-64px",
        `${label} a held rail key's cap is on its down frame (${String(down)}), not its rest (${rest})`,
      );
      await close();
    }

    // A plate button (the Buys drawer's Back plate): down, with its canvas painted differently.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await openSheet(page, "buys");
      await framesPainted(page, 3);
      await page.evaluate((selector) => {
        globalThis.__skinRest = document.querySelector(selector).toDataURL();
      }, BACK_SKIN);
      const held = await holdThrough(page, BACK_PLATE, (selector) => {
        const plate = document.querySelector(selector);
        if (!plate.classList.contains("down")) return false;
        const pixels = plate.querySelector("canvas.board-skin").toDataURL();
        return pixels !== globalThis.__skinRest;
      });
      await afterLift(page);
      const back = !(await hasClass(page, BACK_PLATE, "down"));
      const same = await page.evaluate(
        (selector) =>
          document.querySelector(selector).toDataURL() ===
          globalThis.__skinRest,
        BACK_SKIN,
      );
      check(
        held && back && same,
        `${label} a held plate button shows down with its own pixels, and its released pixels return after the lift`,
      );
      await close();
    }

    // The Ready plate: the guard's pressed frame while held (a tap buys, so it ends in Done).
    {
      const { page, close } = await openScreen(viewport, crewMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await baysDrawn(page);
      await page.waitForSelector(".board-ready:not(:disabled)");
      await noteAway(page);
      const restFrame = await frameOf(page, GUARD);
      const held = await holdThrough(
        page,
        ".board-ready",
        () =>
          document.querySelector(".board-ready-guard")?.style
            .backgroundPositionX === "-160px",
      );
      await afterLift(page);
      const after = await frameOf(page, GUARD);
      check(
        held && restFrame !== "-160px" && after !== "-160px",
        `${label} a held Ready plate shows the guard's pressed frame (-160px; rest ${restFrame}), and not after the lift (${after})`,
      );
      await close();
    }

    // The dig sprite: the down frame while held, the rest frame after the click's up frame.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await page.waitForSelector(".board-dig-button:not(:disabled)");
      await noteAway(page);
      const restFrame = await frameOf(page, DIG_SPRITE);
      const held = await holdThrough(
        page,
        ".board-dig-button",
        () =>
          document.querySelector(".board-dig-sprite")?.style
            .backgroundPositionX === "-112px",
      );
      await afterLift(page);
      const after = await frameOf(page, DIG_SPRITE);
      check(
        held && restFrame === "0px" && after === restFrame,
        `${label} a held dig button shows the down frame (-112px), then rest (${after}) after the lift`,
      );
      await close();
    }

    // A Buys row: is-pressed while held, off after the lift.
    {
      const { page, close } = await openScreen(viewport, openMountain(), {
        stopClock: true,
        tapClock: "held",
      });
      await openSheet(page, "buys");
      await page.waitForSelector(BUYS_ROW, { visible: true });
      const held = await holdThrough(
        page,
        BUYS_ROW,
        (selector) =>
          document.querySelector(selector)?.classList.contains("is-pressed") ===
          true,
      );
      await afterLift(page);
      const off = await page.$$eval(
        `${OPEN_SHEET("buys")} .board-row`,
        (rows) => rows.every((row) => !row.classList.contains("is-pressed")),
      );
      check(
        held && off,
        `${label} a held Buys row shows is-pressed, and none after the lift`,
      );
      await close();
    }
  });
}
