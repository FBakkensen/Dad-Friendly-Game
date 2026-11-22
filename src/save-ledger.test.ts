import fc from "fast-check";
import { NO_JOBS } from "./workforce";
import { describe, expect, it } from "vitest";
import type { CageTrips } from "./cages";
import {
  NO_GRANITE_PILES,
  NO_LEVEL_MACHINES,
  NO_MINE_LEVELS,
} from "./mine-levels";
import { accrue, createMountain, type Mountain } from "./mountain";
import { levels, partThree } from "./part-three.harness";
import { partThreeOn } from "./part-switch";
import { readGame, shippedFacts, writeGame } from "./save-format";

/**
 * The ledger of what has shipped (#558, #769; spec, "The ledger of what has
 * shipped"). Every id, named value and cap a version 11 save may hold, as this
 * build reads it. Adding a line is fine: an older build reads the new value as
 * `newer` and goes read-only. Removing a line or lowering a cap would turn a
 * save this build wrote into one it refuses, so it needs a version bump and a
 * reset, said in chat first.
 */
const LEDGER = {
  gameKeys: [
    "owned",
    "stock",
    "levels",
    "marks",
    "run",
    "engineers",
    "expeditions",
    "fleet",
    "project",
    "jobs",
    "piles",
    "makers",
    "stockyard",
    "mineLevels",
    "pithead",
    "makerBuffers",
    "cycleMicros",
    "assignedRuns",
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
  stock: ["stones", "brick", "cutStone"],
  levels: {
    boots: 1,
    cartSyn: 1,
    drillSyn: 1,
    borerSyn: 1,
  },
  marks: {
    seen: [
      "engineers",
      "tending",
      "promotion",
      "staffing",
      "upgrade:boots",
      "upgrade:cartSyn",
      "upgrade:drillSyn",
      "upgrade:borerSyn",
    ],
    taught: [
      "engineers",
      "tending",
      "promotion",
      "staffing",
      "upgrade:boots",
      "upgrade:cartSyn",
      "upgrade:drillSyn",
      "upgrade:borerSyn",
    ],
    finds: ["map", "boots", "drawing", "watch", "whistle", "pebble", "ribbon"],
    operational: ["lightTower", "warehouse", "foundry"],
  },
  run: {
    rock: Number.MAX_SAFE_INTEGER,
  },
  engineerNames: ["Ada", "Nils", "Ruth", "Otto", "Mae"],
  posts: ["cart", "drill", "borer", "machine", "camp", "tunnel"],
  tunnels: ["side-seam", "old-shaft", "deep-dark"],
  tripFinds: {
    quiet: [],
    tool: ["map", "boots"],
    keepsake: ["drawing", "watch", "whistle", "pebble", "ribbon"],
    engineer: ["Ada", "Nils", "Ruth", "Otto", "Mae"],
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
    "crystalDrilling",
    "crystalHaulage",
  ],
  piles: ["face", "shaft", "kiln"],
  makers: ["kiln", "saw"],
  caps: {
    engineers: 5,
    engineerTrips: 1000000,
    expeditions: 5,
    expeditionMs: 14400000,
    siteGoodCap: 500,
    cycleMicros: 999999,
    stockyard: 18,
  },
  mineLevels: {
    ids: ["granite", "crystal"],
    machines: ["cart", "drill", "borer", "train"],
    piles: ["face", "shaft", "saw"],
  },
  pithead: ["topsoil", "granite", "crystal"],
  makerBuffers: {
    kiln: ["topsoilRock"],
    saw: ["graniteRock"],
  },
  cycleMicros: ["kiln", "saw"],
  assignedRuns: [
    "pitToStockyardStones",
    "pitTopsoilToKilns",
    "pitGraniteToSaws",
    "stockToCity:stones",
    "stockToCity:brick",
    "stockToCity:cutStone",
  ],
  cages: {
    assigned: ["topsoil", "granite", "crystal"],
    carried: ["topsoil", "granite", "crystal"],
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
      ...Object.values(facts.mineLevels),
      facts.pithead,
      ...Object.values(facts.makerBuffers),
      facts.cycleMicros,
      facts.assignedRuns,
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
  /** The start with nobody on a job and no wagon, so the maps below name only their own facts. */
  const start: Mountain = {
    ...createMountain(),
    jobs: NO_JOBS,
    fleet: { horseWagon: 0, truck: 0 },
  };
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
    mineLevels: {
      granite: {
        machines: { cart: 1, drill: 2, borer: 0, train: 1 },
        piles: { face: 50, shaft: 4, saw: 12 },
      },
    },
  };
  const throughJson = (mountain: Mountain) =>
    readGame(JSON.parse(JSON.stringify(writeGame(mountain))), 0);

  it("round-trips the Granite's machines and piles, its two jobs, the saws, their workers, cut stone and a truck", () => {
    const game = writeGame(sunk);
    expect(game.mineLevels).toEqual({
      granite: {
        machines: { cart: 1, drill: 2, train: 1 },
        piles: { face: 50, shaft: 4, saw: 12 },
      },
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
      mineLevels: {
        granite: {
          machines: NO_LEVEL_MACHINES,
          piles: NO_GRANITE_PILES,
        },
      },
    };
    expect(writeGame(bare).mineLevels).toEqual({ granite: {} });
    expect(throughJson(bare)).toEqual({ kind: "ok", mountain: bare });
    expect(writeGame(createMountain())).not.toHaveProperty("mineLevels");
    const empty = readGame({}, 0);
    expect(empty.kind === "ok" && empty.mountain.mineLevels).toEqual(
      NO_MINE_LEVELS,
    );
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
      readGame(
        {
          owned: { borer: 1 },
          mineLevels: { granite: { machines: { borer: 2 } } },
        },
        0,
      ).kind,
    ).toBe("bad");
    expect(
      readGame(
        {
          owned: { borer: 2 },
          mineLevels: { granite: { machines: { borer: 2 } } },
        },
        0,
      ).kind,
    ).toBe("ok");
    expect(
      readGame({ mineLevels: { granite: { machines: { train: 1 } } } }, 0).kind,
    ).toBe("bad");
  });

  it("refuses workers on the Granite's jobs or the saws, or a saw, while the shaft is not sunk", () => {
    const owned = { helper: 2 };
    for (const job of ["graniteDrilling", "graniteHaulage", "saws"]) {
      expect(readGame({ owned, jobs: { [job]: 1 } }, 0).kind, job).toBe("bad");
      expect(
        readGame({ owned, jobs: { [job]: 1 }, mineLevels: { granite: {} } }, 0)
          .kind,
        job,
      ).toBe("ok");
    }
    expect(readGame({ makers: { saw: 1 } }, 0).kind).toBe("bad");
    expect(
      readGame({ makers: { saw: 1 }, mineLevels: { granite: {} } }, 0).kind,
    ).toBe("ok");
    expect(readGame({ makers: { kiln: 1, saw: 0 } }, 0).kind).toBe("ok");
  });

  it("reads a mineLevels key or id it does not know as newer, and a part-stone pile as bad", () => {
    expect(readGame({ mineLevels: { crystalCaves: {} } }, 0).kind).toBe(
      "newer",
    );
    expect(readGame({ mineLevels: { granite: { lift: {} } } }, 0).kind).toBe(
      "newer",
    );
    expect(
      readGame({ mineLevels: { granite: { machines: { crane: 1 } } } }, 0).kind,
    ).toBe("newer");
    expect(
      readGame({ mineLevels: { granite: { piles: { hopper: 1 } } } }, 0).kind,
    ).toBe("newer");
    expect(
      readGame({ mineLevels: { granite: { piles: { face: 1.5 } } } }, 0).kind,
    ).toBe("bad");
    expect(
      readGame({ mineLevels: { granite: { piles: { saw: -1 } } } }, 0).kind,
    ).toBe("bad");
    expect(
      readGame({ mineLevels: { granite: { machines: "cart" } } }, 0).kind,
    ).toBe("bad");
    expect(readGame({ mineLevels: { granite: 1 } }, 0).kind).toBe("bad");
    expect(readGame({ mineLevels: 1 }, 0).kind).toBe("bad");
    expect(readGame({ mineLevels: [] }, 0).kind).toBe("bad");
    expect(readGame({ mineLevels: null }, 0).kind).toBe("bad");
    expect(
      readGame(
        { mineLevels: { granite: { lift: {}, piles: { face: 1.5 } } } },
        0,
      ).kind,
    ).toBe("bad");
  });

  it("reads a pile past the room this build allows: it is full (ruling 2 of #703)", () => {
    const read = readGame(
      { mineLevels: { granite: { piles: { face: 9_000_000 } } } },
      0,
    );
    expect(read.kind === "ok" && read.mountain.mineLevels.granite).toEqual({
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
      cages: {
        ...mountain.cages,
        assigned: { topsoil: 0, granite: 0, crystal: 0 },
      },
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
        expect(after.mineLevels.granite?.piles.saw).toBe(250);
      }
      // The rock was dug before: unloading it is not digging.
      expect(after.rockDug).toBe(start.rockDug);
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
      cages: {
        ...empty.cages,
        assigned: { topsoil: 0, granite: 0, crystal: 0 },
      },
    };
    expect(writeGame(bare)).not.toHaveProperty("cages");
  });

  it("refuses more hoists assigned than he owns, an engine counted", () => {
    expect(
      readGame(
        {
          owned: { hoist: 1 },
          mineLevels: { granite: {} },
          cages: { assigned: { granite: 2 } },
        },
        0,
      ).kind,
    ).toBe("bad");
    expect(
      readGame(
        {
          owned: { hoist: 1, machine: 1 },
          mineLevels: { granite: {} },
          cages: { assigned: { granite: 2 } },
        },
        0,
      ).kind,
    ).toBe("ok");
    expect(
      readGame(
        {
          owned: { hoist: 2 },
          mineLevels: { granite: {} },
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
        readGame({ owned, mineLevels: { granite: {} }, cages }, 0).kind,
        JSON.stringify(cages),
      ).toBe("ok");
    }
    // The Topsoil alone plays cages too: its rock carried reads.
    const topsoil = readGame({ owned, cages: { carried: { topsoil: 70 } } }, 0);
    expect(topsoil.kind === "ok" && topsoil.mountain.cages).toEqual({
      assigned: { topsoil: 0, granite: 0, crystal: 0 },
      trips: {
        "hoist:0": { level: "topsoil", carried: 70, leg: { kind: "top" } },
      },
    });
  });

  it("refuses rock carried from both levels with only the winch's cage", () => {
    const both = { carried: { topsoil: 5, granite: 6 } };
    expect(readGame({ mineLevels: { granite: {} }, cages: both }, 0).kind).toBe(
      "bad",
    );
    expect(
      readGame(
        { owned: { hoist: 1 }, mineLevels: { granite: {} }, cages: both },
        0,
      ).kind,
    ).toBe("ok");
    expect(
      readGame(
        { owned: { machine: 1 }, mineLevels: { granite: {} }, cages: both },
        0,
      ).kind,
    ).toBe("ok");
    const one = readGame(
      { mineLevels: { granite: {} }, cages: { carried: { granite: 6 } } },
      0,
    );
    expect(one.kind === "ok" && one.mountain.cages.trips).toEqual({
      winch: { level: "granite", carried: 6, leg: { kind: "top" } },
    });
  });

  it("reads a cages key or level it does not know as newer, and a part-rock or a negative as bad", () => {
    const mineLevels = { granite: {} };
    const newer = [
      { lift: {} },
      { assigned: { basalt: 1 } },
      { carried: { basalt: 1 } },
    ];
    for (const cages of newer) {
      expect(
        readGame({ mineLevels, cages }, 0).kind,
        JSON.stringify(cages),
      ).toBe("newer");
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
      expect(
        readGame({ mineLevels, cages }, 0).kind,
        JSON.stringify(cages),
      ).toBe("bad");
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
              mineLevels: { granite: {} },
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
