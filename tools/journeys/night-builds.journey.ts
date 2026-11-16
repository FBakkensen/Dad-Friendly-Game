/**
 * A night that builds (#672, the spec's Proof: a journey for part 2). The Warehouse's roof is
 * a thousand brick short and he closed the game twelve hours ago. The night delivers the brick
 * and the builders build the roof in: the shift report says so as the rules do, the end card
 * comes up behind it, and the order strip reads the Warehouse operational. The stockpile then
 * goes on as the rules say.
 */
import { endCard } from "../../src/frame-cards-words.ts";
import { orderStrip } from "../../src/frame-view.ts";
import { shiftReport } from "../../src/shift-report-view.ts";
import { asGuest, sliceWarehouseRoofSave } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, test } from "./player.ts";

test("a night that builds: the Warehouse's roof, then the end card", async ({
  player,
}) => {
  const json = await player.open(asGuest(sliceWarehouseRoofSave(player.now)));
  const { expected: rules, report } = Expected.opened(json ?? "", player.now);
  const night = report?.night;
  if (report === undefined || night === undefined) {
    throw new Error("twelve hours away is a night");
  }
  expect(rules.mountain.operational).toContain("warehouse");
  const words = shiftReport({ ...report, night });

  const card = await player.card();
  expect(card.title).toBe(words.title);
  expect(card.lines).toEqual([words.head, ...words.lines]);
  await player.closeCard();

  const end = endCard("warehouse");
  const behind = await player.card();
  expect(behind.title).toBe(end.title);
  expect(behind.lines).toEqual(end.paragraphs);
  await player.closeCard();
  rules.until(player.now);
  await player.expectStones(rules.pocket);
  const strip = orderStrip(rules.mountain);
  if (strip.kind !== "planning") {
    throw new Error("the Warehouse's roof is the end of the city's orders");
  }
  await expect(player.page.locator(".frame-order-line")).toHaveText(strip.line);

  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
