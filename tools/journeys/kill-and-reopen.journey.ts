/**
 * Kill the tab and reopen (#553): a busy fresh mine, its driver freed, then the tab is killed
 * with no unload handler running. The next open is the same moment: the stockpile reads what the game
 * saved, and the rules pay what they pay for the time in between.
 */
import type { Action } from "../../src/economy/actions.ts";
import { asGuest, sliceBusySave } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, NINE_PM, type Player, test } from "./player.ts";

/** Put the city order on hold so hauled pithead stone stays in the stockpile and grows with each load. */
const HOLD_ORDER: Action = { kind: "holdOrder" };

/** Long enough for rock to be drilled, hauled, lifted and driven into the stockpile. */
const FIRST_LOAD_WITHIN_MS = 2 * 60 * 1000;

/**
 * The mine works a tick at a time until the rules' stockpile has grown past `stones`: since
 * part 3 (#682) stone comes up in cage loads, so it stands between them and then jumps.
 */
async function untilALoad(
  player: Player,
  rules: Expected,
  stones: number,
): Promise<void> {
  const start = player.now;
  while (rules.pocket <= stones) {
    expect(player.now - start, "a load comes up").toBeLessThan(
      FIRST_LOAD_WITHIN_MS,
    );
    await player.wait(TICK_MS);
    rules.until(player.now);
  }
}

/**
 * A busy mine open at nine, every stage at work and an order in hand, so no card is up, and
 * its city order put on hold: the move the kill must keep.
 */
async function busyMine(player: Player): Promise<Expected> {
  const json = await player.open(asGuest(sliceBusySave(NINE_PM)));
  const rules = Expected.opened(json ?? "", player.now).expected;
  expect(await player.cardUp()).toBe(false);
  await player.expectStones(rules.pocket);
  const seen = rules.mountain;
  expect(rules.move(HOLD_ORDER, player.now), "the rules hold the order").toBe(
    true,
  );
  await player.act(HOLD_ORDER, seen);
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
  expect(reopened.mountain.project.kind, "the move survived the kill").toBe(
    "onHold",
  );
  expect(await player.cardUp()).toBe(false);
  await player.expectStones(atKill);

  // The reopened tab's mine works on as the rules say, and the stockpile grows.
  await untilALoad(player, reopened, atKill);
  expect(reopened.pocket).toBeGreaterThan(atKill);
  await player.expectStones(reopened.pocket);
});

test("kill the tab while the mine works: the same moment (#573)", async ({
  player,
}) => {
  const rules = await busyMine(player);
  const before = rules.pocket;

  // The mine at work until a load comes up, no move, then the kill.
  await untilALoad(player, rules, before);
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
