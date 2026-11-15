/**
 * The tab left open all night (#553): a busy fresh mine open at nine, the phone left on while
 * the clock jumps eight hours. Nothing stalls, and the stockpile reads what a cold open of the
 * same save after the same eight hours reads, on another phone.
 */
import { asGuest, sliceBusySave } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, HOUR_MS, NINE_PM, test } from "./player.ts";

test("the tab left open all night pays what a cold reopen pays", async ({
  player,
  otherPhone,
}) => {
  const save = asGuest(sliceBusySave(NINE_PM));
  const json = await player.open(save);
  if (json === undefined) {
    throw new Error("The all-night save was not stored");
  }
  const morning = NINE_PM + 8 * HOUR_MS;
  const { expected: rules, report } = Expected.opened(json, morning);
  expect(report?.awayMs).toBe(8 * HOUR_MS);

  // The phone stays on all night, the game open.
  await player.jump(8 * HOUR_MS);
  if (await player.cardUp()) {
    await player.closeCard();
  }
  rules.until(player.now);
  await player.expectStones(rules.pocket);

  // A cold open of the same save, after the same eight hours, on another phone.
  const cold = await otherPhone();
  await cold.open(save, morning);
  expect((await cold.card()).title).toBe("Shift report");
  await cold.closeCard();
  const coldRules = Expected.opened(json, morning).expected;
  coldRules.until(cold.now);
  await cold.expectStones(coldRules.pocket);

  // Nothing stalled: the open tab's mine works on as the rules say.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
