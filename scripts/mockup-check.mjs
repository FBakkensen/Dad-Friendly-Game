/* global console, process, document, innerWidth, innerHeight, getComputedStyle, Element, URL */
/**
 * Layout guard for the M9-2 static mockups. Serves the Vite app, opens
 * mockups/preview.html, and fails if a phone viewport scrolls, a label is
 * under 0.9rem, a card is see-through, or a button has no spelled-out tap.
 * Writes a PNG per scene so the sheets can be reviewed.
 *
 *   npm run mockups
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";

const server =
  process.env.MOCKUP_URL === undefined
    ? await createServer({
        server: { host: "127.0.0.1", port: 4175, strictPort: false },
        logLevel: "error",
      }).then((dev) => dev.listen())
    : undefined;
const BASE =
  process.env.MOCKUP_URL ??
  server?.resolvedUrls?.local[0] ??
  "http://127.0.0.1:4175/";
const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome"].find((path) =>
    existsSync(path),
  ) ??
  "/usr/bin/google-chrome";
const OUT = process.env.MOCKUP_OUT ?? "mockups/shots";
mkdirSync(OUT, { recursive: true });

const SIZES = [
  [390, 844],
  [360, 640],
  [360, 560],
];

const SHOTS = [
  ["workshop", "rest", ""],
  ["workshop", "shake", "rails"],
  ["workshop", "press", "props"],
  ["workshop", "press", "charge"],
  ["workshop", "press", "back"],
  ["workshop", "float", "props"],
  ["workshop", "float", "charge"],
  ["workshop", "hammer", "props"],
  ["workshop", "hammer", "charge"],
  ["workshop", "busy", ""],
  ["layer", "rest", ""],
  ["layer", "press", "dig"],
  ["mountain", "rest", ""],
  ["mountain", "press", "posts"],
  ["mountain", "rest", "open"],
  ["craft-done", "rest", ""],
  ["craft-done", "press", "done"],
  ["other-tab", "rest", ""],
];

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => {
  failures.push(`page error: ${String(error)}`);
});

function shotName(scene, phase, control, width, height) {
  const who = control === "" ? phase : `${phase}-${control}`;
  return `${scene}-${who}-${String(width)}x${String(height)}.png`;
}

async function fit(page, label) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const mock = document.querySelector("#mock");
    const visible = (element) => {
      for (
        let node = element;
        node instanceof Element;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
      }
      return true;
    };
    const boxOf = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        text: (element.textContent ?? "").trim().slice(0, 48),
        font: Number.parseFloat(style.fontSize),
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        clipped: element.scrollWidth > element.clientWidth + 1,
      };
    };
    const labels = [...document.querySelectorAll(".label")]
      .filter(visible)
      .map(boxOf);
    const buttons = [...document.querySelectorAll("button")]
      .filter(visible)
      .map((button) => {
        const box = boxOf(button);
        const style = getComputedStyle(button);
        const tap = button.getAttribute("data-tap") ?? "";
        const reason = button.getAttribute("data-short");
        const short = reason !== null;
        const tapOk = short
          ? button.disabled &&
            tap.includes("gentle shake") &&
            tap.includes(reason) &&
            (button.textContent ?? "").includes(reason) &&
            style.backgroundColor === "rgb(58, 42, 28)"
          : tap.includes("Presses in") &&
            tap.includes("Silent until unmuted") &&
            (!button.hasAttribute("data-craft") ||
              tap.includes("hammer tap") ||
              tap.includes("hammer stays quiet") ||
              tap.includes("waits its turn"));
        return {
          ...box,
          height: button.getBoundingClientRect().height,
          tap,
          craft: button.hasAttribute("data-craft"),
          short,
          tapOk,
          pressed: button.classList.contains("is-pressed"),
          transform: style.transform,
        };
      });
    const cards = [...document.querySelectorAll(".card")]
      .filter(visible)
      .map((card) => getComputedStyle(card).backgroundColor);
    const opaque = (color) => {
      const match = /rgba?\(([^)]+)\)/.exec(color);
      if (match === null) {
        return false;
      }
      const parts = match[1].split(",").map((part) => Number(part.trim()));
      const alpha = parts.length === 4 ? parts[3] : 1;
      return alpha === 1;
    };
    const inside = (box) =>
      box.left >= -1 &&
      box.top >= -1 &&
      box.right <= innerWidth + 1 &&
      box.bottom <= innerHeight + 1;
    const hidden = document.querySelector(".is-hidden-recipe");
    const hiddenText = hidden?.textContent ?? "";
    return {
      scroll:
        root.scrollHeight === root.clientHeight &&
        root.scrollWidth === root.clientWidth &&
        mock !== null &&
        mock.scrollHeight === mock.clientHeight &&
        mock.scrollWidth === mock.clientWidth,
      root: [
        root.scrollWidth,
        root.scrollHeight,
        root.clientWidth,
        root.clientHeight,
      ],
      mock:
        mock === null
          ? []
          : [
              mock.scrollWidth,
              mock.scrollHeight,
              mock.clientWidth,
              mock.clientHeight,
            ],
      labelsOk: labels.every(
        (label) => label.font >= 14.4 && inside(label) && !label.clipped,
      ),
      labelMiss: labels.filter(
        (label) => label.font < 14.4 || !inside(label) || label.clipped,
      ),
      buttonsOk: buttons.every(
        (button) =>
          button.height >= 44 &&
          button.font >= 14.4 &&
          inside(button) &&
          !button.clipped &&
          button.tapOk &&
          button.tap.includes("Silent until unmuted"),
      ),
      buttonMiss: buttons.filter(
        (button) =>
          button.height < 44 ||
          button.font < 14.4 ||
          !inside(button) ||
          button.clipped,
      ),
      cardsOk: cards.length > 0 && cards.every(opaque),
      cards,
      quiet: document.querySelector("audio, video") === null,
      hiddenOk:
        hidden === null ||
        (!/[0-9?]/.test(hiddenText) && hiddenText.includes("folded sketch")),
      scene: mock?.dataset.scene ?? "",
    };
  });
  check(
    result.scroll &&
      result.labelsOk &&
      result.buttonsOk &&
      result.cardsOk &&
      result.quiet &&
      result.hiddenOk,
    label,
  );
  if (
    !result.scroll ||
    !result.labelsOk ||
    !result.buttonsOk ||
    !result.cardsOk ||
    !result.hiddenOk
  ) {
    console.log(JSON.stringify(result));
  }
  return result;
}

for (const [width, height] of SIZES) {
  await page.setViewport({
    width,
    height,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  for (const [scene, phase, control] of SHOTS) {
    const url = new URL("mockups/preview.html", BASE);
    url.searchParams.set("scene", scene);
    url.searchParams.set("phase", phase);
    url.searchParams.set("shot", "1");
    if (control !== "") {
      url.searchParams.set("control", control);
    }
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#mock[data-ready='1']");
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    const name = `${String(width)}x${String(height)} ${scene} ${phase} ${control}`;
    const result = await fit(page, name);
    if (phase === "shake") {
      const shook = await page.$eval("button.is-shaking", (button) => {
        const style = getComputedStyle(button);
        const reason = button.getAttribute("data-short") ?? "";
        const tap = button.getAttribute("data-tap") ?? "";
        return (
          button.disabled &&
          reason === "Need 5 more iron" &&
          (button.textContent ?? "").includes(reason) &&
          tap.includes("gentle shake") &&
          tap.includes(reason) &&
          style.transform !== "none" &&
          style.backgroundColor === "rgb(58, 42, 28)"
        );
      });
      check(shook, `${name} short craft shakes and names the gap`);
    }
    if (phase === "press") {
      const pressed = await page.$eval("button.is-pressed", (button) => {
        const style = getComputedStyle(button);
        return style.transform !== "none";
      });
      check(pressed, `${name} presses in`);
    }
    if (phase === "float") {
      const floating = await page.$$eval(".float-chip", (chips) => {
        return (
          chips.length > 0 &&
          chips.every((chip) => {
            const box = chip.getBoundingClientRect();
            return (
              getComputedStyle(chip).display !== "none" &&
              box.left >= 0 &&
              box.right <= innerWidth &&
              box.top >= 0 &&
              box.bottom <= innerHeight
            );
          })
        );
      });
      check(floating, `${name} materials float inside the screen`);
    }
    if (phase === "hammer") {
      const hammer = await page.$eval(".hammer", (img) => {
        const style = getComputedStyle(img);
        const box = img.getBoundingClientRect();
        return (
          style.display !== "none" &&
          img.naturalWidth > 0 &&
          box.right <= innerWidth &&
          box.bottom <= innerHeight
        );
      });
      check(hammer, `${name} hammer tap is on screen`);
    }
    if (phase === "busy") {
      const bar = await page.$eval(".bar span", (span) => {
        const box = span.getBoundingClientRect();
        return box.width > 8 && box.width < span.parentElement.clientWidth;
      });
      check(bar, `${name} bench progress is a partial bar`);
    }
    if (result.scroll && result.labelsOk && result.buttonsOk) {
      await page.screenshot({
        path: join(OUT, shotName(scene, phase, control, width, height)),
        type: "png",
      });
    }
  }
}

// Wide Latin face, the tight sheet. Same fit bar, one proof shot.
await page.setViewport({
  width: 360,
  height: 560,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
for (const [scene, phase, control] of SHOTS) {
  const url = new URL("mockups/preview.html", BASE);
  url.searchParams.set("scene", scene);
  url.searchParams.set("phase", phase);
  url.searchParams.set("shot", "1");
  if (control !== "") {
    url.searchParams.set("control", control);
  }
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#mock[data-ready='1']");
  await page.waitForFunction(() =>
    [...document.images].every((img) => img.complete && img.naturalWidth > 0),
  );
  await page.addStyleTag({
    content: `* { font-family: "Liberation Sans", sans-serif !important; }`,
  });
  await fit(page, `360x560 wide ${scene} ${phase} ${control}`);
  if (scene === "workshop" && phase === "rest") {
    await page.screenshot({
      path: join(OUT, "workshop-rest-360x560-wide.png"),
      type: "png",
    });
  }
}

await browser.close();
await server?.close();
if (failures.length > 0) {
  console.error(
    `\n${String(failures.length)} mockup check(s) failed:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(`\nAll mockup checks passed. Shots in ${OUT}`);
