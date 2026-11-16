import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { makerTakes } from "./makers";
import {
  NO_GRANITE_PILES,
  NO_LEVEL_MACHINES,
  type GranitePiles,
  type LevelMachines,
} from "./mine-levels";
import { mineMoves, type MinePiles } from "./mine-piles";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { EMPTY_STOCK, type Stock } from "./stock";
import type { Project } from "./city";

/**
 * Part 3's mine (slice 1, rules 3 and 5, #673): each level has its own
 * drilling, haulage, drilled rock and rock at the shaft, the one hoist lifts
 * from both, the Granite's rock goes to the saws first, three rock for a cut
 * stone, and what they cannot take bypasses to stone. With the shaft not
 * sunk, or part 3 off, the mine plays exactly as part 2 (ruling 6).
 */
const partThree = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

const HOUR = 60 * 60 * 1000;

type Setup = {
  /** Workers on the Topsoil's drilling and haulage: 3 a second each, with tools. */
  readonly topsoil?: number;
  /** Workers on the Granite's drilling and haulage. */
  readonly granite?: number;
  /** Workers on the one hoist. */
  readonly hoisting?: number;
  readonly kilns?: number;
  readonly onKilns?: number;
  readonly saws?: number;
  readonly onSaws?: number;
  readonly piles?: Partial<MinePiles>;
  readonly granitePiles?: Partial<GranitePiles>;
  readonly machines?: Partial<LevelMachines>;
  readonly sunk?: boolean;
  readonly stock?: Partial<Stock>;
  readonly project?: Project;
  readonly driving?: number;
  readonly building?: number;
};

/** A fresh mine with the Light Tower up, the shaft sunk (by default), and these workers, makers and piles. */
function levels({
  topsoil = 0,
  granite = 0,
  hoisting = 0,
  kilns = 0,
  onKilns = kilns,
  saws = 0,
  onSaws = saws,
  piles = {},
  granitePiles = {},
  machines = {},
  sunk = true,
  stock = {},
  project = { kind: "unordered" },
  driving = 0,
  building = 0,
}: Setup): Mountain {
  const start = createMountain();
  const own = { ...NO_LEVEL_MACHINES, ...machines };
  return {
    ...start,
    owned: {
      ...start.owned,
      helper:
        2 * topsoil +
        2 * granite +
        hoisting +
        onKilns +
        onSaws +
        driving +
        building,
      cart: start.owned.cart + own.cart,
      drill: start.owned.drill + own.drill,
    },
    jobs: {
      drilling: topsoil,
      haulage: topsoil,
      hoisting,
      driving,
      building,
      kilns: onKilns,
      graniteDrilling: granite,
      graniteHaulage: granite,
      saws: onSaws,
    },
    stock: { ...EMPTY_STOCK, ...stock },
    makers: { kiln: kilns, saw: saws },
    piles: { face: 0, shaft: 0, kiln: 0, ...piles },
    granite: sunk
      ? {
          kind: "sunk",
          machines: own,
          piles: { ...NO_GRANITE_PILES, ...granitePiles },
        }
      : { kind: "unsunk" },
    operational: ["lightTower"],
    project,
  };
}

const live = (mountain: Mountain, seconds: number) =>
  accrue({ mountain, from: 0, to: seconds * 1000 });

const night = (mountain: Mountain, awayMs: number) =>
  accrueAway({ mountain, lastSeen: 0, now: awayMs });

/** The Granite's piles on a mountain whose shaft is sunk. */
function granitePilesOf(mountain: Mountain): GranitePiles {
  if (mountain.granite.kind !== "sunk") {
    throw new Error("the shaft is not sunk");
  }
  return mountain.granite.piles;
}

/** Every rock waiting in a pile, on both levels. */
function rockWaiting(mountain: Mountain): number {
  const deep = granitePilesOf(mountain);
  return (
    mountain.piles.face +
    mountain.piles.shaft +
    mountain.piles.kiln +
    deep.face +
    deep.shaft +
    deep.saw
  );
}

