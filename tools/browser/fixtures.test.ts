// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { grantFirstEngineer } from "../../src/engineers.ts";
import type { Mountain } from "../../src/mountain.ts";

/**
 * Every value the browser scripts seed, pinned. EXPECTED was printed by
 * scripts/fixtures.mjs (before it moved here) with Date.now frozen at FIXED.
 * CREW reads the clock when the module loads, so the clock is frozen first.
 */
const FIXED = 1_700_000_000_000;

const EXPECTED = {
  CREW: {
    remaining: 90700000,
    pocket: 9765,
    helpers: 51,
    carts: 24,
    drills: 6,
    borers: 2,
    boosts: { sharper: 1700003600000, overtime: 1700003600000 },
  },
  SAVE_KEY: "dad-friendly-session",
  workshopBusy: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 228000000,
      pocket: 50000,
      helpers: 4,
      carts: 1,
      staffed: 2,
      startedAt: 1699999999000,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
      bench: {
        recipe: "sturdy-props",
        startedAt: 1699999940000,
        endsAt: 1700000540000,
      },
      axleUntil: 1700000720000,
    },
  },
  workshopIdle: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 228000000,
      pocket: 200000,
      helpers: 4,
      carts: 1,
      staffed: 2,
      startedAt: 1699999999000,
    },
    workshop: {
      materials: { clay: 2, iron: 1, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  freshMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: { remaining: 240000000, pocket: 0, helpers: 0 },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
    },
  },
  openMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 215000000,
      pocket: 5000000,
      helpers: 20,
      carts: 5,
      drills: 2,
      borers: 1,
      staffed: 2,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  crewMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 239500000,
      pocket: 6854,
      helpers: 18,
      carts: 6,
      staffed: 2,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
    },
  },
  lastStoneSave: {
    version: 5,
    mountain: {
      remaining: 1,
      pocket: 0,
      helpers: 999,
      kids: 999,
      staffed: 2,
      legacy: 1,
    },
    lastSeen: 1700000000000,
  },
  crystalMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 180000000,
      pocket: 3000000,
      helpers: 30,
      carts: 10,
      drills: 6,
      borers: 2,
      staffed: 2,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  heartMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 110000000,
      pocket: 40000000,
      helpers: 60,
      kids: 3,
      carts: 20,
      drills: 10,
      borers: 4,
      machines: 1,
      staffed: 2,
      legacy: 1,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  savingMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 215000000,
      pocket: 100,
      helpers: 18,
      carts: 6,
      borers: 1,
      staffed: 2,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  fleetMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 210000000,
      pocket: 50000000,
      helpers: 170,
      carts: 120,
      drills: 30,
      borers: 2,
      staffed: 2,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  shortMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 215000000,
      pocket: 6000000,
      helpers: 21,
      carts: 6,
      drills: 4,
      borers: 1,
      staffed: 2,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  idleMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 239500000,
      pocket: 6854,
      helpers: 3,
      carts: 6,
      staffed: 2,
      taught: [],
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
    },
  },
  toolsMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 215000000,
      pocket: 5000000,
      helpers: 20,
      carts: 5,
      drills: 2,
      borers: 1,
      staffed: 2,
      upgrades: { boots: 1, tap: 2 },
      finds: ["pick", "lamp"],
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  machineMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 180000000,
      pocket: 2000000,
      helpers: 75,
      kids: 0,
      carts: 20,
      drills: 10,
      borers: 4,
      machines: 1,
      staffed: 2,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  heirMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 239500000,
      pocket: 6854,
      helpers: 18,
      carts: 6,
      staffed: 2,
      legacy: 1,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
    },
  },
  fullGraniteMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 210000000,
      pocket: 80000000,
      helpers: 80,
      carts: 24,
      drills: 8,
      borers: 3,
      staffed: 2,
      engineers: [
        { name: "Ada", rank: 0, trips: 0, post: "borer" },
        { name: "Nils", rank: 0, trips: 0, post: "drill" },
      ],
      upgrades: { tap: 3, boots: 1, steady: 1, cartSyn: 1 },
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  machinePickMountain: {
    version: 6,
    lastSeen: 1700000000000,
    mountain: {
      remaining: 180000000,
      pocket: 200000000,
      helpers: 90,
      kids: 0,
      carts: 20,
      drills: 10,
      borers: 4,
      machines: 1,
      staffed: 2,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "machine" }],
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  },
  seedJson: {
    freshMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":240000000,"pocket":0,"helpers":0},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
    openMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":215000000,"pocket":5000000,"helpers":20,"carts":5,"drills":2,"borers":1,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    crewMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":239500000,"pocket":6854,"helpers":18,"carts":6},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
    lastStoneSave:
      '{"version":5,"mountain":{"staffed":2,"remaining":1,"pocket":0,"helpers":999,"kids":999,"legacy":1},"lastSeen":1700000000000}',
    crystalMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":180000000,"pocket":3000000,"helpers":30,"carts":10,"drills":6,"borers":2,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    heartMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":110000000,"pocket":40000000,"helpers":60,"kids":3,"carts":20,"drills":10,"borers":4,"machines":1,"legacy":1,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    savingMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":215000000,"pocket":100,"helpers":18,"carts":6,"borers":1,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    fleetMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":210000000,"pocket":50000000,"helpers":170,"carts":120,"drills":30,"borers":2,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    shortMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":215000000,"pocket":6000000,"helpers":21,"carts":6,"drills":4,"borers":1,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    idleMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":239500000,"pocket":6854,"helpers":3,"carts":6,"taught":[]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
    toolsMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":215000000,"pocket":5000000,"helpers":20,"carts":5,"drills":2,"borers":1,"upgrades":{"boots":1,"tap":2},"finds":["pick","lamp"],"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    machineMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":180000000,"pocket":2000000,"helpers":75,"kids":0,"carts":20,"drills":10,"borers":4,"machines":1,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    heirMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":239500000,"pocket":6854,"helpers":18,"carts":6,"legacy":1},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
    fullGraniteMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":210000000,"pocket":80000000,"helpers":80,"carts":24,"drills":8,"borers":3,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"},{"name":"Nils","rank":0,"trips":0,"post":"drill"}],"upgrades":{"tap":3,"boots":1,"steady":1,"cartSyn":1}},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    machinePickMountain:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":180000000,"pocket":200000000,"helpers":90,"kids":0,"carts":20,"drills":10,"borers":4,"machines":1,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"machine"}]},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    workshopBusy:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":228000000,"pocket":50000,"helpers":4,"carts":1,"startedAt":1699999999000},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"],"bench":{"recipe":"sturdy-props","startedAt":1699999940000,"endsAt":1700000540000},"axleUntil":1700000720000}}',
    workshopIdle:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"staffed":2,"remaining":228000000,"pocket":200000,"helpers":4,"carts":1,"startedAt":1699999999000},"workshop":{"materials":{"clay":2,"iron":1,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    crew: '{"version":4,"mountain":{"staffed":2,"remaining":90700000,"pocket":9765,"helpers":51,"carts":24,"drills":6,"borers":2,"boosts":{"sharper":1700003600000,"overtime":1700003600000},"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"lastSeen":1700000000000}',
    crewThreeHelpers:
      '{"version":4,"mountain":{"staffed":2,"remaining":90700000,"pocket":9765,"helpers":3,"carts":24,"drills":6,"borers":2,"boosts":{"sharper":1700003600000,"overtime":1700003600000},"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"}]},"lastSeen":1700000000000}',
    legacyFlag:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":215000000,"pocket":5000000,"helpers":20,"carts":5,"drills":2,"borers":1,"staffed":2},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    noMountain: '{"version":6,"lastSeen":1700000000000}',
  },
};

