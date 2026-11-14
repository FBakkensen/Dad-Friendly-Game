import { describe, expect, it } from "vitest";
import { buyCrew, tierLock, tierLocked } from "./crew";
import { createMountain } from "./mountain";
import { shownStones } from "./scale";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import { tierById, tierCost } from "./tiers";

describe("crew unlocks", () => {
  // M12 retune (#252): the Hammer is found at 25M, the card opens at 120M.
  // Pockets cover the Great Machine with stones to spare.
  const spare = 29_400_000;
  const pocket = tierCost(tierById("machine"), 0) + spare;
  const nearHammer = {
    ...minedMountain(119_999_999),
    pocket,
    borers: 1,
  };
  const atHammer = {
    ...minedMountain(120_000_000),
    pocket,
    borers: 1,
  };

  it("locks the Great Machine until the Hammer is found and the Deep Heart is reached", () => {
    const machine = tierById("machine");
    expect(tierLocked(nearHammer, machine)).toBe(true);
    expect(tierLocked(atHammer, machine)).toBe(false);
    expect(tierLock(minedMountain(25_000_000), machine)).toEqual({
      kind: "depth",
      depth: 120_000_000,
      at: shownStones(createMountain(), 120_000_000),
    });
    expect(tierLocked(nearHammer, tierById("borer"))).toBe(false);
  });

  it("won't sell a locked tier, even with stones to spare", () => {
    expect(buyCrew(nearHammer, "machine")).toBe(nearHammer);
    expect(buyCrew(atHammer, "machine")).toMatchObject({
      machines: 1,
      kids: 0,
      pocket: spare,
    });
    expect(buyCrew(nearHammer, "borer")).toMatchObject({ borers: 2 });
  });

  it("brings the first engineer with the first borer, and not with the second", () => {
    const bought = buyCrew(
      { ...minedMountain(10_000_000), pocket: 10_000_000 },
      "borer",
    );
    expect(bought.borers).toBe(1);
    expect(bought.helpers).toBe(0);
    expect(bought.engineers).toEqual([
      { name: "Ada", rank: 0, trips: 0, post: "borer" },
    ]);
    const again = buyCrew({ ...bought, pocket: 20_000_000 }, "borer");
    expect(again.borers).toBe(2);
    expect(again.engineers).toEqual(bought.engineers);
    const fresh = minedMountain(0);
    expect(buyCrew(fresh, "borer")).toBe(fresh);
  });

  it("keeps the borer locked until the Granite (10M), then sells it (#250, #356)", () => {
    const shallow = { ...minedMountain(9_999_999), pocket: 50_000_000 };
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
      pocket: 50_000_000,
    };
    expect(tierLock(deep, tierById("borer"))).toBeUndefined();
    expect(buyCrew(deep, "borer").borers).toBe(1);
    expect(tierLock(deep, tierById("machine"))).toEqual({
      kind: "depth",
      depth: 120_000_000,
      at: shownStones(createMountain(), 120_000_000),
    });
    expect(tierLock(deep, tierById("helper"))).toBeUndefined();
    // An older save that already owns a borer keeps buying them.
    const older = { ...shallow, borers: 1 };
    expect(tierLock(older, tierById("borer"))).toBeUndefined();
    expect(buyCrew(older, "borer").borers).toBe(2);
  });

  it("leaves an engineer's post alone when a Great Machine is bought", () => {
    const withBorer = buyCrew(
      // Enough for a borer, its workers and the Great Machine.
      {
        ...minedMountain(120_000_000),
        pocket:
          tierCost(tierById("borer"), 0) +
          tierCost(tierById("machine"), 0) +
          5_000_000,
        helpers: 5,
      },
      "borer",
    );
    expect(withBorer.engineers[0]?.post).toBe("borer");
    const withMachine = buyCrew(withBorer, "machine");
    expect(withMachine.machines).toBe(1);
    expect(withMachine.engineers[0]?.post).toBe("borer");
    expect(effectiveRates(withMachine).running.machine).toBe(0);
  });
});
