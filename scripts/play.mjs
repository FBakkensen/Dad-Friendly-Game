/* global console, process, sessionStorage, localStorage, setTimeout, URL, document, getComputedStyle */
/**
 * Quick play-test in a real browser: open the game on a named save, run a
 * few taps, and keep a shot after each step plus the console and page errors.
 *   npm run play -- --save mid label:Buys
 *   npm run play -- --save heart --search ?trouble=cave-in tap:.board-window
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
  labelMatch,
  parsePlayArgs,
  shotName,
  targetQuery,
} from "../src/play-plan.ts";
import {
  CREW,
  SAVE_KEY,
  crewMountain,
  crystalMountain,
  fleetMountain,
  heartMountain,
  heirMountain,
  idleMountain,
  lastStoneSave,
  machineMountain,
  openMountain,
  savingMountain,
  seedJson,
  shortMountain,
  toolsMountain,
  workshopSave,
} from "./fixtures.mjs";

const HOUR = 60 * 60 * 1000;

/** Starting saves, from the visual check's fixtures. `fresh` seeds nothing. */
const SAVES = {
  fresh: { note: "first open, nothing saved", save: () => undefined },
  early: { note: "a crewed Topsoil: workers and carts", save: crewMountain },
  mid: {
    note: "Granite with a borer: Workshop and Engineers open",
    save: openMountain,
  },
  crystal: {
    note: "the Crystal Caves: drills and borers at work",
    save: crystalMountain,
  },
  heart: {
    note: "the Deep Heart on a kid's run: the Great Machine and Legacy ×1.5",
    save: heartMountain,
  },
  workshop: {
    note: "a craft on the bench and axle grease running",
    save: () => workshopSave(Date.now(), true),
  },
  crew: {
    note: "every tier so far and both boosts, in the Deep Heart",
    save: () => ({ version: 4, mountain: CREW, lastSeen: Date.now() }),
  },
  late: {
    note: "one stone left: a tap finds the legend and offers passing the mine",
    save: lastStoneSave,
  },
  away: {
    note: "the mid save, last seen 9 hours ago: the welcome-back card",
    save: () => ({ ...openMountain(), lastSeen: Date.now() - 9 * HOUR }),
  },
  heir: {
    note: "a kid's run after one pass: Grandpa tends the carts",
    save: heirMountain,
  },
  edge: {
    note: "13 carts, four stones above the Granite: tap across, open Buys",
    save: () => ({
      version: 6,
      lastSeen: Date.now(),
      mountain: {
        remaining: 240_000_000 - 9_999_996,
        pocket: 2_000_000,
        helpers: 40,
        carts: 13,
        drills: 4,
        staffed: 2,
      },
      workshop: openMountain().workshop,
    }),
  },
  brief: {
    note: "the mid save, last seen 2 minutes ago: the quiet away note",
    save: () => ({ ...openMountain(), lastSeen: Date.now() - HOUR / 30 }),
  },
  saving: {
    note: "a free hand and nothing affordable: Saving for a cart",
    save: savingMountain,
  },
  fleet: {
    note: "120 carts: three flaps on the cart bay",
    save: fleetMountain,
  },
  short: {
    note: "a borer he can afford but not staff: Needs 8 workers",
    save: shortMountain,
  },
  idle: {
    note: "carts standing idle: the staffing New row in Buys",
    save: idleMountain,
  },
  tools: {
    note: "upgrades owned and levelled, and found tools under Brought home",
    save: toolsMountain,
  },
  machine: {
    note: "the Great Machine with the Kid row locked; add ?trouble=cave-in for the Buys key's red lamp",
    save: machineMountain,
  },
};

const plan = parsePlayArgs(process.argv.slice(2), Object.keys(SAVES));
if (plan.kind === "help") {
  console.log(PLAY_USAGE);
  console.log("\nSaves:");
  for (const [name, { note }] of Object.entries(SAVES)) {
    console.log(`  ${name.padEnd(9)} ${note}`);
  }
  process.exit(0);
}
if (plan.kind === "error") {
  console.error(`${plan.message}\n\n${PLAY_USAGE}`);
  process.exit(2);
}

const SCREENS = {
  phone: {
    ...plan.phone,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  desktop: { width: 1366, height: 768, deviceScaleFactor: 2 },
};

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
let stoppedEarly = false;
const note = (line) => {
  log.push(line);
  console.log(line);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox"],
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What a person can tap, with the name a screen reader would give it. */
const TAPPABLE =
  "button, a[href], summary, input, select, textarea, [role=button], [role=tab], [role=link], [aria-label]";

/**
 * The first visible element whose accessible name is the label, else the first
 * that starts with it ("Upgrades" finds "Upgrades, one is affordable").
 */
async function findByLabel(page, label) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const handles = await page.$$(TAPPABLE);
    const names = await Promise.all(
      handles.map((handle) =>
        handle.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const visible =
            box.width > 0 &&
            box.height > 0 &&
            style.visibility !== "hidden" &&
            element.closest("[hidden], [inert]") === null;
          if (!visible) {
            return "";
          }
          const labelledBy = element.getAttribute("aria-labelledby");
          const byId =
            labelledBy === null
              ? ""
              : labelledBy
                  .split(/\s+/)
                  .map((id) => document.getElementById(id)?.textContent ?? "")
                  .join(" ");
          return (
            element.getAttribute("aria-label") ??
            (byId.trim() || element.textContent || "")
          );
        }),
      ),
    );
    // A hidden control has no name, so it never matches.
    const index = labelMatch(
      names.map((name) => (name.trim() === "" ? "\u0000" : name)),
      label,
    );
    if (index !== -1) {
      return handles[index];
    }
    if (Date.now() > deadline) {
      throw new Error(`No visible control named "${label}"`);
    }
    await sleep(100);
  }
}

async function step(page, screen, action) {
  if (action.kind === "wait") {
    await sleep(action.ms);
    return;
  }
  const element =
    action.target.by === "label"
      ? await findByLabel(page, action.target.label)
      : await page.waitForSelector(targetQuery(action.target), {
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

const save = SAVES[plan.save].save();
note(`play: save ${plan.save}, ${BASE}`);
try {
  for (const screen of plan.screens) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on("console", (message) => {
      note(`[${screen}] console.${message.type()}: ${message.text()}`);
    });
    // Failed loads throw no page error, so list them (offline Firebase is expected).
    page.on("requestfailed", (request) => {
      note(
        `[${screen}] request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
      );
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        note(
          `[${screen}] HTTP ${String(response.status())}: ${response.request().method()} ${response.url()}`,
        );
      }
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
    await page.goto(new URL(plan.search, BASE).href, {
      waitUntil: "networkidle0",
    });
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
  stoppedEarly = true;
  note(`play: stopped early: ${String(error)}`);
} finally {
  await browser.close();
  await server?.close();
  writeFileSync(join(plan.out, "log.txt"), `${log.join("\n")}\n`);
}

const ok = pageErrors === 0 && failedSteps === 0 && !stoppedEarly;
const verdict = ok
  ? "play: ok"
  : stoppedEarly
    ? "play: stopped early"
    : `play: ${String(pageErrors)} page error(s), ${String(failedSteps)} failed step(s)`;
console.log(`${verdict}. Shots and log.txt in ${plan.out}/`);
process.exit(ok ? 0 : 1);
