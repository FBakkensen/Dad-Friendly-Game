import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { LINE_OFF } from "./line";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";

/**
 * How far one more hand or machine may lower the line while Grandpa's tenth
 * still goes by machine group, not by stage (docs/DESIGN.md; the engineers
 * by stage are #539). The worst seen is about 4%. With no Grandpa, posted
 * engineer or not, it may not lower it at all: her floor is a share of the
 * line since #543.
 */
const TENDED_SLIP = 0.05;

type Crew = Pick<
  Mountain,
  | "helpers"
  | "carts"
  | "hoists"
  | "drills"
  | "borers"
  | "trains"
  | "machines"
  | "legacy"
>;

type Grid = { readonly [K in keyof Crew]: readonly number[] };

const MORE: readonly (readonly [string, (crew: Crew) => Crew])[] = [
  ["helper", (crew) => ({ ...crew, helpers: crew.helpers + 1 })],
  ["cart", (crew) => ({ ...crew, carts: crew.carts + 1 })],
  ["hoist", (crew) => ({ ...crew, hoists: crew.hoists + 1 })],
  ["drill", (crew) => ({ ...crew, drills: crew.drills + 1 })],
  ["borer", (crew) => ({ ...crew, borers: crew.borers + 1 })],
  ["train", (crew) => ({ ...crew, trains: crew.trains + 1 })],
  ["machine", (crew) => ({ ...crew, machines: crew.machines + 1 })],
];

/** Early crews: every fifth count of workers, and where a big crew just fits. */
const EARLY: Grid = {
  legacy: [0, 1],
  carts: [0, 10],
  hoists: [0, 5],
  drills: [0, 50],
  borers: [0, 1, 3],
  trains: [0, 2],
  machines: [0, 1, 2],
  helpers: [...Array.from({ length: 13 }, (_, at) => at * 5), 16, 17, 33],
};

/** Late crews, with hundreds of ways to staff the big machines. */
const LATE: Grid = {
  legacy: [0, 1],
  carts: [10, 40],
  hoists: [5, 60],
  drills: [20, 100],
  borers: [5, 9],
  trains: [3, 9],
  machines: [2, 6],
  helpers: [47, 83, 99],
};

function crews(grid: Grid): Crew[] {
  let all: Crew[] = [{} as Crew];
  for (const key of Object.keys(grid) as (keyof Crew)[]) {
    all = all.flatMap((crew) =>
      grid[key].map((value) => ({ ...crew, [key]: value })),
    );
  }
  return all;
}

/** Every crew on the grid, at each post, with one more of each kind. */
function sweep(grid: Grid): { checked: number; misses: string[] } {
  const misses: string[] = [];
  let checked = 0;
  withFactors({ [LINE_OFF]: 0 }, () => {
    for (const post of ["borer", "machine", "camp"] as const) {
      const engineers =
        post === "camp"
          ? []
          : [{ name: "Ada" as const, rank: 0 as const, trips: 0, post }];
      const rate = (crew: Crew): number =>
        effectiveRates({ ...minedMountain(50_000_000), ...crew, engineers })
          .exactCrewPerSecond;
      for (const crew of crews(grid)) {
        const now = rate(crew);
        const tended = crew.legacy > 0;
        const allowed = tended ? now * TENDED_SLIP : 0;
        for (const [what, more] of MORE) {
          const after = rate(more(crew));
          if (after < now - allowed - 1e-6) {
            misses.push(
              `${what} on ${JSON.stringify({ post, ...crew })}: ${String(now)} to ${String(after)}`,
            );
          }
          checked += 1;
        }
      }
    }
  });
  return { checked, misses };
}

const size = (grid: Grid): number =>
  Object.values(grid).reduce((total, values) => total * values.length, 3);

describe("staffing by the line never slows it (#534)", () => {
  it("early: one more worker or machine never slows the line; tended, at most a small slip", () => {
    const { checked, misses } = sweep(EARLY);
    expect(checked).toBe(size(EARLY) * MORE.length);
    expect(misses).toEqual([]);
  }, 600_000);

  it("late, with hundreds of ways to staff the big machines: the same", () => {
    const { checked, misses } = sweep(LATE);
    expect(checked).toBe(size(LATE) * MORE.length);
    expect(misses).toEqual([]);
  }, 600_000);
});
