/**
 * The one player driver the journeys share (#552). It holds every selector: a journey opens a
 * named save, taps, buys and reads the numbers the player sees, and never reaches into the
 * game. The save, the clock and Math.random are set before the page boots.
 */
import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { DRAWER_SETTLE_MS } from "../../src/board-interaction.ts";
import type { ShownTierId } from "../../src/tiers.ts";
import { seedJson, type SeedSave } from "../browser/fixtures.ts";
import { SAVE_KEY, seedScript } from "../browser/harness.ts";
import { createRng } from "../sweep/random.ts";
import { TICK_MS, type Expected } from "./expected.ts";
import { PHONE } from "./phone.ts";

/** 9 pm on a weekday: the kids are asleep. Every journey's clock starts here. */
export const NINE_PM = Date.UTC(2026, 10, 16, 21, 0, 0);

export const HOUR_MS = 60 * 60 * 1000;

/** The seed of the page's Math.random, so a vein or a wobble lands the same every run. */
const RANDOM_SEED = 552;

/** The whole ticks a drawer or a card takes to settle, so the next tap counts. */
const PAST_SETTLE_MS = Math.ceil((DRAWER_SETTLE_MS + 1) / TICK_MS) * TICK_MS;

const BUYS_KEY = '.board-key[data-key="buys"]';
const OPEN_BUYS = '.board-sheet[data-sheet="buys"].is-open';

export class Player {
  private tab: Page;
  /** The page's clock: it stands still between the journey's waits. */
  private at = NINE_PM;
  /** Every error the page threw: any one fails the journey. */
  readonly pageErrors: Error[] = [];

  constructor(page: Page) {
    this.tab = page;
    this.watch(page);
  }

  /** The tab the player has open now. */
  get page(): Page {
    return this.tab;
  }

  private watch(page: Page): void {
    page.on("pageerror", (error) => {
      this.pageErrors.push(error);
    });
  }

  /** The moment on the page's clock. */
  get now(): number {
    return this.at;
  }

  /**
   * Opens the game at `at` (nine o'clock unless a journey says otherwise) on `save`, or on
   * nothing saved. The stored JSON is returned, so the journey can ask the rules what that save
   * is owed.
   */
  async open(save?: SeedSave, at = NINE_PM): Promise<string | undefined> {
    const json = save === undefined ? undefined : seedJson(save);
    this.at = at;
    const seed = seedScript(
      json === undefined
        ? { kind: "remove" }
        : { kind: "once", guard: "journey-seeded", json },
      SAVE_KEY,
    );
    await this.boot(seed);
    return json;
  }

  /**
   * The tab is killed the way a phone kills it: the renderer crashes, so no pagehide, no
   * visibilitychange and no unload handler runs. Only what the game already saved survives.
   */
  async kill(): Promise<void> {
    const crashed = this.page.waitForEvent("crash");
    const cdp = await this.page.context().newCDPSession(this.page);
    // Page.crash never answers: the renderer is gone before it can.
    void cdp.send("Page.crash").catch(() => undefined);
    await crashed;
    await this.page.close();
  }

  /** Opens the game again in a new tab of the same phone, at the moment on the clock now. */
  async reopen(): Promise<void> {
    this.tab = await this.page.context().newPage();
    this.watch(this.tab);
    await this.boot(undefined);
    // The killed tab's writer lease outlives it; the new tab plays once it holds the seat,
    // and until then it shows the other-tab card.
    await expect(this.page.locator(".other-tab")).toBeHidden();
  }

  /** The clock, the seeded random and the save go in, then the game boots. */
  private async boot(seed: string | undefined): Promise<void> {
    // The clock stands where the journey says and moves only when the journey waits.
    await this.page.clock.install({ time: this.at - TICK_MS });
    await this.page.clock.pauseAt(this.at);
    // The sweep's own seeded stream, put in before any of the game's code runs.
    await this.page.addInitScript({
      content: `Math.random = (${createRng.toString()})(${String(RANDOM_SEED)});`,
    });
    if (seed !== undefined) {
      await this.page.addInitScript(seed);
    }
    await this.page.goto("/");
    await expect(this.page.locator(".board-odo[data-count]")).toBeAttached();
    await expect(this.page.locator(".save-status")).not.toHaveText(
      /^$|Loading/,
    );
  }

  /**
   * The clock jumps `ms` at once, as a phone left on all night does: every due timer, the
   * game's tick among them, runs once at the far end.
   */
  async jump(ms: number): Promise<void> {
    await this.page.clock.fastForward(ms);
    this.at += ms;
  }

