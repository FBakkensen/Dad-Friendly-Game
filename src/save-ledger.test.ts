import { describe, expect, it } from "vitest";
import { createMountain } from "./mountain";
import { readGame, shippedFacts, writeGame } from "./save-format";

/**
 * The ledger of what has shipped (#558; spec, "The ledger of what has
 * shipped"). Every id, named value and cap a version 8 save may hold, as this
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
  stock: ["stones", "clay", "iron", "crystal", "heartstone"],
  levels: {
    tap: 10,
    boots: 1,
    steady: 1,
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
    "crystal-flare": 1000,
    "crystal-lamp": 1000,
    "engineers-kit": 1000,
    "heartstone-core": 1000,
    "heartstone-ember": 1000,
  },
  clocks: [
    "sharper",
    "overtime",
    "blasting-charge",
    "axle-grease",
    "crystal-flare",
    "heartstone-ember",
    "gold-rush",
  ],
  marks: {
    seen: [
      "workshop",
      "engineers",
      "tending",
      "promotion",
      "staffing",
      "boost:sharper",
      "boost:overtime",
      "upgrade:tap",
      "upgrade:boots",
      "upgrade:steady",
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
      "boost:sharper",
      "boost:overtime",
      "upgrade:tap",
      "upgrade:boots",
      "upgrade:steady",
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
      "crystal-flare",
      "crystal-lamp",
      "engineers-kit",
      "heartstone-core",
      "heartstone-ember",
    ],
    finds: [
      "pick",
      "lamp",
      "map",
      "boots",
      "drawing",
      "watch",
      "whistle",
      "pebble",
      "ribbon",
    ],
    operational: ["lightTower"],
  },
  run: {
    generation: 1000,
    stretch: 1000000,
    dug: 240000000,
    rushBank: Number.MAX_SAFE_INTEGER,
  },
  engineerNames: ["Ada", "Nils", "Ruth", "Otto", "Mae"],
  posts: ["cart", "drill", "borer", "machine", "camp", "tunnel"],
  tunnels: ["side-seam", "old-shaft", "deep-dark"],
  tripFinds: {
    quiet: [],
    glimmer: ["lantern", "shield", "hammer", "heart", "crown", "mantle"],
    tool: ["pick", "lamp", "map", "boots"],
    keepsake: ["drawing", "watch", "whistle", "pebble", "ribbon"],
    engineer: ["Ada", "Nils", "Ruth", "Otto", "Mae"],
    recipe: ["crystal-lamp", "engineers-kit"],
  },
  fleet: ["horseWagon"],
  projectStates: ["delivering", "onHold"],
  jobs: ["drilling", "haulage", "hoisting", "driving", "building"],
  piles: ["face", "shaft"],
  caps: {
    engineers: 5,
    engineerTrips: 1000000,
    expeditions: 5,
    expeditionMs: 14400000,
    craftMs: 14400000,
    siteHolds: 500,
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
      Object.keys(facts.tripFinds),
      ...Object.values(facts.tripFinds),
    ];
    for (const list of lists) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe("the mine's piles in the save (#703)", () => {
  it("round-trips the drilled rock and rock at the shaft", () => {
    const mountain = { ...createMountain(), piles: { face: 120, shaft: 7 } };
    const game = writeGame(mountain);
    expect(game.piles).toEqual({ face: 120, shaft: 7 });
    const read = readGame(JSON.parse(JSON.stringify(game)), 0);
    expect(read.kind === "ok" && read.mountain.piles).toEqual({
      face: 120,
      shaft: 7,
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
    });
  });

  it("refuses a part-stone or a negative pile, and a pile it does not know is newer", () => {
    expect(readGame({ piles: { face: 1.5 } }, 0).kind).toBe("bad");
    expect(readGame({ piles: { shaft: -1 } }, 0).kind).toBe("bad");
    expect(readGame({ piles: { kiln: 3 } }, 0).kind).toBe("newer");
  });
});
