import { EMPTY_MATERIALS, materialsGained } from "./layers";
import { minedMountain } from "./test-fixtures";
import {
  BASE_AWAY_CAP_MS,
  SHIELD_AWAY_CAP_MS,
  effectiveRates,
  heartBonus,
} from "./rates";
import { describe, expect, it } from "vitest";
import { AWAY_PAY_RATE } from "./rates";
import {
  MOUNTAIN_STONES,
  accrueAway,
  accrue,
  createMountain,
  mineByHand,
  minedOut,
  parseMountain,
} from "./mountain";
import { STARTING_RECIPE_IDS } from "./workshop";

describe("mountain", () => {
  it("starts with a million stones, an empty pocket, and no helpers", () => {
    expect(createMountain()).toEqual({
      remaining: MOUNTAIN_STONES,
      pocket: 0,
      helpers: 0,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
      staffed: 2,
      materials: EMPTY_MATERIALS,
      recipes: [...STARTING_RECIPE_IDS],
    });
    expect(minedOut(createMountain())).toBe(0);
  });

  it("moves exactly one stone from the mountain to the pocket per tap", () => {
    let mountain = createMountain();
    for (let tap = 0; tap < 3; tap += 1) {
      mountain = mineByHand(mountain);
    }
    expect(mountain).toEqual({
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 3,
      pocket: 3,
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

  it("accepts staffing marks true, 1 and 2, and rejects anything else", () => {
    const base = {
      remaining: 10,
      pocket: 0,
      helpers: 0,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    };
    expect(parseMountain({ ...base, staffed: true })?.staffed).toBe(true);
    expect(parseMountain({ ...base, staffed: 1 })?.staffed).toBe(1);
    expect(parseMountain({ ...base, staffed: 2 })?.staffed).toBe(2);
    expect(parseMountain(base)?.staffed).toBeUndefined();
    for (const staffed of [false, 0, 3, 1.5, "2"]) {
      expect(parseMountain({ ...base, staffed })).toBeUndefined();
    }
  });

  it("reads materials, recipes, a bench, and crafted gear, and rejects a bad shape", () => {
    const base = {
      remaining: 10,
      pocket: 0,
      helpers: 0,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    };
    const materials = { clay: 1, iron: 2, crystal: 3, heartstone: 4 };
    const recipes = ["iron-rails", "diamond-bits"] as const;
    const bench = {
      recipe: "iron-rails" as const,
      startedAt: 10,
      endsAt: 10 + 60_000,
    };
    const crafted = { "sturdy-props": 1 };
    expect(
      parseMountain({ ...base, materials, recipes, bench, crafted }),
    ).toEqual({
      ...base,
      materials,
      recipes,
      bench,
      crafted,
    });
    expect(parseMountain({ ...base, bench: null })).toEqual(base);
    expect(parseMountain({ ...base, crafted: {} })).toEqual(base);
    expect(
      parseMountain({ ...base, materials: { ...materials, clay: 1.5 } }),
    ).toBeUndefined();
    expect(parseMountain({ ...base, recipes: ["nope"] })?.recipes).toEqual([]);
    expect(
      parseMountain({
        ...base,
        bench: { recipe: "iron-rails", startedAt: 5, endsAt: 5 },
      }),
    ).toBeUndefined();
    expect(
      parseMountain({ ...base, crafted: { "iron-rails": -1 } }),
    ).toBeUndefined();
  });
});

describe("materials from digging", () => {
  it("puts the units an absence dug on the away report", () => {
    const away = accrueAway({
      mountain: { ...createMountain(), helpers: 50, carts: 50 },
      lastSeen: 0,
      now: 10 * 3_600_000,
    });
    expect(away.report.materials).toEqual({
      clay: 4,
      iron: 0,
      crystal: 0,
      heartstone: 0,
    });
    expect(away.report.materials).toEqual(
      materialsGained(0, minedOut(away.mountain)),
    );
  });

  it("pays a hand tap when the stones cross a gap", () => {
    const mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 999_999,
      pocket: 999_999,
    };
    const tapped = mineByHand(mountain);
    expect(minedOut(tapped)).toBe(1_000_000);
    expect(tapped.materials).toEqual({ ...EMPTY_MATERIALS, clay: 1 });
    expect(tapped.pocket).toBe(1_000_000);
  });

  it("pays the same units live, away, and in small slices", () => {
    const helpers = 2_000;
    const stones = 12_000_000;
    const mountain = { ...createMountain(), helpers };
    const liveMs = (stones / helpers) * 1_000;
    const awayMs = liveMs / AWAY_PAY_RATE;
    const live = accrue({ mountain, from: 0, to: liveMs });
    const away = accrue({ mountain, from: 0, to: awayMs, pay: AWAY_PAY_RATE });
    const closed = accrueAway({ mountain, lastSeen: 0, now: awayMs });
    const expected = {
      clay: 10,
      iron: 2,
      crystal: 0,
      heartstone: 0,
    };
    expect(live.mined).toBe(stones);
    expect(away.mined).toBe(stones);
    expect(closed.mined).toBe(stones);
    expect(live.mountain.materials).toEqual(expected);
    expect(away.mountain.materials).toEqual(expected);
    expect(closed.mountain.materials).toEqual(expected);

    let sliced = mountain;
    let at = 0;
    const slice = liveMs / 1_000;
    for (let step = 0; step < 1_000; step += 1) {
      const part = accrue({ mountain: sliced, from: at, to: at + slice });
      sliced = part.mountain;
      at = part.settledAt;
    }
    expect(minedOut(sliced)).toBe(stones);
    expect(sliced.materials).toEqual(expected);
  });

  it("keeps the remainder, so one-stone digs match one dig", () => {
    const start = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 999_700,
      pocket: 999_700,
      helpers: 10,
    };
    let stepped = start;
    let at = 0;
    for (let step = 0; step < 30; step += 1) {
      const part = accrue({ mountain: stepped, from: at, to: at + 1_000 });
      stepped = part.mountain;
      at = part.settledAt;
    }
    const once = accrue({ mountain: start, from: 0, to: 30_000 });
    const away = accrueAway({ mountain: start, lastSeen: 0, now: 100_000 });
    expect(once.mined).toBe(300);
    expect(away.mined).toBe(300);
    expect(stepped.materials).toEqual(once.mountain.materials);
    expect(away.mountain.materials).toEqual(once.mountain.materials);
    expect(once.mountain.materials?.clay).toBe(1);
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
        materials: EMPTY_MATERIALS,
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
        materials: { ...EMPTY_MATERIALS, heartstone: 1 },
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
    remaining: MOUNTAIN_STONES,
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
      paidMs: 90_500,
      capped: false,
      heart: 1,
      materials: EMPTY_MATERIALS,
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

  it("pays 8 hours of a short gap, and 16 hours of one long absence", () => {
    const short = accrueAway({
      mountain: crew,
      lastSeen: 0,
      now: 10 * 3_600_000,
    });
    expect(short.report.paidMs).toBe(BASE_AWAY_CAP_MS);
    expect(short.mined).toBe((BASE_AWAY_CAP_MS / 1000) * 2 * AWAY_PAY_RATE);
    const now = BASE_AWAY_CAP_MS * 3;
    const result = accrueAway({ mountain: crew, lastSeen: 0, now });
    const longCap = 16 * 3_600_000;
    expect(result.mined).toBe((longCap / 1000) * 2 * AWAY_PAY_RATE);
    expect(result.settledAt).toBe(now);
    expect(result.report).toEqual({
      mined: (longCap / 1000) * 2 * AWAY_PAY_RATE,
      awayMs: now,
      paidMs: longCap,
      capped: true,
      heart: 1,
      materials: EMPTY_MATERIALS,
    });
  });

  it("pays nothing for a clock that went backwards", () => {
    expect(
      accrueAway({ mountain: crew, lastSeen: 5_000, now: 1_000 }).report,
    ).toEqual({
      mined: 0,
      awayMs: 0,
      paidMs: 0,
      capped: false,
      heart: 1,
      materials: EMPTY_MATERIALS,
    });
  });
});

describe("Shield of Protection: away cap", () => {
  const crew = { ...minedMountain(0), helpers: 10 };
  const shielded = { ...minedMountain(10_000_000), helpers: 10 };
  const DAY = 24 * 3_600_000;

  it("pays 16 hours of a long absence without the Shield, and a whole day with it", () => {
    const plain = accrueAway({ mountain: crew, lastSeen: 0, now: 2 * DAY });
    expect(plain.report.capped).toBe(true);
    expect(plain.report.paidMs).toBe(16 * 3_600_000);
    expect(plain.mined).toBe(Math.floor(16 * 3600 * 10 * AWAY_PAY_RATE));
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

  it("pays the unslowed crew while a machine is in trouble", () => {
    const crew = {
      ...createMountain(),
      remaining: 1_000_000,
      helpers: 9,
      carts: 1,
      borers: 1,
    };
    const trouble = {
      kind: "cave-in" as const,
      tier: "cart" as const,
      startedAt: 0,
    };
    const plain = accrue({ mountain: crew, from: 0, to: 10_000, live: true });
    const slowed = accrue({
      mountain: crew,
      from: 0,
      to: 10_000,
      live: true,
      trouble,
    });
    const ignored = accrue({ mountain: crew, from: 0, to: 10_000, trouble });
    const away = accrueAway({ mountain: crew, lastSeen: 0, now: 10_000 });
    expect(slowed.mined).toBeLessThan(plain.mined);
    expect(ignored.mined).toBe(plain.mined);
    expect(away.mined).toBe(Math.floor(plain.mined * AWAY_PAY_RATE));
  });

  it("counts only the paid time, up to the Shield's 24 hours", () => {
    const away = accrueAway({ mountain: hearty, lastSeen: 0, now: 40 * HOUR });
    expect(away.report.heart).toBe(1.5);
    expect(away.mined).toBe(Math.floor(24 * 3600 * 10 * AWAY_PAY_RATE * 1.5));
  });
});
