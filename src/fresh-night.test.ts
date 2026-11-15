import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { accrueAway, createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { EMPTY_STOCK } from "./stock";
import type { Project } from "./city";

/** The night's facts in a fresh mine, for the shift report (#663, rule 4, rule 7.12). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const HOUR = 60 * 60 * 1000;
const EIGHT_HOURS = 8 * HOUR;

/** The Light Tower at `step` with `stones` arrived, all built in. */
function site(step: 0 | 1 | 2, stones = 0): Project {
  return {
    kind: "delivering",
    site: {
      building: "lightTower",
      step,
      arrived: { ...EMPTY_STOCK, stones },
      onSite: EMPTY_STOCK,
    },
  };
}

/**
 * Three workers on each stage (the line moves 9 a second, 2.7 at night), one
 * wagon with its driver (9 a second, 2.7 at night) and two builders (16 a
 * second, 4.8 at night), with this pocket and project.
 */
function mine(
  pocket: number,
  project: Project,
  operational: Mountain["operational"] = [],
): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: 12 },
    jobs: { drilling: 3, haulage: 3, hoisting: 3, driving: 1, building: 2 },
    stock: { ...start.stock, stones: pocket },
    fleet: { ...start.fleet, horseWagon: 1 },
    project,
    operational,
  };
}

const night = (mountain: Mountain, awayMs: number) =>
  accrueAway({ mountain, lastSeen: 0, now: awayMs });

