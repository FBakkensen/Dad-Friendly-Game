import { describe, expect, it } from "vitest";
import {
  boostById,
  boostCost,
  boostLeft,
  buyBoost,
  parseBoosts,
  NO_BOOSTS,
} from "./boosts";
import { accrue, accrueAway, stonesPerSecond } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain, NONE_OWNED } from "./test-fixtures";

const MIN = 60_000;
const crew = {
  ...minedMountain(0),
  stock: { ...minedMountain(0).stock, stones: 1_000_000 },
  owned: { ...minedMountain(0).owned, helper: 500 },
}; // 500 workers, x8 at the 100 mark: 4,000/s

describe("quick boosts", () => {
  it("are priced from what they boost, with a floor for new dads", () => {
    // Overtime is priced in seconds of the crew. Sharper picks was priced in
    // taps, and since the dig went (#728) a tap is no stones, so it costs its
    // floor. The units and floors are pinned in src/tuning.test.ts (#381).
    const sharper = boostById("sharper");
    const overtime = boostById("overtime");
    const pricing = { crewPerSecond: 500 };
    expect(boostCost(sharper, pricing)).toBe(sharper.minCost);
    expect(boostCost(overtime, pricing)).toBe(500 * overtime.priceUnits);
    const fresh = { crewPerSecond: 0 };
    // A crew of nothing pays Overtime's floor.
    expect(boostCost(sharper, fresh)).toBe(sharper.minCost);
    expect(boostCost(overtime, fresh)).toBe(overtime.minCost);
  });

  // A dad who plays a 10-minute session.
  const SESSION_S = 10 * 60;
  it.each([
    ["a first helper", { owned: { ...NONE_OWNED, helper: 1 } }],
    ["a small crew", { owned: { ...NONE_OWNED, helper: 40, cart: 10 } }],
    [
      "mid game",
      {
        owned: { ...NONE_OWNED, helper: 120, cart: 40, drill: 15 },
      },
    ],
    [
      "late game",
      {
        owned: {
          ...NONE_OWNED,
          helper: 400,
          cart: 60,
          drill: 30,
          borer: 10,
          machine: 4,
        },
      },
    ],
  ])("pay back more than they cost with %s", (_, fields) => {
    const mountain = { ...minedMountain(30_000_000), ...fields };
    const rates = effectiveRates(mountain);
    // Overtime runs past a short session; count only the 10 minutes played.
    const overtime = boostById("overtime");
    const overtimeGain =
      rates.crewPerSecond * (overtime.multiplier - 1) * SESSION_S;
    if (rates.crewPerSecond * overtime.priceUnits >= overtime.minCost) {
      expect(overtimeGain).toBeGreaterThanOrEqual(
        3 * boostCost(overtime, rates),
      );
    }
  });

  it("never prices Sharper picks off a big crew (#333)", () => {
    const sharper = boostById("sharper");
    expect(boostCost(sharper, { crewPerSecond: 586 })).toBe(sharper.minCost);
    expect(boostCost(sharper, { crewPerSecond: 60_000 })).toBe(sharper.minCost);
  });

  it("never show more than a boost's full length after the clock is set back (#116)", () => {
    const sharp = buyBoost({
      mountain: crew,
      id: "sharper",
      now: 1_000,
      pricing: { crewPerSecond: 500 },
    });
    expect(boostLeft(sharp, "sharper", 1_000 - 60 * MIN)).toBe(10 * MIN);
  });

  it("start a countdown saved as an end time, one of each at a time", () => {
    const sharp = buyBoost({
      mountain: crew,
      id: "sharper",
      now: 1_000,
      pricing: { crewPerSecond: 500 },
    });
    // Its floor: a tap is no stones since the dig went (#728).
    expect(sharp.stock.stones).toBe(
      crew.stock.stones - boostById("sharper").minCost,
    );
    expect(sharp.boosts).toEqual({ ...NO_BOOSTS, sharper: 1_000 + 10 * MIN });
    expect(boostLeft(sharp, "sharper", 1_000 + 4 * MIN)).toBe(6 * MIN);
    // Already running: can't stack or restart.
    expect(
      buyBoost({
        mountain: sharp,
        id: "sharper",
        now: 2_000,
        pricing: { crewPerSecond: 500 },
      }),
    ).toBe(sharp);
    // The other one can run alongside.
    const both = buyBoost({
      mountain: sharp,
      id: "overtime",
      now: 2_000,
      pricing: { crewPerSecond: 500 },
    });
    expect(both.boosts).toEqual({
      sharper: 1_000 + 10 * MIN,
      overtime: 2_000 + 30 * MIN,
    });
    // Once it ends it can be bought again.
    const later = 1_000 + 10 * MIN;
    expect(boostLeft(both, "sharper", later)).toBe(0);
    expect(
      buyBoost({
        mountain: both,
        id: "sharper",
        now: later,
        pricing: { crewPerSecond: 500 },
      }).boosts.sharper,
    ).toBe(later + 10 * MIN);
    // Too poor: nothing happens.
    const poor = { ...crew, stock: { ...crew.stock, stones: 99 } };
    expect(
      buyBoost({
        mountain: poor,
        id: "sharper",
        now: 0,
        pricing: { crewPerSecond: 0 },
      }),
    ).toBe(poor);
  });

  it("Overtime doubles the crew while playing, but never away earnings", () => {
    const over = { ...crew, boosts: { ...NO_BOOSTS, overtime: 30 * MIN } };
    expect(stonesPerSecond(over)).toBe(4_000);
    expect(stonesPerSecond(over, MIN)).toBe(8_000);
    expect(
      accrue({ mountain: over, from: 0, to: 10_000, live: true }).mined,
    ).toBe(80_000);
    expect(accrue({ mountain: over, from: 0, to: 10_000 }).mined).toBe(40_000);
    expect(accrueAway({ mountain: over, lastSeen: 0, now: 10_000 }).mined).toBe(
      12_000,
    );
  });

  it("reads saved end times and rejects anything odd", () => {
    expect(parseBoosts({ sharper: 5, overtime: 9 })).toEqual({
      sharper: 5,
      overtime: 9,
    });
    for (const bad of [
      null,
      [],
      { sharper: -1 },
      { sharper: 1.5 },
      { turbo: 1 },
      { overtime: "9" },
    ]) {
      expect(parseBoosts(bad)).toBeUndefined();
    }
  });
});
