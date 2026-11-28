/**
 * Slice 2 Part 2 end-to-end journey (#780):
 * 1. A v11 Part 1 save already past The Foundry's roof (carrying legacy `levels.boots = 1`)
 *    opens in normal play with Factory open, no old upgrade rows in Workforce, and Crystal Caves
 *    ready to sink. Sinking opens the 3rd level (`The Crystal Caves: reached`), 4-cell Hoisting
 *    strip, Glassworks, and Precision Assembly.
 * 2. In a Part 2 mine with The Research Lab operational, Research honors installed upgrades,
 *    cancelling an active delivering project refunds 100% of arrived goods to the stockpile, and
 *    starting a new project enters delivering state cleanly.
 */
import type { Action } from "../../src/economy/actions.ts";
import { CRYSTAL_REACHED } from "../../src/frame-cards-words.ts";
import {
  asGuest,
  slice2Part2CrystalUnsunkSave,
  slice2Part2Save,
} from "../browser/fixtures.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, type Player, test } from "./player.ts";

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

test("Slice 2 Part 2: Crystal Caves sink, 3-level hoisting, Factory, and no old upgrade rows", async ({
  player,
}) => {
  const json = await player.open(
    asGuest(slice2Part2CrystalUnsunkSave(player.now)),
  );
  const rules = Expected.opened(json ?? "", player.now).expected;
  expect(await player.cardUp()).toBe(false);
  await player.expectStones(rules.pocket);

  // Workforce sheet shows no old instant-buy upgrade rows.
  await player.page.locator(".frame-workers").tap();
  const workforce = player.page.locator('.frame-sheet[aria-label="Workforce"]');
  await expect(workforce).toBeVisible();
  await expect(workforce.locator("[data-upgrade]")).toHaveCount(0);
  await workforce.locator(".frame-sheet-close").tap();

  // Factory tab is open behind the Foundry's roof.
  await player.site("factory");
  await expect(
    player.page.locator('.factory-plate[data-maker="partsPress"]'),
  ).toBeVisible();

  // Sink Crystal Caves in normal play: arrival card, then 3 levels + 4-cell hoisting strip.
  await make(player, rules, { kind: "sinkShaft", level: "crystal" });
  expect(rules.mountain.mineLevels.crystal).toBeDefined();
  const card = await player.card();
  expect(card.title).toBe(CRYSTAL_REACHED.title);
  expect(card.lines).toEqual(CRYSTAL_REACHED.paragraphs);
  await player.closeCard();
  rules.until(player.now);

  await expect(player.page.locator(".mine-level-rows")).toHaveCount(3);
  await expect(player.page.locator(".mine-strip-cell")).toHaveCount(4);

  for (const action of [
    { kind: "placeWorker", job: "crystalDrilling", count: 1 },
    { kind: "placeWorker", job: "crystalHaulage", count: 1 },
    { kind: "assignHoist", level: "crystal", count: 1 },
  ] as const) {
    await make(player, rules, action);
  }
  await expect(
    player.page.locator(
      '.mine-strip-cell[data-place="crystal"] .mine-strip-count',
    ),
  ).toHaveText(/^1\s*hoist$/);

  // Refinery now shows Glassworks and Factory now shows Precision Assembly.
  await player.site("refinery");
  await expect(
    player.page.locator('.refinery-plate[data-maker="glassworks"]'),
  ).toBeVisible();
  await player.site("factory");
  await expect(
    player.page.locator('.factory-plate[data-maker="precisionAssembly"]'),
  ).toBeVisible();

  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});

test("Slice 2 Part 2: Research Lab honors installed work, lossless cancel refund, and starting a project", async ({
  player,
}) => {
  const json = await player.open(asGuest(slice2Part2Save(player.now)));
  const rules = Expected.opened(json ?? "", player.now).expected;
  expect(await player.cardUp()).toBe(false);
  await player.expectStones(rules.pocket);

  // Open Research sheet from City's Research Lab door.
  await player.site("city");
  await expect(player.page.locator(".city-tag")).toHaveCount(4);
  await player.page.locator(".city-research-door").tap();
  await expect(player.page.locator(".research-sheet")).toBeVisible();
  await expect(
    player.page.locator(
      '.research-card[data-research="workBoots"][data-status="done"]',
    ),
  ).toBeVisible();
  await expect(
    player.page.locator(
      '.research-card[data-research="heavyCouplings"][data-status="delivering"]',
    ),
  ).toBeVisible();
  await player.page.locator(".research-sheet .frame-sheet-close").tap();

  // Cancel active delivering project: 100% lossless refund of arrived parts + glass.
  const partsBefore = rules.mountain.stock.parts;
  const arrivedParts = rules.mountain.research.active?.arrived.parts ?? 0;
  expect(arrivedParts).toBeGreaterThan(0);
  await make(player, rules, { kind: "cancelResearch" });
  expect(rules.mountain.research.active).toBeUndefined();
  expect(rules.mountain.stock.parts).toBe(partsBefore + arrivedParts);

  // Start a new project: enters delivering state cleanly.
  await make(player, rules, { kind: "startResearch", id: "ironRails" });
  expect(rules.mountain.research.active?.id).toBe("ironRails");
  await player.page.locator(".city-research-door").tap();
  await expect(
    player.page.locator(
      '.research-card[data-research="ironRails"][data-status="delivering"]',
    ),
  ).toBeVisible();
  await player.page.locator(".research-sheet .frame-sheet-close").tap();

  await player.wait(5 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
