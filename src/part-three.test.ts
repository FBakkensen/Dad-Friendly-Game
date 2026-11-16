import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { makerTakes } from "./makers";
import { NO_LEVEL_MACHINES, type GranitePiles } from "./mine-levels";
import {
  faceHolds,
  kilnHolds,
  makerHolds,
  mineDraw,
  mineMoves,
  mineSettled,
  mineWork,
  shaftHolds,
  takeIncome,
} from "./mine-piles";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import { levels, partThree, partTwo, type Setup } from "./part-three.harness";
import { effectiveRates } from "./rates";
import { EMPTY_STOCK } from "./stock";
import { stockDraw } from "./transport";
import type { Project } from "./city";

/**
 * Part 3's mine (slice 1, rules 3 and 5, #673): each level has its own
 * drilling, haulage, drilled rock and rock at the shaft, the shaft's cages
 * lift from both (#724), the Granite's rock goes to the saws first, three
 * rock for a cut stone, and what they cannot take bypasses to stone. With the
 * shaft not sunk, or part 3 off, the mine plays exactly as part 2 (ruling 6).
 *
 * Unattended time counts the cages as rates (rule 5.14). A hoist's cage
 * carries a load of 600 (its 60 a second times the Topsoil's 10 s trip): 60
 * a second from the Topsoil, or 30 from the Granite (20 s), for a hoist
 * assigned there. The winch's cage carries its workers' tools for 10 s, up
 * to a hoist's 600, and serves both levels: a cage for both lifts its load
 * once a round of the levels in the turn, so each level in the turn gets
 * `load / 30` with both in it.
 */
const HOUR = 60 * 60 * 1000;

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

/** The Granite's sawing mine: 16 on each of its stages and on hoisting, three hoists assigned there, and a saw. */
const SAWING: Setup = {
  granite: 16,
  hoisting: 16,
  hoists: 3,
  assigned: { granite: 3 },
  saws: 1,
};

