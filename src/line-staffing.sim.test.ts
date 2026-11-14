import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { LINE_OFF } from "./line";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";

/**
 * How far one more hand or machine may lower the line while Grandpa's tenth
 * still goes to the biggest group, not to a stage (docs/DESIGN.md; the
 * engineers by stage are #539).
 */
const GRANDPA_SLIP = 0.05;

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

const MORE: readonly (readonly [string, (crew: Crew) => Crew])[] = [
  ["helper", (crew) => ({ ...crew, helpers: crew.helpers + 1 })],
  ["cart", (crew) => ({ ...crew, carts: crew.carts + 1 })],
  ["hoist", (crew) => ({ ...crew, hoists: crew.hoists + 1 })],
  ["drill", (crew) => ({ ...crew, drills: crew.drills + 1 })],
  ["borer", (crew) => ({ ...crew, borers: crew.borers + 1 })],
  ["train", (crew) => ({ ...crew, trains: crew.trains + 1 })],
  ["machine", (crew) => ({ ...crew, machines: crew.machines + 1 })],
];

function crews(): Crew[] {
  const all: Crew[] = [];
  for (const legacy of [0, 1])
    for (const carts of [0, 10])
      for (const hoists of [0, 5])
        for (const drills of [0, 10, 50])
          for (const borers of [0, 1, 3])
            for (const trains of [0, 2])
              for (const machines of [0, 1])
                for (let helpers = 0; helpers <= 60; helpers += 5)
                  all.push({
                    helpers,
                    carts,
                    hoists,
                    drills,
                    borers,
                    trains,
                    machines,
                    legacy,
                  });
  return all;
}

describe("staffing by the line never slows it (#534)", () => {
  it("one more worker or machine of any kind never slows the line; with Grandpa, at most a small slip", () => {
    const misses: string[] = [];
    let checked = 0;
    withFactors({ [LINE_OFF]: 0 }, () => {
      for (const post of ["borer", "camp"] as const) {
        const engineers =
          post === "camp"
            ? []
            : [{ name: "Ada" as const, rank: 0 as const, trips: 0, post }];
        const rate = (crew: Crew): number =>
          effectiveRates({ ...minedMountain(50_000_000), ...crew, engineers })
            .exactCrewPerSecond;
        for (const crew of crews()) {
          const now = rate(crew);
          for (const [what, more] of MORE) {
            const after = rate(more(crew));
            const allowed = crew.legacy === 0 ? 0 : now * GRANDPA_SLIP;
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
    expect(checked).toBe(2 * 2 * 2 * 2 * 3 * 3 * 2 * 2 * 13 * 7);
    expect(misses).toEqual([]);
  }, 120_000);
});
