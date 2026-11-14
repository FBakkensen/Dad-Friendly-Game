import { describe, expect, it } from "vitest";
import { shippedFacts } from "./save-format";

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
  caps: {
    engineers: 5,
    engineerTrips: 1000000,
    expeditions: 5,
    expeditionMs: 14400000,
    craftMs: 14400000,
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
      Object.keys(facts.tripFinds),
      ...Object.values(facts.tripFinds),
    ];
    for (const list of lists) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
