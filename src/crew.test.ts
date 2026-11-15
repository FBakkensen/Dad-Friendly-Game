import { describe, expect, it } from "vitest";
import { buyCrew, tierLock, tierLocked } from "./crew";
import { createMountain } from "./mountain";
import { shownStones } from "./scale";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import { tierById, tierCost } from "./tiers";

describe("crew unlocks", () => {
  // M12 retune (#252): the card opens at 120M, the Deep Heart entrance.
  // Pockets cover the Great Machine with stones to spare.
  const spare = 29_400_000;
  const pocket = tierCost(tierById("machine"), 0) + spare;
  const nearDeep = {
    ...minedMountain(119_999_999),
    stock: { ...minedMountain(119_999_999).stock, stones: pocket },
    owned: { ...minedMountain(119_999_999).owned, borer: 1 },
  };
  const atDeep = {
    ...minedMountain(120_000_000),
    stock: { ...minedMountain(120_000_000).stock, stones: pocket },
    owned: { ...minedMountain(120_000_000).owned, borer: 1 },
  };

  it("the Great Machine opens at 120M mined", () => {
    const machine = tierById("machine");
    expect(tierLocked(nearDeep, machine)).toBe(true);
    expect(tierLocked(atDeep, machine)).toBe(false);
    expect(tierLock(minedMountain(25_000_000), machine)).toEqual({
      kind: "depth",
      depth: 120_000_000,
      at: shownStones(createMountain(), 120_000_000),
    });
    expect(tierLocked(nearDeep, tierById("borer"))).toBe(false);
  });

  it("the Kid worker opens at 70M mined", () => {
    const kid = tierById("kid");
    const stones = tierCost(kid, 0);
    const near = {
      ...minedMountain(69_999_999),
      stock: { ...minedMountain(69_999_999).stock, stones },
    };
    const at = {
      ...minedMountain(70_000_000),
      stock: { ...minedMountain(70_000_000).stock, stones },
    };
    expect(tierLock(near, kid)).toEqual({
      kind: "depth",
      depth: 70_000_000,
      at: shownStones(createMountain(), 70_000_000),
    });
    expect(buyCrew(near, "kid")).toBe(near);
    expect(tierLock(at, kid)).toBeUndefined();
    expect(buyCrew(at, "kid").owned.kid).toBe(1);
  });

  it("won't sell a locked tier, even with stones to spare", () => {
    expect(buyCrew(nearDeep, "machine")).toBe(nearDeep);
    expect(buyCrew(atDeep, "machine")).toMatchObject({
      owned: { machine: 1, kid: 0 },
      stock: { stones: spare },
    });
    expect(buyCrew(nearDeep, "borer")).toMatchObject({ owned: { borer: 2 } });
  });

  it("brings the first engineer with the first borer, and not with the second", () => {
    const bought = buyCrew(
      {
        ...minedMountain(10_000_000),
        stock: { ...minedMountain(10_000_000).stock, stones: 10_000_000 },
      },
      "borer",
    );
    expect(bought.owned.borer).toBe(1);
    expect(bought.owned.helper).toBe(0);
    expect(bought.engineers).toEqual([
      { name: "Ada", rank: 0, trips: 0, post: "borer" },
    ]);
    const again = buyCrew(
      { ...bought, stock: { ...bought.stock, stones: 20_000_000 } },
      "borer",
    );
    expect(again.owned.borer).toBe(2);
    expect(again.engineers).toEqual(bought.engineers);
    const fresh = minedMountain(0);
    expect(buyCrew(fresh, "borer")).toBe(fresh);
  });

  it("keeps the borer locked until the Granite (10M), then sells it (#250, #356)", () => {
    const shallow = {
      ...minedMountain(9_999_999),
      stock: { ...minedMountain(9_999_999).stock, stones: 50_000_000 },
    };
    expect(tierLock(shallow, tierById("borer"))).toEqual({
      kind: "depth",
      depth: 10_000_000,
      at: 10_000_000,
    });
    expect(tierLocked(shallow, tierById("borer"))).toBe(true);
    expect(buyCrew(shallow, "borer")).toBe(shallow);
    const deep = {
      ...shallow,
      ...minedMountain(10_000_000),
      stock: { ...shallow.stock, stones: 50_000_000 },
    };
    expect(tierLock(deep, tierById("borer"))).toBeUndefined();
    expect(buyCrew(deep, "borer").owned.borer).toBe(1);
    expect(tierLock(deep, tierById("machine"))).toEqual({
      kind: "depth",
      depth: 120_000_000,
      at: shownStones(createMountain(), 120_000_000),
    });
    expect(tierLock(deep, tierById("helper"))).toBeUndefined();
    // An older save that already owns a borer keeps buying them.
    const older = { ...shallow, owned: { ...shallow.owned, borer: 1 } };
    expect(tierLock(older, tierById("borer"))).toBeUndefined();
    expect(buyCrew(older, "borer").owned.borer).toBe(2);
  });

  it("leaves an engineer's post alone when a Great Machine is bought", () => {
    const withBorer = buyCrew(
      // Enough for a borer, its workers and the Great Machine.
      {
        ...minedMountain(120_000_000),
        stock: {
          ...minedMountain(120_000_000).stock,
          stones:
            tierCost(tierById("borer"), 0) +
            tierCost(tierById("machine"), 0) +
            5_000_000,
        },
        owned: { ...minedMountain(120_000_000).owned, helper: 5 },
      },
      "borer",
    );
    expect(withBorer.engineers[0]?.post).toBe("borer");
    const withMachine = buyCrew(withBorer, "machine");
    expect(withMachine.owned.machine).toBe(1);
    expect(withMachine.engineers[0]?.post).toBe("borer");
    expect(effectiveRates(withMachine).running.machine).toBe(0);
  });
});
