/* global console, process, setTimeout, document, getComputedStyle */
/**
 * Quick play-test in a real browser: open the game on a named save, run a
 * few taps, and keep a shot after each step plus the console and page errors.
 *   npm run play -- --save mid label:Buys
 *   npm run play -- --save heart --search ?trouble=cave-in tap:.board-window
 *   npm run play -- --help
 * Shots and log.txt land in play-shots/ (git-ignored), replaced on each run.
 * Exits non-zero on any page error or an action that could not run.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAY_USAGE,
  isPlayOutput,
  labelMatch,
  parsePlayArgs,
  shotName,
  targetQuery,
} from "../src/play-plan.ts";
import {
  launchChrome,
  open,
  openPair,
  startServer,
} from "../tools/browser/harness.ts";
import {
  chargePayoffSave,
  crewMountain,
  crewV4Save,
  crystalMountain,
  firstCraftSave,
  fleetMountain,
  foundBelowSave,
  heartMountain,
  heirMountain,
  idleMountain,
  lastStoneSave,
  machineMountain,
  openMountain,
  playAwaySave,
  playCraftSave,
  playBriefSave,
  playEdgeSave,
  savingMountain,
  seedJson,
  shortMountain,
  toolsMountain,
  unknownBenchSave,
  workshopSave,
} from "../tools/browser/fixtures.ts";

/** Starting saves, from the typed fixtures in tools/browser/fixtures.ts. `fresh` seeds nothing. */
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
  "workshop-free": {
    note: "a free bench: grease to craft, a short charge, two pages",
    save: () => workshopSave(Date.now(), false),
  },
  "first-craft": {
    note: "the Workshop not yet taught, 10 clay: the charge's New row",
    save: () => firstCraftSave(Date.now()),
  },
  payoff: {
    note: "the first blasting charge working: its row shows the payoff",
    save: () => chargePayoffSave(Date.now()),
  },
  "bench-unknown": {
    note: "a craft this build cannot name on the bench",
    save: () => unknownBenchSave(Date.now()),
  },
  crew: {
    note: "every tier so far and both boosts, in the Deep Heart",
    save: crewV4Save,
  },
  late: {
    note: "one stone left: a tap finds the legend and offers passing the mine",
    save: lastStoneSave,
  },
  away: {
    note: "the mid save, last seen 9 hours ago: the welcome-back card",
    save: playAwaySave,
  },
  heir: {
    note: "a kid's run after one pass: Grandpa tends the carts",
    save: heirMountain,
  },
  edge: {
    note: "13 carts, four stones above the Granite: tap across, open Buys",
    save: playEdgeSave,
  },
  crafted: {
    note: "a craft finishing three seconds after opening: the craft-done card",
    save: playCraftSave,
  },
  brief: {
    note: "the mid save, last seen 2 minutes ago: the quiet away note",
    save: playBriefSave,
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
  keepsakes: {
    note: "every tool and keepsake found: a relic's detail shows all five keepsakes",
    save: foundBelowSave,
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

// Clear only what an earlier run wrote, so --out never deletes anything else.
mkdirSync(plan.out, { recursive: true });
for (const file of readdirSync(plan.out)) {
  if (isPlayOutput(file)) {
    rmSync(join(plan.out, file));
  }
}

const server = await startServer({ port: 4175, url: plan.url });
const BASE = server.base;

const log = [];
let pageErrors = 0;
let failedSteps = 0;
let stoppedEarly = false;
const note = (line) => {
  log.push(line);
  console.log(line);
};

const browser = await launchChrome();

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

/**
 * One tab, or with --tabs 2 two tabs in one context, played on the second: the first keeps the
 * mountain, so the second shows the other-tab card.
 */
async function openTabs(options) {
  if (plan.tabs === 1) {
    return open(browser, BASE, options);
  }
  const { pages, context } = await openPair(browser, BASE, options);
  return { page: pages[1], context };
}

const save = SAVES[plan.save].save();
note(`play: save ${plan.save}${plan.tabs === 2 ? ", two tabs" : ""}, ${BASE}`);
try {
  for (const screen of plan.screens) {
    const { page, context } = await openTabs({
      viewport: SCREENS[screen],
      seed:
        save === undefined
          ? { kind: "none" }
          : { kind: "once", guard: "play-seeded", json: seedJson(save) },
      clock: { date: "real", tap: "real" },
      search: plan.search,
      onPageError: (error) => {
        pageErrors += 1;
        note(`[${screen}] PAGE ERROR: ${String(error)}`);
      },
      beforeLoad: (target) => {
        target.on("console", (message) => {
          note(`[${screen}] console.${message.type()}: ${message.text()}`);
        });
        // Failed loads throw no page error, so list them (offline Firebase is expected).
        target.on("requestfailed", (request) => {
          note(
            `[${screen}] request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
          );
        });
        target.on("response", (response) => {
          if (response.status() >= 400) {
            note(
              `[${screen}] HTTP ${String(response.status())}: ${response.request().method()} ${response.url()}`,
            );
          }
        });
        return Promise.resolve();
      },
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
  await server.close();
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
