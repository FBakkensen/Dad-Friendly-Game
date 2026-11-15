/**
 * Back after eight hours (#552): a busy fresh mine, last seen at one in the afternoon, opened
 * at nine. The shift report comes up, and once it is closed the stockpile reads what the rules
 * pay for those eight hours, and the mine goes on from there.
 */
import { asGuest, sliceBusySave } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, HOUR_MS, NINE_PM, test } from "./player.ts";

test("back after eight hours: the shift report, then what the rules pay", async ({
  player,
}) => {
  const json = await player.open(asGuest(sliceBusySave(NINE_PM - 8 * HOUR_MS)));
  const { expected: rules, report } = Expected.opened(json ?? "", player.now);
  expect(report, "eight hours away is a report").toBeDefined();
  expect(report?.awayMs).toBe(8 * HOUR_MS);

  expect((await player.card()).title).toBe("Shift report");
  await player.closeCard();
  rules.until(player.now);
  await player.expectStones(rules.pocket);

  // Back at the frame, the mine works on as the rules say.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
