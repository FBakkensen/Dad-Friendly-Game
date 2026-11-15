import { EMPTY_MATERIALS, type Materials } from "./layers";
import { minedMountain } from "./test-fixtures";
import { setOwned } from "./tiers";
import { describe, expect, it } from "vitest";
import { BAND_SCALE, BAND_STARTS, shownStones, stonesLeft } from "./scale";
import { materialsGained } from "./layers";
import { AWAY_PAY_RATE } from "./rates";
import {
  MOUNTAIN_STONES,
  accrueAway,
  accrue,
  createMountain,
  digStones,
  mineByHand,
  minedOut,
  stonesPerSecond,
  BARE_MOUNTAIN,
  type Mountain,
} from "./mountain";
import { STARTING_RECIPE_IDS } from "./workshop";

/** The four materials a mountain holds (#560: they live in its stock). */
const materialsIn = (mountain: Mountain): Materials => ({
  clay: mountain.stock.clay,
  iron: mountain.stock.iron,
  crystal: mountain.stock.crystal,
  heartstone: mountain.stock.heartstone,
});

describe("mountain", () => {
  it("starts with a million stones, an empty pocket, and no helpers", () => {
    expect(createMountain()).toEqual({
      ...BARE_MOUNTAIN,
      remaining: MOUNTAIN_STONES,
      stock: { ...BARE_MOUNTAIN.stock, stones: 0, ...EMPTY_MATERIALS },
      owned: {
        ...BARE_MOUNTAIN.owned,
        helper: 0,
        cart: 0,
        drill: 0,
        borer: 0,
        machine: 0,
        kid: 0,
      },
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
      stock: { ...createMountain().stock, stones: 3 },
    });
    expect(minedOut(mountain)).toBe(3);
  });

  it("stops at zero and returns the same mountain", () => {
    const empty = {
      ...BARE_MOUNTAIN,
      remaining: 0,
      stock: { ...BARE_MOUNTAIN.stock, stones: 5 },
      owned: {
        ...BARE_MOUNTAIN.owned,
        helper: 0,
        cart: 0,
        drill: 0,
        borer: 0,
        machine: 0,
        kid: 0,
      },
    };
    expect(mineByHand(empty)).toBe(empty);
  });
});

describe("materials from digging", () => {
  it("pays a hand tap when the stones cross a gap", () => {
    const mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 999_999,
      stock: { ...createMountain().stock, stones: 999_999 },
    };
    const tapped = mineByHand(mountain);
    expect(minedOut(tapped)).toBe(1_000_000);
    expect(materialsIn(tapped)).toEqual({ ...EMPTY_MATERIALS, clay: 1 });
    expect(tapped.stock.stones).toBe(1_000_000);
  });

  it("pays the same units live, away, and in small slices", () => {
    const helpers = 1_500;
    // From 7M to 14M, so the dig crosses into the Granite and the away pay
    // divides whole seconds (3M + 4M x 2.625 = 13.5M stones, #357 tune).
    const depth = 14_000_000;
    const mountain = setOwned(minedMountain(7_000_000), "helper", helpers);
    const stones =
      shownStones(mountain, depth) - shownStones(mountain, 7_000_000);
    // 1,500 workers hold the top three marks, so each digs 8 a second.
    const liveMs = (stones / (helpers * 8)) * 1_000;
    const awayMs = liveMs / AWAY_PAY_RATE;
    const live = accrue({ mountain, from: 0, to: liveMs });
    const away = accrue({ mountain, from: 0, to: awayMs, pay: AWAY_PAY_RATE });
    const closed = accrueAway({ mountain, lastSeen: 0, now: awayMs });
    const expected = {
      clay: 3,
      iron: 4,
      crystal: 0,
      heartstone: 0,
    };
    expect(live.mined).toBe(stones);
    expect(away.mined).toBe(stones);
    expect(closed.mined).toBe(stones);
    expect(materialsIn(live.mountain)).toEqual(expected);
    expect(materialsIn(away.mountain)).toEqual(expected);
    expect(materialsIn(closed.mountain)).toEqual(expected);

    let sliced = mountain;
    let at = 0;
    // Whole-second slices: the dig divides whole seconds.
    const slice = 1_000;
    for (let step = 0; step < liveMs / slice; step += 1) {
      const part = accrue({ mountain: sliced, from: at, to: at + slice });
      sliced = part.mountain;
      at = part.settledAt;
    }
    expect(minedOut(sliced)).toBeCloseTo(depth, 3);
    expect(materialsIn(sliced)).toEqual(expected);
  });

  it("keeps the remainder, so one-stone digs match one dig", () => {
    const start = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 999_700,
      stock: { ...createMountain().stock, stones: 999_700 },
      owned: { ...createMountain().owned, helper: 10 },
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
    expect(materialsIn(stepped)).toEqual(materialsIn(once.mountain));
    expect(materialsIn(away.mountain)).toEqual(materialsIn(once.mountain));
    expect(once.mountain.stock.clay).toBe(1);
  });
});

