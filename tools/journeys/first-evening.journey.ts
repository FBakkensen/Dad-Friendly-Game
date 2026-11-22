/**
 * The first evening to the Light Tower's roof (#664, the spec's Proof: a journey for each part).
 * A fresh mine with one worker on drilling: he closes the first evening's card, orders the Light
 * Tower, hires and places his workers, buys machines and horse wagons, and looks in every ten
 * minutes. At each look the stockpile reads what the rules say, from the game's own session,
 * until the roof goes on. In part 2 (#672) the roof opens the refinery: its card comes up behind
 * the report, and the refinery's key is in the site bar.
 */
import { refineryOpens } from "../../src/frame-cards-words.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, test } from "./player.ts";

/** How often he looks in: the clock jumps this far between his looks. */
const LOOK_MS = 10 * 60 * 1000;

/** Moves he makes at one look at most: a plan is a few, and he stops when nothing is left. */
const MOVES_A_LOOK = 60;

/** Long enough that a retune slower than this is a different first evening. */
const ROOF_WITHIN_MS = 24 * 60 * 60 * 1000;

test("the first evening: from one worker to the Light Tower's roof", async ({
  player,
}) => {
  test.setTimeout(300_000);
  await player.open();
  const start = player.now;
  const rules = Expected.fresh(player.now);
  expect(rules.mountain.jobs.drilling).toBe(1);
  expect((await player.card()).title).toBe("The first evening");
  await player.closeCard();
  rules.until(player.now);
  await player.expectStones(rules.pocket);

  let seenDrilling = rules.mountain.jobs.drilling > 0;
  let seenHaulage = false;
  let seenHoisting = false;
  let seenDriving = false;
  let stonesBeforeDriving: number | undefined;
  let stoneRoseFromDriving = false;
  let hiredSecondAfterGain = false;

  const observeOneWorker = () => {
    const m = rules.mountain;
    if (m.owned.helper === 1) {
      if (m.jobs.drilling > 0) seenDrilling = true;
      if (seenDrilling && m.jobs.haulage > 0) seenHaulage = true;
      if (seenHaulage && m.jobs.hoisting > 0) seenHoisting = true;
      if (seenHoisting && m.jobs.driving > 0) {
        if (!seenDriving) {
          seenDriving = true;
          stonesBeforeDriving = m.stock.stones;
        }
        if (
          stonesBeforeDriving !== undefined &&
          m.stock.stones > stonesBeforeDriving
        ) {
          stoneRoseFromDriving = true;
        }
      }
    } else if (m.owned.helper >= 2 && stoneRoseFromDriving) {
      hiredSecondAfterGain = true;
    }
  };

  while (!rules.mountain.operational.includes("lightTower")) {
    expect(player.now - start, "the roof in time").toBeLessThan(ROOF_WITHIN_MS);
    for (let moves = 0; moves < MOVES_A_LOOK;) {
      const plan = rules.plan();
      if (plan.length === 0) {
        break;
      }
      // A plan's later moves may no longer pay once its first ones are made; its first may not.
      let taken = 0;
      for (const action of plan) {
        const seen = rules.mountain;
        if (!rules.move(action, player.now)) {
          break;
        }
        await player.act(action, seen);
        taken += 1;
        observeOneWorker();
      }
      expect(taken, `the rules take ${plan[0]?.kind ?? ""}`).toBeGreaterThan(0);
      moves += taken;
      await player.expectStones(rules.pocket);
    }
    await player.jump(LOOK_MS);
    const report = rules.jumped(player.now);
    observeOneWorker();
    if (rules.mountain.operational.includes("lightTower")) {
      break;
    }
    // Ten minutes the game folds in at once are a stretch away: where anything happened in it,
    // the shift report says so, and where nothing did, no card comes up.
    if (report?.night === undefined) {
      // A tick past the jump, so a card that came up has painted.
      await player.wait(TICK_MS);
      rules.until(player.now);
      observeOneWorker();
      expect(await player.cardUp(), "no shift report on a quiet stretch").toBe(
        false,
      );
    } else {
      expect((await player.card()).title).toBe("Shift report");
      await player.closeCard();
      rules.until(player.now);
      observeOneWorker();
    }
    await player.expectStones(rules.pocket);
  }

  expect(seenDrilling, "Worker #1 drilled first").toBe(true);
  expect(seenHaulage, "Worker #1 moved to haulage").toBe(true);
  expect(seenHoisting, "Worker #1 moved to hoisting").toBe(true);
  expect(seenDriving, "Worker #1 moved to driving").toBe(true);
  expect(
    stoneRoseFromDriving,
    "Stone rose from driving (pitToStockyardStones)",
  ).toBe(true);
  expect(hiredSecondAfterGain, "Worker #2 was hired after stone gain").toBe(
    true,
  );

  // The roof went on in those minutes: the shift report tells it, and the refinery's card is behind.
  expect((await player.card()).title).toBe("Shift report");
  await player.closeCard();
  const opens = refineryOpens();
  const behind = await player.card();
  expect(behind.title).toBe(opens.title);
  expect(behind.lines).toEqual(opens.paragraphs);
  await player.closeCard();
  await expect(
    player.page.locator('.frame-site[data-site="refinery"]'),
  ).toBeVisible();
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
