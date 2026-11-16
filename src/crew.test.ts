import { describe, expect, it } from "vitest";
import { buyCrew, tierLock, tierLocked, tierOnSale } from "./crew";
import { withFactors } from "./economy/factors";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { tierById } from "./tiers";

const partThree = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);

/** A fresh mine with plenty of stone and cut stone, the shaft sunk or not. */
function rich(sunk: boolean): Mountain {
  const start = createMountain();
  return {
    ...start,
    stock: { ...start.stock, stones: 1e12, cutStone: 1e9 },
    ...(sunk
      ? {
          granite: {
            kind: "sunk",
            machines: NO_LEVEL_MACHINES,
            piles: NO_GRANITE_PILES,
          },
        }
      : {}),
  };
}

describe("crew unlocks (rule 1's table, #653)", () => {
  it("won't sell a tier behind a later part's door, even with stones to spare", () => {
    const crew = rich(false);
    for (const id of ["borer", "train", "machine", "kid"] as const) {
      expect(tierLocked(crew, tierById(id))).toBe(true);
      expect(tierOnSale(crew, tierById(id))).toBe(false);
      expect(buyCrew(crew, id)).toBe(crew);
    }
    expect(tierLock(crew, tierById("cart"))).toBeUndefined();
    expect(buyCrew(crew, "cart").owned.cart).toBe(1);
  });

  it("opens the Granite's borer once the shaft is sunk, in part 3 only (#673)", () => {
    partThree(() => {
      expect(tierLock(rich(false), tierById("borer"))).toEqual({
        kind: "later",
        at: "granite",
      });
      expect(tierLock(rich(true), tierById("borer"))).toBeUndefined();
      expect(tierOnSale(rich(true), tierById("borer"))).toBe(true);
      // The Foundry's door stays shut.
      expect(tierLocked(rich(true), tierById("machine"))).toBe(true);
    });
    expect(tierOnSale(rich(true), tierById("borer"))).toBe(false);
  });

  it("brings the first engineer with the first borer, and not with the second", () => {
    partThree(() => {
      const bought = buyCrew(rich(true), "borer");
      expect(bought.owned.borer).toBe(1);
      expect(bought.engineers).toEqual([
        { name: "Ada", rank: 0, trips: 0, post: "borer" },
      ]);
      const again = buyCrew(bought, "borer");
      expect(again.owned.borer).toBe(2);
      expect(again.engineers).toEqual(bought.engineers);
    });
  });
});
