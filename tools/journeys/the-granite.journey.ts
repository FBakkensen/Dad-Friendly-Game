/**
 * The shaft and the Granite (#682, the spec's Proof: a journey for part 3). The Light Tower and
 * the Warehouse are up and the stockyard holds the shaft's price. He sinks the shaft: the
 * Granite's card comes up. He moves his two free workers onto the Granite's drilling and
 * haulage, and assigns a hoist to the Granite. At each step, and as the mine works on until
 * the Granite is drilled, the stockpile and the jobs read what the rules say. The Foundry's roof is the night-builds
 * journey's.
 */
import type { Action } from "../../src/economy/actions.ts";
import { LEVEL_REACHED } from "../../src/frame-cards-words.ts";
import { asGuest, sliceGraniteUnsunkSave } from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, type Player, test } from "./player.ts";

/** The moves, in his order: sink, a worker on each of the Granite's jobs, a hoist there. */
const MOVES: readonly Action[] = [
  { kind: "placeWorker", job: "graniteDrilling", count: 1 },
  { kind: "placeWorker", job: "graniteHaulage", count: 1 },
  { kind: "assignHoist", level: "granite", count: 1 },
];

/** Long enough for the Granite's first rock to be drilled. */
const GRANITE_ROCK_WITHIN_MS = 5 * 60 * 1000;

/** Makes `action` on the rules and on the page, as he sees the board. */
async function make(
  player: Player,
  rules: Expected,
  action: Action,
): Promise<void> {
  const seen = rules.mountain;
  expect(rules.move(action, player.now), `the rules take ${action.kind}`).toBe(
    true,
  );
  await player.act(action, seen);
  await player.expectStones(rules.pocket);
}

test("the shaft: workers on the Granite, a hoist assigned, and the mine works on", async ({
  player,
}) => {
  test.setTimeout(180_000);
  const json = await player.open(asGuest(sliceGraniteUnsunkSave(player.now)));
  const rules = Expected.opened(json ?? "", player.now).expected;
  expect(await player.cardUp()).toBe(false);
  await player.expectStones(rules.pocket);

  await make(player, rules, { kind: "sinkShaft" });
  expect(rules.mountain.mineLevels.granite).toBeDefined();
  const card = await player.card();
  expect(card.title).toBe(LEVEL_REACHED.title);
  expect(card.lines).toEqual(LEVEL_REACHED.paragraphs);
  await player.closeCard();
  rules.until(player.now);

  for (const action of MOVES) {
    await make(player, rules, action);
  }
  expect(rules.mountain.jobs.graniteDrilling).toBe(1);
  expect(rules.mountain.jobs.graniteHaulage).toBe(1);
  expect(rules.mountain.cages.assigned.granite).toBe(1);
  await expect(
    player.page.locator(
      '.mine-strip-cell[data-place="granite"] .mine-strip-count',
    ),
  ).toHaveText(/^1\s*hoist$/);

  // The mine works on as the rules say, the stockpile with it, until the Granite is drilled.
  const start = player.now;
  const dugAtStart = rules.mountain.graniteDug;
  while (rules.mountain.graniteDug === dugAtStart) {
    expect(player.now - start, "the Granite is drilled").toBeLessThan(
      GRANITE_ROCK_WITHIN_MS,
    );
    await player.wait(10 * TICK_MS);
    rules.until(player.now);
    await player.expectStones(rules.pocket);
  }
  expect(await player.cardUp()).toBe(false);
});
