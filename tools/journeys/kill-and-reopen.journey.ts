/**
 * Kill the tab and reopen (#553): digs and a buy, then the tab is killed with no unload handler
 * running. The next open is the same moment: the board reads what the game saved, and the rules
 * pay what they pay for the time in between.
 */
import { Expected, TICK_MS } from "./expected.ts";
import { expect, test } from "./player.ts";

test("kill the tab and reopen: the same moment", async ({ player }) => {
  await player.open();
  const rules = Expected.fresh(player.now);

  // Dig to the first worker, hire him, and dig once more.
  let taps = 0;
  while (!rules.allows({ kind: "buyTier", id: "helper" }, player.now)) {
    rules.move({ kind: "dig" }, player.now);
    taps += 1;
    expect(taps, "taps to the first worker").toBeLessThan(200);
  }
  await player.dig(taps);
  await player.openBuys();
  rules.until(player.now);
  expect(rules.move({ kind: "buyTier", id: "helper" }, player.now)).toBe(true);
  await player.buy("helper");
  await player.closeBuys();
  expect(rules.move({ kind: "dig" }, player.now)).toBe(true);
  await player.dig(1);
  await player.expectStones(rules.pocket);

  // The phone kills the tab the moment after the tap, and he opens the game again.
  const atKill = rules.pocket;
  await player.kill();
  await player.reopen();
  const reopened = rules.reopened(player.now).expected;
  expect(reopened.pocket, "the same moment").toBe(atKill);
  await player.expectStones(atKill);
  expect(reopened.mountain.helpers).toBe(1);

  // The reopened tab plays on.
  await player.wait(5 * TICK_MS);
  reopened.until(player.now);
  await player.expectStones(reopened.pocket);
});

test("kill the tab while the crew digs: their work since the last move is paid as time away", async ({
  player,
}) => {
  await player.open();
  const rules = Expected.fresh(player.now);
  let taps = 0;
  while (!rules.allows({ kind: "buyTier", id: "helper" }, player.now)) {
    rules.move({ kind: "dig" }, player.now);
    taps += 1;
    expect(taps, "taps to the first worker").toBeLessThan(200);
  }
  await player.dig(taps);
  await player.openBuys();
  rules.until(player.now);
  expect(rules.move({ kind: "buyTier", id: "helper" }, player.now)).toBe(true);
  await player.buy("helper");

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
