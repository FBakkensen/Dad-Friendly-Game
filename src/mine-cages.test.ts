import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  carriedBy,
  legSeconds,
  type Cage,
  type CageKey,
  type CageTrips,
} from "./cages";
import type { GranitePiles } from "./mine-levels";
import type { Project } from "./city";
import { makerTakes } from "./makers";
import { flowMineLive, landedMine } from "./mine-cages";
import {
  faceHolds,
  flowMine,
  makerHolds,
  mineDraw,
  mineWork,
  shaftHolds,
} from "./mine-piles";
import { accrue, accrueAway, type Mountain } from "./mountain";
import { levels, partThree, partTwo, type Setup } from "./part-three.harness";
import { EMPTY_STOCK, type Stock } from "./stock";
import { stockpileRoom } from "./stockyard";

/**
 * Live play runs the shaft's cages trip by trip (slice 1, part 3, rules 5.5
 * to 5.11, #724, rulings 10 and 11): rock is in stock only once a cage
 * unloads at the top. A hoist's cage carries 600 (60 a second for the
 * Topsoil's 10 s trip); a trip is 10 s to the Topsoil (5 down, 5 up) and 20 s
 * to the Granite (10 down, 10 up). A night lands the cages first (ruling 13).
 */

/** Live play over `seconds` from 0, as the session's tick plays it. */
const play = (mountain: Mountain, seconds: number) =>
  accrue({ mountain, from: 0, to: seconds * 1000, live: true });

/** The mountain after live play, with part 3 on. */
const played = (mountain: Mountain, seconds: number): Mountain =>
  partThree(() => play(mountain, seconds).mountain);

/** A part 3 mine from the shared harness, with part 3 on while it is built. */
const mine = (setup: Setup): Mountain => partThree(() => levels(setup));

function tripOf(mountain: Mountain, key: CageKey): Cage | undefined {
  return mountain.cages.trips[key];
}

function granitePilesOf(mountain: Mountain): GranitePiles {
  if (mountain.granite.kind !== "sunk") {
    throw new Error("the shaft is not sunk");
  }
  return mountain.granite.piles;
}

/** A hoist going up from `level` with `carried`, `left` seconds from the top. */
const goingUp = (
  level: Cage["level"],
  carried: number,
  left: number,
): CageTrips => ({ "hoist:0": { level, carried, leg: { kind: "up", left } } });

describe("rock is in stock when a cage unloads at the top (rules 5.5, 5.6)", () => {
  const topsoilAlone: Setup = {
    sunk: false,
    hoists: 1,
    hoisting: 1,
    piles: { shaft: 1_800 },
  };

  it("brings the first load to stone after one trip to the Topsoil, and none before", () => {
    const start = mine(topsoilAlone);
    expect(partThree(() => shaftHolds(start))).toBe(1_800);
    const nine = played(start, 9);
    expect(nine.stock.stones).toBe(0);
    expect(tripOf(nine, "hoist:0")).toEqual({
      level: "topsoil",
      carried: 600,
      leg: { kind: "up", left: 1 },
    });
    expect(nine.piles.shaft).toBe(1_200);
    const ten = played(start, 10);
    expect(ten.stock.stones).toBe(600);
    // The rock was dug before: unloading it is not digging.
    expect(ten.rockDug).toBe(start.rockDug);
    expect(partThree(() => play(start, 10).mined)).toBe(600);
  });

  it("plays the same in one call as a second at a time", () => {
    const start = mine({ ...topsoilAlone, topsoil: 4 });
    let state = start;
    for (let second = 0; second < 25; second += 1) {
      state = played(state, 1);
    }
    expect(state).toEqual(played(start, 25));
  });

  it("plays the cages before the stockyard opens too", () => {
    const start = mine({ ...topsoilAlone, operational: [] });
    expect(played(start, 9).stock.stones).toBe(0);
    expect(played(start, 10).stock.stones).toBe(600);
  });

  it("fills the kilns' pile before stone", () => {
    const start = mine({
      ...topsoilAlone,
      topsoil: 10,
      kilns: 1,
      onKilns: 0,
    });
    // Two loads in at 20 s; the third is on its way up at 29 s.
    const two = played(start, 29);
    expect(two.piles.kiln).toBe(1_200);
    expect(tripOf(two, "hoist:0")?.carried).toBe(600);
    const three = played(start, 30);
    expect(three.piles.kiln).toBe(1_800);
    expect(three.stock.stones).toBe(0);
    const four = played(start, 40);
    expect(four.piles.kiln).toBe(1_800);
    expect(four.stock.stones).toBe(600);
  });

  it("waits at the top with its load while the stone stockpile and the maker's pile are full, and the shaft fills behind it (Review Focus 4)", () => {
    const room = partThree(() => stockpileRoom(levels(topsoilAlone), "stones"));
    const start = mine({
      ...topsoilAlone,
      topsoil: 10,
      stock: { stones: room },
    });
    const waiting = played(start, 30);
    expect(waiting.stock.stones).toBe(room);
    expect(tripOf(waiting, "hoist:0")).toEqual({
      level: "topsoil",
      carried: 600,
      leg: { kind: "top" },
    });
    // 600 went up at 5 s; haulage has filled the shaft since.
    expect(waiting.piles.shaft).toBeGreaterThan(1_200);
    expect(waiting.rockDug).toBeGreaterThan(start.rockDug);
    // Transport takes 200: the next second the cage unloads that much.
    const taken = {
      ...waiting,
      stock: { ...waiting.stock, stones: room - 200 },
    };
    const next = played(taken, 1);
    expect(next.stock.stones).toBe(room);
    expect(tripOf(next, "hoist:0")).toEqual({
      level: "topsoil",
      carried: 400,
      leg: { kind: "top" },
    });
  });
});

