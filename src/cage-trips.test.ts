import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  cageInstant,
  cagesAfter,
  landCages,
  nextLegEnd,
  topWaits,
  waitingCage,
  withCarried,
  type LevelScene,
  type ShaftScene,
} from "./cage-trips";
import type { Cage, CageKey, CageTrips, ShaftCage } from "./cages";
import { MINE_LEVEL_IDS, type MineLevelId } from "./mine-levels";

const hoist = (serves: ShaftCage["serves"], runs = true): ShaftCage => ({
  key: "hoist:0",
  load: 600,
  runs,
  serves,
});

type LevelSetup = {
  readonly shaft?: number;
  readonly maker?: number;
  readonly makerHolds?: number;
  readonly coming?: boolean;
  readonly inTurn?: boolean;
};

const levelScene = (setup: LevelSetup = {}): LevelScene => ({
  shaft: { held: setup.shaft ?? 0, holds: 1_800 },
  maker: { held: setup.maker ?? 0, holds: setup.makerHolds ?? 1_800 },
  coming: setup.coming ?? false,
  inTurn: setup.inTurn ?? true,
});

/** The Topsoil always, the Granite when given, and piles with room to spare by default. */
function scene({
  topsoil = {},
  granite,
  stone = 0,
  stoneHolds = 100_000,
}: {
  readonly topsoil?: LevelSetup;
  readonly granite?: LevelSetup;
  readonly stone?: number;
  readonly stoneHolds?: number;
} = {}): ShaftScene {
  return {
    levels: {
      topsoil: levelScene(topsoil),
      ...(granite === undefined ? {} : { granite: levelScene(granite) }),
    },
    stone: { held: stone, holds: stoneHolds },
  };
}

const at = (
  level: MineLevelId,
  carried: number,
  leg: Cage["leg"],
): CageTrips => ({ "hoist:0": { level, carried, leg } });

const TOP = { kind: "top" } as const;
const LOADING = { kind: "loading" } as const;
const down = (left: number) => ({ kind: "down", left }) as const;
const up = (left: number) => ({ kind: "up", left }) as const;

/** All the rock in the scene and the cages. */
function rockIn(trips: CageTrips, shaft: ShaftScene): number {
  let total = shaft.stone.held;
  for (const level of MINE_LEVEL_IDS) {
    const here = shaft.levels[level];
    total += (here?.shaft.held ?? 0) + (here?.maker.held ?? 0);
  }
  for (const cage of Object.values(trips)) {
    total += cage?.carried ?? 0;
  }
  return total;
}

describe("at the top (rule 5.6)", () => {
  it("unloads into its level's maker pile first, then the stone stockpile, then goes down", () => {
    const instant = cageInstant(
      [hoist("topsoil")],
      at("topsoil", 600, up(0)),
      scene({ topsoil: { maker: 1_500 } }),
    );
    expect(instant.toMaker).toEqual({ topsoil: 300 });
    expect(instant.toStone).toBe(300);
    expect(instant.scene.levels.topsoil?.maker.held).toBe(1_800);
    expect(instant.scene.stone.held).toBe(300);
    expect(instant.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 0,
      leg: down(5),
    });
    expect(instant.changed).toBe(true);
  });

  it("waits at the top with what finds no room", () => {
    const instant = cageInstant(
      [hoist("topsoil")],
      at("topsoil", 600, up(0)),
      scene({ topsoil: { maker: 1_800 }, stone: 99, stoneHolds: 100 }),
    );
    expect(instant.toMaker).toEqual({});
    expect(instant.toStone).toBe(1);
    expect(instant.scene.stone.held).toBe(100);
    expect(instant.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 599,
      leg: TOP,
    });
    expect(topWaits(instant.trips)).toBe(true);
    // Once transport makes room, it unloads that much at the next instant.
    const later = cageInstant([hoist("topsoil")], instant.trips, {
      ...instant.scene,
      stone: { held: 0, holds: 100 },
    });
    expect(later.toStone).toBe(100);
    expect(later.trips["hoist:0"]?.carried).toBe(499);
  });

  it("unloads without its workers, then stands (rule 5.11)", () => {
    const instant = cageInstant(
      [hoist("topsoil", false)],
      at("topsoil", 600, up(0)),
      scene({ topsoil: { maker: 1_500, shaft: 1_800, coming: true } }),
    );
    expect(instant.toMaker).toEqual({ topsoil: 300 });
    expect(instant.toStone).toBe(300);
    expect(instant.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 0,
      leg: TOP,
    });
    expect(topWaits(instant.trips)).toBe(false);
  });
});

