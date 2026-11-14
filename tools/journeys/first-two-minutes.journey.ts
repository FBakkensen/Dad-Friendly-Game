/**
 * The first two minutes (#552): a fresh mountain, taps, the first worker, the first cart. At
 * each step the board reads what the rules say it should, from the game's own session.
 */
import { READY_HOLD_MS } from "../../src/board-interaction.ts";
import { Expected, TICK_MS } from "./expected.ts";
import { expect, test } from "./player.ts";

/** Workers he hires before saving for the cart: enough to have it inside about two minutes. */
const WORKERS = 10;

/** A buy holds its row for READY_HOLD_MS, so the next buy waits whole ticks past it. */
const BETWEEN_BUYS_MS = Math.ceil(READY_HOLD_MS / TICK_MS) * TICK_MS;

/** Long enough that a retune slower than this is a different first evening. */
const CART_WITHIN_MS = 10 * 60 * 1000;

test("a fresh mountain: taps, the first worker, the first cart", async ({
  player,
}) => {
  await player.open();
  const start = player.now;
  const rules = Expected.fresh(player.now);
  await player.expectStones(0);

  // Dig by hand until the rules say a worker is affordable.
  let taps = 0;
  while (!rules.allows({ kind: "buyTier", id: "helper" }, player.now)) {
    rules.move({ kind: "dig" }, player.now);
    taps += 1;
    expect(taps, "taps to the first worker").toBeLessThan(200);
  }
  await player.dig(taps);
  await player.expectStones(rules.pocket);

  await player.openBuys();
  rules.until(player.now);
  expect(rules.move({ kind: "buyTier", id: "helper" }, player.now)).toBe(true);
  await player.buy("helper");
  await player.expectStones(rules.pocket);
  expect(rules.mountain.helpers).toBe(1);

  // The crew digs on its own: he hires to ten workers as each is affordable.
  while (rules.mountain.helpers < WORKERS) {
    const hire = rules.firstTickAllowing(
      { kind: "buyTier", id: "helper" },
      player.now + BETWEEN_BUYS_MS - TICK_MS,
      CART_WITHIN_MS,
    );
    expect(hire, "the next worker in time").toBeDefined();
    await player.wait((hire ?? player.now) - player.now);
    rules.until(player.now);
    await player.expectStones(rules.pocket);
    expect(rules.move({ kind: "buyTier", id: "helper" }, player.now)).toBe(
      true,
    );
    await player.buy("helper");
    await player.expectStones(rules.pocket);
  }

  // Then he shuts Buys and saves for the cart. Rows keep their places while the drawer is
  // open, so the cart's row shows when he opens it again.
  await player.closeBuys();
  const cart = rules.firstTickAllowing(
    { kind: "buyTier", id: "cart" },
    player.now + BETWEEN_BUYS_MS - TICK_MS,
    CART_WITHIN_MS,
  );
  expect(cart, "the first cart in time").toBeDefined();
  await player.wait((cart ?? player.now) - player.now);
  await player.openBuys();
  rules.until(player.now);
  await player.expectStones(rules.pocket);
  expect(rules.move({ kind: "buyTier", id: "cart" }, player.now)).toBe(true);
  await player.buy("cart");
  await player.expectStones(rules.pocket);
  expect(player.now - start, "the first cart's moment").toBeLessThan(
    CART_WITHIN_MS,
  );
  expect(rules.mountain.carts).toBe(1);

  // A cart's worth of time on: the board still reads what the rules say.
  await player.wait(10 * TICK_MS);
  rules.until(player.now);
  await player.expectStones(rules.pocket);
});
