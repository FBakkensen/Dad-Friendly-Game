/**
 * Kill the tab and reopen (#553): digs and a buy, then the tab is killed with no unload handler
 * running. The next open is the same moment: the board reads what the game saved, and the rules
 * pay what they pay for the time in between.
 */
import { Expected, TICK_MS } from "./expected.ts";
import { expect, hireFirstWorker, test } from "./player.ts";

test("kill the tab and reopen: the same moment", async ({ player }) => {
  await player.open();
  const rules = Expected.fresh(player.now);

  // Digs and the first worker, then the phone kills the tab the moment after the buy.
  await hireFirstWorker(player, rules);
  const atKill = rules.pocket;
  await player.kill();

  await player.reopen();
  const reopened = rules.reopened(player.now).expected;
  expect(reopened.pocket, "the rules reopen the same moment").toBe(atKill);
  await player.expectStones(atKill);

  // The worker survived the kill: the reopened tab's crew digs on at his speed.
  await player.wait(5 * TICK_MS);
  reopened.until(player.now);
  expect(reopened.pocket).toBeGreaterThan(atKill);
  await player.expectStones(reopened.pocket);
});

test("kill the tab while the crew digs: the same moment (#573)", async ({
  player,
}) => {
  await player.open();
  const rules = Expected.fresh(player.now);
  await hireFirstWorker(player, rules);

  // A few seconds of the crew at work, no move, then the kill.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  const atKill = rules.pocket;
  await player.expectStones(atKill);
  await player.kill();
  await player.reopen();

  // Each tick saved the crew's work, so the reopened tab reads what the board showed.
  const reopened = rules.reopened(player.now).expected;
  expect(reopened.pocket, "the rules reopen the same moment").toBe(atKill);
  await player.expectStones(atKill);
});