describe("at a level (rules 5.7, 5.9)", () => {
  it("takes the rock at the shaft and goes up full", () => {
    const instant = cageInstant(
      [hoist("topsoil")],
      at("topsoil", 0, LOADING),
      scene({ topsoil: { shaft: 1_800, coming: true } }),
    );
    expect(instant.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 600,
      leg: up(5),
    });
    expect(instant.scene.levels.topsoil?.shaft.held).toBe(1_200);
    expect(instant.toStone).toBe(0);
    expect(instant.toMaker).toEqual({});
  });

  it("waits for a whole load at its one level while rock is coming", () => {
    const instant = cageInstant(
      [hoist("topsoil")],
      at("topsoil", 0, LOADING),
      scene({ topsoil: { shaft: 100, coming: true } }),
    );
    expect(instant.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 100,
      leg: LOADING,
    });
    expect(instant.scene.levels.topsoil?.shaft.held).toBe(0);
    expect(waitingCage([hoist("topsoil")], instant.trips, "topsoil")).toEqual({
      key: "hoist:0",
      pile: { held: 100, holds: 600 },
    });
    expect(
      waitingCage([hoist("topsoil")], instant.trips, "granite"),
    ).toBeUndefined();
    // Haulage fills it between instants; once full it goes up at the next.
    const full = withCarried(instant.trips, "hoist:0", 600);
    expect(waitingCage([hoist("topsoil")], full, "topsoil")).toBeUndefined();
    const next = cageInstant([hoist("topsoil")], full, instant.scene);
    expect(next.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 600,
      leg: up(5),
    });
  });

  it("goes up with a part load when no more rock is coming, and an empty one waits", () => {
    const part = cageInstant(
      [hoist("topsoil")],
      at("topsoil", 0, LOADING),
      scene({ topsoil: { shaft: 100, coming: false } }),
    );
    expect(part.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 100,
      leg: up(5),
    });
    const empty = cageInstant(
      [hoist("topsoil")],
      at("topsoil", 0, LOADING),
      scene({ topsoil: { shaft: 0, coming: false } }),
    );
    expect(empty.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 0,
      leg: LOADING,
    });
    expect(empty.changed).toBe(false);
    expect(waitingCage([hoist("topsoil")], empty.trips, "topsoil")).toEqual({
      key: "hoist:0",
      pile: { held: 0, holds: 600 },
    });
  });

  it("takes what is there and goes on, for both levels in turn, even empty", () => {
    const both = { topsoil: { shaft: 100, coming: true }, granite: {} };
    const part = cageInstant(
      [hoist("both")],
      at("topsoil", 0, LOADING),
      scene(both),
    );
    expect(part.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 100,
      leg: up(5),
    });
    const empty = cageInstant(
      [hoist("both")],
      at("granite", 0, LOADING),
      scene({ topsoil: {}, granite: { shaft: 0, coming: true } }),
    );
    expect(empty.trips["hoist:0"]).toEqual({
      level: "granite",
      carried: 0,
      leg: up(10),
    });
  });

  it("waits as a cage with one level when the other level is out of the turn", () => {
    const out = cageInstant(
      [hoist("both")],
      at("topsoil", 0, LOADING),
      scene({
        topsoil: { shaft: 100, coming: true },
        granite: { inTurn: false },
      }),
    );
    expect(out.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 100,
      leg: LOADING,
    });
    const alone = cageInstant(
      [hoist("both")],
      at("topsoil", 0, LOADING),
      scene({ topsoil: { shaft: 100, coming: true } }),
    );
    expect(alone.trips["hoist:0"]?.leg).toEqual(LOADING);
  });

  it("takes what is there and goes up from a level it no longer serves (Review Focus 2)", () => {
    const waiting = at("granite", 100, LOADING);
    const shaft = scene({
      topsoil: { shaft: 400, coming: true },
      granite: { shaft: 50, coming: true },
    });
    // While assigned to the Granite it waits there for a whole load.
    const assigned = cageInstant([hoist("granite")], waiting, shaft);
    expect(assigned.trips["hoist:0"]).toEqual({
      level: "granite",
      carried: 150,
      leg: LOADING,
    });
    // Its last hoist taken off the Granite, it serves both and goes up.
    const freed = cageInstant([hoist("both")], waiting, shaft);
    expect(freed.trips["hoist:0"]).toEqual({
      level: "granite",
      carried: 150,
      leg: up(10),
    });
    expect(freed.scene.levels.granite?.shaft.held).toBe(0);
    expect(freed.scene.levels.topsoil?.shaft.held).toBe(400);
  });
});