describe("the hoists on their levels (rules 5.7 to 5.10)", () => {
  it("lets a hoist for both go strictly in turn: Topsoil, Granite, Topsoil", () => {
    const start = mine({
      hoists: 1,
      hoisting: 1,
      piles: { shaft: 1_800 },
      granitePiles: { shaft: 1_800 },
    });
    const ten = played(start, 10);
    expect(ten.stock.stones).toBe(600);
    expect(ten.piles.shaft).toBe(1_200);
    expect(granitePilesOf(ten).shaft).toBe(1_800);
    const thirty = played(start, 30);
    expect(thirty.stock.stones).toBe(1_200);
    expect(thirty.piles.shaft).toBe(1_200);
    expect(granitePilesOf(thirty).shaft).toBe(1_200);
    expect(tripOf(thirty, "hoist:0")).toEqual({
      level: "topsoil",
      carried: 0,
      leg: { kind: "down", left: 5 },
    });
  });

  it("waits at the Granite for a whole load for a hoist assigned there", () => {
    const start = mine({
      granite: 4,
      hoists: 1,
      hoisting: 1,
      assigned: { granite: 1 },
      granitePiles: { shaft: 100 },
    });
    const { face, haul } = partThree(() => mineWork(start).levels.granite);
    expect(face).toBe(haul);
    expect(haul).toBeGreaterThan(0);
    const fill = Math.ceil(500 / haul);
    // Down at 10 s, it takes the 100 there and loads what haulage brings.
    const loading = played(start, 10 + Math.floor(fill / 2));
    const trip = tripOf(loading, "hoist:0");
    expect(trip?.leg).toEqual({ kind: "loading" });
    expect(trip?.level).toBe("granite");
    expect(trip?.carried).toBeGreaterThan(100);
    expect(trip?.carried).toBeLessThan(600);
    expect(granitePilesOf(loading).shaft).toBe(0);
    expect(loading.stock.stones).toBe(0);
    // Full, it goes up: 10 s later the whole load is stone.
    const landed = played(start, 10 + fill + 10);
    expect(landed.stock.stones).toBe(600);
  });

  it("leaves the Topsoil out of the turn with nobody on its haulage and nothing at its shaft", () => {
    const start = mine({
      hoists: 1,
      hoisting: 1,
      granitePiles: { shaft: 1_800 },
    });
    const twenty = played(start, 20);
    expect(twenty.stock.stones).toBe(600);
    const forty = played(start, 40);
    expect(forty.stock.stones).toBe(1_200);
    expect(granitePilesOf(forty).shaft).toBe(600);
    expect(tripOf(forty, "hoist:0")).toEqual({
      level: "granite",
      carried: 0,
      leg: { kind: "down", left: 10 },
    });
  });

  it("sends the winch's cage to a level that no hoist serves", () => {
    const start = mine({
      hoists: 1,
      hoisting: 2,
      assigned: { topsoil: 1 },
      granitePiles: { shaft: 1_800 },
    });
    const winch = partThree(() => mineWork(start).cages).find(
      (cage) => cage.key === "winch",
    );
    // One worker on the winch's tools: 1 × toolSpeed for the Topsoil's 10 s.
    expect(winch?.serves).toBe("both");
    expect(winch?.runs).toBe(true);
    const load = winch?.load ?? 0;
    expect(load).toBeGreaterThan(0);
    expect(load).toBeLessThan(600);
    const twenty = played(start, 20);
    expect(twenty.stock.stones).toBe(load);
    expect(granitePilesOf(twenty).shaft).toBe(1_800 - load);
    // The hoist on the Topsoil waits there empty: nothing comes up from it.
    expect(tripOf(twenty, "hoist:0")).toEqual({
      level: "topsoil",
      carried: 0,
      leg: { kind: "loading" },
    });
  });

  it("lifts nothing from the Granite with every hoist on the Topsoil and nobody on the winch: its shaft fills and its haulage stops (Review Focus 3)", () => {
    const start = mine({
      granite: 4,
      hoists: 1,
      hoisting: 1,
      assigned: { topsoil: 1 },
    });
    const full = played(start, 600);
    const deep = granitePilesOf(full);
    expect(full.stock.stones).toBe(0);
    expect(deep.shaft).toBe(partThree(() => shaftHolds(start)));
    expect(deep.face).toBe(300);
    // No rock is lost: all that was drilled waits on the Granite.
    expect(full.rockDug - start.rockDug).toBe(deep.face + deep.shaft);
    const later = played(full, 60);
    expect(granitePilesOf(later)).toEqual(deep);
    expect(later.rockDug).toBe(full.rockDug);
    // The hoist waits at the Topsoil, and the winch's cage stands at the top.
    expect(tripOf(later, "hoist:0")).toEqual({
      level: "topsoil",
      carried: 0,
      leg: { kind: "loading" },
    });
    expect(tripOf(later, "winch")).toBeUndefined();
  });

  it("lets a cage whose workers are taken away finish its trip, unload, and stand (rule 5.11)", () => {
    const start = mine({
      sunk: false,
      hoists: 1,
      hoisting: 0,
      piles: { shaft: 1_800 },
      trips: goingUp("topsoil", 600, 5),
    });
    const five = played(start, 5);
    expect(five.stock.stones).toBe(600);
    expect(tripOf(five, "hoist:0")).toEqual({
      level: "topsoil",
      carried: 0,
      leg: { kind: "top" },
    });
    const later = played(five, 60);
    expect(later.stock.stones).toBe(600);
    expect(later.piles.shaft).toBe(1_800);
    expect(later.cages.trips).toEqual(five.cages.trips);
  });

  it("adds a cage for a hoist bought in play, at the top, and leaves the others' trips alone", () => {
    const start = mine({
      sunk: false,
      hoists: 1,
      hoisting: 2,
      piles: { shaft: 1_800 },
    });
    const before = played(start, 7);
    expect(tripOf(before, "hoist:0")?.leg).toEqual({ kind: "up", left: 3 });
    expect(tripOf(before, "hoist:1")).toBeUndefined();
    const bought = {
      ...before,
      owned: { ...before.owned, hoist: before.owned.hoist + 1 },
    };
    const after = played(bought, 1);
    expect(tripOf(after, "hoist:0")).toEqual(
      tripOf(played(before, 1), "hoist:0"),
    );
    // The new cage started empty at the top and went down at once.
    expect(tripOf(after, "hoist:1")).toEqual({
      level: "topsoil",
      carried: 0,
      leg: { kind: "down", left: 4 },
    });
  });

  it("brings up the rock of a cage that is not among the shaft's cages, and never loses it", () => {
    const start = mine({
      sunk: false,
      hoists: 1,
      hoisting: 1,
      trips: {
        "hoist:4": {
          level: "topsoil",
          carried: 600,
          leg: { kind: "up", left: 3 },
        },
      },
    });
    const three = played(start, 3);
    expect(three.stock.stones).toBe(600);
    expect(tripOf(three, "hoist:4")?.carried).toBe(0);
    // At the top with no room, it keeps its rock until there is room.
    const room = partThree(() => stockpileRoom(start, "stones"));
    const full = {
      ...start,
      stock: { ...start.stock, stones: room },
      cages: {
        ...start.cages,
        trips: {
          "hoist:4": { level: "topsoil", carried: 600, leg: { kind: "top" } },
        } satisfies CageTrips,
      },
    };
    const kept = played(full, 30);
    expect(tripOf(kept, "hoist:4")?.carried).toBe(600);
    expect(kept.stock.stones).toBe(room);
  });

  it("gives back the same mine when no rock moves and no cage changes", () => {
    const start = mine({ sunk: false, hoists: 1 });
    expect(partThree(() => play(start, 60)).mountain).toBe(start);
  });
});

