/**
 * A night that fills the stockyard (#672, the spec's Proof: a journey for part 2). The refinery
 * runs a kiln, the stockyard is nearly full and nothing is ordered; he closed the game twelve
 * hours ago. The shift report says what the rules say of that night: what each good made, when
 * each stockpile filled, and that the full stockyard stopped production. "To the stockyard"
 * takes him to the refinery, the top row reads both stockpiles full, and the mine goes on from
 * there as the rules say.
 */
import { stockpiles } from "../../src/frame-view.ts";
import { shiftReport } from "../../src/shift-report-view.ts";
import { asGuest, sliceYardFullSave } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, test } from "./player.ts";

test("a night that fills the stockyard: the report, then the refinery", async ({
  player,
}) => {
  const json = await player.open(asGuest(sliceYardFullSave(player.now)));
  const { expected: rules, report } = Expected.opened(json ?? "", player.now);
  const night = report?.night;
  if (report === undefined || night === undefined) {
    throw new Error("twelve hours away is a night");
  }
  expect(night.stop, "the stockyard stopped the night").toBe("stockyard");
  const words = shiftReport({ ...report, night });
  expect(words.toStockyard).toBe(true);
  expect(words.marks.length, "a mark for each stockpile").toBe(2);

  const card = await player.card();
  expect(card.title).toBe(words.title);
  expect(card.lines).toEqual([words.head, ...words.lines]);
  expect(card.marks).toEqual(words.marks);
  expect(card.key).toBe(words.key);

  await player.toStockyard();
  rules.until(player.now);
  const piles = stockpiles(rules.mountain);
  expect(piles.map((pile) => pile.full)).toEqual([true, true]);
  for (const pile of piles) {
    expect(await player.pile(pile.good)).toEqual({
      text: pile.text,
      room: "full",
    });
  }
  await player.expectStones(rules.pocket);

  // Back at the frame, the mine goes on as the rules say.
  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
