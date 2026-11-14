/**
 * The one player driver the journeys share (#552). It holds every selector: a journey opens a
 * named save, taps, buys and reads the numbers the player sees, and never reaches into the
 * game. The save, the clock and Math.random are set before the page boots.
 */
import { test as base, expect, type Page } from "@playwright/test";
import { DRAWER_SETTLE_MS } from "../../src/board-interaction.ts";
import type { ShownTierId } from "../../src/tiers.ts";
import { seedJson, type SeedSave } from "../browser/fixtures.ts";
import { SAVE_KEY, seedScript } from "../browser/harness.ts";
import { createRng } from "../sweep/random.ts";
import { TICK_MS } from "./expected.ts";

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
  readonly page: Page;
  /** The page's clock: it stands still between the journey's waits. */
  private at = NINE_PM;
  /** Every error the page threw: any one fails the journey. */
  readonly pageErrors: Error[] = [];

  constructor(page: Page) {
    this.page = page;
    page.on("pageerror", (error) => {
      this.pageErrors.push(error);
    });
  }

  /** The moment on the page's clock. */
  get now(): number {
    return this.at;
  }

  /**
   * Opens the game at nine o'clock on `save`, or on nothing saved. The stored JSON is
   * returned, so the journey can ask the rules what that save is owed.
   */
  async open(save?: SeedSave): Promise<string | undefined> {
    const json = save === undefined ? undefined : seedJson(save);
    // The clock stands at nine and moves only when the journey waits.
    await this.page.clock.install({ time: this.at - TICK_MS });
    await this.page.clock.pauseAt(this.at);
    // The sweep's own seeded stream, put in before any of the game's code runs.
    await this.page.addInitScript({
      content: `Math.random = (${createRng.toString()})(${String(RANDOM_SEED)});`,
    });
    const seed = seedScript(
      json === undefined
        ? { kind: "remove" }
        : { kind: "once", guard: "journey-seeded", json },
      SAVE_KEY,
    );
    if (seed !== undefined) {
      await this.page.addInitScript(seed);
    }
    await this.page.goto("/");
    await expect(this.page.locator(".board-odo[data-count]")).toBeAttached();
    await expect(this.page.locator(".save-status")).not.toHaveText(
      /^$|Loading/,
    );
    return json;
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

/** The journeys' test: a `player` on a phone page, failed by any page error. */
export const test = base.extend<{ player: Player }>({
  player: async ({ page }, use) => {
    const player = new Player(page);
    await use(player);
    expect(player.pageErrors, "page errors").toEqual([]);
  },
});

export { expect };
