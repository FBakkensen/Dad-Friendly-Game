import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { LINE_OFF } from "./line-switch";
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

type Counted =
  "helper" | "cart" | "hoist" | "drill" | "borer" | "train" | "machine";

type Crew = Readonly<Record<Counted | "legacy", number>>;

type Grid = { readonly [K in keyof Crew]: readonly number[] };

const COUNTED: readonly Counted[] = [
  "helper",
  "cart",
  "hoist",
  "drill",
  "borer",
  "train",
  "machine",
];

const MORE: readonly (readonly [string, (crew: Crew) => Crew])[] = COUNTED.map(
  (id) => [id, (crew: Crew) => ({ ...crew, [id]: crew[id] + 1 })],
);

/** Early crews: every fifth count of workers, and where a big crew just fits. */
const EARLY: Grid = {
  legacy: [0, 1],
  cart: [0, 10],
  hoist: [0, 5],
  drill: [0, 50],
  borer: [0, 1, 3],
  train: [0, 2],
  machine: [0, 1, 2],
  helper: [...Array.from({ length: 13 }, (_, at) => at * 5), 16, 17, 33],
};

/** Late crews, with hundreds of ways to staff the big machines. */
const LATE: Grid = {
  legacy: [0, 1],
  cart: [10, 40],
  hoist: [5, 60],
  drill: [20, 100],
  borer: [5, 9],
  train: [3, 9],
  machine: [2, 6],
  helper: [47, 83, 99],
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
      const rate = (crew: Crew): number => {
        const { legacy, ...counts } = crew;
        const base = minedMountain(50_000_000);
        return effectiveRates({
          ...base,
          legacy,
          owned: { ...base.owned, ...counts },
          engineers,
        }).exactCrewPerSecond;
      };
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