describe("going down (rules 5.7, 5.8)", () => {
  it("goes to the other level strictly in turn, and to the same while the other is out of the turn", () => {
    const both = scene({ topsoil: {}, granite: {} });
    expect(
      cageInstant([hoist("both")], at("topsoil", 0, TOP), both).trips[
        "hoist:0"
      ],
    ).toEqual({ level: "granite", carried: 0, leg: down(10) });
    expect(
      cageInstant([hoist("both")], at("granite", 0, TOP), both).trips[
        "hoist:0"
      ],
    ).toEqual({ level: "topsoil", carried: 0, leg: down(5) });
    const graniteOut = scene({ topsoil: {}, granite: { inTurn: false } });
    expect(
      cageInstant([hoist("both")], at("topsoil", 0, TOP), graniteOut).trips[
        "hoist:0"
      ],
    ).toEqual({ level: "topsoil", carried: 0, leg: down(5) });
    // A fresh cage at an even place last served the Granite, so it starts at the Topsoil.
    expect(cageInstant([hoist("both")], {}, both).trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 0,
      leg: down(5),
    });
  });

  it("stands at the top when no level is in the turn, or when it does not run", () => {
    const none = scene({
      topsoil: { inTurn: false },
      granite: { inTurn: false },
    });
    const trips = at("topsoil", 0, TOP);
    const idle = cageInstant([hoist("both")], trips, none);
    expect(idle.changed).toBe(false);
    expect(idle.trips).toBe(trips);
    expect(idle.scene).toBe(none);
    const both = scene({ topsoil: {}, granite: {} });
    const stopped = cageInstant([hoist("both", false)], trips, both);
    expect(stopped.changed).toBe(false);
    expect(stopped.trips).toBe(trips);
    // A fresh cage that stands keeps no entry.
    expect(cageInstant([hoist("topsoil", false)], {}, both).trips).toEqual({});
  });

  it("goes only to its own level once assigned, also with nothing there", () => {
    const graniteEmpty = scene({
      topsoil: { shaft: 1_800, coming: true },
      granite: { inTurn: false },
    });
    expect(
      cageInstant([hoist("granite")], at("granite", 0, TOP), graniteEmpty)
        .trips["hoist:0"],
    ).toEqual({ level: "granite", carried: 0, leg: down(10) });
    expect(
      cageInstant([hoist("topsoil")], at("topsoil", 0, TOP), graniteEmpty)
        .trips["hoist:0"],
    ).toEqual({ level: "topsoil", carried: 0, leg: down(5) });
  });

  it("turns back on its way down when its workers are taken away, by the way it came (rule 5.11)", () => {
    const shaft = scene({ topsoil: {}, granite: {} });
    const instant = cageInstant(
      [hoist("granite", false)],
      at("granite", 0, down(4)),
      shaft,
    );
    expect(instant.trips["hoist:0"]).toEqual({
      level: "granite",
      carried: 0,
      leg: up(6),
    });
    const again = cageInstant(
      [hoist("granite", false)],
      instant.trips,
      instant.scene,
    );
    expect(again.changed).toBe(false);
    // A cage that runs goes on down.
    expect(
      cageInstant([hoist("granite")], at("granite", 0, down(4)), shaft).trips[
        "hoist:0"
      ],
    ).toEqual({ level: "granite", carried: 0, leg: down(4) });
  });
});

const CAGE_KEYS: readonly CageKey[] = [
  "machine:0",
  "hoist:0",
  "hoist:1",
  "hoist:2",
  "hoist:3",
  "hoist:4",
  "winch",
];

const levelArb = fc.constantFrom<MineLevelId>("topsoil", "granite");

const cagesArb = fc
  .array(
    fc.record({
      load: fc.oneof(fc.integer({ min: 1, max: 2_000 }), fc.constant(333.3)),
      runs: fc.boolean(),
      serves: fc.constantFrom<ShaftCage["serves"]>(
        "topsoil",
        "granite",
        "both",
      ),
    }),
    { minLength: 1, maxLength: 7 },
  )
  .map((list) =>
    list.map((cage, place): ShaftCage => ({
      key: CAGE_KEYS[place] ?? "winch",
      ...cage,
    })),
  );