type Fixtures = typeof import("./fixtures.ts");
let f: Fixtures;

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED);
  vi.resetModules();
  f = await import("./fixtures.ts");
});
afterAll(() => {
  vi.useRealTimers();
});

const BUILDERS = [
  "freshMountain",
  "openMountain",
  "crewMountain",
  "lastStoneSave",
  "crystalMountain",
  "heartMountain",
  "savingMountain",
  "fleetMountain",
  "shortMountain",
  "idleMountain",
  "toolsMountain",
  "machineMountain",
  "heirMountain",
  "fullGraniteMountain",
  "machinePickMountain",
] as const;

/** The saves seedJson is called with: every builder, plus the shapes the scripts build inline. */
function seeds(): Record<string, Parameters<Fixtures["seedJson"]>[0]> {
  return {
    ...Object.fromEntries(BUILDERS.map((name) => [name, f[name]()])),
    workshopBusy: f.workshopSave(FIXED, true),
    workshopIdle: f.workshopSave(FIXED, false),
    crew: { version: 4, mountain: f.CREW, lastSeen: FIXED },
    crewThreeHelpers: {
      version: 4,
      mountain: { ...f.CREW, helpers: 3 },
      lastSeen: FIXED,
    },
    legacyFlag: { ...f.openMountain(), legacy: true },
    noMountain: { version: 6, lastSeen: FIXED },
  };
}

