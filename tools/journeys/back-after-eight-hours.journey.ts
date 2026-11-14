/**
 * Back after eight hours (#552): the mid-game save, last seen at one in the afternoon, opened
 * at nine. The welcome card shows the haul the rules pay for those eight hours, and the board
 * goes on from there.
 */
import { openMountain } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, HOUR_MS, NINE_PM, test } from "./player.ts";

test("back after eight hours: the welcome card shows the haul the rules pay", async ({
  player,
}) => {
  const json = await player.open({
    ...openMountain(),
    lastSeen: NINE_PM - 8 * HOUR_MS,
  });
  const { expected: rules, report } = Expected.opened(json ?? "", player.now);
  expect(report, "eight hours away is a welcome").toBeDefined();
  expect(report?.awayMs).toBe(8 * HOUR_MS);
  const haul = report?.mined ?? 0;
  expect(haul).toBeGreaterThan(0);

  expect(await player.welcomeHaul()).toBe(haul);
  await player.closeWelcome();
  rules.until(player.now);
  await player.expectStones(rules.pocket);

  // Back at the mountain, the crew digs on at the board's speed.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