describe("a night after play (ruling 13)", () => {
  it("lands the cages first, then counts rates, and the report counts what landed (Review Focus 5)", () => {
    const start = mine({
      hoists: 1,
      saws: 1,
      onSaws: 0,
      granitePiles: { saw: 1_700 },
      trips: goingUp("granite", 600, 7),
    });
    const away = partThree(() =>
      accrueAway({ mountain: start, lastSeen: 0, now: 60 * 60 * 1000 }),
    );
    const after = away.mountain;
    // 100 finds room at the saws, the other 500 goes to stone.
    expect(granitePilesOf(after).saw).toBe(1_800);
    expect(after.stock.stones).toBe(500);
    expect(away.mined).toBe(600);
    expect(away.report.mined).toBe(600);
    expect(away.report.night.produced.stones).toBe(500);
    expect(after.cages.trips["hoist:0"]).toEqual({
      level: "granite",
      carried: 0,
      leg: { kind: "top" },
    });
  });

  it("keeps in the cage at the top what finds no room", () => {
    const room = partThree(() => stockpileRoom(levels({}), "stones"));
    const start = mine({
      hoists: 1,
      stock: { stones: room - 100 },
      trips: goingUp("topsoil", 600, 2),
    });
    const away = partThree(() =>
      accrueAway({ mountain: start, lastSeen: 0, now: 60 * 60 * 1000 }),
    );
    expect(away.mountain.stock.stones).toBe(room);
    expect(away.report.night.produced.stones).toBe(100);
    expect(away.mountain.cages.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 500,
      leg: { kind: "top" },
    });
  });
});

