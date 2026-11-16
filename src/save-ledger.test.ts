import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CageTrips } from "./cages";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES, UNSUNK } from "./mine-levels";
import { accrue, createMountain, type Mountain } from "./mountain";
import { levels, partThree } from "./part-three.harness";
import { partThreeOn } from "./part-switch";
import { readGame, shippedFacts, writeGame } from "./save-format";

/**
 * The ledger of what has shipped (#558; spec, "The ledger of what has
 * shipped"). Every id, named value and cap a version 10 save may hold, as this
 * build reads it. A retired key (#729) is still read at its cap and never
 * written, so it moves to its own list rather than going. Adding a line is fine: an older build reads the new value as
 * `newer` and goes read-only. Removing a line or lowering a cap would turn a
 * save this build wrote into one it refuses, so it needs a version bump and a
 * reset, said in chat first.
 */
const LEDGER = {
  gameKeys: [
    "owned",
    "stock",
    "levels",
    "clocks",
    "marks",
    "run",
    "engineers",
    "expeditions",
    "bench",
    "fleet",
    "project",
    "jobs",
    "piles",
    "makers",
    "stockyard",
    "granite",
    "station",
    "cages",
  ],
  owned: [
    "helper",
    "cart",
    "hoist",
    "drill",
    "borer",
    "train",
    "machine",
    "kid",
  ],
  stock: [
    "stones",
    "clay",
    "iron",
    "crystal",
    "heartstone",
    "brick",
    "cutStone",
  ],
  levels: {
    boots: 1,
    cartSyn: 1,
    drillSyn: 1,
    borerSyn: 1,
    machineSyn: 1,
    "iron-rails": 1000,
    "sturdy-props": 1000,
    "blasting-charge": 1000,
    reinforce: 1000,
    "axle-grease": 1000,
    "diamond-bits": 1000,
    "engineers-kit": 1000,
    "heartstone-core": 1000,
    "heartstone-ember": 1000,
  },
  clocks: ["blasting-charge", "axle-grease", "heartstone-ember"],
  marks: {
    seen: [
      "workshop",
      "engineers",
      "tending",
      "promotion",
      "staffing",
      "upgrade:boots",
      "upgrade:cartSyn",
      "upgrade:drillSyn",
      "upgrade:borerSyn",
      "upgrade:machineSyn",
    ],
    taught: [
      "workshop",
      "engineers",
      "tending",
      "promotion",
      "staffing",
      "upgrade:boots",
      "upgrade:cartSyn",
      "upgrade:drillSyn",
      "upgrade:borerSyn",
      "upgrade:machineSyn",
    ],
    recipes: [
      "iron-rails",
      "sturdy-props",
      "blasting-charge",
      "reinforce",
      "axle-grease",
      "diamond-bits",
      "engineers-kit",
      "heartstone-core",
      "heartstone-ember",
    ],
    finds: ["map", "boots", "drawing", "watch", "whistle", "pebble", "ribbon"],
    operational: ["lightTower", "warehouse", "foundry"],
  },
  run: {
    dug: 240000000,
    rock: Number.MAX_SAFE_INTEGER,
    granite: Number.MAX_SAFE_INTEGER,
  },
  // Retired (#729): still read at these caps, and never written.
  retiredRun: {
    generation: 1000,
    stretch: 1000000,
  },
  engineerNames: ["Ada", "Nils", "Ruth", "Otto", "Mae"],
  posts: ["cart", "drill", "borer", "machine", "camp", "tunnel"],
  tunnels: ["side-seam", "old-shaft", "deep-dark"],
  tripFinds: {
    quiet: [],
    tool: ["map", "boots"],
    keepsake: ["drawing", "watch", "whistle", "pebble", "ribbon"],
    engineer: ["Ada", "Nils", "Ruth", "Otto", "Mae"],
    recipe: ["engineers-kit"],
  },
  fleet: ["horseWagon", "truck"],
  projectStates: ["delivering", "onHold"],
  jobs: [
    "drilling",
    "haulage",
    "hoisting",
    "driving",
    "building",
    "kilns",
    "graniteDrilling",
    "graniteHaulage",
    "saws",
  ],
  piles: ["face", "shaft", "kiln"],
  makers: ["kiln", "saw"],
  caps: {
    engineers: 5,
    engineerTrips: 1000000,
    expeditions: 5,
    expeditionMs: 14400000,
    craftMs: 14400000,
    siteHolds: 500,
    stockyard: 18,
  },
  granite: {
    machines: ["cart", "drill", "borer", "train"],
    piles: ["face", "shaft", "saw"],
  },
  station: {
    blueprints: [
      "iron-rails",
      "sturdy-props",
      "blasting-charge",
      "reinforce",
      "axle-grease",
    ],
    states: ["delivering", "done"],
  },
  cages: {
    assigned: ["topsoil", "granite"],
    carried: ["topsoil", "granite"],
  },
};

