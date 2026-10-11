import { describe, expect, it } from "vitest";
import {
  MOUNTAIN_STONES,
  createMountain,
  mineByHand,
  minedOut,
  parseMountain,
} from "./mountain";

describe("mountain", () => {
  it("starts with a million stones, an empty pocket, and no helpers", () => {
    expect(createMountain()).toEqual({
      remaining: 1_000_000,
      pocket: 0,
      helpers: 0,
    });
    expect(minedOut(createMountain())).toBe(0);
  });

  it("moves exactly one stone from the mountain to the pocket per tap", () => {
    let mountain = createMountain();
    for (let tap = 0; tap < 3; tap += 1) {
      mountain = mineByHand(mountain);
    }
    expect(mountain).toEqual({
      remaining: MOUNTAIN_STONES - 3,
      pocket: 3,
      helpers: 0,
    });
    expect(minedOut(mountain)).toBe(3);
  });

  it("stops at zero and returns the same mountain", () => {
    const empty = { remaining: 0, pocket: 5, helpers: 0 };
    expect(mineByHand(empty)).toBe(empty);
  });

  it("parses a sane mountain and rejects anything else", () => {
    expect(parseMountain({ remaining: 10, pocket: 2, helpers: 1 })).toEqual({
      remaining: 10,
      pocket: 2,
      helpers: 1,
    });
    for (const bad of [
      null,
      "x",
      {},
      { remaining: -1, pocket: 0, helpers: 0 },
      { remaining: MOUNTAIN_STONES + 1, pocket: 0, helpers: 0 },
      { remaining: 1.5, pocket: 0, helpers: 0 },
      { remaining: 1, pocket: Number.NaN, helpers: 0 },
      { remaining: 1, pocket: 0, helpers: "2" },
    ]) {
      expect(parseMountain(bad)).toBeUndefined();
    }
  });
});