describe("parts 1 and 2 do not change (#724)", () => {
  it("plays live exactly as before with part 3 off", () => {
    fc.assert(
      fc.property(
        fc.record({
          topsoil: fc.nat(8),
          hoisting: fc.nat(8),
          hoists: fc.nat(3),
          kilns: fc.nat(3),
          onKilns: fc.nat(3),
          face: fc.nat(300),
          shaft: fc.nat(300),
          kiln: fc.nat(300),
          stones: fc.nat(6_000_100),
          brick: fc.nat(1_000_100),
          open: fc.boolean(),
        }),
        fc.integer({ min: 1, max: 4 * 3_600 }),
        (setup, seconds) => {
          const start = partTwo(() =>
            levels({
              ...setup,
              sunk: false,
              piles: {
                face: setup.face,
                shaft: setup.shaft,
                kiln: setup.kilns > 0 ? setup.kiln : 0,
              },
              stock: { stones: setup.stones, brick: setup.brick },
              operational: setup.open ? ["lightTower"] : [],
            }),
          );
          const run = (live: boolean) =>
            partTwo(() =>
              accrue({ mountain: start, from: 0, to: seconds * 1000, live }),
            );
          expect(run(true)).toEqual(run(false));
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("one call of live play (ruling 11)", () => {
  const delivering: Project = {
    kind: "delivering",
    site: {
      building: "warehouse",
      step: 0,
      arrived: EMPTY_STOCK,
      onSite: EMPTY_STOCK,
    },
  };

  it("finds the room transport makes in the stone stockpile, a second at a time, while a cage waits at the top", () => {
    const room = partThree(() => stockpileRoom(levels({}), "stones"));
    const start = mine({
      sunk: false,
      hoists: 1,
      hoisting: 1,
      driving: 1,
      piles: { shaft: 1_800 },
      stock: { stones: room },
      project: delivering,
    });
    const draw = partThree(() => mineDraw(start, 1, true)).stones ?? 0;
    expect(draw).toBeGreaterThan(0);
    const flow = partThree(() => flowMineLive(start, 30, 1, true));
    // At 10 s it unloads the 10 s transport took, then each second's take.
    const unloaded = 10 * draw + 20 * draw;
    expect(flow.gained.stones).toBe(unloaded);
    expect(flow.mined).toBe(unloaded);
    // The stock gains it all; transport takes it afterwards (`deliver`).
    expect(flow.mountain.stock.stones).toBe(room + unloaded);
    expect(flow.mountain.project).toBe(start.project);
    expect(tripOf(flow.mountain, "hoist:0")).toEqual({
      level: "topsoil",
      carried: 600 - unloaded,
      leg: { kind: "top" },
    });
  });

  it("is flowMine exactly while part 3 is off, and lands nothing", () => {
    const start = partTwo(() =>
      levels({
        sunk: false,
        topsoil: 4,
        hoisting: 2,
        hoists: 1,
        piles: { face: 100, shaft: 200 },
        trips: goingUp("topsoil", 600, 2),
      }),
    );
    expect(partTwo(() => flowMineLive(start, 40, 1, true))).toEqual(
      partTwo(() => flowMine(start, 40, 1, true)),
    );
    expect(partTwo(() => landedMine(start)).mountain).toBe(start);
  });

  it("lands nothing when no cage carries rock, and leaves the cages where they are", () => {
    const start = mine({
      hoists: 1,
      hoisting: 1,
      trips: {
        "hoist:0": {
          level: "granite",
          carried: 0,
          leg: { kind: "down", left: 4 },
        },
      },
    });
    expect(partThree(() => landedMine(start)).mountain).toBe(start);
  });

  it("counts rock drilled and makes no rock: what is dug is in a pile, a cage or stock", () => {
    const start = mine({
      topsoil: 6,
      granite: 4,
      hoists: 2,
      hoisting: 3,
      assigned: { granite: 1 },
      kilns: 1,
      saws: 1,
    });
    const flow = partThree(() => flowMineLive(start, 300, 1, true));
    const after = flow.mountain;
    const deep = granitePilesOf(after);
    const carried = Object.values(after.cages.trips).reduce(
      (sum, trip) => sum + (trip?.carried ?? 0),
      0,
    );
    const kilnTakes = partThree(() => makerTakes("kiln"));
    const sawTakes = partThree(() => makerTakes("saw"));
    const rock =
      after.piles.face +
      after.piles.shaft +
      after.piles.kiln +
      deep.face +
      deep.shaft +
      deep.saw +
      carried +
      after.stock.stones +
      after.stock.brick * kilnTakes +
      after.stock.cutStone * sawTakes;
    expect(after.rockDug - start.rockDug).toBeGreaterThan(0);
    expect(rock).toBe(after.rockDug - start.rockDug);
    expect(flow.gained.brick).toBe(after.stock.brick);
    expect(flow.gained.cutStone).toBe(after.stock.cutStone);
    expect(flow.mined).toBe(
      after.stock.stones +
        after.piles.kiln +
        deep.saw +
        after.stock.brick * kilnTakes +
        after.stock.cutStone * sawTakes,
    );
  });
});

/** What an arbitrary draws. */
type Drawn<A> = A extends fc.Arbitrary<infer T> ? T : never;

/** A share from 0 to 1, in thousandths: where a pile or a cage stands within its room or leg. */
const share = fc.nat(1_000).map((thousandths) => thousandths / 1_000);

const legKinds = ["top", "down", "loading", "up"] as const;

/** One cage's trip as drawn: whether it has one, its level, leg, how far along, and how full. */
const tripDrawn = fc.record({
  present: fc.boolean(),
  granite: fc.boolean(),
  leg: fc.constantFrom(...legKinds),
  along: share,
  full: share,
});

type TripDrawn = Drawn<typeof tripDrawn>;

/** A mine as drawn: workers on each job, hoists and their assignment, makers, piles, and the stone stock near its room or not. */
const mineDrawn = fc.record({
  sunk: fc.boolean(),
  jobs: fc.record({
    drilling: fc.nat(8),
    haulage: fc.nat(8),
    graniteDrilling: fc.nat(8),
    graniteHaulage: fc.nat(8),
  }),
  hoists: fc.nat(4),
  topsoilAssigned: fc.nat(4),
  graniteAssigned: fc.nat(4),
  hoisting: fc.nat(8),
  kilns: fc.nat(2),
  onKilns: fc.nat(2),
  saws: fc.nat(2),
  onSaws: fc.nat(2),
  piles: fc.array(share, { minLength: 6, maxLength: 6 }),
  stoneShort: fc.option(fc.nat(2_000)),
  trips: fc.array(tripDrawn, { minLength: 7, maxLength: 7 }),
});

type MineDrawn = Drawn<typeof mineDrawn>;

/** One cage's trip from what was drawn: within its leg's seconds and its load. */
function tripOfDrawn(
  drawn: TripDrawn,
  sunk: boolean,
  load: number,
): Cage | undefined {
  if (!drawn.present) {
    return undefined;
  }
  const level = sunk && drawn.granite ? "granite" : "topsoil";
  const carried = Math.floor(drawn.full * load);
  switch (drawn.leg) {
    case "top":
      return { level, carried, leg: { kind: "top" } };
    case "loading":
      return { level, carried, leg: { kind: "loading" } };
    case "down":
    case "up": {
      const seconds = legSeconds(level, drawn.leg);
      const left = 1 + Math.floor(drawn.along * (seconds - 1));
      return {
        level,
        // A cage goes down only once it is empty.
        carried: drawn.leg === "down" ? 0 : carried,
        leg: { kind: drawn.leg, left },
      };
    }
  }
}

/**
 * A mine from the shared harness as drawn: the assignment within the hoists
 * he owns (none while the shaft is unsunk), the piles within their rooms,
 * and the cages' trips at random legs, each within its load.
 */
function drawnMine(
  drawn: MineDrawn,
  tripFor: (drawn: TripDrawn, sunk: boolean, load: number) => Cage | undefined,
): Mountain {
  const topsoil = drawn.sunk
    ? Math.min(drawn.topsoilAssigned, drawn.hoists)
    : 0;
  const granite = drawn.sunk
    ? Math.min(drawn.graniteAssigned, drawn.hoists - topsoil)
    : 0;
  const setup: Setup = {
    sunk: drawn.sunk,
    hoists: drawn.hoists,
    hoisting: drawn.hoisting,
    assigned: { topsoil, granite },
    kilns: drawn.kilns,
    onKilns: drawn.onKilns,
    saws: drawn.sunk ? drawn.saws : 0,
    onSaws: drawn.sunk ? drawn.onSaws : 0,
    jobs: drawn.sunk
      ? drawn.jobs
      : { ...drawn.jobs, graniteDrilling: 0, graniteHaulage: 0 },
  };
  const bare = mine(setup);
  const [face = 0, shaft = 0, kiln = 0, deepFace = 0, deepShaft = 0, saw = 0] =
    drawn.piles;
  const rooms = partThree(() => ({
    shaft: shaftHolds(bare),
    kiln: makerHolds(bare, "kiln"),
    saw: makerHolds(bare, "saw"),
    stones: stockpileRoom(bare, "stones"),
  }));
  const trips: Partial<Record<CageKey, Cage>> = {};
  partThree(() => mineWork(bare)).cages.forEach((cage, place) => {
    const drawnTrip = drawn.trips[place];
    const trip =
      drawnTrip === undefined
        ? undefined
        : partThree(() => tripFor(drawnTrip, drawn.sunk, cage.load));
    if (trip !== undefined) {
      trips[cage.key] = trip;
    }
  });
  return mine({
    ...setup,
    piles: {
      face: Math.floor(face * faceHolds("topsoil")),
      shaft: Math.floor(shaft * rooms.shaft),
      kiln: Math.floor(kiln * rooms.kiln),
    },
    granitePiles: {
      face: Math.floor(deepFace * faceHolds("granite")),
      shaft: Math.floor(deepShaft * rooms.shaft),
      saw: Math.floor(saw * rooms.saw),
    },
    stock:
      drawn.stoneShort === null
        ? {}
        : { stones: Math.max(0, rooms.stones - drawn.stoneShort) },
    trips,
  });
}

/** The rock waiting in the mine's piles, both levels: drilled, at the shaft and at the makers. */
function rockInPiles(mountain: Mountain): number {
  const { face, shaft, kiln } = mountain.piles;
  const deep =
    mountain.granite.kind === "sunk"
      ? mountain.granite.piles.face +
        mountain.granite.piles.shaft +
        mountain.granite.piles.saw
      : 0;
  return face + shaft + kiln + deep;
}

/** The rock at the saws, 0 while the shaft is unsunk. */
function sawPile(mountain: Mountain): number {
  return mountain.granite.kind === "sunk" ? mountain.granite.piles.saw : 0;
}

/** The rock every cage carries. */
function rockInCages(mountain: Mountain): number {
  const { topsoil, granite } = carriedBy(mountain.cages.trips);
  return topsoil + granite;
}

/** The rock a flow put in the stockpiles: stone, and the rock in the brick and cut stone made. */
function rockGained(gained: Partial<Stock>): number {
  return partThree(
    () =>
      (gained.stones ?? 0) +
      makerTakes("kiln") * (gained.brick ?? 0) +
      makerTakes("saw") * (gained.cutStone ?? 0),
  );
}

describe("what the shaft holds (Proof)", () => {
  it("makes and loses no rock in the shaft", () => {
    fc.assert(
      fc.property(
        mineDrawn,
        fc.integer({ min: 1, max: 120 }),
        (drawn, seconds) => {
          const before = drawnMine(drawn, tripOfDrawn);
          const flow = partThree(() => flowMineLive(before, seconds, 1, true));
          const after = flow.mountain;
          const dug = after.rockDug - before.rockDug;
          expect(dug).toBeGreaterThanOrEqual(0);
          expect(dug).toBe(
            rockInPiles(after) -
              rockInPiles(before) +
              rockInCages(after) -
              rockInCages(before) +
              rockGained(flow.gained),
          );
          // The stock gains what reached it, gross: transport takes it after.
          expect(after.stock.stones).toBe(
            before.stock.stones + (flow.gained.stones ?? 0),
          );
        },
      ),
      { numRuns: 60 },
    );
  });

  it("raises neither the stone stockpile nor a maker's pile while every cage is down, but brick and cut stone may rise", () => {
    /** Every cage loading at a level or on its way down: none can reach the top within four seconds. */
    const below = (drawn: TripDrawn, sunk: boolean, load: number): Cage => {
      const trip = tripOfDrawn(
        {
          ...drawn,
          present: true,
          leg: drawn.leg === "down" ? "down" : "loading",
        },
        sunk,
        load,
      );
      if (trip === undefined) {
        throw new Error("a cage below has a trip");
      }
      return trip;
    };
    fc.assert(
      fc.property(
        mineDrawn,
        fc.integer({ min: 1, max: 4 }),
        (drawn, seconds) => {
          const before = drawnMine(drawn, below);
          const flow = partThree(() => flowMineLive(before, seconds, 1, true));
          const after = flow.mountain;
          expect(flow.mined).toBe(0);
          expect(after.stock.stones).toBe(before.stock.stones);
          expect(after.piles.kiln).toBeLessThanOrEqual(before.piles.kiln);
          expect(sawPile(after)).toBeLessThanOrEqual(sawPile(before));
          expect(after.stock.brick).toBeGreaterThanOrEqual(before.stock.brick);
          expect(after.stock.cutStone).toBeGreaterThanOrEqual(
            before.stock.cutStone,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("live play through transport (#724, Task 6 review)", () => {
  /** The rock in goods: stone, and the rock in brick and cut stone. */
  const rockIn = (goods: Stock): number =>
    rockGained({
      stones: goods.stones,
      brick: goods.brick,
      cutStone: goods.cutStone,
    });

  /** The rock in the stock and delivered to the Warehouse's site (`arrived` counts it all, built or not). */
  function rockDelivered(mountain: Mountain): number {
    const project = mountain.project;
    const site =
      project.kind === "unordered" ? 0 : rockIn(project.site.arrived);
    return rockIn(mountain.stock) + site;
  }

  it("loses no rock while the stockyard is full and transport drains it", () => {
    fc.assert(
      fc.property(
        fc.record({
          topsoil: fc.integer({ min: 1, max: 8 }),
          granite: fc.nat(8),
          hoists: fc.nat(3),
          hoisting: fc.integer({ min: 1, max: 6 }),
          kilns: fc.nat(2),
          driving: fc.integer({ min: 1, max: 3 }),
          short: fc.nat(2_000),
        }),
        fc.integer({ min: 1, max: 300 }),
        (setup, seconds) => {
          const room = partThree(() => stockpileRoom(levels({}), "stones"));
          const before = mine({
            ...setup,
            piles: { shaft: 1_800 },
            stock: { stones: room - setup.short },
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
          const after = played(before, seconds);
          // Transport carried stone off the full stockpile.
          expect(rockDelivered(after) - rockIn(after.stock)).toBeGreaterThan(0);
          expect(after.rockDug - before.rockDug).toBe(
            rockInPiles(after) -
              rockInPiles(before) +
              rockInCages(after) -
              rockInCages(before) +
              rockDelivered(after) -
              rockDelivered(before),
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});
