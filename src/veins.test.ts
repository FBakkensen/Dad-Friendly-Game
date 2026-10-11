import { describe, expect, it } from "vitest";
import {
  VEIN_GLINT_MS,
  advanceVein,
  mineVein,
  veinReward,
  waitForVein,
} from "./veins";

const MINUTE = 60_000;

describe("golden veins", () => {
  it("waits 3 to 6 minutes of play before glinting", () => {
    expect(waitForVein({ now: 0, random: () => 0 })).toEqual({
      kind: "waiting",
      appearsAt: 3 * MINUTE,
    });
    expect(waitForVein({ now: 0, random: () => 0.999 }).kind).toBe("waiting");
    const latest = waitForVein({ now: 0, random: () => 1 });
    expect(latest).toEqual({ kind: "waiting", appearsAt: 6 * MINUTE });
  });

  it("glints at a spot on the mountain face, then moves on if missed", () => {
    const waiting = waitForVein({ now: 0, random: () => 0 });
    expect(
      advanceVein({ vein: waiting, now: 3 * MINUTE - 1, random: () => 0 }),
    ).toBe(waiting);

    const glint = advanceVein({
      vein: waiting,
      now: 3 * MINUTE,
      random: () => 0.5,
    });
    expect(glint).toEqual({
      kind: "glinting",
      until: 3 * MINUTE + VEIN_GLINT_MS,
      x: 0.5,
      y: 0.5,
    });
    expect(
      advanceVein({ vein: glint, now: 3 * MINUTE + 1_000, random: () => 0 }),
    ).toBe(glint);
    expect(
      advanceVein({
        vein: glint,
        now: 3 * MINUTE + VEIN_GLINT_MS,
        random: () => 0,
      }),
    ).toEqual({ kind: "waiting", appearsAt: 6 * MINUTE + VEIN_GLINT_MS });
  });

  it("pays a minute of crew output, at least 50, capped by the mountain", () => {
    expect(veinReward({ remaining: 1_000, pocket: 0, helpers: 0 })).toBe(50);
    expect(veinReward({ remaining: 1_000, pocket: 0, helpers: 3 })).toBe(180);
    expect(veinReward({ remaining: 20, pocket: 0, helpers: 3 })).toBe(20);
    expect(mineVein({ remaining: 1_000, pocket: 7, helpers: 3 })).toEqual({
      remaining: 820,
      pocket: 187,
      helpers: 3,
    });
    const empty = { remaining: 0, pocket: 7, helpers: 3 };
    expect(mineVein(empty)).toBe(empty);
  });
});
