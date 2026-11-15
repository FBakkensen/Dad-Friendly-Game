import { describe, expect, it, vi } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import * as minePiles from "./mine-piles";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import { PART_TWO_OFF } from "./part-switch";
import { EMPTY_STOCK } from "./stock";

vi.mock("./mine-piles", async (original) => {
  const real = await original<typeof import("./mine-piles")>();
  return { ...real, flowMine: vi.fn(real.flowMine) };
});

const HOUR = 60 * 60 * 1000;

/**
 * The mine's stretches with the stockyard open (#666, PR review): transport
 * that outruns the mine takes a dry stockpile at what comes in, and a
 * stockpile a few goods short of its room is full for the stretch, so a long
 * night or day is not cut into one-second stretches.
 */
describe("long stretches with the stockyard open (#666)", () => {
  it("runs a long night with transport faster than the mine in a handful of stretches", () => {
    withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, () => {
      const start = createMountain();
      const mountain: Mountain = {
        ...start,
        owned: { ...start.owned, helper: 23 },
        jobs: {
          drilling: 1,
          haulage: 1,
          hoisting: 1,
          driving: 15,
          building: 4,
          kilns: 1,
        },
        stock: EMPTY_STOCK,
        makers: { kiln: 1 },
        piles: { face: 300, shaft: 300, kiln: 300 },
        operational: ["lightTower"],
        project: {
          kind: "delivering",
          site: {
            building: "warehouse",
            step: 0,
            arrived: EMPTY_STOCK,
            onSite: EMPTY_STOCK,
          },
        },
      };
      const flowMine = vi.mocked(minePiles.flowMine);
      flowMine.mockClear();
      const away = accrueAway({ mountain, lastSeen: 0, now: 48 * HOUR });
      expect(away.report.night?.delivered.brick).toBeGreaterThan(0);
      expect(flowMine.mock.calls.length).toBeLessThan(20);
    });
  });

  it("keeps a full stone stockpile in long stretches while transport takes from it", () => {
    withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, () => {
      const start = createMountain();
      // No kilns: all the rock is stone, and the stockpile sits at its room
      // as transport takes stone and brick for the Warehouse's foundation.
      const mountain: Mountain = {
        ...start,
        owned: { ...start.owned, helper: 21 },
        jobs: { ...start.jobs, drilling: 6, haulage: 6, hoisting: 6 },
        stock: { ...EMPTY_STOCK, stones: 2_990_000, brick: 600_000 },
        piles: { face: 300, shaft: 300, kiln: 0 },
        operational: ["lightTower"],
        project: {
          kind: "delivering",
          site: {
            building: "warehouse",
            step: 0,
            arrived: EMPTY_STOCK,
            onSite: EMPTY_STOCK,
          },
        },
      };
      const withCrew: Mountain = {
        ...mountain,
        jobs: { ...mountain.jobs, driving: 1, building: 2 },
      };
      const flowMine = vi.mocked(minePiles.flowMine);
      flowMine.mockClear();
      const day = accrue({ mountain: withCrew, from: 0, to: 24 * HOUR });
      expect(day.mountain.stock.stones).toBeGreaterThan(2_999_000);
      expect(flowMine.mock.calls.length).toBeLessThan(50);
    });
  });

  /** A full brick stockpile and a dry stone one, the Warehouse wanting both. */
  function brickFull(line: number): Mountain {
    const start = createMountain();
    return {
      ...start,
      owned: { ...start.owned, helper: 3 * line + 2 + 1 + 2 },
      jobs: {
        drilling: line,
        haulage: line,
        hoisting: line,
        driving: 1,
        building: 2,
        kilns: 2,
      },
      stock: { ...EMPTY_STOCK, brick: 500_000 },
      makers: { kiln: 2 },
      piles: { face: 300, shaft: 300, kiln: 300 },
      operational: ["lightTower"],
      project: {
        kind: "delivering",
        site: {
          building: "warehouse",
          step: 0,
          arrived: EMPTY_STOCK,
          onSite: EMPTY_STOCK,
        },
      },
    };
  }

  it("with less rock lifted than transport carries, the kilns take it all and transport takes brick", () => {
    withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, () => {
      // Hoisting lifts 6 a second, the kilns can make 24, the wagon carries 9:
      // every stone of rock goes to the kilns, so no stone comes in to take.
      const flowMine = vi.mocked(minePiles.flowMine);
      flowMine.mockClear();
      const away = accrueAway({
        mountain: brickFull(2),
        lastSeen: 0,
        now: 24 * HOUR,
      });
      const night = away.report.night;
      expect(night?.delivered.stones ?? 0).toBeLessThanOrEqual(20);
      expect(night?.delivered.brick).toBeGreaterThan(0);
      expect(away.mountain.stock.stones).toBeLessThanOrEqual(20);
      expect(flowMine.mock.calls.length).toBeLessThan(20);
    });
  });

  it("with more rock lifted than transport carries, the brick stockpile stays at its room", () => {
    withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, () => {
      // Hoisting lifts 18 a second and the wagon carries 9, half of each good:
      // the kilns make what transport takes, and the rest is stone.
      const flowMine = vi.mocked(minePiles.flowMine);
      flowMine.mockClear();
      const away = accrueAway({
        mountain: brickFull(6),
        lastSeen: 0,
        now: 24 * HOUR,
      });
      const brick = away.mountain.stock.brick;
      expect(brick).toBeGreaterThanOrEqual(500_000 - 20);
      expect(brick).toBeLessThanOrEqual(500_000 + 20);
      expect(away.report.night?.delivered.stones).toBeGreaterThan(0);
      expect(flowMine.mock.calls.length).toBeLessThan(20);
    });
  });
});