const legArb: fc.Arbitrary<Cage["leg"]> = fc.oneof(
  fc.constant(TOP),
  fc.constant(LOADING),
  fc.integer({ min: 0, max: 10 }).map(down),
  fc.integer({ min: 0, max: 10 }).map(up),
);

const tripArb: fc.Arbitrary<Cage | undefined> = fc.option(
  fc.record({
    level: levelArb,
    carried: fc.integer({ min: 0, max: 2_000 }),
    leg: legArb,
  }),
  { nil: undefined },
);

const levelSceneArb: fc.Arbitrary<LevelScene> = fc.record({
  shaft: fc.record({
    held: fc.integer({ min: 0, max: 2_000 }),
    holds: fc.constant(1_800),
  }),
  maker: fc.record({
    held: fc.integer({ min: 0, max: 2_000 }),
    holds: fc.constantFrom(0, 300, 1_800),
  }),
  coming: fc.boolean(),
  inTurn: fc.boolean(),
});

const sceneArb: fc.Arbitrary<ShaftScene> = fc
  .record({
    topsoil: levelSceneArb,
    granite: fc.option(levelSceneArb, { nil: undefined }),
    stone: fc.record({
      held: fc.integer({ min: 0, max: 2_000 }),
      holds: fc.constantFrom(0, 100, 2_000, 100_000),
    }),
  })
  .map(({ topsoil, granite, stone }) => ({
    levels: granite === undefined ? { topsoil } : { topsoil, granite },
    stone,
  }));

type InstantInput = {
  readonly cages: readonly ShaftCage[];
  readonly trips: CageTrips;
  readonly scene: ShaftScene;
};

const inputArb: fc.Arbitrary<InstantInput> = cagesArb.chain((cages) =>
  fc
    .record({
      trips: fc.array(tripArb, {
        minLength: cages.length,
        maxLength: cages.length,
      }),
      scene: sceneArb,
    })
    .map(({ trips, scene: shaft }) => {
      const entries: Partial<Record<CageKey, Cage>> = {};
      cages.forEach((cage, place) => {
        const trip = trips[place];
        if (trip !== undefined) {
          entries[cage.key] = trip;
        }
      });
      return { cages, trips: entries, scene: shaft };
    }),
);

/** The edges the pre-flight scan found (C13), always among the inputs. */
const EDGES: readonly InstantInput[] = [
  {
    cages: [hoist("topsoil", false)],
    trips: at("topsoil", 0, down(5)),
    scene: scene({ topsoil: { shaft: 300, coming: true } }),
  },
  {
    cages: [hoist("topsoil"), { ...hoist("topsoil"), key: "hoist:1" }],
    trips: {},
    scene: scene({ topsoil: { shaft: 300, coming: true } }),
  },
  {
    cages: [
      hoist("both"),
      { ...hoist("both", false), key: "hoist:1" },
      { key: "winch", load: 333.3, runs: true, serves: "both" },
    ],
    trips: {
      "hoist:0": { level: "granite", carried: 600, leg: up(0) },
      "hoist:1": { level: "topsoil", carried: 0, leg: down(5) },
      winch: { level: "topsoil", carried: 0, leg: LOADING },
    },
    scene: scene({
      topsoil: { shaft: 1_000, coming: true },
      granite: { maker: 1_700 },
      stone: 50,
      stoneHolds: 100,
    }),
  },
];

