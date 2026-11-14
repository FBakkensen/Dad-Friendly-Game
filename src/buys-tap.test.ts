import { describe, expect, it } from "vitest";
import { buysTap } from "./buys-tap";
import type { Trouble } from "./hazards";
import type { Mountain } from "./mountain";
import { readyNow } from "./ready-now";
import { minedMountain } from "./test-fixtures";
import { tierById, tierQuote, type BuyAmount, type ShownTierId } from "./tiers";

const NOW = 1_700_000_000_000;

/** A crewed Topsoil, 18 workers and 6 carts, with a cart's price and more in the pocket. */
function crewed(over: Partial<Mountain> = {}): Mountain {
  return {
    ...minedMountain(500_000),
    helpers: 18,
    carts: 6,
    pocket: 1_000_000,
    ...over,
  };
}

function tap(
  mountain: Mountain,
  tier: ShownTierId,
  {
    trouble,
    guided,
    amount = "one",
  }: {
    trouble?: Trouble;
    guided?: ShownTierId | undefined;
    amount?: BuyAmount;
  } = {},
) {
  return buysTap({
    snapshot: { mountain, trouble },
    tier,
    pick: readyNow(mountain, NOW, trouble),
    now: NOW,
    guided,
    amount,
  });
}

describe("buysTap", () => {
  it("a row that can buy buys", () => {
    expect(tap(crewed(), "cart")).toEqual({ kind: "buy", count: 1 });
  });

  it("×10 buys ten, and Max as many as the pocket holds, read at the tap (#358)", () => {
    expect(tap(crewed(), "cart", { amount: "ten" })).toEqual({
      kind: "buy",
      count: 10,
    });
    const max = tierQuote(crewed(), tierById("cart"), "max").count;
    expect(max).toBeGreaterThan(10);
    expect(tap(crewed(), "cart", { amount: "max" })).toEqual({
      kind: "buy",
      count: max,
    });
    expect(tap(crewed({ pocket: 0 }), "cart", { amount: "ten" })).toEqual({
      kind: "blink",
    });
  });

  it("the staffing New row hires one worker in any amount (#358)", () => {
    const idle = crewed({ helpers: 2 });
    expect(tap(idle, "cart", { guided: "cart", amount: "max" })).toEqual({
      kind: "hire",
    });
  });

  it("a row too dear blinks", () => {
    expect(tap(crewed({ pocket: 0 }), "cart")).toEqual({ kind: "blink" });
  });

  it("a row held in place but no longer shown blinks", () => {
    // No carts: the drill is not shown, though the open drawer may still hold its row.
    expect(tap(crewed({ carts: 0 }), "drill")).toEqual({ kind: "blink" });
  });

  it("the staffing New row hires a worker", () => {
    // 2 workers run 2 carts; 4 stand idle, so another cart would stand idle too.
    expect(tap(crewed({ helpers: 2 }), "cart", { guided: "cart" })).toEqual({
      kind: "hire",
    });
  });

  it("a troubled row is a trouble press, even with nothing in the pocket", () => {
    const trouble: Trouble = {
      kind: "cave-in",
      tier: "cart",
      startedAt: NOW - 1_000,
    };
    expect(tap(crewed({ pocket: 0 }), "cart", { trouble })).toEqual({
      kind: "trouble",
      tier: "cart",
    });
    // The drill beside it buys as usual.
    expect(tap(crewed(), "drill", { trouble })).toEqual({
      kind: "buy",
      count: 1,
    });
  });
});