describe("the Granite's rock (rules 3 and 5, #673)", () => {
  it("goes to the saws first, three rock for a cut stone, and the rest bypasses to stone", () => {
    partThree(() => {
      // 49 workers reach the 25 workers' mark: 6 a second each. Three
      // hoists assigned to the Granite lift 30 a second each, and the
      // winch's cage (13 on tools, capped at 600) 30 more with the Granite
      // alone in the turn: 120, more than the Granite's haulage brings, so
      // 96 a second is lifted. One saw takes 90 for its 30 cut stone: its
      // pile of 2,400 (a load of 600 for each of the four cages) fills in
      // 400 seconds, and the rest then bypasses.
      const after = live(levels(SAWING), 500);
      expect(after.mined).toBe(48_000);
      expect(after.mountain.stock.cutStone).toBe(15_000);
      expect(granitePilesOf(after.mountain).saw).toBe(2_400);
      expect(after.mountain.stock.stones).toBe(48_000 - 3 * 15_000 - 2_400);
      expect(after.mountain.stock.brick).toBe(0);
    });
  });

  it("settles both levels and says when the saws' pile fills (#673)", () => {
    partThree(() => {
      // As above: 96 a second lifted from the Granite, the saw takes 90, so
      // its pile grows 6 a second. Nothing else changes until it is full:
      // from empty in 2,400 / 6 = 400 seconds, from 120 in 2,280 / 6 = 380.
      const empty = mineSettled(levels(SAWING), 1, true);
      expect(empty.change).toBe(400);
      expect(empty.income.cutStone).toBe(30);
      expect(empty.income.stones ?? 0).toBe(0);
      const begun = levels({ ...SAWING, granitePiles: { saw: 120 } });
      expect(mineSettled(begun, 1, true).change).toBe(380);
      // Drilling stopped, 288 drilled rock waiting: the saws' pile is full at
      // 2,397 + 6 × 0.5, inside the first second, and the drilled rock runs
      // out at 288 / 96 = 3 seconds from now, not from the settling.
      const draining = levels({
        ...SAWING,
        granitePiles: { face: 288, saw: 2_397 },
      });
      expect(mineSettled(draining, 1, false).change).toBe(3);
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

  it("counts a mine where only the Granite works as at work, and accrues it", () => {
    partThree(() => {
      // A hoist assigned to the Granite, and the winch's cage for both.
      const deep = levels({
        granite: 4,
        hoisting: 4,
        hoists: 1,
        assigned: { granite: 1 },
      });
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
      // 13 workers: 3 a second each, so haulage brings 12 a second. A hoist
      // assigned to the Granite lifts 30 a second, and the winch's cage (3
      // on tools, a load of 90) 4.5 more: all 12 is lifted. The saws' pile
      // is full at three loads of the hoist's 600.
      const start = levels({
        granite: 4,
        hoisting: 4,
        hoists: 1,
        assigned: { granite: 1 },
        saws: 1,
        granitePiles: { saw: 1_800 },
        stock: { cutStone: 250_000 },
      });
      const after = live(start, 100);
      expect(after.mountain.stock.cutStone).toBe(250_000);
      expect(granitePilesOf(after.mountain).saw).toBe(1_800);
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
      // 37 workers: 6 a second each. No hoist: the winch's cage is 12 on
      // tools, 72 a second, capped at a hoist's load of 600, so both levels
      // in the turn lift 600 / 30 = 20 a second each. 40 a second, 18 at the
      // night shift output, fills the stone in about 15 hours: past the old
      // eight-hour clock, and short of the night.
      expect(facts?.producedMs).toBeGreaterThan(8 * HOUR);
      expect(facts?.producedMs).toBeLessThan(24 * HOUR);
      expect(away.report.capped).toBe(false);
      // Every rock lifted is in a stockpile or waits at the saws, whose pile
      // holds three loads of the winch's 600.
      expect(away.mined).toBe(1_000_000 + 3 * 1_000 + 1_800);
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

describe("the cages as rates, unattended (rule 5.14, #724)", () => {
  /** The rock lifted from each level over a run whose piles start empty and never fill: drilled, less what waits. */
  const liftedFrom = (after: Mountain, drilled: number) => ({
    topsoil: drilled - after.piles.face - after.piles.shaft,
    granite: drilled - granitePilesOf(after).face - granitePilesOf(after).shaft,
  });

  it("lifts from the cages, not from hoisting's workers, with the Topsoil alone", () => {
    partThree(() => {
      // 80 workers reach the 50 workers' mark: 12 a second each, so the
      // Topsoil drills and hauls 240 a second. One hoist runs (60 a
      // second), and the winch's 39 on tools would move 468, but its cage
      // carries no more than a hoist's: 120 a second, not hoisting's 528.
      const start = levels({
        topsoil: 20,
        hoisting: 40,
        hoists: 1,
        sunk: false,
      });
      const pay = effectiveRates(start).awayPay;
      expect(pay).toBeGreaterThan(0);
      const away = night(start, HOUR);
      expect(away.mined).toBe(Math.round(120 * pay * 3_600));
    });
  });

  it("lifts a load in 20 s from the Granite for a hoist assigned there", () => {
    partThree(() => {
      // 25 workers: 6 a second each, so the Granite hauls 72 a second. The
      // hoist's load of 600 every 20 s is 30 a second. Nobody is on the
      // winch, so the Topsoil's rock at the shaft stays where it is.
      const start = levels({
        granite: 12,
        hoisting: 1,
        hoists: 1,
        assigned: { granite: 1 },
        piles: { shaft: 300 },
      });
      const after = live(start, 100);
      expect(after.mined).toBe(3_000);
      expect(after.mountain.piles.shaft).toBe(300);
      expect(after.mountain.stock.stones).toBe(3_000);
    });
  });

  it("lifts two loads in 30 s for a hoist for both, one from each level", () => {
    partThree(() => {
      // 25 workers: 6 a second each, so each level drills and hauls 36 a
      // second. The hoist serves both: its 600 once a round of 10 s and 20
      // s, so each level is lifted 600 / 30 = 20 a second, the Topsoil as
      // fast as the Granite, and each level's rock at the shaft grows 16 a
      // second (strictly in turn: what one cannot use is not handed on).
      const start = levels({
        topsoil: 6,
        granite: 6,
        hoisting: 1,
        hoists: 1,
      });
      const after = live(start, 100);
      expect(after.mined).toBe(4_000);
      expect(liftedFrom(after.mountain, 3_600)).toEqual({
        topsoil: 2_000,
        granite: 2_000,
      });
      expect(after.mountain.piles.shaft).toBe(1_600);
      expect(granitePilesOf(after.mountain).shaft).toBe(1_600);
    });
  });

  it("gives a hoist for both to the Granite alone while the Topsoil has nobody on haulage and nothing at the shaft (rule 5.7)", () => {
    partThree(() => {
      // 25 workers: the Granite hauls 72 a second. The Topsoil is out of
      // the turn, so the hoist makes every trip to the Granite: 600 every
      // 20 s, 30 a second, not the 20 it would get in turn with the Topsoil.
      const start = levels({ granite: 12, hoisting: 1, hoists: 1 });
      const after = live(start, 100);
      expect(after.mined).toBe(3_000);
      expect(after.mountain.piles).toEqual({ face: 0, shaft: 0, kiln: 0 });
    });
  });

  it("caps the winch's cage at a hoist's load", () => {
    partThree(() => {
      // 80 workers: 12 a second each. 40 on the winch would move 480 a
      // second with their tools; its cage carries a hoist's 600 in 10 s.
      const start = levels({ topsoil: 20, hoisting: 40, sunk: false });
      const after = live(start, 100);
      expect(after.mined).toBe(100 * effectiveRates(start).tierSpeed.hoist);
      expect(after.mined).toBe(6_000);
    });
  });

  it("lifts nothing from a level that no hoist serves when nobody is on the winch (rule 5.8)", () => {
    partThree(() => {
      // 25 workers: each level hauls 36 a second. The one hoist is assigned
      // to the Topsoil and lifts all of it. The Granite's rock at the shaft
      // fills to its 1,800 in 50 s and stays; then its haulage stops, and its
      // drilled rock fills to 300. No rock is lost.
      const start = levels({
        topsoil: 6,
        granite: 6,
        hoisting: 1,
        hoists: 1,
        assigned: { topsoil: 1 },
      });
      const after = live(start, 100).mountain;
      expect(granitePilesOf(after)).toEqual({
        face: 300,
        shaft: 1_800,
        saw: 0,
      });
      expect(after.stock.stones).toBe(3_600);
      expect(after.rockDug).toBe(3_600 + 1_800 + 300);
    });
  });

  it("makes the rock at the shaft and the makers' piles hold a load of his largest cage for each cage, at least three, never less than 300", () => {
    partThree(() => {
      const hoisted = levels({ hoists: 1, kilns: 1 });
      expect(shaftHolds(hoisted)).toBe(1_800);
      expect(makerHolds(hoisted, "kiln")).toBe(1_800);
      expect(kilnHolds(hoisted)).toBe(1_800);
      expect(makerHolds(hoisted, "saw")).toBe(0);
      // The winch's cage counts too (rule 5.10): 40 on tools carry 600.
      const winched = levels({ kilns: 1, saws: 1, hoisting: 40 });
      expect(shaftHolds(winched)).toBe(1_800);
      expect(makerHolds(winched, "kiln")).toBe(1_800);
      expect(makerHolds(winched, "saw")).toBe(1_800);
      // A load for each cage past three: six hoists and the winch hold seven.
      const six = levels({ hoists: 6, kilns: 1 });
      expect(shaftHolds(six)).toBe(7 * 600);
      expect(makerHolds(six, "kiln")).toBe(7 * 600);
      // An idle winch carries nothing: with no hoist the piles stay 300.
      expect(shaftHolds(levels({ kilns: 1 }))).toBe(300);
      // The drilled rock stays as the lab set it.
      for (const level of ["topsoil", "granite"] as const) {
        expect(faceHolds(level)).toBe(300);
      }
    });
    partTwo(() => {
      const hoisted = levels({ hoists: 3, kilns: 1, sunk: false });
      expect(shaftHolds(hoisted)).toBe(300);
      expect(makerHolds(hoisted, "kiln")).toBe(300);
      expect(kilnHolds(hoisted)).toBe(300);
    });
  });

  it("works the cages out only while part 3 is on, and transport's draw only once the stockyard is open", () => {
    const setup: Setup = { hoists: 1, hoisting: 3, sunk: false };
    const off = partTwo(() => mineWork(levels(setup)));
    expect(off.cages).toEqual([]);
    expect(off.lift).toBeUndefined();
    const on = partThree(() => mineWork(levels(setup)));
    expect(on.cages.map((cage) => cage.key)).toEqual(["hoist:0", "winch"]);
    expect(on.lift).toEqual({ own: { topsoil: 60 + 6, granite: 0 }, loads: 0 });
    partThree(() => {
      const dark = { ...levels({ topsoil: 2 }), operational: [] };
      expect(mineDraw(dark, 1, true)).toEqual({});
      const delivering = levels({
        topsoil: 2,
        hoisting: 2,
        driving: 1,
        stock: { stones: 500 },
        project: {
          kind: "delivering",
          site: {
            building: "warehouse",
            step: 0,
            arrived: EMPTY_STOCK,
            onSite: EMPTY_STOCK,
          },
        },
      });
      const draw = mineDraw(delivering, 1, true);
      expect(draw.stones).toBeGreaterThan(0);
      expect(draw).toEqual(
        stockDraw(delivering, 1, takeIncome(delivering, 1, true)),
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
          // The one change is the room of the piles the cages use, which
          // the winch's cage sets from part 3 (#724): with its knob at 0
          // they hold part 2's 300, and the rest plays exactly as part 2.
          const sameRooms = { "piles.loads": 0 };
          expect(partThree(() => live(start, seconds), sameRooms)).toEqual(
            partTwo(() => live(start, seconds)),
          );
          expect(
            partThree(() => night(start, seconds * 1000), sameRooms),
          ).toEqual(partTwo(() => night(start, seconds * 1000)));
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
        machines: { cart: 2 },
        stock: { stones: 1_000, cutStone: 10 },
      };
      // Loading crews bought: the Granite's haulage must not speed the carts.
      const loading = { ...createMountain().upgrades, cartSyn: 1 };
      const sunk = { ...levels(setup), upgrades: loading };
      // Part 2's copy: the same workers, those of the Granite's jobs free.
      const shallow = levels({ ...setup, sunk: false });
      const unsunk = {
        ...shallow,
        upgrades: loading,
        jobs: { ...shallow.jobs, graniteDrilling: 0, graniteHaulage: 0 },
      };
      expect(effectiveRates(sunk)).toEqual(effectiveRates(unsunk));
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
