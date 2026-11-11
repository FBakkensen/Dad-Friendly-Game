import { describe, expect, it } from "vitest";
import {
  boostById,
  boostCost,
  boostLeft,
  buyBoost,
  parseBoosts,
  NO_BOOSTS,
} from "./boosts";
import { accrue, accrueAway, mineByHand, stonesPerSecond } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import { NO_UPGRADES } from "./upgrades";

const MIN = 60_000;
const crew = { ...minedMountain(0), helpers: 500, pocket: 1_000_000 }; // 500 workers, x8 at the 100 mark: 4,000/s

describe("quick boosts", () => {
  it("are priced from what they boost, with a floor for new dads", () => {
    // Sharper picks is priced in taps, Overtime in seconds of the crew. The
    // units and floors are pinned in src/tuning.test.ts (#381).
    const sharper = boostById("sharper");
    const overtime = boostById("overtime");
    const pricing = {
      crewPerSecond: 500,
      tapYield: 1_000,
    };
    expect(boostCost(sharper, pricing)).toBe(1_000 * sharper.priceUnits);
    expect(boostCost(overtime, pricing)).toBe(500 * overtime.priceUnits);
    const fresh = { crewPerSecond: 0, tapYield: 1 };
    // A one-stone tap already prices Sharper picks above its floor; a crew of
    // nothing pays Overtime's floor.
    expect(sharper.priceUnits).toBeGreaterThan(sharper.minCost);
    expect(boostCost(sharper, fresh)).toBe(sharper.priceUnits);
    expect(boostCost(overtime, fresh)).toBe(overtime.minCost);
  });

  // A dad who plays a 10-minute session tapping about once a second.
  const SESSION_S = 10 * 60;
  const TAPS_PER_S = 1;
  it.each([
    ["a first helper", { helpers: 1 }],
    ["a small crew", { helpers: 40, carts: 10 }],
    [
      "mid game",
      {
        helpers: 120,
        carts: 40,
        drills: 15,
        upgrades: { ...NO_UPGRADES, tap: 3 },
      },
    ],
    [
      "late game",
      {
        helpers: 400,
        carts: 60,
        drills: 30,
        borers: 10,
        machines: 4,
        upgrades: { ...NO_UPGRADES, tap: 10 },
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
    // Priced from taps alone (#333): a slow session earns it back five times,
    // however big the crew.
    const cost = boostCost(sharper, rates);
    expect(sharperGain).toBeGreaterThanOrEqual(5 * cost);
  });

  it("never prices Sharper picks off a big crew whose taps are still 1 (#333)", () => {
    // The mid save: 586 stones a second, Strong arms at 0.
    const rates = { crewPerSecond: 586, tapYield: 1 };
    const sharper = boostById("sharper");
    // Its taps' worth, never the crew's.
    expect(boostCost(sharper, rates)).toBe(sharper.priceUnits);
    expect(boostCost(sharper, { crewPerSecond: 60_000, tapYield: 1 })).toBe(
      sharper.priceUnits,
    );
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
    // Its taps' worth at 500 a tap.
    expect(sharp.pocket).toBe(
      crew.pocket - boostById("sharper").priceUnits * 500,
    );
    expect(sharp.boosts).toEqual({ ...NO_BOOSTS, sharper: 1_000 + 10 * MIN });
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
      }).boosts.sharper,
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
      upgrades: { ...NO_UPGRADES, tap: 2 },
      boosts: { ...NO_BOOSTS, sharper: 10 * MIN },
    };
    expect(effectiveRates(strong).tapYield).toBe(133);
    expect(effectiveRates(strong, 5 * MIN).tapYield).toBe(266);
    expect(effectiveRates(strong, 10 * MIN).tapYield).toBe(133);
    expect(mineByHand(strong, 0).pocket - strong.pocket).toBe(266);
  });

  it("Overtime doubles the crew while playing, but never away earnings", () => {
    const over = { ...crew, boosts: { ...NO_BOOSTS, overtime: 30 * MIN } };
    expect(stonesPerSecond(over)).toBe(4_000);
    expect(stonesPerSecond(over, MIN)).toBe(8_000);
    // Tap power takes its share of the crew's own speed, not the doubled one.
    expect(
      effectiveRates({ ...over, upgrades: { ...NO_UPGRADES, tap: 1 } }, MIN)
        .tapYield,
    ).toBe(67);
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
