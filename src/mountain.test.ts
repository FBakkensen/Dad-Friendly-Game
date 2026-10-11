import { describe, expect, it } from "vitest";
import {
  AWAY_CAP_MS,
  MOUNTAIN_STONES,
  accrueAway,
  accrue,
  helperCost,
  hireHelper,
  stonesPerSecond,
  createMountain,
  mineByHand,
  minedOut,
  parseMountain,
} from "./mountain";

describe("mountain", () => {
  it("starts with a million stones, an empty pocket, and no helpers", () => {
    expect(createMountain()).toEqual({
      remaining: 100_000_000,
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

describe("helpers", () => {
  it("costs 10, then 15% more each, rounded up", () => {
    expect([0, 1, 2, 3, 10].map(helperCost)).toEqual([10, 12, 14, 16, 41]);
  });

  it("hires only when the pocket covers the cost, and pays for it", () => {
    const poor = { remaining: 100, pocket: 9, helpers: 0 };
    expect(hireHelper(poor)).toBe(poor);

    const one = hireHelper({ remaining: 100, pocket: 25, helpers: 0 });
    expect(one).toEqual({ remaining: 100, pocket: 15, helpers: 1 });
    expect(hireHelper(one)).toEqual({ remaining: 100, pocket: 3, helpers: 2 });
    expect(stonesPerSecond({ remaining: 1, pocket: 0, helpers: 3 })).toBe(3);
  });
});

describe("accrue", () => {
  const crew = { remaining: 1000, pocket: 0, helpers: 2 };

  it("mines whole seconds and keeps the leftover part-second unspent", () => {
    expect(accrue({ mountain: crew, from: 0, to: 2_750 })).toEqual({
      mountain: { remaining: 996, pocket: 4, helpers: 2 },
      mined: 4,
      settledAt: 2_000,
    });
  });

  it("adds up to the same total however the time is sliced", () => {
    let mountain = crew;
    let at = 0;
    for (const to of [300, 1_200, 2_300, 4_750, 5_000]) {
      const result = accrue({ mountain, from: at, to });
      mountain = result.mountain;
      at = result.settledAt;
    }
    expect(mountain).toEqual(
      accrue({ mountain: crew, from: 0, to: 5_000 }).mountain,
    );
  });

  it("stops at an empty mountain and spends the rest of the time", () => {
    const almost = { remaining: 3, pocket: 0, helpers: 2 };
    expect(accrue({ mountain: almost, from: 0, to: 10_500 })).toEqual({
      mountain: { remaining: 0, pocket: 3, helpers: 2 },
      mined: 3,
      settledAt: 10_500,
    });
  });

  it("does nothing without helpers or when the clock goes backwards", () => {
    const idle = { remaining: 10, pocket: 0, helpers: 0 };
    expect(accrue({ mountain: idle, from: 0, to: 9_000 })).toEqual({
      mountain: idle,
      mined: 0,
      settledAt: 9_000,
    });
    expect(accrue({ mountain: crew, from: 5_000, to: 1_000 })).toEqual({
      mountain: crew,
      mined: 0,
      settledAt: 5_000,
    });
  });
});

describe("accrueAway", () => {
  const crew = { remaining: 100_000_000, pocket: 0, helpers: 2 };

  it("pays for the whole absence under the cap", () => {
    const result = accrueAway({ mountain: crew, lastSeen: 0, now: 90_500 });
    expect(result.mined).toBe(180);
    expect(result.settledAt).toBe(90_000);
    expect(result.report).toEqual({
      mined: 180,
      awayMs: 90_500,
      capped: false,
    });
  });

  it("pays at most the cap but reports the real time away", () => {
    const now = AWAY_CAP_MS * 3;
    const result = accrueAway({ mountain: crew, lastSeen: 0, now });
    expect(result.mined).toBe((AWAY_CAP_MS / 1000) * 2);
    expect(result.settledAt).toBe(now);
    expect(result.report).toEqual({
      mined: (AWAY_CAP_MS / 1000) * 2,
      awayMs: now,
      capped: true,
    });
  });

  it("pays nothing for a clock that went backwards", () => {
    expect(
      accrueAway({ mountain: crew, lastSeen: 5_000, now: 1_000 }).report,
    ).toEqual({
      mined: 0,
      awayMs: 0,
      capped: false,
    });
  });
});
