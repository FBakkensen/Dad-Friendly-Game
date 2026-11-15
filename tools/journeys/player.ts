/**
 * The one player driver the journeys share (#552). It holds every selector: a journey opens a
 * named save, taps, buys and reads the numbers the player sees, and never reaches into the
 * game. The save, the clock and Math.random are set before the page boots. Since part 1 was
 * switched on (#664) it plays the frame: the mine and the city, their keys and the workers'
 * − and +, and the cards.
 */
import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { DRAWER_SETTLE_MS } from "../../src/board-interaction.ts";
import type { Action } from "../../src/economy/actions.ts";
import type { Mountain } from "../../src/mountain.ts";
import { machineKeys } from "../../src/mine-view.ts";
import { seedJson, type SeedSave } from "../browser/fixtures.ts";
import { SAVE_KEY, seedScript } from "../browser/harness.ts";
import { createRng } from "../sweep/random.ts";
import { TICK_MS } from "./expected.ts";
import { PHONE } from "./phone.ts";

/** 9 pm on a weekday: the kids are asleep. Every journey's clock starts here. */
export const NINE_PM = Date.UTC(2026, 10, 16, 21, 0, 0);

export const HOUR_MS = 60 * 60 * 1000;

/** The seed of the page's Math.random, so a wobble lands the same every run. */
const RANDOM_SEED = 552;

/** The whole ticks a drawer or a card takes to settle, so the next tap counts. */
const PAST_SETTLE_MS = Math.ceil((DRAWER_SETTLE_MS + 1) / TICK_MS) * TICK_MS;

/** The card over the frame: the first evening, the shift report, the end card. */
const CARD = ".frame-card:not([hidden])";

/** The jobs on the mine's stage rows; driving and building are on the city's plates. */
const MINE_JOBS: readonly string[] = ["drilling", "haulage", "hoisting"];

type Site = "mine" | "city";

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
    await expect(
      this.page.locator(".frame-pile-count[data-count]"),
    ).toBeAttached();
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

  /** The site the frame shows: a tap on its key in the site bar. */
  async site(site: Site): Promise<void> {
    const key = this.page.locator(`.frame-site[data-site="${site}"]`);
    if ((await key.getAttribute("aria-current")) !== "page") {
      await key.tap();
    }
    await expect(
      this.page.locator(`.frame-scene[data-site="${site}"]`),
    ).toBeAttached();
  }

  /** The visible match of `selector`, tapped once. */
  private async tapShown(selector: string): Promise<void> {
    await this.page.locator(selector).filter({ visible: true }).first().tap();
  }

  /**
   * Makes the move the way a dad does, on the frame: the hire key, a stage's machine key in the
   * mine, a job's − or + on its stage row or the city's plates, the city's order key and its
   * vehicle key. `mountain` is the one he sees as he taps.
   */
  async act(action: Action, mountain: Mountain): Promise<void> {
    switch (action.kind) {
      case "buyTier": {
        if (action.id === "helper") {
          await this.tapShown(".frame-hire");
          return;
        }
        const key = machineKeys(mountain, "one").find(
          (each) => each.id === action.id,
        );
        if (key === undefined) {
          throw new Error(`No key in the mine buys a ${action.id}`);
        }
        await this.site("mine");
        await this.tapShown(`.mine-key[data-stage="${key.stage}"]`);
        return;
      }
      case "placeWorker":
      case "freeWorker": {
        const way = action.kind === "placeWorker" ? "place" : "free";
        await this.site(MINE_JOBS.includes(action.job) ? "mine" : "city");
        await this.tapShown(
          `.frame-scene .frame-step[data-job="${action.job}"][data-way="${way}"]`,
        );
        return;
      }
      case "placeOrder":
      case "holdOrder":
      case "resumeOrder":
        await this.site("city");
        await this.tapShown(".city-order");
        return;
      case "buyVehicle":
        await this.site("city");
        await this.tapShown(`.city-key[data-vehicle="${action.id}"]`);
        return;
      default:
        throw new Error(`The frame has no key for ${action.kind}`);
    }
  }

  /** The stones in the stockpile, exactly, as the frame carries them. */
  async stones(): Promise<number> {
    return Number(
      await this.page.locator(".frame-pile-count").getAttribute("data-count"),
    );
  }

  /** The stockpile reads `stones`, to a millionth of a stone. */
  async expectStones(stones: number): Promise<void> {
    await expect.poll(() => this.stones()).toBeCloseTo(stones, 6);
  }

  /** The card over the frame, once it is up: its key's words and its title. */
  async card(): Promise<{
    title: string;
    key: string;
    lines: readonly string[];
  }> {
    const card = this.page.locator(CARD);
    await expect(card).toBeVisible();
    return {
      title: (await card.locator(".frame-card-title").textContent()) ?? "",
      key: (await card.locator(".frame-card-key").textContent()) ?? "",
      lines: await card.locator(".frame-card-line").allTextContents(),
    };
  }

  /**
   * Closes the card by its key, once it has settled (a card ignores the finger that was
   * already down as it opened). A card behind it, the end card behind the report of its
   * night, comes up in its place.
   */
  async closeCard(): Promise<void> {
    const card = this.page.locator(CARD);
    await expect(card).toBeVisible();
    const shown = await card.getAttribute("data-card");
    await this.wait(PAST_SETTLE_MS);
    await card.locator(".frame-card-key").tap();
    await expect(
      this.page.locator(
        `.frame-card[data-card="${shown ?? ""}"]:not([hidden])`,
      ),
    ).toBeHidden();
  }

  /** Whether a card is up over the frame now. */
  async cardUp(): Promise<boolean> {
    return this.page.locator(CARD).isVisible();
  }
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
