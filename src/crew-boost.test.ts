import { RUSH_MS, startRush } from "./gold-rush";
import { describe, expect, it } from "vitest";
import {
  boostRanOut,
  dialFrame,
  liveCrewBoost,
  strongestCrewTimer,
  type CrewBoost,
} from "./crew-boost";
import { boostById, NO_BOOSTS } from "./boosts";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import {
  axleCrewMultiplier,
  chargeCrewMultiplier,
  timerDurationMs,
  COLD_CLOCKS,
} from "./workshop";
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
  boosts: {
    ...NO_BOOSTS,
    overtime: NOW - startedAgo + boostById("overtime").durationMs,
  },
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
      clocks: { ...COLD_CLOCKS, "blasting-charge": NOW + 5 * MIN },
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
      clocks: { ...COLD_CLOCKS, "blasting-charge": NOW + 10 * MIN },
    };
    expect(chargeCrewMultiplier(base, NOW)).toBe(
      boostById("overtime").multiplier,
    );
    const charge = liveCrewBoost(base, NOW);
    expect(charge).toMatchObject({
      source: "blasting-charge",
      leftMs: 10 * MIN,
    });
    const longer: Mountain = {
      ...base,
      clocks: { ...COLD_CLOCKS, "blasting-charge": NOW + 30_000 },
    };
    expect(liveCrewBoost(longer, NOW)).toMatchObject({
      source: "overtime",
      leftMs: MIN,
    });
    expect(timerDurationMs("blasting-charge")).toBeGreaterThan(0);
    agrees(base);
    agrees(longer);
  });

  it("an axle grease on the clock runs the crew", () => {
    const m: Mountain = {
      ...crew(),
      clocks: { ...COLD_CLOCKS, "axle-grease": NOW + 5 * MIN },
    };
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
  it("shows the rush's held stones over Overtime, and the crew runs at Overtime alone", () => {
    const m: Mountain = {
      ...startRush({ ...crew(), rushBank: 9_000 }, NOW),
      boosts: { ...NO_BOOSTS, overtime: NOW + 10 * MIN },
    };
    expect(liveCrewBoost(m, NOW)).toEqual({
      kind: "rush",
      name: "Gold rush",
      held: 9_000,
      leftMs: RUSH_MS,
      fullMs: RUSH_MS,
    });
    // Overtime's ×2; the held stones are paid beside the crew, not as its speed (#525)
    expect(effectiveRates(m, NOW).crewPerSecond).toBe(
      effectiveRates(crew()).crewPerSecond * 2,
    );
  });

  it("goes back to Overtime when the rush ends", () => {
    const m: Mountain = {
      ...startRush({ ...crew(), rushBank: 9_000 }, NOW),
      boosts: { ...NO_BOOSTS, overtime: NOW + 10 * MIN },
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

describe("boostRanOut (#527)", () => {
  const SEC = 1000;
  const seenAt = (m: Mountain, at: number) => ({
    timer: strongestCrewTimer(m, at),
    at,
  });
  const overtimeLeft = (ms: number): Mountain =>
    withOvertime(crew(), 30 * MIN - ms);

  it("names Overtime when its clock runs out", () => {
    const m = overtimeLeft(SEC);
    const seen = seenAt(m, NOW);
    expect(seen.timer).toMatchObject({ source: "overtime", leftMs: SEC });
    expect(boostRanOut(seen, m, NOW + SEC)).toMatchObject({
      source: "overtime",
      name: "Overtime",
    });
  });

  it("names axle grease when it runs out", () => {
    const m: Mountain = {
      ...crew(),
      clocks: { ...COLD_CLOCKS, "axle-grease": NOW + SEC },
    };
    expect(boostRanOut(seenAt(m, NOW), m, NOW + SEC)).toMatchObject({
      source: "axle-grease",
    });
  });

  it("names Overtime running out under a Gold rush: the crew still slows", () => {
    const m: Mountain = startRush(
      { ...overtimeLeft(SEC), rushBank: 9_000 },
      NOW,
    );
    expect(liveCrewBoost(m, NOW).kind).toBe("rush");
    expect(boostRanOut(seenAt(m, NOW), m, NOW + SEC)).toMatchObject({
      source: "overtime",
    });
  });

  it("says nothing when a Gold rush runs out: the crew's speed never had it", () => {
    const m = startRush({ ...crew(), rushBank: 9_000 }, NOW);
    expect(seenAt(m, NOW + RUSH_MS - SEC).timer).toBeUndefined();
    expect(
      boostRanOut(seenAt(m, NOW + RUSH_MS - SEC), m, NOW + RUSH_MS),
    ).toBeUndefined();
  });

  it("says nothing while the timer still runs", () => {
    const m = overtimeLeft(10 * SEC);
    expect(boostRanOut(seenAt(m, NOW), m, NOW + SEC)).toBeUndefined();
  });

  it("says nothing when nothing ran", () => {
    expect(boostRanOut(seenAt(crew(), NOW), crew(), NOW + SEC)).toBeUndefined();
    expect(boostRanOut(undefined, crew(), NOW)).toBeUndefined();
  });

  it("says nothing when a timer as strong carries on", () => {
    const m: Mountain = {
      ...overtimeLeft(SEC),
      clocks: { ...COLD_CLOCKS, "axle-grease": NOW + 10 * MIN },
    };
    // Overtime was the one shown; the grease, as strong, carries on.
    const seen = seenAt(overtimeLeft(SEC), NOW);
    expect(axleCrewMultiplier(m, NOW + SEC)).toBe(
      boostById("overtime").multiplier,
    );
    expect(boostRanOut(seen, m, NOW + SEC)).toBeUndefined();
  });

  it("says nothing for a timer that ended while the game was away", () => {
    const m = overtimeLeft(SEC);
    expect(boostRanOut(seenAt(m, NOW), m, NOW + 10 * SEC)).toBeUndefined();
  });

  it("says nothing when a timer was stopped early, not run out", () => {
    const m = overtimeLeft(20 * SEC);
    const stopped: Mountain = { ...m, boosts: NO_BOOSTS };
    expect(boostRanOut(seenAt(m, NOW), stopped, NOW + SEC)).toBeUndefined();
  });
});