  /**
   * Lets `ms` pass on the page's clock. Whole ticks jump a tick at a time: the game's tick and
   * every due timer run once a tick, the frame loop too, which is all the rules see and some
   * thirty times faster than running every frame. Anything shorter runs every timer and frame.
   */
  async wait(ms: number): Promise<void> {
    if (ms % TICK_MS === 0) {
      for (let done = 0; done < ms; done += TICK_MS) {
        await this.page.clock.fastForward(TICK_MS);
      }
    } else {
      await this.page.clock.runFor(ms);
    }
    this.at += ms;
  }

  /** Digs by hand: one tap on the rock window each time. */
  async dig(times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      await this.page.locator(".board-window").tap();
    }
  }

  /**
   * Opens Buys, and lets the drawer settle so the first tap counts. It waits a whole tick, so
   * the player's next tap lands on a tick, where the rows' lamps were last painted: a row
   * judges what is affordable by the board he sees, not by the crew's work since.
   */
  async openBuys(): Promise<void> {
    await this.page.locator(BUYS_KEY).tap();
    await expect(this.page.locator(OPEN_BUYS)).toBeVisible();
    await this.wait(PAST_SETTLE_MS);
  }

  /** Shuts the open Buys drawer by its Back plate. */
  async closeBuys(): Promise<void> {
    await this.page.locator(`${OPEN_BUYS} .board-sheet-back`).tap();
    await expect(this.page.locator(OPEN_BUYS)).toBeHidden();
  }

  /** Taps a tier's row in the open Buys drawer. */
  async buy(tier: ShownTierId): Promise<void> {
    await this.page.locator(`${OPEN_BUYS} .tier[data-tier="${tier}"]`).tap();
  }

  /** The stones in the pocket, exactly, as the odometer carries them. */
  async stones(): Promise<number> {
    return Number(
      await this.page.locator(".board-odo").getAttribute("data-count"),
    );
  }

  /** The odometer settles on `stones`, to a millionth of a stone. */
  async expectStones(stones: number): Promise<void> {
    await expect.poll(() => this.stones()).toBeCloseTo(stones, 6);
  }

  /** The welcome-back card's haul, exactly, once the card is up. */
  async welcomeHaul(): Promise<number> {
    const count = this.page.locator(".welcome-back .welcome-mined-count");
    await expect(this.page.locator(".welcome-back")).toBeVisible();
    return Number(await count.getAttribute("data-count"));
  }

  /**
   * Back to the mountain: the welcome card's plate, once the card has settled (a card, like a
   * drawer, ignores the finger that was already down as it opened).
   */
  async closeWelcome(): Promise<void> {
    await this.wait(PAST_SETTLE_MS);
    await this.page.locator(".welcome-continue").tap();
    await expect(this.page.locator(".welcome-back")).toBeHidden();
  }
}

/**
 * Digs by hand until the rules say a worker is affordable, opens Buys and hires him: the
 * opening every fresh journey shares. Buys is left open.
 */
export async function hireFirstWorker(
  player: Player,
  rules: Expected,
): Promise<void> {
  let taps = 0;
  while (!rules.allows({ kind: "buyTier", id: "helper" }, player.now)) {
    rules.move({ kind: "dig" }, player.now);
    taps += 1;
    expect(taps, "taps to the first worker").toBeLessThan(200);
  }
  await player.dig(taps);
  await player.expectStones(rules.pocket);
  await player.openBuys();
  rules.until(player.now);
  expect(rules.move({ kind: "buyTier", id: "helper" }, player.now)).toBe(true);
  await player.buy("helper");
  await player.expectStones(rules.pocket);
}

/**
 * The journeys' test: a `player` on a phone page, and `otherPhone()` for a second phone with its
 * own storage (a cold open beside a tab left open). Any page error on either fails the journey.
 */
export const test = base.extend<{
  player: Player;
  otherPhone: () => Promise<Player>;
}>({
  player: async ({ page }, use) => {
    const player = new Player(page);
    await use(player);
    expect(player.pageErrors, "page errors").toEqual([]);
  },
  otherPhone: async ({ browser, baseURL }, use) => {
    const phones: { player: Player; context: BrowserContext }[] = [];
    await use(async () => {
      const context = await browser.newContext({
        ...PHONE,
        ...(baseURL === undefined ? {} : { baseURL }),
      });
      const player = new Player(await context.newPage());
      phones.push({ player, context });
      return player;
    });
    for (const { context } of phones) {
      await context.close();
    }
    for (const { player } of phones) {
      expect(player.pageErrors, "page errors on the other phone").toEqual([]);
    }
  },
});

export { expect };
