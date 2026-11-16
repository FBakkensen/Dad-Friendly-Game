import { describe, expect, it } from "vitest";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES, UNSUNK } from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
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
    operational: ["lightTower", "warehouse"],
  },
  run: {
    dug: 240000000,
    rock: Number.MAX_SAFE_INTEGER,
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
