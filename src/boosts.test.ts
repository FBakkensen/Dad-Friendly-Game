import { describe, expect, it } from "vitest";
import {
  boostById,
  boostCost,
  boostLeft,
  buyBoost,
  parseBoosts,
} from "./boosts";
import { accrue, accrueAway, mineByHand, stonesPerSecond } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";

const MIN = 60_000;
const crew = { ...minedMountain(0), helpers: 500, pocket: 1_000_000 }; // 500/s

describe("quick boosts", () => {
  it("are priced from what they boost, with a floor for new dads", () => {
    // Sharper picks: 120 taps' worth. Overtime: 3 minutes of the crew.
    const pricing = {
      crewPerSecond: 500,
      tapYield: 1_000,
    };
    expect(boostCost(boostById("sharper"), pricing)).toBe(120_000);
    expect(boostCost(boostById("overtime"), pricing)).toBe(90_000);
    const fresh = { crewPerSecond: 0, tapYield: 1 };
    // 120 taps of one stone is already above the 100-stone floor.
    expect(boostCost(boostById("sharper"), fresh)).toBe(120);
    expect(boostCost(boostById("overtime"), fresh)).toBe(500);
  });

  // A dad who plays a 10-minute session tapping about once a second.
  const SESSION_S = 10 * 60;
  const TAPS_PER_S = 1;
  it.each([
    ["a first helper", { helpers: 1 }],
    ["a small crew", { helpers: 40, carts: 10 }],
    ["mid game", { helpers: 120, carts: 40, drills: 15, upgrades: { tap: 3 } }],
    [
      "late game",
      {
        helpers: 400,
        carts: 60,
        drills: 30,
        borers: 10,
        machines: 4,
        upgrades: { tap: 10 },
      },
    ],
  ])("pay back more than they cost with %s", (_, fields) => {
    const mountain = { ...minedMountain(30_000_000), ...fields };
    const rates = effectiveRates(mountain);
    // Overtime runs past a short session; count only the 10 minutes played.
    const overtime = boostById("overtime");
    const overtimeGain =
      rates.crewPerSecond * (overtime.multiplier - 1) * SESSION_S;
    const sharper = boostById("sharper");
    const sharperGain =
      rates.tapYield *
      (sharper.multiplier - 1) *
      TAPS_PER_S *
      (sharper.durationMs / 1000);
    if (rates.crewPerSecond * overtime.priceUnits >= overtime.minCost) {
      expect(overtimeGain).toBeGreaterThanOrEqual(
        3 * boostCost(overtime, rates),
      );
    }
    expect(sharperGain).toBeGreaterThanOrEqual(5 * boostCost(sharper, rates));
  });

  it("never show more than a boost's full length after the clock is set back (#116)", () => {
    const sharp = buyBoost({
      mountain: crew,
      id: "sharper",
      now: 1_000,
      pricing: { crewPerSecond: 500, tapYield: 500 },
    });
    expect(boostLeft(sharp, "sharper", 1_000 - 60 * MIN)).toBe(10 * MIN);
  });

  it("start a countdown saved as an end time, one of each at a time", () => {
    const sharp = buyBoost({
      mountain: crew,
      id: "sharper",
      now: 1_000,
      pricing: { crewPerSecond: 500, tapYield: 500 },
    });
    expect(sharp.pocket).toBe(940_000); // 120 taps × 500
    expect(sharp.boosts).toEqual({ sharper: 1_000 + 10 * MIN });
    expect(boostLeft(sharp, "sharper", 1_000 + 4 * MIN)).toBe(6 * MIN);
    // Already running: can't stack or restart.
    expect(
      buyBoost({
        mountain: sharp,
        id: "sharper",
        now: 2_000,
        pricing: { crewPerSecond: 500, tapYield: 500 },
      }),
    ).toBe(sharp);
    // The other one can run alongside.
    const both = buyBoost({
      mountain: sharp,
      id: "overtime",
      now: 2_000,
      pricing: { crewPerSecond: 500, tapYield: 500 },
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
        pricing: { crewPerSecond: 500, tapYield: 500 },
      }).boosts?.sharper,
    ).toBe(later + 10 * MIN);
    // Too poor: nothing happens.
    const poor = { ...crew, pocket: 99 };
    expect(
      buyBoost({
        mountain: poor,
        id: "sharper",
        now: 0,
        pricing: { crewPerSecond: 0, tapYield: 1 },
      }),
    ).toBe(poor);
  });

  it("Sharper picks doubles taps (tap power included) only while it runs", () => {
    const strong = {
      ...crew,
      upgrades: { tap: 2 },
      boosts: { sharper: 10 * MIN },
    };
    expect(effectiveRates(strong).tapYield).toBe(11);
    expect(effectiveRates(strong, 5 * MIN).tapYield).toBe(22);
    expect(effectiveRates(strong, 10 * MIN).tapYield).toBe(11);
    expect(mineByHand(strong, 0).pocket - strong.pocket).toBe(22);
  });

  it("Overtime doubles the crew while playing, but never away earnings", () => {
    const over = { ...crew, boosts: { overtime: 30 * MIN } };
    expect(stonesPerSecond(over)).toBe(500);
    expect(stonesPerSecond(over, MIN)).toBe(1_000);
    // Tap power takes its share of the crew's own speed, not the doubled one.
    expect(
      effectiveRates({ ...over, upgrades: { tap: 1 } }, MIN).tapYield,
    ).toBe(6);
    expect(
      accrue({ mountain: over, from: 0, to: 10_000, live: true }).mined,
    ).toBe(10_000);
    expect(accrue({ mountain: over, from: 0, to: 10_000 }).mined).toBe(5_000);
    expect(accrueAway({ mountain: over, lastSeen: 0, now: 10_000 }).mined).toBe(
      1_500,
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
