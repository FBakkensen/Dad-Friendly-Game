/* global console, process, sessionStorage, localStorage, setTimeout, URL */
/**
 * Quick play-test in a real browser: open the game on a named save, run a
 * few taps, and keep a shot after each step plus the console and page errors.
 *   npm run play -- --save mid label:Buys
 *   npm run play -- --help
 * Shots and log.txt land in play-shots/ (git-ignored), replaced on each run.
 * Exits non-zero on any page error or an action that could not run.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import {
  PLAY_USAGE,
  isPlayOutput,
  parsePlayArgs,
  shotName,
  targetQuery,
} from "../src/play-plan.ts";
import {
  CREW,
  SAVE_KEY,
  crewMountain,
  openMountain,
  seedJson,
  workshopSave,
} from "./fixtures.mjs";

/** Starting saves, from the visual check's fixtures. `fresh` seeds nothing. */
const SAVES = {
  fresh: () => undefined,
  early: () => crewMountain(),
  mid: () => openMountain(),
  workshop: () => workshopSave(Date.now(), true),
  late: () => ({ version: 4, mountain: CREW, lastSeen: Date.now() }),
};
const SAVE_NOTES = {
  fresh: "first open, nothing saved",
  early: "a crewed Topsoil: workers and carts",
  mid: "Granite with a borer: Workshop and Engineers open",
  workshop: "a craft on the bench and axle grease running",
  late: "every tier so far, both boosts running",
};

const SCREENS = {
  phone: {
    width: 412,
    height: 915,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  desktop: { width: 1366, height: 768, deviceScaleFactor: 2 },
};

const plan = parsePlayArgs(process.argv.slice(2), Object.keys(SAVES));
if (plan.kind === "help") {
  console.log(PLAY_USAGE);
  console.log("\nSaves:");
  for (const [name, note] of Object.entries(SAVE_NOTES)) {
    console.log(`  ${name.padEnd(9)} ${note}`);
  }
  process.exit(0);
}
if (plan.kind === "error") {
  console.error(`${plan.message}\n\n${PLAY_USAGE}`);
  process.exit(2);
}

const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome"].find((path) =>
    existsSync(path),
  ) ??
  "/usr/bin/google-chrome";

// Clear only what an earlier run wrote, so --out never deletes anything else.
mkdirSync(plan.out, { recursive: true });
for (const file of readdirSync(plan.out)) {
  if (isPlayOutput(file)) {
    rmSync(join(plan.out, file));
  }
}

const server =
  plan.url === undefined
    ? await createServer({
        server: { host: "127.0.0.1", port: 4175, strictPort: false },
        logLevel: "error",
      }).then((dev) => dev.listen())
    : undefined;
const BASE =
  plan.url ?? server?.resolvedUrls?.local[0] ?? "http://127.0.0.1:4175/";

const log = [];
let pageErrors = 0;
let failedSteps = 0;
const note = (line) => {
  log.push(line);
  console.log(line);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox"],
});

async function step(page, screen, action) {
  if (action.kind === "wait") {
    await new Promise((resolve) => setTimeout(resolve, action.ms));
    return;
  }
  const query = targetQuery(action.target);
  const element = await page.waitForSelector(query, {
    visible: true,
    timeout: 5_000,
  });
  if (action.kind === "waitFor") {
    return;
  }
  for (let i = 0; i < action.times; i += 1) {
    if (screen === "phone") {
      await element.tap();
    } else {
      await element.click();
    }
    // A tap's effects (floats, sheets) land a frame or two later.
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

const save = SAVES[plan.save]();
note(`play: save ${plan.save}, ${BASE}`);
try {
  for (const screen of plan.screens) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on("console", (message) => {
      note(`[${screen}] console.${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      pageErrors += 1;
      note(`[${screen}] PAGE ERROR: ${String(error)}`);
    });
    await page.setViewport(SCREENS[screen]);
    if (save !== undefined) {
      await page.evaluateOnNewDocument(
        (key, value) => {
          if (sessionStorage.getItem("play-seeded") === null) {
            sessionStorage.setItem("play-seeded", "1");
            localStorage.setItem(key, value);
          }
        },
        SAVE_KEY,
        seedJson(save),
      );
    }
    await page.goto(new URL(BASE).href, { waitUntil: "networkidle0" });
    const shots = [shotName(screen, 0, undefined)];
    await page.screenshot({ path: join(plan.out, shots[0]) });
    for (const [index, action] of plan.actions.entries()) {
      const name = shotName(screen, index + 1, action);
      try {
        await step(page, screen, action);
      } catch (error) {
        failedSteps += 1;
        note(`[${screen}] STEP FAILED ${name}: ${String(error)}`);
      }
      await page.screenshot({ path: join(plan.out, name) });
      shots.push(name);
    }
    const saveLine = await page
      .$eval("[data-log]", (element) => ({
        text: element.textContent.trim(),
        log: element.getAttribute("data-log"),
      }))
      .catch(() => undefined);
    note(
      saveLine === undefined
        ? `[${screen}] save line: not on screen`
        : `[${screen}] save line: ${saveLine.text} (data-log: ${saveLine.log})`,
    );
    note(`[${screen}] shots: ${shots.join(", ")}`);
    await context.close();
  }
} catch (error) {
  // A launch or navigation failure still leaves a log behind.
  failedSteps += 1;
  note(`play: stopped early: ${String(error)}`);
} finally {
  await browser.close();
  await server?.close();
  writeFileSync(join(plan.out, "log.txt"), `${log.join("\n")}\n`);
}

const verdict =
  pageErrors === 0 && failedSteps === 0
    ? "play: ok"
    : `play: ${String(pageErrors)} page error(s), ${String(failedSteps)} failed step(s)`;
console.log(`${verdict}. Shots and log.txt in ${plan.out}/`);
process.exit(pageErrors === 0 && failedSteps === 0 ? 0 : 1);
