/* global console, process, setTimeout, document, getComputedStyle */
/**
 * Quick play-test in a real browser: open the game on a named save, run a
 * few taps, and keep a shot after each step plus the console and page errors.
 *   npm run play -- --save busy tap:.frame-key
 *   npm run play -- --save start "tap:.frame-site[data-site=city]"
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
  reopenTab,
  startServer,
} from "../tools/browser/harness.ts";
import {
  newerSave,
  seedJson,
  DEV_BACKUP_KEY,
  sliceBusySave,
  sliceListSave,
  sliceDoneSave,
  sliceNightSave,
  sliceOrderedSave,
  slicePartOneDoneSave,
  sliceRefinerySave,
  sliceYardFullSave,
  sliceFactorySave,
  sliceGraniteUnsunkSave,
  sliceFactoryOrderSave,
  sliceFactoryDoneSave,
  sliceRoofSave,
  sliceStartSave,
  sliceStandsSave,
  sliceStructureSave,
  sliceTwoLevelsSave,
  sliceWarehouseRoofSave,
  sliceFoundrySave,
  sliceFoundryRoofSave,
  sliceWarehouseSave,
  sliceWarehouseTrucksSave,
} from "../tools/browser/fixtures.ts";

/**
 * Starting saves, from the typed fixtures in tools/browser/fixtures.ts. `fresh` seeds nothing.
 * The frame's saves are the dev account's phone backup, played on a memory save (#664).
 */
const MEMORY = "?memorySave=1";
const SAVES = {
  fresh: {
    note: "first open, nothing saved: the first evening",
    save: () => undefined,
  },
  newer: {
    note: "a save a later build wrote: the update card, and nothing written (#558)",
    save: () => newerSave(Date.now()),
  },
  start: {
    note: "a fresh one-worker start with drilled rock, and the first evening's card",
    save: () => sliceStartSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  ordered: {
    note: "the foundation on order and nothing affordable",
    save: () => sliceOrderedSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  stands: {
    note: "nobody hoisting, so the line stands",
    save: () => sliceStandsSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  structure: {
    note: "the Light Tower's structure rising, a wagon with no driver",
    save: () => sliceStructureSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  done: {
    note: "the Light Tower, the Warehouse and the Foundry operational, nothing to order",
    save: () => sliceDoneSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  busy: {
    note: "carts, two wagons, free workers and stone to spend",
    save: () => sliceBusySave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  list: {
    note: "five carts and drills, so the stages' lists hold upgrades, and Work boots",
    save: () => sliceListSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  night: {
    note: "closed nine hours ago, so the frame opens on the shift report",
    save: () => sliceNightSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  roof: {
    note: "the roof goes on in the night: the shift report, then the refinery opens",
    save: () => sliceRoofSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  partonedone: {
    note: "a part 1 save after the Light Tower's roof, 8M stone: the refinery's card greets it",
    save: () => slicePartOneDoneSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  refinery: {
    note: "a kiln with its worker, brick and stone in the stockyard",
    save: () => sliceRefinerySave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  yardfull: {
    note: "closed twelve hours ago: the stockyard fills and stops the mine",
    save: () => sliceYardFullSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  warehouse: {
    note: "the Warehouse's first step delivering, stone and brick on the way",
    save: () => sliceWarehouseSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  warehouseroof: {
    note: "the Warehouse's roof goes on in the night: the shift report, then its card that opens trucks",
    save: () => sliceWarehouseRoofSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  foundry: {
    note: "part 3: the Foundry's structure going up, brick and cut stone on the way",
    save: () => sliceFoundrySave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  foundryroof: {
    note: "part 3: the Foundry's roof goes on in the night: the shift report, then the slice's end card",
    save: () => sliceFoundryRoofSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  factory: {
    note: "part 3: the shaft sunk, clay and iron in the bins, the station idle",
    save: () => sliceFactorySave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  factoryorder: {
    note: "part 3: sturdy props on the station, stone and clay arriving",
    save: () => sliceFactoryOrderSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  factorydone: {
    note: "part 3: iron rails done on the station, waiting to be installed",
    save: () => sliceFactoryDoneSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  "granite-unsunk": {
    note: "part 3: the Light Tower up and the stone and brick to sink the shaft",
    save: () => sliceGraniteUnsunkSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  "warehouse-trucks": {
    note: "part 3: the Warehouse operational and the brick for a truck",
    save: () => sliceWarehouseTrucksSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
  "two-levels": {
    note: "part 3: the shaft sunk, both levels working, a hoist on each and one for both",
    save: () => sliceTwoLevelsSave(Date.now()),
    key: DEV_BACKUP_KEY,
    search: MEMORY,
  },
};

const plan = parsePlayArgs(process.argv.slice(2), Object.keys(SAVES));
if (plan.kind === "help") {
  console.log(PLAY_USAGE);
  console.log("\nSaves:");
  const width = Math.max(...Object.keys(SAVES).map((name) => name.length));
  for (const [name, { note }] of Object.entries(SAVES)) {
    console.log(`  ${name.padEnd(width)}  ${note}`);
  }
  process.exit(0);
}
if (plan.kind === "error") {
  console.error(`${plan.message}\n\n${PLAY_USAGE}`);
  process.exit(2);
}

/** The phone: the game is phone-only, and a PC shows the same board. */
const PHONE = {
  ...plan.phone,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
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

async function step(page, action) {
  if (action.kind === "wait") {
    await sleep(action.ms);
    return;
  }
  if (action.kind === "reload") {
    await page.reload({ waitUntil: "networkidle0" });
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
    await element.tap();
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
  const options = {
    viewport: PHONE,
    seed:
      save === undefined
        ? { kind: "none" }
        : { kind: "once", guard: "play-seeded", json: seedJson(save) },
    clock: { date: "real", tap: "real" },
    seedKey: SAVES[plan.save].key,
    search: plan.search === "" ? (SAVES[plan.save].search ?? "") : plan.search,
    onPageError: (error) => {
      pageErrors += 1;
      note(`[phone] PAGE ERROR: ${String(error)}`);
    },
    beforeLoad: (target) => {
      target.on("console", (message) => {
        note(`[phone] console.${message.type()}: ${message.text()}`);
      });
      // Failed loads throw no page error, so list them (offline Firebase is expected).
      target.on("requestfailed", (request) => {
        note(
          `[phone] request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
        );
      });
      target.on("response", (response) => {
        if (response.status() >= 400) {
          note(
            `[phone] HTTP ${String(response.status())}: ${response.request().method()} ${response.url()}`,
          );
        }
      });
      return Promise.resolve();
    },
  };
  const opened = await openTabs(options);
  const context = opened.context;
  let page = opened.page;
  const shots = [shotName(0, undefined)];
  await page.screenshot({ path: join(plan.out, shots[0]) });
  for (const [index, action] of plan.actions.entries()) {
    const name = shotName(index + 1, action);
    try {
      if (action.kind === "reopen") {
        page = await reopenTab(context, page, BASE, options);
      } else {
        await step(page, action);
      }
    } catch (error) {
      failedSteps += 1;
      note(`[phone] STEP FAILED ${name}: ${String(error)}`);
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
      ? `[phone] save line: not on screen`
      : `[phone] save line: ${saveLine.text} (data-log: ${saveLine.log})`,
  );
  note(`[phone] shots: ${shots.join(", ")}`);
  await context.close();
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
