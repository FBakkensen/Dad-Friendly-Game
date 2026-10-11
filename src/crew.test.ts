import { describe, expect, it } from "vitest";
import { buyCrew, tierLocked } from "./crew";
import { minedMountain } from "./test-fixtures";
import { tierById } from "./tiers";

describe("crew unlocks", () => {
  const nearHammer = {
    ...minedMountain(24_999_999),
    pocket: 50_000_000,
    borers: 1,
  };
  const atHammer = {
    ...minedMountain(25_000_000),
    pocket: 50_000_000,
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
      pocket: 10_000_000,
    });
    expect(buyCrew(nearHammer, "borer")).toMatchObject({ borers: 2 });
  });
});