describe("fixtures values", () => {
  it("exports the save key", () => {
    expect(f.SAVE_KEY).toBe(EXPECTED.SAVE_KEY);
  });

  it("CREW keeps its import-time boosts", () => {
    expect(f.CREW).toEqual(EXPECTED.CREW);
  });

  it("workshopSave builds the busy and idle benches", () => {
    expect(f.workshopSave(FIXED, true)).toEqual(EXPECTED.workshopBusy);
    expect(f.workshopSave(FIXED, false)).toEqual(EXPECTED.workshopIdle);
  });

  it.each(BUILDERS)("%s builds the same save", (name) => {
    expect(JSON.parse(JSON.stringify(f[name]()))).toEqual(EXPECTED[name]);
  });

  it.each(Object.keys(EXPECTED.seedJson))("seedJson stores %s", (name) => {
    const save = seeds()[name];
    if (save === undefined) throw new Error(name);
    expect(f.seedJson(save)).toBe(
      EXPECTED.seedJson[name as keyof typeof EXPECTED.seedJson],
    );
  });

  it("builders hand out fresh objects each call", () => {
    expect(f.openMountain()).not.toBe(f.openMountain());
    expect(f.openMountain().mountain).not.toBe(f.openMountain().mountain);
  });
});

describe("the first engineer", () => {
  // withCurrentEngineer (fixtures) checks engineers !== undefined; grantFirstEngineer
  // (src/engineers.ts) checks length > 0. They differ only on engineers: []. No fixture
  // and no script passes []: the inputs are borers >= 1 with engineers missing (Ada is
  // granted), borers >= 1 with engineers listed (left alone) and borers < 1 (left alone).
  // The game normalises borers to a number on load, so the comparison does the same.
  const base = {
    remaining: 1,
    pocket: 0,
    helpers: 1,
    carts: 0,
    drills: 0,
    kids: 0,
    machines: 0,
    staffed: 2 as const,
  };
  const ADA = { name: "Ada", rank: 0, trips: 0, post: "borer" };
  const NILS = { name: "Nils", rank: 0, trips: 0, post: "drill" };
  const inputs: Record<string, Record<string, unknown>> = {
    "a borer, no engineers": { borers: 1 },
    "two borers, no engineers": { borers: 2 },
    "no borer, no engineers": {},
    "no borer, borers 0": { borers: 0 },
    "a borer, one engineer": { borers: 1, engineers: [ADA] },
    "a borer, two engineers": { borers: 3, engineers: [ADA, NILS] },
  };

  it.each(Object.keys(inputs))(
    "agrees with grantFirstEngineer: %s",
    (label) => {
      const raw = inputs[label] ?? {};
      const mountain = { ...base, borers: 0, ...raw } as unknown as Mountain;
      const fromSrc = grantFirstEngineer(mountain).mountain;
      const seeded = JSON.parse(
        f.seedJson({
          version: 6,
          lastSeen: FIXED,
          mountain: { ...base, ...raw },
          workshop: {
            materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
            recipes: [],
          },
        }),
      ) as { mountain: { engineers?: unknown } };
      expect(seeded.mountain.engineers).toEqual(fromSrc.engineers);
    },
  );
});
