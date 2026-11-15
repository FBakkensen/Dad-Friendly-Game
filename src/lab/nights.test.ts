import { describe, expect, it } from "vitest";
import { withFactors } from "../economy/factors";
import { FRESH_OFF } from "../line-switch";
import { createMountain, type Mountain, type NightReport } from "../mountain";
import { PART_TWO_OFF } from "../part-switch";
import { EMPTY_STOCK } from "../stock";
import type { DecisionSample } from "./measure";
import nightFull from "./measures/nightFull";
import nightFullAt from "./measures/nightFullAt";
import { nightRecord, type NightRecord } from "./nights";
import { HOUR_MS } from "./targets";
import { createWorld, step, type World } from "./world";

/** How the lab reads a long night once the stockyard is open (#667). */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

const lit: Mountain = { ...createMountain(), operational: ["lightTower"] };

function report(fullAtMs?: number): NightReport {
  return {
    producedMs: 0,
    stop: fullAtMs === undefined ? "none" : "stockyard",
    ...(fullAtMs === undefined ? {} : { fullAtMs: { stones: fullAtMs } }),
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
      });
      expect(nightRecord(world(10 * HOUR_MS, 4 * HOUR_MS))).toEqual({
        awayMs: 10 * HOUR_MS,
        fullAtMs: 4 * HOUR_MS,
      });
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
    [{ awayMs: 10 }, { awayMs: 10, fullAtMs: 5 }],
    [],
    [
      { awayMs: 10, fullAtMs: 9 },
      { awayMs: 10, fullAtMs: 2 },
    ],
  );

  it("shares the long nights a full stockyard ended", () => {
    expect(nightFull.aggregate(nights)).toBe(0.75);
    expect(nightFull.aggregate([])).toBeNaN();
  });

  it("takes the median share of the night when it filled", () => {
    expect(nightFullAt.aggregate(nights)).toBe(0.5);
    expect(nightFullAt.aggregate(samples([{ awayMs: 10 }]))).toBeNaN();
  });
});
