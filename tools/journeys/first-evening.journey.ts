/**
 * The first evening to the Light Tower's roof (#664, the spec's Proof: a journey for each part).
 * A fresh mine with one worker on drilling: he closes the first evening's card, orders the Light
 * Tower, hires and places his workers, buys machines and horse wagons, and looks in every ten
 * minutes. At each look the stockpile reads what the rules say, from the game's own session,
 * until the roof goes on and the end card comes up.
 */
import { Expected } from "./expected.ts";
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

  while (!rules.mountain.operational.includes("lightTower")) {
    expect(player.now - start, "the roof in time").toBeLessThan(ROOF_WITHIN_MS);
    for (let moves = 0; moves < MOVES_A_LOOK;) {
      const plan = rules.plan();
      if (plan.length === 0) {
        break;
      }
      for (const action of plan) {
        const seen = rules.mountain;
        if (!rules.move(action, player.now)) {
          break;
        }
        await player.act(action, seen);
        moves += 1;
      }
      await player.expectStones(rules.pocket);
    }
    await player.jump(LOOK_MS);
    rules.jumped(player.now);
    if (rules.mountain.operational.includes("lightTower")) {
      break;
    }
    // Ten minutes the game folds in at once are a stretch away: the shift report says so.
    if (await player.cardUp()) {
      expect((await player.card()).title).toBe("Shift report");
      await player.closeCard();
      rules.until(player.now);
    }
    await player.expectStones(rules.pocket);
  }

  // The roof went on in those minutes: the shift report tells it, and the end card is behind.
  expect((await player.card()).title).toBe("Shift report");
  await player.closeCard();
  expect((await player.card()).title).toBe("The Light Tower: operational");
  await player.closeCard();
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
