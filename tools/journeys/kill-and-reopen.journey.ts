/**
 * Kill the tab and reopen (#553): a busy fresh mine, its driver freed, then the tab is killed
 * with no unload handler running. The next open is the same moment: the stockpile reads what the game
 * saved, and the rules pay what they pay for the time in between.
 */
import type { Action } from "../../src/economy/actions.ts";
import { asGuest, sliceBusySave } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, NINE_PM, type Player, test } from "./player.ts";

/** Transport stops, so what hoisting lifts stays in the stockpile and it grows every tick. */
const FREE_DRIVER: Action = { kind: "freeWorker", job: "driving", count: 1 };

/**
 * A busy mine open at nine, every stage at work and an order in hand, so no card is up, and
 * its driver freed: the move the kill must keep.
 */
async function busyMine(player: Player): Promise<Expected> {
  const json = await player.open(asGuest(sliceBusySave(NINE_PM)));
  const rules = Expected.opened(json ?? "", player.now).expected;
  expect(await player.cardUp()).toBe(false);
  await player.expectStones(rules.pocket);
  const seen = rules.mountain;
  expect(rules.move(FREE_DRIVER, player.now), "the rules free him").toBe(true);
  await player.act(FREE_DRIVER, seen);
  return rules;
}

test("kill the tab and reopen: the same moment", async ({ player }) => {
  const rules = await busyMine(player);
  const atKill = rules.pocket;
  await player.expectStones(atKill);
  await player.kill();

  await player.reopen();
  const reopened = rules.reopened(player.now).expected;
  expect(reopened.pocket, "the rules reopen the same moment").toBe(atKill);
  expect(reopened.mountain.jobs.driving, "the move survived the kill").toBe(0);
  expect(await player.cardUp()).toBe(false);
  await player.expectStones(atKill);

  // The reopened tab's mine works on as the rules say, and the stockpile grows.
  await player.wait(5 * TICK_MS);
  reopened.until(player.now);
  expect(reopened.pocket).toBeGreaterThan(atKill);
  await player.expectStones(reopened.pocket);
});

test("kill the tab while the mine works: the same moment (#573)", async ({
  player,
}) => {
  const rules = await busyMine(player);
  const before = rules.pocket;

  // A few seconds of the mine at work, no move, then the kill.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  const atKill = rules.pocket;
  expect(atKill, "the mine worked before the kill").toBeGreaterThan(before);
  await player.expectStones(atKill);
  await player.kill();
  await player.reopen();

  // Each tick saved the mine's work, so the reopened tab reads what the frame showed.
  const reopened = rules.reopened(player.now).expected;
  expect(reopened.pocket, "the rules reopen the same moment").toBe(atKill);
  await player.expectStones(atKill);
});