describe("accrue", () => {
  // Shallow, in the Topsoil, so a stone is a stone of depth.
  const crew = {
    ...BARE_MOUNTAIN,
    remaining: MOUNTAIN_STONES - 1000,
    stock: { ...BARE_MOUNTAIN.stock, stones: 0 },
    owned: {
      ...BARE_MOUNTAIN.owned,
      helper: 2,
      cart: 0,
      drill: 0,
      borer: 0,
      machine: 0,
      kid: 0,
    },
  };

  it("mines whole seconds and keeps the leftover part-second unspent", () => {
    expect(accrue({ mountain: crew, from: 0, to: 2_750 })).toEqual({
      mountain: {
        ...crew,
        remaining: MOUNTAIN_STONES - 1_004,
        stock: { ...crew.stock, stones: 4, ...EMPTY_MATERIALS },
        owned: {
          ...crew.owned,
          helper: 2,
          cart: 0,
          drill: 0,
          borer: 0,
          machine: 0,
          kid: 0,
        },
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
    // 3 depth left in the Heart band takes 3 x BAND_SCALE[3] stones, rounded
    // up to whole stones (#357: 3 x 32.4 is 97.2, so 98).
    const left = Math.ceil(3 * BAND_SCALE[3]);
    const almost = {
      ...BARE_MOUNTAIN,
      remaining: 3,
      stock: { ...BARE_MOUNTAIN.stock, stones: 0 },
      owned: {
        ...BARE_MOUNTAIN.owned,
        helper: 2,
        cart: 0,
        drill: 0,
        borer: 0,
        machine: 0,
        kid: 0,
      },
    };
    expect(
      accrue({ mountain: almost, from: 0, to: (left / 2 + 0.5) * 1_000 }),
    ).toEqual({
      mountain: {
        ...almost,
        remaining: 0,
        stock: {
          ...almost.stock,
          stones: left,
          ...EMPTY_MATERIALS,
          heartstone: 1,
        },
        owned: {
          ...almost.owned,
          helper: 2,
          cart: 0,
          drill: 0,
          borer: 0,
          machine: 0,
          kid: 0,
        },
      },
      mined: left,
      settledAt: (left / 2 + 0.5) * 1_000,
    });
  });

  it("does nothing without helpers or when the clock goes backwards", () => {
    const idle = {
      ...BARE_MOUNTAIN,
      remaining: 10,
      stock: { ...BARE_MOUNTAIN.stock, stones: 0 },
      owned: {
        ...BARE_MOUNTAIN.owned,
        helper: 0,
        cart: 0,
        drill: 0,
        borer: 0,
        machine: 0,
        kid: 0,
      },
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

describe("a stretch that crosses into a new band (#592)", () => {
  // 500 stones above the Granite, which slows drills.
  const drillCrew = {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - (BAND_STARTS[1] - 500),
    owned: {
      ...createMountain().owned,
      helper: 30,
      cart: 10,
      hoist: 10,
      drill: 20,
    },
  };

  it("pays what the same time pays a second at a time", () => {
    const once = accrue({ mountain: drillCrew, from: 0, to: 120_000 });
    let stepped = drillCrew;
    for (let second = 0; second < 120; second += 1) {
      stepped = accrue({
        mountain: stepped,
        from: second * 1000,
        to: (second + 1) * 1000,
      }).mountain;
    }
    expect(minedOut(once.mountain)).toBeGreaterThan(BAND_STARTS[1]);
    expect(
      Math.abs(minedOut(once.mountain) - minedOut(stepped)),
    ).toBeLessThanOrEqual(120);
    expect(once.settledAt).toBe(120_000);
  });

  it("digs at the new band's speed past the crossing", () => {
    const topsoilSpeed = stonesPerSecond(drillCrew);
    const once = accrue({ mountain: drillCrew, from: 0, to: 120_000 });
    expect(once.mined).toBeLessThan(Math.floor(120 * topsoilSpeed));
    const crossed = digStones(drillCrew, 500);
    expect(stonesPerSecond(crossed)).toBeLessThan(topsoilSpeed);
  });

  it("a slow crew a part stone above the band keeps digging past it", () => {
    // A stretched run, one worker at away pay: under a stone a second, and
    // the depth a part stone short of the Granite.
    for (const stretch of [1, 1.5, 2.84]) {
      const slow = {
        ...createMountain(),
        stretch,
        owned: { ...createMountain().owned, helper: 1 },
        remaining: MOUNTAIN_STONES - (BAND_STARTS[1] - 0.3 / stretch),
      };
      const rate = stonesPerSecond(slow);
      const hour = accrue({ mountain: slow, from: 0, to: 3_600_000, pay: 0.3 });
      expect(minedOut(hour.mountain)).toBeGreaterThan(BAND_STARTS[1]);
      expect(hour.mined).toBeGreaterThanOrEqual(
        Math.floor(3600 * rate * 0.3) - 2,
      );
    }
  });
});

describe("accrueAway", () => {
  const crew = {
    ...BARE_MOUNTAIN,
    remaining: MOUNTAIN_STONES,
    stock: { ...BARE_MOUNTAIN.stock, stones: 0 },
    owned: {
      ...BARE_MOUNTAIN.owned,
      helper: 2,
      cart: 0,
      drill: 0,
      borer: 0,
      machine: 0,
      kid: 0,
    },
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

  it.each([
    [4, 4],
    [6, 6],
    [8, 6.8],
    [12, 8.4],
    [16, 10],
    [24, 13.2],
    [48, 13.2],
  ])("slopes away pay: %i hours away pays %f hours (#278)", (away, paid) => {
    const now = away * 3_600_000;
    const result = accrueAway({ mountain: crew, lastSeen: 0, now });
    expect(result.report.paidMs).toBeCloseTo(paid * 3_600_000, 3);
    expect(result.report.capped).toBe(away > 6);
    expect(result.mined).toBe(Math.floor(paid * 3600 * 2 * AWAY_PAY_RATE));
    expect(result.settledAt).toBe(now);
  });

  it("pays nothing for a clock that went backwards", () => {
    expect(
      accrueAway({ mountain: crew, lastSeen: 5_000, now: 1_000 }).report,
    ).toEqual({
      mined: 0,
      awayMs: 0,
      paidMs: 0,
      capped: false,
      materials: EMPTY_MATERIALS,
    });
  });
});

describe("the away cap", () => {
  const crew = {
    ...minedMountain(0),
    owned: { ...minedMountain(0).owned, helper: 10 },
  };
  const deep = {
    ...minedMountain(45_000_000),
    owned: { ...minedMountain(45_000_000).owned, helper: 10 },
  };
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  it("pays 13.2 hours of a long absence, however deep the mine (#728)", () => {
    for (const mountain of [crew, deep]) {
      const away = accrueAway({ mountain, lastSeen: 0, now: 2 * DAY });
      expect(away.report.capped).toBe(true);
      expect(away.report.paidMs).toBeCloseTo(13.2 * HOUR, 3);
      expect(away.mined).toBe(Math.floor(13.2 * 3600 * 10 * AWAY_PAY_RATE));
    }
  });

  it("pays the away rate, never more for a longer absence (#728)", () => {
    const away = accrueAway({ mountain: deep, lastSeen: 0, now: 6 * HOUR });
    expect(away.mined).toBe(Math.floor(6 * 3600 * 10 * AWAY_PAY_RATE));
  });

  it("pays the unslowed crew while a machine is in trouble", () => {
    const crew = {
      ...createMountain(),
      remaining: 1_000_000,
      owned: { ...createMountain().owned, helper: 9, cart: 1, borer: 1 },
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
});

describe("digging through band scales (#356)", () => {
  it("a haul across two boundaries lands on the exact depth, pocket and materials", () => {
    const start = minedMountain(9_000_000);
    const stones =
      (BAND_STARTS[1] - 9_000_000) * BAND_SCALE[0] +
      (BAND_STARTS[2] - BAND_STARTS[1]) * BAND_SCALE[1] +
      5_000_000 * BAND_SCALE[2];
    const dug = digStones(start, stones);
    expect(minedOut(dug)).toBe(BAND_STARTS[2] + 5_000_000);
    expect(dug.stock.stones - start.stock.stones).toBe(stones);
    const gained = materialsGained(9_000_000, minedOut(dug));
    const before = materialsIn(start);
    expect(materialsIn(dug)).toEqual({
      ...before,
      clay: before.clay + gained.clay,
      iron: before.iron + gained.iron,
      crystal: before.crystal + gained.crystal,
    });
    expect(gained.iron).toBeGreaterThan(0);
  });

  it("the last stones empty the mountain and the pocket gains exactly stonesLeft", () => {
    const m = minedMountain(MOUNTAIN_STONES - 1_000);
    const left = stonesLeft(m);
    expect(left).toBe(1_000 * BAND_SCALE[3]);
    const exact = digStones(m, left);
    expect(exact.remaining).toBe(0);
    const over = digStones(m, left + 5);
    expect(over.remaining).toBe(0);
    expect(over.stock.stones - m.stock.stones).toBe(left + 5);
    const tapped = mineByHand({ ...m, remaining: 0 });
    expect(tapped.remaining).toBe(0);
  });

  it("an hour in the Granite moves depth by stones over the band scale", () => {
    const granite = {
      ...minedMountain(BAND_STARTS[1] + 1_000),
      owned: { ...minedMountain(BAND_STARTS[1] + 1_000).owned, helper: 2 },
    };
    const result = accrue({ mountain: granite, from: 0, to: 3_600_000 });
    expect(result.mined).toBeGreaterThan(0);
    expect(minedOut(result.mountain) - minedOut(granite)).toBeCloseTo(
      result.mined / BAND_SCALE[1],
      6,
    );
  });
});
