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
const crew = { ...minedMountain(0), carts: 50, pocket: 1_000_000 }; // 500/s

describe("quick boosts", () => {
  it("are priced from the crew's speed, with a floor for new dads", () => {
    expect(boostCost(boostById("sharper"), 500)).toBe(30_000);
    expect(boostCost(boostById("overtime"), 500)).toBe(300_000);
    expect(boostCost(boostById("sharper"), 0)).toBe(100);
    expect(boostCost(boostById("overtime"), 0)).toBe(500);
  });

  it("start a countdown saved as an end time, one of each at a time", () => {
    const sharp = buyBoost({
      mountain: crew,
      id: "sharper",
      now: 1_000,
      crewPerSecond: 500,
    });
    expect(sharp.pocket).toBe(970_000);
    expect(sharp.boosts).toEqual({ sharper: 1_000 + 10 * MIN });
    expect(boostLeft(sharp, "sharper", 1_000 + 4 * MIN)).toBe(6 * MIN);
    // Already running: can't stack or restart.
    expect(
      buyBoost({
        mountain: sharp,
        id: "sharper",
        now: 2_000,
        crewPerSecond: 500,
      }),
    ).toBe(sharp);
    // The other one can run alongside.
    const both = buyBoost({
      mountain: sharp,
      id: "overtime",
      now: 2_000,
      crewPerSecond: 500,
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
        crewPerSecond: 500,
      }).boosts?.sharper,
    ).toBe(later + 10 * MIN);
    // Too poor: nothing happens.
    const poor = { ...crew, pocket: 99 };
    expect(
      buyBoost({ mountain: poor, id: "sharper", now: 0, crewPerSecond: 0 }),
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