describe("trip by trip", () => {
  it("is the same instant twice", () => {
    fc.assert(
      fc.property(inputArb, ({ cages, trips, scene: shaft }) => {
        const once = cageInstant(cages, trips, shaft);
        const twice = cageInstant(cages, once.trips, once.scene);
        expect(twice.changed).toBe(false);
        expect(twice.trips).toEqual(once.trips);
        expect(twice.scene).toEqual(once.scene);
        expect(twice.toStone).toBe(0);
        expect(twice.toMaker).toEqual({});
      }),
      { examples: EDGES.map((edge) => [edge]) },
    );
  });

  it("loses and makes no rock at an instant", () => {
    fc.assert(
      fc.property(inputArb, ({ cages, trips, scene: shaft }) => {
        const once = cageInstant(cages, trips, shaft);
        expect(rockIn(once.trips, once.scene)).toBe(rockIn(trips, shaft));
        const poured =
          (once.toMaker.topsoil ?? 0) +
          (once.toMaker.granite ?? 0) +
          once.toStone;
        expect(once.scene.stone.held - shaft.stone.held).toBe(once.toStone);
        expect(poured).toBeGreaterThanOrEqual(0);
        const landed = landCages(cages, trips, shaft);
        expect(rockIn(landed.trips, landed.scene)).toBe(rockIn(trips, shaft));
      }),
      { examples: EDGES.map((edge) => [edge]) },
    );
  });

  it("lands a cage turned back with 0 s travelled within the same instant", () => {
    const instant = cageInstant(
      [hoist("topsoil", false)],
      at("topsoil", 0, down(5)),
      scene({ topsoil: { shaft: 300, coming: true } }),
    );
    expect(instant.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 0,
      leg: TOP,
    });
    expect(instant.changed).toBe(true);
    expect(instant.scene.levels.topsoil?.shaft.held).toBe(300);
  });

  it("pours nothing into a level that is not in the scene", () => {
    const alone = scene({ topsoil: { shaft: 300, coming: true } });
    const fresh = cageInstant([hoist("topsoil")], {}, alone);
    expect(fresh.toMaker).toEqual({});
    expect(fresh.toStone).toBe(0);
    expect(Object.keys(fresh.scene.levels)).toEqual(["topsoil"]);
    expect(fresh.trips["hoist:0"]).toEqual({
      level: "topsoil",
      carried: 0,
      leg: down(5),
    });
    // Rock carried from a level not in the scene goes to the stone stockpile only.
    const stray = cageInstant(
      [hoist("topsoil")],
      at("granite", 200, up(0)),
      alone,
    );
    expect(stray.toMaker).toEqual({});
    expect(stray.toStone).toBe(200);
    expect(Object.keys(stray.scene.levels)).toEqual(["topsoil"]);
  });

  it("counts the legs down and says when the next one ends", () => {
    const trips: CageTrips = {
      "hoist:0": { level: "topsoil", carried: 0, leg: down(5) },
      "hoist:1": { level: "granite", carried: 600, leg: up(2) },
      "hoist:2": { level: "topsoil", carried: 100, leg: LOADING },
      winch: { level: "granite", carried: 0, leg: TOP },
    };
    expect(nextLegEnd(trips)).toBe(2);
    const later = cagesAfter(trips, 3);
    expect(later).toEqual({
      "hoist:0": { level: "topsoil", carried: 0, leg: down(2) },
      "hoist:1": { level: "granite", carried: 600, leg: up(0) },
      "hoist:2": { level: "topsoil", carried: 100, leg: LOADING },
      winch: { level: "granite", carried: 0, leg: TOP },
    });
    expect(nextLegEnd(later)).toBe(0);
    expect(nextLegEnd({})).toBe(Infinity);
    expect(
      nextLegEnd({ winch: { level: "granite", carried: 0, leg: TOP } }),
    ).toBe(Infinity);
    expect(cagesAfter(trips, 0)).toBe(trips);
  });

  it("lands every cage at the top and unloads it, keeping what finds no room (ruling 13)", () => {
    const cages: readonly ShaftCage[] = [
      hoist("granite"),
      { ...hoist("topsoil"), key: "hoist:1" },
      { key: "winch", load: 300, runs: true, serves: "both" },
    ];
    const trips: CageTrips = {
      "hoist:0": { level: "granite", carried: 600, leg: up(7) },
      "hoist:1": { level: "topsoil", carried: 100, leg: LOADING },
      winch: { level: "granite", carried: 0, leg: down(3) },
    };
    const shaft = scene({
      topsoil: { shaft: 900, makerHolds: 0, coming: true },
      granite: { shaft: 400, maker: 1_700 },
      stone: 1_700,
      stoneHolds: 2_000,
    });
    const landed = landCages(cages, trips, shaft);
    expect(landed.toMaker).toEqual({ granite: 100 });
    expect(landed.toStone).toBe(300);
    expect(landed.trips).toEqual({
      "hoist:0": { level: "granite", carried: 200, leg: TOP },
      "hoist:1": { level: "topsoil", carried: 100, leg: TOP },
      winch: { level: "granite", carried: 0, leg: TOP },
    });
    // Landing loads nothing at the shaft.
    expect(landed.scene.levels.topsoil?.shaft.held).toBe(900);
    expect(landed.scene.levels.granite?.shaft.held).toBe(400);
    expect(topWaits(landed.trips)).toBe(true);
    // Cages already at the top with nothing are the same.
    const calm = landCages(cages, {}, shaft);
    expect(calm.changed).toBe(false);
    expect(calm.scene).toBe(shaft);
  });
});