describe("the ledger of what has shipped (#558)", () => {
  it("the build reads every id, value and cap that has shipped", () => {
    expect(shippedFacts()).toEqual(LEDGER);
  });

  it("ids are unique within each map", () => {
    const facts = shippedFacts();
    const lists: readonly (readonly string[])[] = [
      facts.gameKeys,
      facts.owned,
      facts.stock,
      Object.keys(facts.levels),
      facts.clocks,
      ...Object.values(facts.marks),
      facts.engineerNames,
      facts.posts,
      facts.tunnels,
      facts.fleet,
      facts.projectStates,
      facts.jobs,
      facts.piles,
      facts.makers,
      Object.keys(facts.tripFinds),
      ...Object.values(facts.tripFinds),
      ...Object.values(facts.granite),
      ...Object.values(facts.station),
      ...Object.values(facts.cages),
    ];
    for (const list of lists) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe("rock dug in all, in the save (#664)", () => {
  it("round-trips the count, and saves none while it is 0", () => {
    const mountain = { ...createMountain(), rockDug: 1_234_567 };
    const game = writeGame(mountain);
    expect(game.run).toEqual({ rock: 1_234_567 });
    const read = readGame(JSON.parse(JSON.stringify(game)), 0);
    expect(read.kind === "ok" && read.mountain.rockDug).toBe(1_234_567);
    expect(writeGame(createMountain())).not.toHaveProperty("run");
  });

  it("refuses a part-stone or a negative count", () => {
    expect(readGame({ run: { rock: 1.5 } }, 0).kind).toBe("bad");
    expect(readGame({ run: { rock: -1 } }, 0).kind).toBe("bad");
  });
});

describe("the mine's piles in the save (#703)", () => {
  it("round-trips the drilled rock and rock at the shaft", () => {
    const mountain = {
      ...createMountain(),
      piles: { face: 120, shaft: 7, kiln: 0 },
    };
    const game = writeGame(mountain);
    expect(game.piles).toEqual({ face: 120, shaft: 7 });
    const read = readGame(JSON.parse(JSON.stringify(game)), 0);
    expect(read.kind === "ok" && read.mountain.piles).toEqual({
      face: 120,
      shaft: 7,
      kiln: 0,
    });
  });

  it("saves no piles while both are empty", () => {
    expect(writeGame(createMountain())).not.toHaveProperty("piles");
  });

  it("reads a pile over the room this build allows: it is full (ruling 2)", () => {
    const read = readGame({ piles: { face: 9000 } }, 0);
    expect(read.kind === "ok" && read.mountain.piles).toEqual({
      face: 9000,
      shaft: 0,
      kiln: 0,
    });
  });

  it("refuses a part-stone or a negative pile, and a pile it does not know is newer", () => {
    expect(readGame({ piles: { face: 1.5 } }, 0).kind).toBe("bad");
    expect(readGame({ piles: { shaft: -1 } }, 0).kind).toBe("bad");
    expect(readGame({ piles: { hopper: 3 } }, 0).kind).toBe("newer");
  });
});

describe("part 2's facts in the save (#666)", () => {
  it("round-trips the kilns, the stockyard's level, brick, the kilns' job and their pile", () => {
    const start = createMountain();
    const mountain = {
      ...start,
      owned: { ...start.owned, helper: 3 },
      stock: { ...start.stock, stones: 40, brick: 7 },
      jobs: { ...start.jobs, kilns: 2 },
      piles: { ...start.piles, kiln: 120 },
      makers: { kiln: 3, saw: 0 },
      stockyard: 2,
    };
    const game = writeGame(mountain);
    expect(game.makers).toEqual({ kiln: 3 });
    expect(game.stockyard).toBe(2);
    expect(game.stock).toEqual({ stones: 40, brick: 7 });
    const read = readGame(JSON.parse(JSON.stringify(game)), 0);
    expect(read).toEqual({ kind: "ok", mountain });
  });

  it("saves neither while there are no kilns and the stockyard is at its first level", () => {
    const game = writeGame(createMountain());
    expect(game).not.toHaveProperty("makers");
    expect(game).not.toHaveProperty("stockyard");
  });

  it("refuses a part-kiln or a negative level, and a maker it does not know is newer", () => {
    expect(readGame({ makers: { kiln: 1.5, saw: 0 } }, 0).kind).toBe("bad");
    expect(readGame({ stockyard: -1 }, 0).kind).toBe("bad");
    expect(readGame({ stockyard: 1.5 }, 0).kind).toBe("bad");
    expect(readGame({ stockyard: "2" }, 0).kind).toBe("bad");
    expect(readGame({ makers: { crusher: 1 } }, 0).kind).toBe("newer");
  });

  it("reads a stockyard past this build's last level as newer", () => {
    expect(readGame({ stockyard: 18 }, 0).kind).toBe("ok");
    expect(readGame({ stockyard: 19 }, 0).kind).toBe("newer");
  });
});

describe("part 3's facts in the save (#673)", () => {
  const start = createMountain();
  /** A mountain with the Granite sunk, its machines, piles, jobs and saws in play. */
  const sunk: Mountain = {
    ...start,
    owned: { ...start.owned, helper: 10, cart: 3, drill: 2, train: 1 },
    stock: { ...start.stock, stones: 40, brick: 7, cutStone: 30 },
    fleet: { ...start.fleet, truck: 1 },
    jobs: {
      ...start.jobs,
      graniteDrilling: 2,
      graniteHaulage: 1,
      saws: 1,
    },
    makers: { kiln: 1, saw: 2 },
    granite: {
      kind: "sunk",
      machines: { cart: 1, drill: 2, borer: 0, train: 1 },
      piles: { face: 50, shaft: 4, saw: 12 },
    },
  };
  const throughJson = (mountain: Mountain) =>
    readGame(JSON.parse(JSON.stringify(writeGame(mountain))), 0);

  it("round-trips the Granite's machines and piles, its two jobs, the saws, their workers, cut stone and a truck", () => {
    const game = writeGame(sunk);
    expect(game.granite).toEqual({
      machines: { cart: 1, drill: 2, train: 1 },
      piles: { face: 50, shaft: 4, saw: 12 },
    });
    expect(game.jobs).toEqual({
      graniteDrilling: 2,
      graniteHaulage: 1,
      saws: 1,
    });
    expect(game.makers).toEqual({ kiln: 1, saw: 2 });
    expect(game.stock).toEqual({ stones: 40, brick: 7, cutStone: 30 });
    expect(game.fleet).toEqual({ truck: 1 });
    expect(throughJson(sunk)).toEqual({ kind: "ok", mountain: sunk });
  });

  it("saves a sunk Granite with nothing on it as an empty map, and none while unsunk", () => {
    const bare: Mountain = {
      ...start,
      granite: {
        kind: "sunk",
        machines: NO_LEVEL_MACHINES,
        piles: NO_GRANITE_PILES,
      },
    };
    expect(writeGame(bare).granite).toEqual({});
    expect(throughJson(bare)).toEqual({ kind: "ok", mountain: bare });
    expect(writeGame(createMountain())).not.toHaveProperty("granite");
    const empty = readGame({}, 0);
    expect(empty.kind === "ok" && empty.mountain.granite).toEqual(UNSUNK);
  });

  it("writes a part 2 save's game map as before", () => {
    const partTwo: Mountain = {
      ...start,
      owned: { ...start.owned, helper: 3 },
      stock: { ...start.stock, stones: 40, brick: 7 },
      jobs: { ...start.jobs, drilling: 1, kilns: 2 },
      piles: { ...start.piles, kiln: 120 },
      makers: { kiln: 3, saw: 0 },
      stockyard: 2,
      project: {
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 2,
          arrived: { ...start.stock, stones: 40 },
          onSite: start.stock,
        },
      },
    };
    const game = writeGame(partTwo);
    expect(Object.keys(game)).toEqual([
      "owned",
      "stock",
      "marks",
      "project",
      "jobs",
      "piles",
      "makers",
      "stockyard",
    ]);
    expect(throughJson(partTwo)).toEqual({ kind: "ok", mountain: partTwo });
  });

  it("refuses more machines on the Granite than he owns", () => {
    expect(
      readGame({ owned: { borer: 1 }, granite: { machines: { borer: 2 } } }, 0)
        .kind,
    ).toBe("bad");
    expect(
      readGame({ owned: { borer: 2 }, granite: { machines: { borer: 2 } } }, 0)
        .kind,
    ).toBe("ok");
    expect(readGame({ granite: { machines: { train: 1 } } }, 0).kind).toBe(
      "bad",
    );
  });

  it("refuses workers on the Granite's jobs or the saws, or a saw, while the shaft is not sunk", () => {
    const owned = { helper: 2 };
    for (const job of ["graniteDrilling", "graniteHaulage", "saws"]) {
      expect(readGame({ owned, jobs: { [job]: 1 } }, 0).kind, job).toBe("bad");
      expect(
        readGame({ owned, jobs: { [job]: 1 }, granite: {} }, 0).kind,
        job,
      ).toBe("ok");
    }
    expect(readGame({ makers: { saw: 1 } }, 0).kind).toBe("bad");
    expect(readGame({ makers: { saw: 1 }, granite: {} }, 0).kind).toBe("ok");
    expect(readGame({ makers: { kiln: 1, saw: 0 } }, 0).kind).toBe("ok");
  });

  it("reads a Granite key or id it does not know as newer, and a part-stone pile as bad", () => {
    expect(readGame({ granite: { lift: {} } }, 0).kind).toBe("newer");
    expect(readGame({ granite: { machines: { crane: 1 } } }, 0).kind).toBe(
      "newer",
    );
    expect(readGame({ granite: { piles: { hopper: 1 } } }, 0).kind).toBe(
      "newer",
    );
    expect(readGame({ granite: { piles: { face: 1.5 } } }, 0).kind).toBe("bad");
    expect(readGame({ granite: { piles: { saw: -1 } } }, 0).kind).toBe("bad");
    expect(readGame({ granite: { machines: "cart" } }, 0).kind).toBe("bad");
    expect(readGame({ granite: 1 }, 0).kind).toBe("bad");
    expect(readGame({ granite: [] }, 0).kind).toBe("bad");
    expect(readGame({ granite: null }, 0).kind).toBe("bad");
    expect(
      readGame({ granite: { lift: {}, piles: { face: 1.5 } } }, 0).kind,
    ).toBe("bad");
  });

  it("reads a pile past the room this build allows: it is full (ruling 2 of #703)", () => {
    const read = readGame({ granite: { piles: { face: 9_000_000 } } }, 0);
    expect(read.kind === "ok" && read.mountain.granite).toEqual({
      kind: "sunk",
      machines: NO_LEVEL_MACHINES,
      piles: { face: 9_000_000, shaft: 0, saw: 0 },
    });
  });

  it("reads and writes a sunk Granite back unchanged with part 3 off", () => {
    expect(partThreeOn()).toBe(false);
    const read = throughJson(sunk);
    expect(read).toEqual({ kind: "ok", mountain: sunk });
    expect(read.kind === "ok" && writeGame(read.mountain)).toEqual(
      writeGame(sunk),
    );
  });
});

describe("the factory's work order and the Granite's rock in the save (#674)", () => {
  const sunk = (): Mountain => ({
    ...createMountain(),
    rockDug: 5_000_000,
    graniteDug: 2_000_000,
    granite: {
      kind: "sunk",
      machines: NO_LEVEL_MACHINES,
      piles: NO_GRANITE_PILES,
    },
  });
  const back = (mountain: Mountain): Mountain | undefined => {
    const read = readGame(JSON.parse(JSON.stringify(writeGame(mountain))), 0);
    return read.kind === "ok" ? read.mountain : undefined;
  };

  it("saves nothing for an idle station and no Granite rock, so a part 2 save writes as before", () => {
    const game = writeGame(createMountain());
    expect(game).not.toHaveProperty("station");
    expect(game).not.toHaveProperty("run");
  });

  it("round-trips the Granite's rock beside the rock dug in all", () => {
    const mountain = sunk();
    expect(writeGame(mountain).run).toEqual({
      rock: 5_000_000,
      granite: 2_000_000,
    });
    expect(back(mountain)).toEqual(mountain);
  });

  it("round-trips a delivering work order, in loads, and a done one with no goods", () => {
    const delivering: Mountain = {
      ...sunk(),
      station: {
        kind: "delivering",
        blueprint: "iron-rails",
        arrived: { ...createMountain().stock, stones: 1_000, iron: 750 },
      },
    };
    expect(writeGame(delivering).station).toEqual({
      blueprint: "iron-rails",
      state: "delivering",
      arrived: { stones: 1_000, iron: 750 },
    });
    expect(back(delivering)).toEqual(delivering);
    const done: Mountain = {
      ...sunk(),
      station: { kind: "done", blueprint: "axle-grease" },
    };
    expect(writeGame(done).station).toEqual({
      blueprint: "axle-grease",
      state: "done",
    });
    expect(back(done)).toEqual(done);
  });

  it("reads a blueprint, state or key it does not know as newer", () => {
    const game = { ...writeGame(sunk()) };
    const newer = [
      { blueprint: "diamond-bits", state: "delivering" },
      { blueprint: "rocket", state: "delivering" },
      { blueprint: "iron-rails", state: "onHold" },
      { blueprint: "iron-rails", state: "delivering", speed: 2 },
      { blueprint: "iron-rails", state: "delivering", arrived: { fuel: 1 } },
    ];
    for (const station of newer) {
      expect(
        readGame({ ...game, station }, 0).kind,
        JSON.stringify(station),
      ).toBe("newer");
    }
    // A Granite this build cannot read leaves the work order to it.
    expect(
      readGame(
        {
          granite: { lift: {} },
          station: { blueprint: "axle-grease", state: "done" },
        },
        0,
      ).kind,
    ).toBe("newer");
  });

  it("refuses a work order past what it requires, one already all in, a done one with goods, or one with no shaft", () => {
    const game = { ...writeGame(sunk()) };
    const bad = [
      {
        blueprint: "iron-rails",
        state: "delivering",
        arrived: { iron: 2_001 },
      },
      { blueprint: "axle-grease", state: "delivering", arrived: { iron: 500 } },
      { blueprint: "axle-grease", state: "done", arrived: { iron: 500 } },
      { blueprint: "iron-rails", state: "delivering", arrived: { iron: 1.5 } },
      { blueprint: 3, state: "delivering" },
      "iron-rails",
    ];
    for (const station of bad) {
      expect(
        readGame({ ...game, station }, 0).kind,
        JSON.stringify(station),
      ).toBe("bad");
    }
    const unsunk = writeGame(createMountain());
    expect(
      readGame(
        { ...unsunk, station: { blueprint: "axle-grease", state: "done" } },
        0,
      ).kind,
    ).toBe("bad");
  });

  it("refuses Granite rock past all the rock dug, or with no shaft", () => {
    expect(readGame({ run: { rock: 10, granite: 11 } }, 0).kind).toBe("bad");
    expect(readGame({ run: { rock: 10, granite: 5 } }, 0).kind).toBe("bad");
  });
});

describe("the cages in the save (#724)", () => {
  const throughJson = (mountain: Mountain) =>
    readGame(JSON.parse(JSON.stringify(writeGame(mountain))), 0);
  /** A sunk shaft with three hoists, one assigned to each level. */
  const shaft = (trips: CageTrips = {}): Mountain =>
    partThree(() =>
      levels({
        hoists: 3,
        hoisting: 1,
        assigned: { topsoil: 1, granite: 1 },
        trips,
      }),
    );

  it("round-trips the hoists assigned and what the cages carry, level by level", () => {
    const atTop: CageTrips = {
      "hoist:0": { level: "topsoil", carried: 600, leg: { kind: "top" } },
      "hoist:1": { level: "granite", carried: 250, leg: { kind: "top" } },
    };
    const mountain = shaft(atTop);
    expect(writeGame(mountain).cages).toEqual({
      assigned: { topsoil: 1, granite: 1 },
      carried: { topsoil: 600, granite: 250 },
    });
    expect(throughJson(mountain)).toEqual({ kind: "ok", mountain });
    // Two cages carrying from the Topsoil come back as one cage at the top
    // with both loads, and the Granite's rock takes the next cage.
    const spread = throughJson(
      shaft({
        "hoist:2": { level: "topsoil", carried: 300, leg: { kind: "loading" } },
        "hoist:0": {
          level: "granite",
          carried: 40,
          leg: { kind: "down", left: 3 },
        },
        winch: { level: "topsoil", carried: 200, leg: { kind: "up", left: 1 } },
      }),
    );
    expect(spread.kind === "ok" && spread.mountain.cages.trips).toEqual({
      "hoist:0": { level: "topsoil", carried: 500, leg: { kind: "top" } },
      "hoist:1": { level: "granite", carried: 40, leg: { kind: "top" } },
    });
    // The Granite's rock alone takes the first cage.
    const granite = throughJson(
      shaft({
        winch: { level: "granite", carried: 90, leg: { kind: "up", left: 4 } },
      }),
    );
    expect(granite.kind === "ok" && granite.mountain.cages.trips).toEqual({
      "hoist:0": { level: "granite", carried: 90, leg: { kind: "top" } },
    });
    // Each part is written only when it has a positive entry.
    const carriedOnly = {
      ...mountain,
      cages: { ...mountain.cages, assigned: { topsoil: 0, granite: 0 } },
    };
    expect(writeGame(carriedOnly).cages).toEqual({
      carried: { topsoil: 600, granite: 250 },
    });
    expect(writeGame(shaft()).cages).toEqual({
      assigned: { topsoil: 1, granite: 1 },
    });
    expect(throughJson(shaft())).toEqual({ kind: "ok", mountain: shaft() });
  });

  it("saves where no cage is: a cage mid-trip reads back at the top with its load (call 63, Review Focus 1)", () => {
    const midTrip: CageTrips = {
      "hoist:0": { level: "granite", carried: 250, leg: { kind: "loading" } },
    };
    const build = (saws: number) =>
      partThree(() =>
        levels({
          hoists: 1,
          hoisting: 1,
          assigned: { granite: 1 },
          trips: midTrip,
          saws,
          onSaws: 0,
        }),
      );
    for (const saws of [0, 1]) {
      const start = build(saws);
      const read = throughJson(start);
      if (read.kind !== "ok") {
        throw new Error(`the save did not read: ${read.kind}`);
      }
      expect(read.mountain.cages.trips).toEqual({
        "hoist:0": { level: "granite", carried: 250, leg: { kind: "top" } },
      });
      const after = partThree(
        () =>
          accrue({ mountain: read.mountain, from: 0, to: 1_000, live: true })
            .mountain,
      );
      expect(
        after.cages.trips["hoist:0"]?.carried ?? 0,
        `saws ${String(saws)}`,
      ).toBe(0);
      if (saws === 0) {
        expect(after.stock.stones).toBe(start.stock.stones + 250);
      } else {
        expect(after.stock.stones).toBe(start.stock.stones);
        expect(after.granite.kind === "sunk" && after.granite.piles.saw).toBe(
          250,
        );
      }
      // The rock was dug before: unloading it is not digging.
      expect(after.rockDug).toBe(start.rockDug);
      expect(after.graniteDug).toBe(start.graniteDug);
    }
  });

  it("unloads a cage that came back with more than its load in one second at the top (Task 8)", () => {
    // Two Topsoil cages carrying 400 and 300 read back as one cage with 700,
    // past a hoist's load of 600; the Granite's 40 takes the next cage.
    const start = shaft({
      "hoist:2": { level: "topsoil", carried: 400, leg: { kind: "loading" } },
      winch: { level: "topsoil", carried: 300, leg: { kind: "up", left: 1 } },
      "hoist:0": {
        level: "granite",
        carried: 40,
        leg: { kind: "down", left: 3 },
      },
    });
    const read = throughJson(start);
    if (read.kind !== "ok") {
      throw new Error(`the save did not read: ${read.kind}`);
    }
    expect(read.mountain.cages.trips["hoist:0"]?.carried).toBe(700);
    const after = partThree(
      () =>
        accrue({ mountain: read.mountain, from: 0, to: 1_000, live: true })
          .mountain,
    );
    // No kiln and no saw, so all of it is stone, and none is dug again.
    expect(after.stock.stones).toBe(start.stock.stones + 740);
    expect(
      Object.values(after.cages.trips).reduce(
        (sum, trip) => sum + (trip?.carried ?? 0),
        0,
      ),
    ).toBe(0);
    expect(after.rockDug).toBe(start.rockDug);
  });

  it("writes a part 2 save's game map as before: no cages key", () => {
    // A guard: today's mountain has no cages, so this held before #724.
    expect(Object.keys(writeGame(createMountain()))).not.toContain("cages");
    // Cages that carry nothing, with no hoist assigned, write no key either.
    const empty = shaft({
      "hoist:0": {
        level: "granite",
        carried: 0,
        leg: { kind: "down", left: 2 },
      },
    });
    const bare = {
      ...empty,
      cages: { ...empty.cages, assigned: { topsoil: 0, granite: 0 } },
    };
    expect(writeGame(bare)).not.toHaveProperty("cages");
  });

  it("refuses more hoists assigned than he owns, an engine counted", () => {
    expect(
      readGame(
        {
          owned: { hoist: 1 },
          granite: {},
          cages: { assigned: { granite: 2 } },
        },
        0,
      ).kind,
    ).toBe("bad");
    expect(
      readGame(
        {
          owned: { hoist: 1, machine: 1 },
          granite: {},
          cages: { assigned: { granite: 2 } },
        },
        0,
      ).kind,
    ).toBe("ok");
    expect(
      readGame(
        {
          owned: { hoist: 2 },
          granite: {},
          cages: { assigned: { topsoil: 1, granite: 2 } },
        },
        0,
      ).kind,
    ).toBe("bad");
  });

  it("refuses hoists assigned, or rock carried from the Granite, while the shaft is not sunk", () => {
    const owned = { hoist: 2 };
    const refused = [
      { assigned: { topsoil: 1 } },
      { assigned: { granite: 1 } },
      { carried: { granite: 1 } },
    ];
    for (const cages of refused) {
      expect(readGame({ owned, cages }, 0).kind, JSON.stringify(cages)).toBe(
        "bad",
      );
      expect(
        readGame({ owned, granite: {}, cages }, 0).kind,
        JSON.stringify(cages),
      ).toBe("ok");
    }
    // The Topsoil alone plays cages too: its rock carried reads.
    const topsoil = readGame({ owned, cages: { carried: { topsoil: 70 } } }, 0);
    expect(topsoil.kind === "ok" && topsoil.mountain.cages).toEqual({
      assigned: { topsoil: 0, granite: 0 },
      trips: {
        "hoist:0": { level: "topsoil", carried: 70, leg: { kind: "top" } },
      },
    });
  });

  it("refuses rock carried from both levels with only the winch's cage", () => {
    const both = { carried: { topsoil: 5, granite: 6 } };
    expect(readGame({ granite: {}, cages: both }, 0).kind).toBe("bad");
    expect(
      readGame({ owned: { hoist: 1 }, granite: {}, cages: both }, 0).kind,
    ).toBe("ok");
    expect(
      readGame({ owned: { machine: 1 }, granite: {}, cages: both }, 0).kind,
    ).toBe("ok");
    const one = readGame(
      { granite: {}, cages: { carried: { granite: 6 } } },
      0,
    );
    expect(one.kind === "ok" && one.mountain.cages.trips).toEqual({
      winch: { level: "granite", carried: 6, leg: { kind: "top" } },
    });
  });

  it("reads a cages key or level it does not know as newer, and a part-rock or a negative as bad", () => {
    const granite = {};
    const newer = [
      { lift: {} },
      { assigned: { basalt: 1 } },
      { carried: { basalt: 1 } },
    ];
    for (const cages of newer) {
      expect(readGame({ granite, cages }, 0).kind, JSON.stringify(cages)).toBe(
        "newer",
      );
    }
    const bad = [
      { carried: { topsoil: 1.5 } },
      { assigned: { granite: -1 } },
      { assigned: "granite" },
      { lift: {}, carried: { topsoil: 1.5 } },
      1,
      [],
      null,
    ];
    for (const cages of bad) {
      expect(readGame({ granite, cages }, 0).kind, JSON.stringify(cages)).toBe(
        "bad",
      );
    }
  });

  it("refuses a save whose hoists assigned are more than he owns, whatever the counts (property)", () => {
    fc.assert(
      fc.property(
        fc.nat(6),
        fc.nat(6),
        fc.nat(6),
        (hoists, topsoil, granite) => {
          const read = readGame(
            {
              owned: { hoist: hoists },
              granite: {},
              cages: { assigned: { topsoil, granite } },
            },
            0,
          );
          expect(read.kind).toBe(topsoil + granite > hoists ? "bad" : "ok");
        },
      ),
    );
  });
});
