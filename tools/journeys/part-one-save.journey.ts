/**
 * A save from part 1 when part 2 is switched on (#672): the Light Tower operational, nothing
 * ordered, no kiln, and more stone than the stockyard's room, last seen twelve hours ago. The
 * full stockyard stood the mine all night, so nothing happened and no report comes up: the
 * session greets with the refinery's card, its tab is in the site bar, and the stockpile reads what the rules say, full.
 * The full stockyard stands the mine until he spends the stone, so a night later nothing has
 * happened: the rules bring no report, and no card comes up.
 */
import { refineryOpens } from "../../src/frame-cards-words.ts";
import { asGuest, slicePartOneDoneSave } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, HOUR_MS, test } from "./player.ts";

test("a part 1 save opens the refinery, and stands at the full stockyard", async ({
  player,
}) => {
  const json = await player.open(
    asGuest(slicePartOneDoneSave(player.now - 12 * HOUR_MS)),
  );
  const { expected: rules, report } = Expected.opened(json ?? "", player.now);
  expect(report?.night, "a night where nothing happened").toBeUndefined();
  const opens = refineryOpens();
  const card = await player.card();
  expect(card.title).toBe(opens.title);
  expect(card.lines).toEqual(opens.paragraphs);
  await player.closeCard();
  await expect(
    player.page.locator('.frame-site[data-site="refinery"]'),
  ).toBeVisible();
  rules.until(player.now);
  await player.expectStones(rules.pocket);

  expect(await player.pile("stones")).toMatchObject({ room: "full" });

  await player.jump(8 * HOUR_MS);
  const later = rules.jumped(player.now);
  expect(later?.night, "a night where nothing happened").toBeUndefined();
  await player.wait(TICK_MS);
  rules.until(player.now);
  expect(await player.cardUp(), "no shift report").toBe(false);
  await player.expectStones(rules.pocket);

  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