describe("the Granite's rock (rules 3 and 5, #673)", () => {
  it("goes to the saws first, three rock for a cut stone, and the rest bypasses to stone", () => {
    partThree(() => {
      // 49 workers reach the 25 workers' mark: 6 a second each. 96 a second
      // lifted from the Granite, one saw takes 90 for its 30 cut stone: its
      // pile of 300 fills in fifty seconds, and the rest bypasses.
      const after = live(levels({ granite: 16, hoisting: 16, saws: 1 }), 100);
      expect(after.mined).toBe(9_600);
      expect(after.mountain.stock.cutStone).toBe(3_000);
      expect(granitePilesOf(after.mountain).saw).toBe(300);
      expect(after.mountain.stock.stones).toBe(9_600 - 3 * 3_000 - 300);
      expect(after.mountain.stock.brick).toBe(0);
    });
  });

  it("stays where it is with nobody on the Granite, and the Topsoil works as in part 2", () => {
    const waiting = { face: 250, shaft: 0, saw: 0 };
    const setup: Setup = {
      topsoil: 6,
      hoisting: 6,
      kilns: 1,
      piles: { face: 300, shaft: 300, kiln: 120 },
      granitePiles: waiting,
    };
    const deep = partThree(() => live(levels(setup), 3_600));
    const shallow = partTwo(() =>
      live(levels({ ...setup, sunk: false }), 3_600),
    );
    expect(granitePilesOf(deep.mountain)).toEqual(waiting);
    expect(deep.mined).toBeGreaterThan(0);
    expect(deep.mined).toBe(shallow.mined);
    expect(deep.mountain.stock).toEqual(shallow.mountain.stock);
    expect(deep.mountain.piles).toEqual(shallow.mountain.piles);
    expect(deep.mountain.rockDug).toBe(shallow.mountain.rockDug);
  });

  it("lifts from both levels' rock at the shaft, and what one cannot use goes to the other (ruling 4)", () => {
    partThree(() => {
      // 12 a second hoisted, and each level brings 12: 6 lifted from each.
      const even = live(levels({ topsoil: 4, granite: 4, hoisting: 4 }), 10);
      expect(even.mined).toBe(120);
      expect(even.mountain.piles.shaft).toBe(60);
      expect(granitePilesOf(even.mountain).shaft).toBe(60);
      expect(even.mountain.stock.stones).toBe(120);
      expect(even.mountain.rockDug).toBe(240);
      // The Topsoil brings 3 a second: the hoist lifts all of it and gives
      // the Granite the other 9.
      const lopsided = live(
        levels({ topsoil: 1, granite: 4, hoisting: 4 }),
        10,
      );
      expect(lopsided.mined).toBe(120);
      expect(lopsided.mountain.piles.shaft).toBe(0);
      expect(granitePilesOf(lopsided.mountain).shaft).toBe(120 - 90);
    });
  });

  it("counts a mine where only the Granite works as at work, and accrues it", () => {
    partThree(() => {
      const deep = levels({ granite: 4, hoisting: 4 });
      expect(mineMoves(deep)).toBe(true);
      // Nobody on the hoist: the Granite still drills and hauls to its piles.
      const hoistless = levels({ granite: 4 });
      expect(mineMoves(hoistless)).toBe(true);
      // Before the stockyard (a hand-made save): the mine's guard still sees the Granite.
      const dark = { ...hoistless, operational: [] };
      const after = live(dark, 10).mountain;
      expect(granitePilesOf(after).shaft).toBe(120);
      expect(after.rockDug).toBe(120);
      // With nobody anywhere, nothing moves.
      expect(mineMoves(levels({ granitePiles: { face: 300 } }))).toBe(false);
    });
  });

  it("stops the saws at a full cut stone stockpile, and their rock then bypasses to stone", () => {
    partThree(() => {
      const start = levels({
        granite: 4,
        hoisting: 4,
        saws: 1,
        granitePiles: { saw: 300 },
        stock: { cutStone: 250_000 },
      });
      const after = live(start, 100);
      expect(after.mountain.stock.cutStone).toBe(250_000);
      expect(granitePilesOf(after.mountain).saw).toBe(300);
      expect(after.mined).toBe(1_200);
      expect(after.mountain.stock.stones).toBe(1_200);
    });
  });

  it("moves no worker and no machine by itself, live or in a night (rule 5.4, 5.12)", () => {
    partThree(() => {
      const start = levels({
        topsoil: 3,
        granite: 5,
        hoisting: 4,
        kilns: 2,
        onKilns: 1,
        saws: 2,
        onSaws: 1,
        machines: { cart: 1, drill: 1 },
        granitePiles: { face: 100 },
      });
      const day = live(start, 3_600).mountain;
      const away = night(start, 12 * HOUR).mountain;
      for (const after of [day, away]) {
        expect(after.jobs).toEqual(start.jobs);
        expect(after.owned).toEqual(start.owned);
        expect(after.makers).toEqual(start.makers);
        expect(after.granite.kind).toBe("sunk");
        expect(
          after.granite.kind === "sunk" ? after.granite.machines : undefined,
        ).toEqual({ ...NO_LEVEL_MACHINES, cart: 1, drill: 1 });
        // The mine did work: the move-freeze is not a mine that stood.
        expect(after.rockDug).toBeGreaterThan(start.rockDug);
      }
    });
  });

  it("runs a night until the stockyard is full, with both levels", () => {
    partThree(() => {
      const start = levels({
        topsoil: 6,
        granite: 6,
        hoisting: 12,
        saws: 1,
        stock: { stones: 5_000_000, cutStone: 249_000 },
      });
      const away = night(start, 24 * HOUR);
      expect(away.mountain.stock.stones).toBe(6_000_000);
      expect(away.mountain.stock.cutStone).toBe(250_000);
      const facts = away.report.night;
      expect(facts?.stop).toBe("stockyard");
      // 37 workers: 6 a second each. 72 a second hoisted, 32.4 at the night
      // shift output, fills the stone in about 8.6 hours: past the old
      // eight-hour clock, and short of the night.
      expect(facts?.producedMs).toBeGreaterThan(8 * HOUR);
      expect(facts?.producedMs).toBeLessThan(24 * HOUR);
      expect(away.report.capped).toBe(false);
      // Every rock lifted is in a stockpile or waits at the saws.
      expect(away.mined).toBe(1_000_000 + 3 * 1_000 + 300);
    });
  });

  it("loses no rock while the stone stockpile has room", () => {
    partThree(() => {
      fc.assert(
        fc.property(
          fc.record({
            topsoil: fc.nat(8),
            granite: fc.nat(8),
            hoisting: fc.nat(8),
            kilns: fc.nat(3),
            onKilns: fc.nat(3),
            saws: fc.nat(3),
            onSaws: fc.nat(3),
            face: fc.nat(300),
            shaft: fc.nat(300),
            kilnPile: fc.nat(300),
            graniteFace: fc.nat(300),
            graniteShaft: fc.nat(300),
            sawPile: fc.nat(300),
          }),
          fc.integer({ min: 1, max: 7_200 }),
          (setup, seconds) => {
            const before = levels({
              ...setup,
              piles: {
                face: setup.face,
                shaft: setup.shaft,
                kiln: setup.kilns > 0 ? setup.kilnPile : 0,
              },
              granitePiles: {
                face: setup.graniteFace,
                shaft: setup.graniteShaft,
                saw: setup.saws > 0 ? setup.sawPile : 0,
              },
            });
            const after = live(before, seconds).mountain;
            const dug = after.rockDug - before.rockDug;
            const gained = {
              stones: after.stock.stones - before.stock.stones,
              brick: after.stock.brick - before.stock.brick,
              cutStone: after.stock.cutStone - before.stock.cutStone,
            };
            expect(gained.stones).toBeGreaterThanOrEqual(0);
            expect(gained.brick).toBeGreaterThanOrEqual(0);
            expect(gained.cutStone).toBeGreaterThanOrEqual(0);
            expect(dug).toBe(
              rockWaiting(after) -
                rockWaiting(before) +
                gained.stones +
                makerTakes("kiln") * gained.brick +
                makerTakes("saw") * gained.cutStone,
            );
          },
        ),
        { numRuns: 60 },
      );
    });
  });
});

