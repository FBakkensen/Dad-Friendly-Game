import { describe, expect, it } from "vitest";
import { buyCrew, staffExisting, tierLocked } from "./crew";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain, unstaffedSave } from "./test-fixtures";
import { tierById } from "./tiers";

describe("crew unlocks", () => {
  const nearHammer = {
    ...minedMountain(24_999_999),
    pocket: 90_000_000,
    borers: 1,
  };
  const atHammer = {
    ...minedMountain(25_000_000),
    pocket: 90_000_000,
    borers: 1,
  };

  it("locks the Great Machine until the Hammer of the Builder is found", () => {
    const machine = tierById("machine");
    expect(tierLocked(nearHammer, machine)).toBe(true);
    expect(tierLocked(atHammer, machine)).toBe(false);
    expect(tierLocked(nearHammer, tierById("borer"))).toBe(false);
  });

  it("won't sell a locked tier, even with stones to spare", () => {
    expect(buyCrew(nearHammer, "machine")).toBe(nearHammer);
    expect(buyCrew(atHammer, "machine")).toMatchObject({
      machines: 1,
      kids: 0,
      pocket: 10_000_000,
    });
    expect(buyCrew(nearHammer, "borer")).toMatchObject({ borers: 2 });
  });
});

/** A save from before #89: no `staffed` mark. */
const oldSave = (fields: Partial<Mountain>): Mountain => {
  return unstaffedSave({ ...minedMountain(0), ...fields });
};

describe("staffExisting (one-time #89 grant)", () => {
  it("hires free helpers to run every machine, keeping everything else", () => {
    const before = oldSave({
      pocket: 777,
      helpers: 20,
      carts: 12,
      drills: 7,
      borers: 1,
    });
    const { mountain, joined } = staffExisting(before);
    // 12 + 14 + 4 = 30 needed.
    expect(joined).toBe(10);
    expect(mountain).toEqual({ ...before, helpers: 30, staffed: true });
    expect(effectiveRates(mountain).helpersShort).toBe(0);
  });

  it("only marks a save that already has enough helpers", () => {
    const before = oldSave({ helpers: 50, carts: 3 });
    expect(staffExisting(before)).toEqual({
      mountain: { ...before, staffed: true },
      joined: 0,
    });
  });

  it("never runs twice", () => {
    const once = staffExisting(oldSave({ helpers: 0, carts: 5 })).mountain;
    const later = { ...once, carts: 9 };
    expect(staffExisting(later)).toEqual({ mountain: later, joined: 0 });
  });
});
