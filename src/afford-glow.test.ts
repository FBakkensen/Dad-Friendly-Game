// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { canBuyAnyTier, canCraftNow, setAffordGlow } from "./afford-glow";
import { MOUNTAIN_STONES, createMountain } from "./mountain";
import { recipesForMined } from "./workshop";

const NOW = 1_700_000_000_000;

describe("afford glow (#282)", () => {
  it("toggles one class and nothing else", () => {
    const button = document.createElement("button");
    setAffordGlow(button, true);
    expect(button.className).toBe("afford-glow");
    setAffordGlow(button, false);
    expect(button.className).toBe("");
  });

  it("lights Buys only when a shown tier is affordable", () => {
    const start = createMountain();
    expect(canBuyAnyTier({ ...start, pocket: 0 })).toBe(false);
    expect(canBuyAnyTier({ ...start, pocket: 1_000_000 })).toBe(true);
  });

  it("lights the Workshop only with a free bench and a craft he can pay for", () => {
    const shed = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 12_000_000,
      helpers: 4,
      carts: 1,
      pocket: 1_000_000,
      materials: { clay: 10, iron: 10, crystal: 0, heartstone: 0 },
      recipes: recipesForMined(12_000_000),
    };
    expect(canCraftNow(shed, NOW)).toBe(true);
    expect(
      canCraftNow(
        {
          ...shed,
          pocket: 0,
          materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      canCraftNow(
        {
          ...shed,
          bench: {
            recipe: "blasting-charge",
            startedAt: NOW,
            endsAt: NOW + 60_000,
          },
        },
        NOW,
      ),
    ).toBe(false);
  });
});