describe("parts 1 and 2 do not change (#673)", () => {
  /** The Warehouse's foundation with `stones` of its stone arrived. */
  const warehouse = (stones: number): Project => ({
    kind: "delivering",
    site: {
      building: "warehouse",
      step: 0,
      arrived: { ...EMPTY_STOCK, stones },
      onSite: EMPTY_STOCK,
    },
  });

  it("plays a mine whose shaft is not sunk exactly as part 2, with part 3 on", () => {
    fc.assert(
      fc.property(
        fc.record({
          topsoil: fc.nat(8),
          hoisting: fc.nat(8),
          kilns: fc.nat(3),
          onKilns: fc.nat(3),
          face: fc.nat(300),
          shaft: fc.nat(300),
          kiln: fc.nat(300),
          stones: fc.nat(6_000_100),
          brick: fc.nat(1_000_100),
          driving: fc.nat(1),
          building: fc.nat(2),
          arrived: fc.option(fc.nat(8_000_000), { nil: undefined }),
        }),
        fc.integer({ min: 1, max: 4 * 3_600 }),
        (setup, seconds) => {
          const start = levels({
            ...setup,
            sunk: false,
            piles: {
              face: setup.face,
              shaft: setup.shaft,
              kiln: setup.kilns > 0 ? setup.kiln : 0,
            },
            stock: { stones: setup.stones, brick: setup.brick },
            ...(setup.arrived === undefined
              ? {}
              : { project: warehouse(setup.arrived) }),
          });
          expect(partThree(() => live(start, seconds))).toEqual(
            partTwo(() => live(start, seconds)),
          );
          expect(partThree(() => night(start, seconds * 1000))).toEqual(
            partTwo(() => night(start, seconds * 1000)),
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it("leaves a sunk Granite alone with part 3 off: the Topsoil plays as part 2", () => {
    partTwo(() => {
      const setup: Setup = {
        topsoil: 6,
        granite: 4,
        hoisting: 6,
        kilns: 1,
        saws: 1,
        piles: { face: 200, shaft: 100, kiln: 50 },
        granitePiles: { face: 300, shaft: 200, saw: 100 },
        stock: { stones: 1_000, cutStone: 10 },
      };
      const sunk = levels(setup);
      const unsunk = levels({ ...setup, sunk: false });
      for (const run of [
        (mountain: Mountain) => live(mountain, 3_600),
        (mountain: Mountain) => night(mountain, 12 * HOUR),
      ]) {
        const deep = run(sunk);
        const shallow = run(unsunk);
        expect(deep.mountain.granite).toEqual(sunk.granite);
        expect(deep.mined).toBeGreaterThan(0);
        expect(deep.mined).toBe(shallow.mined);
        expect(deep.mountain.stock).toEqual(shallow.mountain.stock);
        expect(deep.mountain.piles).toEqual(shallow.mountain.piles);
        expect(deep.mountain.rockDug).toBe(shallow.mountain.rockDug);
      }
    });
  });
});
