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
      pocket: 40_000_000,
    });
    expect(buyCrew(nearHammer, "borer")).toMatchObject({ borers: 2 });
  });

  it("brings the first engineer with the first borer, and not with the second", () => {
    const bought = buyCrew(
      { ...minedMountain(0), pocket: 10_000_000 },
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

  it("leaves an engineer's post alone when a Great Machine is bought", () => {
    const withBorer = buyCrew(
      { ...minedMountain(25_000_000), pocket: 60_000_000, helpers: 5 },
      "borer",
    );
    expect(withBorer.engineers?.[0]?.post).toBe("borer");
    const withMachine = buyCrew(withBorer, "machine");
    expect(withMachine.machines).toBe(1);
    expect(withMachine.engineers?.[0]?.post).toBe("borer");
    expect(effectiveRates(withMachine).running.machine).toBe(0);
  });
});

/** A save from before #89: no `staffed` mark. */
const oldSave = (fields: Partial<Mountain>): Mountain => {
  return unstaffedSave({ ...minedMountain(0), ...fields });
};

describe("staffExisting (one-time grants, #89 and #140)", () => {
  it("hires free workers to run every machine, keeping everything else", () => {
    const before = oldSave({
      pocket: 777,
      helpers: 20,
      carts: 12,
      drills: 7,
      borers: 1,
    });
    const { mountain, joined } = staffExisting(before);
    // 12 carts + 21 drills + 8 borer = 41.
    expect(joined).toBe(21);
    expect(mountain).toEqual({ ...before, helpers: 41, staffed: 2 });
    expect(effectiveRates(mountain).helpersShort).toBe(0);
  });

  it("tops up a save that already had the first grant", () => {
    const before = {
      ...oldSave({
        helpers: 30,
        carts: 12,
        drills: 7,
        borers: 1,
      }),
      staffed: true as const,
    };
    const { mountain, joined } = staffExisting(before);
    expect(joined).toBe(11);
    expect(mountain.staffed).toBe(2);
    expect(mountain.helpers).toBe(41);
    expect(effectiveRates(mountain).helpersShort).toBe(0);
    expect(staffExisting({ ...before, staffed: 1 })).toMatchObject({
      joined: 11,
      mountain: { staffed: 2, helpers: 41 },
    });
  });

  it("counts kids already on the crew, so they are not hired again", () => {
    const before = {
      ...oldSave({ helpers: 0, kids: 4, carts: 3 }),
      staffed: true as const,
    };
    expect(staffExisting(before)).toMatchObject({
      joined: 0,
      mountain: { helpers: 0, kids: 4, staffed: 2 },
    });
  });

  it("only marks a save that already has enough workers", () => {
    const before = oldSave({ helpers: 50, carts: 3 });
    expect(staffExisting(before)).toEqual({
      mountain: { ...before, staffed: 2 },
      joined: 0,
    });
  });

  it("never runs twice, and a save already at 2 is the same object", () => {
    const once = staffExisting(oldSave({ helpers: 0, carts: 5 })).mountain;
    const later = { ...once, carts: 9 };
    expect(staffExisting(later)).toEqual({ mountain: later, joined: 0 });
    const done = { ...later, helpers: 0 };
    expect(staffExisting(done)).toEqual({ mountain: done, joined: 0 });
    expect(staffExisting(done).mountain).toBe(done);
  });
});
