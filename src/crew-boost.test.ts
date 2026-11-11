import { RUSH_MS, startRush } from "./gold-rush";
import { describe, expect, it } from "vitest";
import { dialFrame, liveCrewBoost, type CrewBoost } from "./crew-boost";
import { boostById } from "./boosts";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import { chargeCrewMultiplier, timerDurationMs } from "./workshop";
import type { Mountain } from "./mountain";

const NOW = 1_000_000_000_000;
const MIN = 60_000;

const crew = (): Mountain => ({
  ...minedMountain(0),
  helpers: 3,
  carts: 4,
  kids: 0,
});
const withOvertime = (m: Mountain, startedAgo: number): Mountain => ({
  ...m,
  boosts: { overtime: NOW - startedAgo + boostById("overtime").durationMs },
});

const agrees = (m: Mountain): void => {
  const boost = liveCrewBoost(m, NOW);
  const base = effectiveRates(m).crewPerSecond;
  expect(base).toBeGreaterThan(0);
  const live = effectiveRates(m, NOW).crewPerSecond;
  const multiplier = boost.kind === "running" ? boost.multiplier : 1;
  expect(multiplier).toBeCloseTo(live / base, 1);
};

describe("liveCrewBoost", () => {
  it("rested with nothing running", () => {
    expect(liveCrewBoost(crew(), NOW)).toEqual({ kind: "rested" });
    agrees(crew());
  });

  it("Overtime alone", () => {
    const m = withOvertime(crew(), MIN);
    expect(liveCrewBoost(m, NOW)).toEqual({
      kind: "running",
      source: "overtime",
      name: "Overtime",
      multiplier: 2,
      leftMs: 29 * MIN,
      fullMs: 30 * MIN,
    });
    agrees(m);
  });

  it("the strongest wins", () => {
    const m: Mountain = {
      ...withOvertime(crew(), MIN),
      chargeUntil: NOW + 5 * MIN,
    };
    const charge = chargeCrewMultiplier(m, NOW);
    const overtime = boostById("overtime").multiplier;
    const boost = liveCrewBoost(m, NOW);
    expect(boost.kind).toBe("running");
    if (boost.kind === "running") {
      expect(boost.multiplier).toBe(Math.max(charge, overtime));
      expect(boost.source).toBe(
        charge > overtime ? "blasting-charge" : "overtime",
      );
    }
    agrees(m);
  });

  it("a tie goes to the most time left", () => {
    // Blasting charge and Overtime both read ×2 today; make Overtime shorter.
    const base: Mountain = {
      ...withOvertime(crew(), 29 * MIN),
      chargeUntil: NOW + 10 * MIN,
    };
    expect(chargeCrewMultiplier(base, NOW)).toBe(
      boostById("overtime").multiplier,
    );
    const charge = liveCrewBoost(base, NOW);
    expect(charge).toMatchObject({
      source: "blasting-charge",
      leftMs: 10 * MIN,
    });
    const longer: Mountain = { ...base, chargeUntil: NOW + 30_000 };
    expect(liveCrewBoost(longer, NOW)).toMatchObject({
      source: "overtime",
      leftMs: MIN,
    });
    expect(timerDurationMs("blasting-charge")).toBeGreaterThan(0);
    agrees(base);
    agrees(longer);
  });

  it("an axle grease on the clock runs the crew", () => {
    const m: Mountain = { ...crew(), axleUntil: NOW + 5 * MIN };
    const boost = liveCrewBoost(m, NOW);
    expect(boost).toMatchObject({
      source: "axle-grease",
      name: "Axle grease",
      leftMs: 5 * MIN,
      fullMs: timerDurationMs("axle-grease"),
    });
    agrees(m);
  });
});

describe("the Gold rush on the dial (#468)", () => {
  it("shows the rush over Overtime, and the crew runs at both", () => {
    const m: Mountain = {
      ...startRush({ ...crew(), rushBank: 9_000 }, NOW),
      boosts: { overtime: NOW + 10 * MIN },
    };
    expect(liveCrewBoost(m, NOW)).toEqual({
      kind: "running",
      source: "gold-rush",
      name: "Gold rush",
      multiplier: 10,
      leftMs: RUSH_MS,
      fullMs: RUSH_MS,
    });
    // Overtime's ×2, plus the 9,000 held stones over 90 seconds
    expect(effectiveRates(m, NOW).crewPerSecond).toBe(
      effectiveRates(crew()).crewPerSecond * 2 + 100,
    );
  });

  it("goes back to Overtime when the rush ends", () => {
    const m: Mountain = {
      ...startRush({ ...crew(), rushBank: 9_000 }, NOW),
      boosts: { overtime: NOW + 10 * MIN },
    };
    expect(liveCrewBoost(m, NOW + RUSH_MS)).toMatchObject({
      source: "overtime",
    });
  });
});

describe("dialFrame", () => {
  const running = (leftMs: number, fullMs: number): CrewBoost => ({
    kind: "running",
    source: "overtime",
    name: "Overtime",
    multiplier: 2,
    leftMs,
    fullMs,
  });
  it("maps time left onto 31 frames", () => {
    expect(dialFrame({ kind: "rested" })).toBe(0);
    expect(dialFrame(running(29 * MIN, 30 * MIN))).toBe(29);
    expect(dialFrame(running(1000, 30 * MIN))).toBe(1);
    expect(dialFrame(running(30 * MIN, 30 * MIN))).toBe(30);
  });
});
