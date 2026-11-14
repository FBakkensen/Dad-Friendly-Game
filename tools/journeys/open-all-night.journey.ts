/**
 * The tab left open all night (#553): the mid-game save open at nine, the phone left on while
 * the clock jumps eight hours. Nothing stalls, and the board pays what a cold open of the same
 * save after the same eight hours pays, on another phone.
 */
import { openMountain } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, HOUR_MS, NINE_PM, test } from "./player.ts";

test("the tab left open all night pays what a cold reopen pays", async ({
  player,
  otherPhone,
}) => {
  const save = { ...openMountain(), lastSeen: NINE_PM };
  const json = await player.open(save);
  if (json === undefined) {
    throw new Error("The all-night save was not stored");
  }
  const morning = NINE_PM + 8 * HOUR_MS;
  const { expected: rules, report } = Expected.opened(json, morning);
  expect(report?.awayMs).toBe(8 * HOUR_MS);

  // The phone stays on all night, the game open.
  await player.jump(8 * HOUR_MS);
  await player.expectStones(rules.pocket);

  // A cold open of the same save, after the same eight hours, on another phone.
  const cold = await otherPhone();
  await cold.open(save, morning);
  expect(await cold.welcomeHaul()).toBe(report?.mined);
  await cold.closeWelcome();
  // Both phones read what the rules say: the cold one a settle's tick later.
  const coldRules = Expected.opened(json, morning).expected;
  coldRules.until(cold.now);
  await cold.expectStones(coldRules.pocket);
  await player.expectStones(rules.pocket);

  // Nothing stalled: the open tab's crew digs on at the board's speed.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
