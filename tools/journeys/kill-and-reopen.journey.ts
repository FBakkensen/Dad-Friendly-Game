/**
 * Kill the tab and reopen (#553): moves on the frame, then the tab is killed with no unload
 * handler running. The next open is the same moment: the stockpile reads what the game saved,
 * and the rules pay what they pay for the time in between.
 */
import { Expected, TICK_MS } from "./expected.ts";
import { expect, type Player, test } from "./player.ts";

/** The first look of a fresh mine: the card closed, then what the rules would do, made. */
async function firstMoves(player: Player, rules: Expected): Promise<void> {
  await player.closeCard();
  rules.until(player.now);
  for (const action of rules.plan()) {
    const seen = rules.mountain;
    expect(rules.move(action, player.now)).toBe(true);
    await player.act(action, seen);
  }
  await player.expectStones(rules.pocket);
}

test("kill the tab and reopen: the same moment", async ({ player }) => {
  await player.open();
  const rules = Expected.fresh(player.now);
  await firstMoves(player, rules);
  const atKill = rules.pocket;
  await player.kill();

  await player.reopen();
  const reopened = rules.reopened(player.now).expected;
  expect(reopened.pocket, "the rules reopen the same moment").toBe(atKill);
  // The Light Tower is on order, so the new session opens on the frame, with no card.
  expect(await player.cardUp()).toBe(false);
  await player.expectStones(reopened.pocket);

  // The move survived the kill: the reopened tab's mine works on as the rules say.
  await player.wait(5 * TICK_MS);
  reopened.until(player.now);
  await player.expectStones(reopened.pocket);
});

test("kill the tab while the mine works: the same moment (#573)", async ({
  player,
}) => {
  await player.open();
  const rules = Expected.fresh(player.now);
  await firstMoves(player, rules);

  // A few seconds of the mine at work, no move, then the kill.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  const atKill = rules.pocket;
  await player.expectStones(atKill);
  await player.kill();
  await player.reopen();

  // Each tick saved the mine's work, so the reopened tab reads what the frame showed.
  const reopened = rules.reopened(player.now).expected;
  expect(reopened.pocket, "the rules reopen the same moment").toBe(atKill);
  await player.expectStones(atKill);
});
