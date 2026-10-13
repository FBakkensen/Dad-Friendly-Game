import { describe, expect, it } from "vitest";
import {
  MORRIS_DELTA,
  MORRIS_LEVELS,
  morrisScreen,
  morrisTrajectories,
} from "./morris";
import { createRng } from "./random";

describe("Morris screening", () => {
  it("steps one factor by the grid delta, and every factor once", () => {
    const factors = 5;
    const trajectories = 6;
    const paths = morrisTrajectories(factors, trajectories, createRng(7));
    expect(paths).toHaveLength(trajectories);
    for (const path of paths) {
      expect(path).toHaveLength(factors + 1);
      const seen = new Set<number>();
      for (const point of path) {
        expect(point).toHaveLength(factors);
        for (const coordinate of point) {
          expect(coordinate).toBeGreaterThanOrEqual(-1e-9);
          expect(coordinate).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
      for (let step = 0; step < path.length - 1; step += 1) {
        const before = path[step] ?? [];
        const after = path[step + 1] ?? [];
        const moved = before.flatMap((value, index) =>
          Math.abs(value - (after[index] ?? 0)) > 1e-9 ? [index] : [],
        );
        expect(moved).toHaveLength(1);
        const index = moved[0] ?? -1;
        expect(
          Math.abs((after[index] ?? 0) - (before[index] ?? 0)),
        ).toBeCloseTo(MORRIS_DELTA, 10);
        seen.add(index);
      }
      expect(seen.size).toBe(factors);
    }
    expect(MORRIS_LEVELS).toBe(4);
    expect(MORRIS_DELTA).toBeCloseTo(2 / 3, 10);
  });

  it("gives a null factor no elementary effect", () => {
    const screen = morrisScreen({
      factors: 2,
      trajectories: 8,
      seed: 3,
      evaluate: (unit) => [3 * (unit[0] ?? 0)],
    });
    expect(screen.evaluations).toBe(8 * 3);
    expect(screen.muStar[0]?.[0]).toBeCloseTo(3, 8);
    expect(screen.muStar[1]?.[0]).toBeCloseTo(0, 8);
    expect(screen.sigma[1]?.[0]).toBeCloseTo(0, 8);
  });

  it("replays the same seed", () => {
    const once = morrisTrajectories(4, 3, createRng(11));
    const twice = morrisTrajectories(4, 3, createRng(11));
    expect(twice).toEqual(once);
    expect(morrisTrajectories(4, 3, createRng(12))).not.toEqual(once);
  });
});
