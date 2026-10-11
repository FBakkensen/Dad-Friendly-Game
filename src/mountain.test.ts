import { minedMountain } from "./test-fixtures";
import {
  BASE_AWAY_CAP_MS,
  SHIELD_AWAY_CAP_MS,
  effectiveRates,
  heartBonus,
} from "./rates";
import { describe, expect, it } from "vitest";
import {
  AWAY_PAY_RATE,
  MOUNTAIN_STONES,
  accrueAway,
  accrue,
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
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
      staffed: true,
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
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
      staffed: true,
    });
    expect(minedOut(mountain)).toBe(3);
  });

  it("stops at zero and returns the same mountain", () => {
    const empty = {
      remaining: 0,
      pocket: 5,
      helpers: 0,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    };
    expect(mineByHand(empty)).toBe(empty);
  });

  it("parses a sane mountain and rejects anything else", () => {
    expect(
      parseMountain({
        remaining: 10,
        pocket: 2,
        helpers: 1,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      }),
    ).toEqual({
      remaining: 10,
      pocket: 2,
      helpers: 1,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    });
    for (const bad of [
      null,
      "x",
      {},
      {
        remaining: -1,
        pocket: 0,
        helpers: 0,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
      {
        remaining: MOUNTAIN_STONES + 1,
        pocket: 0,
        helpers: 0,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
      {
        remaining: 1.5,
        pocket: 0,
        helpers: 0,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
      {
        remaining: 1,
        pocket: Number.NaN,
        helpers: 0,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
      {
        remaining: 1,
        pocket: 0,
        helpers: "2",
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
    ]) {
      expect(parseMountain(bad)).toBeUndefined();
    }
  });
});

describe("accrue", () => {
  const crew = {
    remaining: 1000,
    pocket: 0,
    helpers: 2,
    carts: 0,
    drills: 0,
    borers: 0,
    machines: 0,
    kids: 0,
  };

  it("mines whole seconds and keeps the leftover part-second unspent", () => {
    expect(accrue({ mountain: crew, from: 0, to: 2_750 })).toEqual({
      mountain: {
        remaining: 996,
        pocket: 4,
        helpers: 2,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
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
    const almost = {
      remaining: 3,
      pocket: 0,
      helpers: 2,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    };
    expect(accrue({ mountain: almost, from: 0, to: 10_500 })).toEqual({
      mountain: {
        remaining: 0,
        pocket: 3,
        helpers: 2,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
      mined: 3,
      settledAt: 10_500,
    });
  });

  it("does nothing without helpers or when the clock goes backwards", () => {
    const idle = {
      remaining: 10,
      pocket: 0,
      helpers: 0,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    };
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
  const crew = {
    remaining: 100_000_000,
    pocket: 0,
    helpers: 2,
    carts: 0,
    drills: 0,
    borers: 0,
    machines: 0,
    kids: 0,
  };

  it("pays for the whole absence under the cap", () => {
    const result = accrueAway({ mountain: crew, lastSeen: 0, now: 90_500 });
    // 90 whole seconds × 2 a second × 30% away pay.
    expect(result.mined).toBe(54);
    expect(result.settledAt).toBe(90_000);
    expect(result.report).toEqual({
      mined: 54,
      awayMs: 90_500,
      capped: false,
      heart: 1,
    });
  });

  it("pays away time at AWAY_PAY_RATE, but live play in full", () => {
    expect(AWAY_PAY_RATE).toBeGreaterThanOrEqual(0.25);
    expect(AWAY_PAY_RATE).toBeLessThanOrEqual(0.35);
    expect(accrue({ mountain: crew, from: 0, to: 10_000 }).mined).toBe(20);
    expect(
      accrue({ mountain: crew, from: 0, to: 10_000, pay: 0.3 }).mined,
    ).toBe(6);
    // Part-stones round down.
    expect(accrue({ mountain: crew, from: 0, to: 1_000, pay: 0.3 }).mined).toBe(
      0,
    );
  });

  it("pays at most the cap but reports the real time away", () => {
    const now = BASE_AWAY_CAP_MS * 3;
    const result = accrueAway({ mountain: crew, lastSeen: 0, now });
    expect(result.mined).toBe((BASE_AWAY_CAP_MS / 1000) * 2 * AWAY_PAY_RATE);
    expect(result.settledAt).toBe(now);
    expect(result.report).toEqual({
      mined: (BASE_AWAY_CAP_MS / 1000) * 2 * AWAY_PAY_RATE,
      awayMs: now,
      capped: true,
      heart: 1,
    });
  });

  it("pays nothing for a clock that went backwards", () => {
    expect(
      accrueAway({ mountain: crew, lastSeen: 5_000, now: 1_000 }).report,
    ).toEqual({
      mined: 0,
      awayMs: 0,
      capped: false,
      heart: 1,
    });
  });
});

describe("Shield of Protection: away cap", () => {
  const crew = { ...minedMountain(0), helpers: 10 };
  const shielded = { ...minedMountain(10_000_000), helpers: 10 };
  const DAY = 24 * 3_600_000;

  it("pays 8 hours without the Shield and a whole day with it", () => {
    const plain = accrueAway({ mountain: crew, lastSeen: 0, now: 2 * DAY });
    expect(plain.report.capped).toBe(true);
    expect(plain.mined).toBe(Math.floor(8 * 3600 * 10 * AWAY_PAY_RATE));
    const safe = accrueAway({
      mountain: shielded,
      lastSeen: 0,
      now: 20 * 3_600_000,
    });
    expect(safe.report.capped).toBe(false);
    expect(safe.mined).toBe(Math.floor(20 * 3600 * 10 * AWAY_PAY_RATE));
    const long = accrueAway({ mountain: shielded, lastSeen: 0, now: 3 * DAY });
    expect(long.report.capped).toBe(true);
    expect(long.mined).toBe(Math.floor(24 * 3600 * 10 * AWAY_PAY_RATE));
    expect(effectiveRates(shielded).awayCapMs).toBe(SHIELD_AWAY_CAP_MS);
    expect(effectiveRates(crew).awayCapMs).toBe(BASE_AWAY_CAP_MS);
  });
});

describe("Heart of Patience: away pay grows", () => {
  const crew = { ...minedMountain(10_000_000), helpers: 10 };
  const hearty = { ...minedMountain(45_000_000), helpers: 10 };
  const HOUR = 3_600_000;

  it("climbs from ×1 to ×1.5 over 12 hours, and only with the Heart", () => {
    expect(heartBonus(crew, 12 * HOUR)).toBe(1);
    expect(heartBonus(hearty, 0)).toBe(1);
    expect(heartBonus(hearty, 6 * HOUR)).toBe(1.25);
    expect(heartBonus(hearty, 12 * HOUR)).toBe(1.5);
    expect(heartBonus(hearty, 20 * HOUR)).toBe(1.5);
  });

  it("multiplies the away pay and reports the bonus", () => {
    const away = accrueAway({ mountain: hearty, lastSeen: 0, now: 6 * HOUR });
    expect(away.report.heart).toBe(1.25);
    expect(away.mined).toBe(Math.floor(6 * 3600 * 10 * AWAY_PAY_RATE * 1.25));
    const plain = accrueAway({ mountain: crew, lastSeen: 0, now: 6 * HOUR });
    expect(plain.report.heart).toBe(1);
  });

  it("counts only the paid time, up to the Shield's 24 hours", () => {
    const away = accrueAway({ mountain: hearty, lastSeen: 0, now: 40 * HOUR });
    expect(away.report.heart).toBe(1.5);
    expect(away.mined).toBe(Math.floor(24 * 3600 * 10 * AWAY_PAY_RATE * 1.5));
  });
});
