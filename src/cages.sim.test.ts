import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { flowMineLive } from "./mine-cages";
import { flowMine } from "./mine-piles";
import type { Mountain } from "./mountain";
import { levels, partThree, type Setup } from "./part-three.harness";

/**
 * The cages as played and a night's rates agree (slice 1, part 3, rule 5.14,
 * #724, ruling 17): one hour live, trip by trip, and the same hour counted as
 * rates, from the same start, at pay 1, with room in the stockyard, lift the
 * same rock within the gap.
 */

/**
 * The gap allowed between the cages played and counted as rates, as a share
 * of the rates' rock, plus one rock (ruling 17). The prototype measured
 * about 1%. The lab's `cageGap` (#675) replaces it.
 */
const CAGE_GAP_GUESS = 0.02;

const HOUR = 3_600;

/** The rock waiting below the cages: drilled rock and rock at the shaft, on both levels. */
function belowCages(mountain: Mountain): number {
  const { face, shaft } = mountain.piles;
  const deep =
    mountain.granite.kind === "sunk"
      ? mountain.granite.piles.face + mountain.granite.piles.shaft
      : 0;
  return face + shaft + deep;
}

/** The rock lifted from `start` to `after` (ruling 17): drilled, less what still waits below the cages. */
function lifted(start: Mountain, after: Mountain): number {
  return (
    after.rockDug - start.rockDug - (belowCages(after) - belowCages(start))
  );
}

/** A part 3 mine from the shared harness, with part 3 on while it is built. */
const mine = (setup: Setup): Mountain => partThree(() => levels(setup));

/** The hour played live and counted as rates: the rock each lifted. */
function hour(start: Mountain): {
  readonly live: number;
  readonly rates: number;
} {
  return partThree(() => ({
    live: lifted(start, flowMineLive(start, HOUR, 1, true).mountain),
    rates: lifted(start, flowMine(start, HOUR, 1, true).mountain),
  }));
}

function expectWithinGap({ live, rates }: { live: number; rates: number }) {
  expect(Math.abs(live - rates)).toBeLessThanOrEqual(
    CAGE_GAP_GUESS * rates + 1,
  );
}

const makers = fc.record({
  kilns: fc.nat(2),
  onKilns: fc.nat(4),
  saws: fc.nat(2),
  onSaws: fc.nat(4),
});

describe("the cages as played and a night's rates (rule 5.14, ruling 17)", () => {
  it("agree on the rock lifted in an hour within the gap, up to six hoists and six cages for both", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }).chain((hoists) =>
          fc
            // The cages for both, the winch among them, are at most six.
            .integer({ min: Math.max(0, hoists - 5), max: hoists })
            .chain((assignedCount) =>
              fc.record({
                hoists: fc.constant(hoists),
                topsoil: fc.integer({ min: 0, max: assignedCount }),
                assignedCount: fc.constant(assignedCount),
              }),
            ),
        ),
        fc.record({
          drilling: fc.nat(20),
          haulage: fc.nat(20),
          graniteDrilling: fc.nat(20),
          graniteHaulage: fc.nat(20),
        }),
        fc.nat(12),
        makers,
        (shaft, jobs, hoisting, maker) => {
          const start = mine({
            hoists: shaft.hoists,
            hoisting,
            assigned: {
              topsoil: shaft.topsoil,
              granite: shaft.assignedCount - shaft.topsoil,
            },
            ...maker,
            jobs,
          });
          expectWithinGap(hour(start));
        },
      ),
      { numRuns: 40 },
    );
  });

  it("agree with the Topsoil alone", () => {
    fc.assert(
      fc.property(
        fc.nat(6),
        fc.record({ drilling: fc.nat(20), haulage: fc.nat(20) }),
        fc.nat(12),
        fc.record({ kilns: fc.nat(2), onKilns: fc.nat(4) }),
        (hoists, jobs, hoisting, maker) => {
          const start = mine({ sunk: false, hoists, hoisting, ...maker, jobs });
          expectWithinGap(hour(start));
        },
      ),
      { numRuns: 40 },
    );
  });
});
