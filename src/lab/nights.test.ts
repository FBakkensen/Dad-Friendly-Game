import { describe, expect, it } from "vitest";
import { withFactors } from "../economy/factors";
import { FRESH_OFF } from "../line-switch";
import { createMountain, type Mountain, type NightReport } from "../mountain";
import { PART_TWO_OFF } from "../part-switch";
import { EMPTY_STOCK } from "../stock";
import type { DecisionSample } from "./measure";
import deadGood from "./measures/deadGood";
import nightFull from "./measures/nightFull";
import nightFullAt from "./measures/nightFullAt";
import { nightRecord, type NightRecord } from "./nights";
import { HOUR_MS, MS_PER_SECOND, SAMPLE_INTERVAL_SEC } from "./targets";
import { createWorld, step, type World } from "./world";

/** How the lab reads a long night once the stockyard is open (#667). */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

const lit: Mountain = { ...createMountain(), operational: ["lightTower"] };

function report(fullAtMs?: number, deadMs = 0): NightReport {
  return {
    producedMs: 0,
    deadMs,
    stop: fullAtMs === undefined ? "none" : "stockyard",
    ...(fullAtMs === undefined ? {} : { fullAtMs: { stones: fullAtMs } }),
    produced: EMPTY_STOCK,
    delivered: EMPTY_STOCK,
    steps: [],
    payFrom: 0.45,
    payTo: 0.45,
  };
}

function world(awayMs: number, fullAtMs?: number, mountain = lit): World {
  return {
    ...createWorld(1, mountain),
    clock: awayMs,
    night: { awayMs, report: report(fullAtMs) },
  };
}

function samples(...nights: NightRecord[][]): readonly DecisionSample[] {
  return nights.map((list) => ({ nights: list }) as unknown as DecisionSample);
}

describe("a long night with the stockyard open (#667)", () => {
  it("is recorded with when the stone stockpile filled", () => {
    partTwo(() => {
      expect(nightRecord(world(10 * HOUR_MS))).toEqual({
        awayMs: 10 * HOUR_MS,
        endedFull: false,
        deadMs: 0,
      });
      expect(nightRecord(world(10 * HOUR_MS, 4 * HOUR_MS))).toEqual({
        awayMs: 10 * HOUR_MS,
        endedFull: true,
        fullAtMs: 4 * HOUR_MS,
        deadMs: 0,
      });
      // Full from the start: ended full, with no time it filled.
      expect(nightRecord(world(10 * HOUR_MS, 0))).toEqual({
        awayMs: 10 * HOUR_MS,
        endedFull: true,
        deadMs: 0,
      });
    });
  });

  it("carries how long the night's report says a stockpile sat dead", () => {
    partTwo(() => {
      expect(
        nightRecord({
          ...createWorld(1, lit),
          clock: 10 * HOUR_MS,
          night: {
            awayMs: 10 * HOUR_MS,
            report: report(undefined, 7 * HOUR_MS),
          },
        })?.deadMs,
      ).toBe(7 * HOUR_MS);
    });
  });

  it("leaves out a short gap, a live second and a mine with no stockyard", () => {
    partTwo(() => {
      expect(nightRecord(world(2 * HOUR_MS))).toBeUndefined();
      expect(nightRecord(createWorld(1, lit))).toBeUndefined();
      expect(
        nightRecord(world(10 * HOUR_MS, undefined, createMountain())),
      ).toBeUndefined();
    });
  });

  it("is carried by the lab's world only after time away in a fresh mine", () => {
    partTwo(() => {
      const start = createWorld(1, lit);
      const away = step(start, 10 * HOUR_MS, "away");
      expect(away.night?.awayMs).toBe(10 * HOUR_MS);
      expect(step(away, 1000, "live").night).toBeUndefined();
    });
    expect(step(createWorld(1), 10 * HOUR_MS, "away").night).toBeUndefined();
  });
});

describe("the night measures (#667)", () => {
  const nights = samples(
    [
      { awayMs: 10, endedFull: false, deadMs: 0 },
      { awayMs: 10, endedFull: true, fullAtMs: 5, deadMs: 0 },
    ],
    [],
    [
      { awayMs: 10, endedFull: true, fullAtMs: 9, deadMs: 0 },
      { awayMs: 10, endedFull: true, fullAtMs: 2, deadMs: 0 },
      // Filled, but transport kept the mine going to morning: not ended full.
      { awayMs: 10, endedFull: false, fullAtMs: 1, deadMs: 0 },
      // Full from the start: ended full, no time it filled.
      { awayMs: 10, endedFull: true, deadMs: 0 },
    ],
  );

  it("shares the long nights a full stockyard ended", () => {
    expect(nightFull.aggregate(nights)).toBe(4 / 6);
    expect(nightFull.aggregate([])).toBeNaN();
  });

  it("takes the median share of the night when it filled, among the nights it ended", () => {
    expect(nightFullAt.aggregate(nights)).toBe(0.5);
    expect(
      nightFullAt.aggregate(
        samples([{ awayMs: 10, endedFull: true, deadMs: 0 }]),
      ),
    ).toBeNaN();
  });
});

describe("deadGood weighed by time, nights included (#667, PR review)", () => {
  const minute = SAMPLE_INTERVAL_SEC * MS_PER_SECOND;
  const live = (yardOpen: boolean, dead: boolean, nights: NightRecord[] = []) =>
    ({
      fresh: { yardOpen, deadGood: dead },
      nights,
    }) as unknown as DecisionSample;

  it("counts a minute for each live sample and the dead stretch of each long night", () => {
    const run = [
      live(true, true),
      live(false, true),
      live(true, false, [
        // Filled four hours in, nothing took it to morning: six hours dead.
        {
          awayMs: 10 * HOUR_MS,
          endedFull: true,
          fullAtMs: 4 * HOUR_MS,
          deadMs: 6 * HOUR_MS,
        },
        // Full from the start: all of it dead.
        { awayMs: 8 * HOUR_MS, endedFull: true, deadMs: 8 * HOUR_MS },
        // Filled, but the order took it: none dead.
        { awayMs: 7 * HOUR_MS, endedFull: false, fullAtMs: HOUR_MS, deadMs: 0 },
      ]),
    ];
    expect(deadGood.aggregate(run)).toBeCloseTo(
      (minute + 14 * HOUR_MS) / (2 * minute + 25 * HOUR_MS),
      12,
    );
    expect(deadGood.aggregate([live(false, true)])).toBeNaN();
  });
});
