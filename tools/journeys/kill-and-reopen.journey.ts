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

test("kill the tab while the crew digs: their work since the last move is paid as time away", async ({
  player,
}) => {
  await player.open();
  const rules = Expected.fresh(player.now);
  await hireFirstWorker(player, rules);

  // A few seconds of the crew at work, no move, then the kill.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
  await player.kill();
  await player.reopen();

  // Known gap (#573): the game saves on moves, not ticks, so those seconds come back at the
  // away rate. The board reads exactly what the rules pay for that, no more and no less.
  const reopened = rules.reopened(player.now).expected;
  expect(reopened.pocket).toBeLessThan(rules.pocket);
  await player.expectStones(reopened.pocket);
});