describe("the night's facts (#663)", () => {
  it("stops a producing mine at eight hours, and says the clock did it", () => {
    fresh(() => {
      const start = mine(0, site(2));
      expect(effectiveRates(start).crewPerSecond).toBe(9);
      const away = night(start, 12 * HOUR);
      expect(away.mined).toBe(77_760);
      expect(away.report.night).toEqual({
        producedMs: EIGHT_HOURS,
        stop: "clock",
        // The wagon takes all eight hours' stone; after that the pocket is empty.
        delivered: { ...EMPTY_STOCK, stones: 77_760 },
        steps: [],
        payFrom: 0.3,
        payTo: 0.3,
      });
    });
  });

  it("produces all of a short night, and nothing stopped it", () => {
    fresh(() => {
      const away = night(mine(0, site(2)), 2 * HOUR);
      expect(away.mined).toBe(19_440);
      expect(away.report.night).toEqual({
        producedMs: 2 * HOUR,
        stop: "none",
        delivered: { ...EMPTY_STOCK, stones: 19_440 },
        steps: [],
        payFrom: 0.3,
        payTo: 0.3,
      });
    });
  });

  it("produces nothing with nobody on a stage, and transport still delivers from the pocket", () => {
    fresh(() => {
      const start = mine(10_000, site(0));
      const stood = { ...start, jobs: { ...start.jobs, hoisting: 0 } };
      const away = night(stood, 12 * HOUR);
      expect(away.mined).toBe(0);
      expect(away.report.night).toEqual({
        producedMs: 0,
        stop: "none",
        delivered: { ...EMPTY_STOCK, stones: 10_000 },
        steps: [],
        payFrom: 0.3,
        payTo: 0.3,
      });
    });
  });

  it("finishes a step mid-night at its own second, and the next step starts", () => {
    fresh(() => {
      // The foundation's 25,000 from a pocket of 30,000 at 2.7 a second:
      // 9,259.3 s, so it is built in during the 9,260th second.
      const away = night(mine(30_000, site(0)), 12 * HOUR);
      expect(away.report.night?.steps).toEqual([
        { building: "lightTower", step: 0, atMs: 9_260_000 },
      ]);
      expect(away.mountain.project.kind).toBe("delivering");
      expect(
        away.mountain.project.kind === "delivering" &&
          away.mountain.project.site.step,
      ).toBe(1);
      expect(away.report.night?.litAtMs).toBeUndefined();
    });
  });

  it("finishes two steps in one night, each at its own second", () => {
    fresh(() => {
      // 1,000 short of the foundation, then the structure's 250,000 from a
      // pocket of a million: 371 s, then 92,593 s more at 2.7 a second.
      const away = night(mine(1_000_000, site(0, 24_000)), 30 * HOUR);
      expect(away.report.night?.steps).toEqual([
        { building: "lightTower", step: 0, atMs: 371_000 },
        { building: "lightTower", step: 1, atMs: 92_964_000 },
      ]);
    });
  });

  it("lights the rest of the night when the roof goes on, and says when", () => {
    fresh(() => {
      // 1,000 short of the roof at 2.7 a second: on in the 371st second.
      const away = night(mine(1_000, site(2, 999_000)), 4 * HOUR);
      expect(away.mountain.operational).toEqual(["lightTower"]);
      const lit = 4 * 3600 - 371;
      expect(away.mined).toBe(Math.floor(371 * 2.7) + Math.floor(lit * 4.05));
      expect(away.report.night).toEqual({
        producedMs: 4 * HOUR,
        stop: "none",
        delivered: { ...EMPTY_STOCK, stones: 1_000 },
        steps: [{ building: "lightTower", step: 2, atMs: 371_000 }],
        payFrom: 0.3,
        payTo: 0.45,
        litAtMs: 371_000,
      });
    });
  });

  it("counts what transport took from the pocket as delivered", () => {
    fresh(() => {
      // Nobody digs; the wagon carries 2.7 a second for an hour: 9,720.
      const start = mine(50_000, site(1));
      const stood = { ...start, jobs: { ...start.jobs, drilling: 0 } };
      const away = night(stood, HOUR);
      expect(away.report.night?.delivered).toEqual({
        ...EMPTY_STOCK,
        stones: 9_720,
      });
      expect(away.mountain.stock.stones).toBe(50_000 - 9_720);
    });
  });

  it("splits nothing for a building already running: one stretch, no steps", () => {
    fresh(() => {
      const away = night(mine(0, { kind: "unordered" }, ["lightTower"]), HOUR);
      expect(away.report.night).toMatchObject({
        producedMs: HOUR,
        stop: "none",
        steps: [],
        payFrom: 0.45,
        payTo: 0.45,
      });
      expect(away.report.night?.litAtMs).toBeUndefined();
    });
  });

  it("says the clock stopped a night a moment past eight hours", () => {
    fresh(() => {
      const away = night(mine(0, site(2)), EIGHT_HOURS + 400);
      expect(away.report.night).toMatchObject({
        producedMs: EIGHT_HOURS,
        stop: "clock",
      });
    });
  });

  it("builds a step after the clock stopped the mine, from what is on its way", () => {
    fresh(() => {
      // The pocket feeds the wagon and the builders after the mine has stopped.
      // 85,000 short of the structure: 31,481 s at the wagon's 2.7 a second.
      const away = night(mine(10_000, site(1, 165_000)), 12 * HOUR);
      expect(away.report.night?.stop).toBe("clock");
      const step = away.report.night?.steps[0];
      expect(step?.step).toBe(1);
      expect(step?.atMs).toBeGreaterThan(EIGHT_HOURS);
    });
  });

  it("drains the piles after the clock", () => {
    fresh(() => {
      // The line is steady (2.7 a second on each stage), so the piles keep
      // their 300 for the eight hours. Then drilling stops: haulage carries
      // the face pile to the shaft and hoisting lifts the shaft pile, 600
      // more, about 222 seconds past the clock (300 / 2.7 twice).
      const start = { ...mine(0, site(2)), piles: { face: 300, shaft: 300 } };
      const away = night(start, 12 * HOUR);
      expect(away.mined).toBe(77_760 + 600);
      expect(away.mountain.piles).toEqual({ face: 0, shaft: 0 });
      const report = away.report.night;
      expect(report?.stop).toBe("clock");
      expect(report?.producedMs).toBeGreaterThan(EIGHT_HOURS + 220_000);
      expect(report?.producedMs).toBeLessThanOrEqual(EIGHT_HOURS + 225_000);
      expect(report?.delivered).toEqual({ ...EMPTY_STOCK, stones: 78_360 });
    });
  });

  it("keeps rock in the face pile when drilling outruns haulage", () => {
    fresh(() => {
      // Three drill, one hauls and three hoist: haulage's 0.9 a second at
      // night is what comes up; the face pile fills (300) and stays full.
      // The night splits where it fills (300 / 1.8 s, the 167th second),
      // and each stretch drops its part-stone.
      const start = mine(0, { kind: "unordered" });
      const slow = { ...start, jobs: { ...start.jobs, haulage: 1 } };
      const away = night(slow, 2 * HOUR);
      expect(away.mined).toBe(
        Math.floor(167 * 0.9) + Math.floor((2 * 3600 - 167) * 0.9),
      );
      expect(away.mountain.piles).toEqual({ face: 300, shaft: 0 });
      expect(away.report.night?.producedMs).toBe(2 * HOUR);
    });
  });

  it("is not in today's game", () => {
    const away = accrueAway({
      mountain: createMountain(),
      lastSeen: 0,
      now: 12 * HOUR,
    });
    expect(away.report.night).toBeUndefined();
  });
});
