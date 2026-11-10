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

/**
 * The builders that used to live in scripts/visual-check.mjs, pinned. Each string
 * is the JSON of the old inline code, printed with Date.now frozen at FIXED and
 * called with the arguments its call sites pass. A few builders take their own
 * clock (`now`); the test passes FIXED.
 */
const VISUAL_EXPECTED: Record<string, string> = {
  noticeBare:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":230000001,"pocket":20,"helpers":0,"carts":0,"staffed":2},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  noticeFull:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":239999995,"pocket":5000000,"helpers":20,"carts":1,"staffed":2},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails"]}}',
  crewSave0:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":228000000,"pocket":0,"helpers":18,"carts":7,"drills":2,"staffed":2},"workshop":{"materials":{"clay":10,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce"]}}',
  crewSave32500:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":228000000,"pocket":32500,"helpers":18,"carts":7,"drills":2,"staffed":2},"workshop":{"materials":{"clay":10,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce"]}}',
  crewSave1234567:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":228000000,"pocket":1234567,"helpers":18,"carts":7,"drills":2,"staffed":2},"workshop":{"materials":{"clay":10,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce"]}}',
  effectSave0:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":228000000,"pocket":5000000,"helpers":20,"carts":2,"borers":1,"staffed":2,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"camp"}],"expeditions":[],"boosts":{}},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  effectSave1:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":228000000,"pocket":5000000,"helpers":20,"carts":2,"borers":1,"staffed":2,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"camp"}],"expeditions":[],"boosts":{"sharper":1700000600000}},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  effectSave2:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":228000000,"pocket":5000000,"helpers":20,"carts":2,"borers":1,"staffed":2,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"camp"}],"expeditions":[],"boosts":{"sharper":1700000600000,"overtime":1700001200000}},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  effectSave3:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":228000000,"pocket":5000000,"helpers":20,"carts":2,"borers":1,"staffed":2,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"tunnel"}],"expeditions":[{"engineer":"Ada","tunnel":"side-seam","sentAt":1699999940000,"returnsAt":1700002400000,"home":"camp","find":{"kind":"quiet"}}],"boosts":{"sharper":1700000600000,"overtime":1700001200000}},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  effectSave12:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":228000000,"pocket":5000000,"helpers":20,"carts":2,"borers":1,"staffed":2,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"tunnel"},{"name":"Nils","rank":0,"trips":0,"post":"tunnel"},{"name":"Ruth","rank":0,"trips":0,"post":"tunnel"},{"name":"Otto","rank":0,"trips":0,"post":"tunnel"},{"name":"Mae","rank":0,"trips":0,"post":"tunnel"}],"expeditions":[{"engineer":"Ada","tunnel":"side-seam","sentAt":1699999940000,"returnsAt":1700002400000,"home":"camp","find":{"kind":"quiet"}},{"engineer":"Nils","tunnel":"side-seam","sentAt":1699999940000,"returnsAt":1700002460000,"home":"camp","find":{"kind":"quiet"}},{"engineer":"Ruth","tunnel":"side-seam","sentAt":1699999940000,"returnsAt":1700002520000,"home":"camp","find":{"kind":"quiet"}},{"engineer":"Otto","tunnel":"side-seam","sentAt":1699999940000,"returnsAt":1700002580000,"home":"camp","find":{"kind":"quiet"}},{"engineer":"Mae","tunnel":"side-seam","sentAt":1699999940000,"returnsAt":1700002640000,"home":"camp","find":{"kind":"quiet"}}],"boosts":{"sharper":1700000600000,"overtime":1700001200000}},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"],"chargeUntil":1700000480000,"axleUntil":1700000720000,"flareUntil":1700003000000,"emberUntil":1700000900000,"bench":{"recipe":"iron-rails","startedAt":1699999999000,"endsAt":1700000540000}}}',
  guardNow:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":200000000,"pocket":3250000,"helpers":34,"carts":12,"drills":4,"borers":1,"staffed":2,"engineers":[{"name":"Ada","rank":1,"trips":3,"post":"camp"}],"boosts":{"sharper":1700003600000}},"workshop":{"materials":{"clay":12,"iron":6,"crystal":2,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  guardWelcome:
    '{"version":6,"lastSeen":1699989200000,"mountain":{"remaining":200000000,"pocket":3250000,"helpers":34,"carts":12,"drills":4,"borers":1,"staffed":2,"engineers":[{"name":"Ada","rank":1,"trips":3,"post":"camp"}],"boosts":{"sharper":1699992800000}},"workshop":{"materials":{"clay":12,"iron":6,"crystal":2,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  guardRemaining5:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":5,"pocket":3250000,"helpers":34,"carts":12,"drills":4,"borers":1,"staffed":2,"engineers":[{"name":"Ada","rank":1,"trips":3,"post":"camp"}],"boosts":{"sharper":1700003600000}},"workshop":{"materials":{"clay":12,"iron":6,"crystal":2,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  overtimeSave:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":215000000,"pocket":5000000,"helpers":20,"carts":5,"drills":2,"borers":1,"staffed":2,"boosts":{"overtime":1700001200000}},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
  borerPickMountain:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":215000000,"pocket":6000000,"helpers":28,"carts":5,"drills":2,"borers":1,"staffed":2},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
  buysFit_longPocket:
    '{"version":4,"mountain":{"remaining":50000000,"pocket":888888,"helpers":24,"carts":12},"lastSeen":1700000000000}',
  buysFit_wide:
    '{"version":4,"mountain":{"remaining":50000000,"pocket":49999999,"helpers":999,"carts":999,"drills":999,"borers":999,"machines":999,"upgrades":{"boots":1,"cartSyn":1,"drillSyn":1,"borerSyn":1,"machineSyn":1}},"lastSeen":1700000000000}',
  buysFit_noBorers:
    '{"version":4,"mountain":{"remaining":50000000,"pocket":49999999,"helpers":120,"carts":85,"drills":40,"borers":0},"lastSeen":1700000000000}',
  crewV4:
    '{"version":4,"mountain":{"remaining":90700000,"pocket":9765,"helpers":51,"carts":24,"drills":6,"borers":2,"boosts":{"sharper":1700003600000,"overtime":1700003600000}},"lastSeen":1700000000000}',
  staffingNote:
    '{"legacy":true,"version":4,"mountain":{"remaining":90700000,"pocket":9765,"helpers":3,"carts":24,"drills":6,"borers":2,"boosts":{"sharper":1700003600000,"overtime":1700003600000}},"lastSeen":1700000000000}',
  welcomeBack:
    '{"version":4,"mountain":{"remaining":99000001,"pocket":180,"helpers":5,"carts":0},"lastSeen":1699999400000}',
  foundBelow:
    '{"version":4,"mountain":{"remaining":74000000,"pocket":100,"helpers":12,"carts":2,"drills":1,"borers":1,"machines":0,"kids":0,"finds":["pick","lamp","map","boots","drawing","watch","whistle","pebble","ribbon"]},"lastSeen":1700000000000}',
  fullShelf:
    '{"version":5,"mountain":{"remaining":0,"pocket":0,"helpers":40,"carts":10,"drills":0,"borers":0,"machines":0,"kids":0,"staffed":2},"lastSeen":1700000000000}',
  mantle:
    '{"version":5,"mountain":{"remaining":1,"pocket":0,"helpers":999,"carts":999,"drills":999,"borers":999,"machines":999,"kids":999,"staffed":2},"lastSeen":1700000000000}',
  away: '{"version":4,"mountain":{"remaining":90700000,"pocket":9765,"helpers":51,"carts":24,"drills":6,"borers":2,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"tunnel"}],"expeditions":[{"engineer":"Ada","tunnel":"old-shaft","sentAt":1700000000000,"returnsAt":1700002400000,"home":"borer","find":{"kind":"quiet"}}]},"lastSeen":1700000000000}',
  posts:
    '{"version":4,"mountain":{"remaining":90700000,"pocket":9765,"helpers":51,"carts":24,"drills":6,"borers":2,"engineers":[{"name":"Ada","rank":1,"trips":3,"post":"borer"},{"name":"Nils","rank":0,"trips":0,"post":"camp"},{"name":"Ruth","rank":2,"trips":9,"post":"drill"},{"name":"Otto","rank":0,"trips":0,"post":"tunnel"},{"name":"Mae","rank":0,"trips":0,"post":"cart"}],"expeditions":[{"engineer":"Otto","tunnel":"old-shaft","sentAt":1700000000000,"returnsAt":1700002400000,"home":"camp","find":{"kind":"quiet"}}],"finds":["drawing","watch"]},"lastSeen":1700000000000}',
  toolHome:
    '{"version":4,"mountain":{"remaining":90700000,"pocket":9765,"helpers":20,"carts":1,"drills":1,"borers":1,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"tunnel"}],"expeditions":[{"engineer":"Ada","tunnel":"old-shaft","sentAt":1699994600000,"returnsAt":1699998200000,"home":"borer","find":{"kind":"tool","id":"pick"}}]},"lastSeen":1699992800000}',
  locked:
    '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":239500000,"pocket":100,"helpers":1,"staffed":2,"startedAt":1699999999000},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]}}',
  legend:
    '{"version":5,"mountain":{"remaining":1,"pocket":0,"helpers":999,"kids":999,"staffed":2,"legacy":1},"lastSeen":1700000000000}',
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

describe("the visual check's builders", () => {
  const SYNERGIES = {
    helpers: 999,
    carts: 999,
    drills: 999,
    borers: 999,
    machines: 999,
    upgrades: {
      boots: 1,
      cartSyn: 1,
      drillSyn: 1,
      borerSyn: 1,
      machineSyn: 1,
    },
  };

  /** Each builder, called as its call sites call it. */
  function calls(): Record<string, () => unknown> {
    return {
      noticeBare: () => f.noticeSave({ mined: 9_999_999, lastSeen: FIXED }),
      noticeFull: () =>
        f.noticeSave({
          mined: 5,
          lastSeen: FIXED,
          mountain: { helpers: 20, carts: 1, pocket: 5_000_000 },
          workshop: { recipes: ["iron-rails"] },
        }),
      crewSave0: () => f.crewSave(0),
      crewSave32500: () => f.crewSave(32_500),
      crewSave1234567: () => f.crewSave(1_234_567),
      effectSave0: () => f.effectSave(0),
      effectSave1: () => f.effectSave(1),
      effectSave2: () => f.effectSave(2),
      effectSave3: () => f.effectSave(3),
      effectSave12: () => f.effectSave(12),
      guardNow: () => f.guardSave(FIXED),
      guardWelcome: () => f.guardSave(FIXED - 3 * 3_600_000),
      guardRemaining5: () => f.guardSave(FIXED, 5),
      overtimeSave: () => f.overtimeSave(),
      borerPickMountain: () => f.borerPickMountain(),
      buysFit_longPocket: () =>
        f.buysFitSave({ helpers: 24, carts: 12, pocket: 888_888 }),
      buysFit_wide: () => f.buysFitSave(SYNERGIES),
      buysFit_noBorers: () =>
        f.buysFitSave({ helpers: 120, carts: 85, drills: 40, borers: 0 }),
      crewV4: () => f.crewV4Save(),
      staffingNote: () => f.staffingNoteSave(),
      welcomeBack: () => f.welcomeBackSave(),
      foundBelow: () => f.foundBelowSave(),
      fullShelf: () => f.fullShelfSave(),
      mantle: () => f.mantleSave(),
      away: () => f.awayTripSave(FIXED),
      posts: () => f.campPostsSave(FIXED),
      toolHome: () => f.toolHomeSave(FIXED),
      locked: () => f.lockedWorkshopSave(FIXED),
      legend: () => f.legendSave(),
    };
  }

  it("pins every builder", () => {
    expect(Object.keys(calls()).sort()).toEqual(
      Object.keys(VISUAL_EXPECTED).sort(),
    );
  });

  it.each(Object.keys(VISUAL_EXPECTED))("%s builds the same save", (name) => {
    const build = calls()[name];
    if (build === undefined) throw new Error(name);
    expect(JSON.stringify(build())).toBe(VISUAL_EXPECTED[name]);
  });
});

describe("the audit's and play's saves", () => {
  const EXPECTED_AUDIT: Record<string, string> = {
    late_rest:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":110000000,"pocket":80000000,"helpers":80,"kids":4,"carts":24,"drills":8,"borers":3,"machines":2,"staffed":2,"startedAt":1699913600000,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"machine"},{"name":"Nils","rank":0,"trips":0,"post":"drill"}],"upgrades":{"tap":3,"boots":1,"steady":1,"cartSyn":1},"finds":["pick","lamp","drawing"]},"workshop":{"materials":{"clay":40,"iron":28,"crystal":12,"heartstone":3},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"]}}',
    late_young:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":220000000,"pocket":80000000,"helpers":80,"kids":0,"carts":24,"drills":8,"borers":3,"machines":0,"staffed":2,"startedAt":1699913600000,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"borer"},{"name":"Nils","rank":0,"trips":0,"post":"drill"}],"upgrades":{"tap":3,"boots":1,"steady":1,"cartSyn":1},"finds":["pick","lamp","drawing"]},"workshop":{"materials":{"clay":40,"iron":28,"crystal":12,"heartstone":3},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"]}}',
    late_built:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":210000000,"pocket":80000000,"helpers":80,"kids":0,"carts":24,"drills":8,"borers":3,"machines":0,"staffed":2,"startedAt":1699913600000,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"machine"},{"name":"Nils","rank":0,"trips":0,"post":"drill"}],"upgrades":{"tap":3,"boots":1,"steady":1,"cartSyn":1},"finds":["pick","lamp","drawing"]},"workshop":{"materials":{"clay":40,"iron":28,"crystal":12,"heartstone":3},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"]}}',
    late_edgeBuilt:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":215000000,"pocket":80000000,"helpers":80,"kids":0,"carts":24,"drills":8,"borers":3,"machines":2,"staffed":2,"startedAt":1699913600000,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"machine"},{"name":"Nils","rank":0,"trips":0,"post":"drill"}],"upgrades":{"tap":3,"boots":1,"steady":1,"cartSyn":1},"finds":["pick","lamp","drawing"]},"workshop":{"materials":{"clay":40,"iron":28,"crystal":12,"heartstone":3},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"]}}',
    late_edgeDeep:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":170000000,"pocket":80000000,"helpers":80,"kids":4,"carts":24,"drills":8,"borers":3,"machines":2,"staffed":2,"startedAt":1699913600000,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"machine"},{"name":"Nils","rank":0,"trips":0,"post":"drill"}],"upgrades":{"tap":3,"boots":1,"steady":1,"cartSyn":1},"finds":["pick","lamp","drawing"]},"workshop":{"materials":{"clay":40,"iron":28,"crystal":12,"heartstone":3},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"]}}',
    late_full:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":0,"pocket":80000000,"helpers":80,"kids":4,"carts":24,"drills":8,"borers":3,"machines":2,"staffed":2,"startedAt":1699913600000,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"machine"},{"name":"Nils","rank":0,"trips":0,"post":"drill"}],"upgrades":{"tap":3,"boots":1,"steady":1,"cartSyn":1},"finds":["pick","lamp","drawing"],"legacy":2},"workshop":{"materials":{"clay":40,"iron":28,"crystal":12,"heartstone":3},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"]}}',
    late_both:
      '{"version":6,"lastSeen":1699999995000,"mountain":{"remaining":200000000,"pocket":80000000,"helpers":65,"kids":0,"carts":24,"drills":8,"borers":3,"machines":2,"staffed":2,"startedAt":1699913595000,"engineers":[{"name":"Ada","rank":0,"trips":0,"post":"machine"},{"name":"Nils","rank":0,"trips":0,"post":"drill"}],"upgrades":{"tap":3,"boots":1,"steady":1,"cartSyn":1},"finds":["pick","lamp","drawing"]},"workshop":{"materials":{"clay":40,"iron":28,"crystal":12,"heartstone":3},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"],"bench":{"recipe":"sturdy-props","startedAt":1699999999000,"endsAt":1700000001000}}}',
    late_quiet:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":220000000,"pocket":2000000,"helpers":8,"kids":0,"carts":2,"drills":0,"borers":0,"machines":0,"staffed":2,"startedAt":1699913600000},"workshop":{"materials":{"clay":1,"iron":2,"crystal":3,"heartstone":4},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"]}}',
    late_quiet2:
      '{"version":6,"lastSeen":1699999999993,"mountain":{"remaining":220000000,"pocket":20,"helpers":0,"kids":0,"carts":0,"drills":0,"borers":0,"machines":0,"staffed":2,"startedAt":1699913599993},"workshop":{"materials":{"clay":40,"iron":28,"crystal":12,"heartstone":3},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease","diamond-bits","crystal-flare","crystal-lamp","engineers-kit","heartstone-core","heartstone-ember"]}}',
    quietBare:
      '{"helpers":8,"kids":0,"carts":2,"drills":0,"borers":0,"machines":0}',
    quietExtra:
      '{"helpers":8,"kids":0,"carts":2,"drills":0,"borers":0,"machines":0,"pocket":40000}',
    playCrewSave:
      '{"version":4,"mountain":{"remaining":90700000,"pocket":9765,"helpers":51,"carts":24,"drills":6,"borers":2,"boosts":{"sharper":1700003600000,"overtime":1700003600000}},"lastSeen":1700000000000}',
    playEdgeSave:
      '{"version":6,"lastSeen":1700000000000,"mountain":{"remaining":230000004,"pocket":2000000,"helpers":40,"carts":13,"drills":4,"staffed":2},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    playAwaySave:
      '{"version":6,"lastSeen":1699967600000,"mountain":{"remaining":215000000,"pocket":5000000,"helpers":20,"carts":5,"drills":2,"borers":1,"staffed":2},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
    playBriefSave:
      '{"version":6,"lastSeen":1699999880000,"mountain":{"remaining":215000000,"pocket":5000000,"helpers":20,"carts":5,"drills":2,"borers":1,"staffed":2},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge","reinforce","axle-grease"]}}',
  };

  /** Each builder, called as the audit and play call them. */
  function calls(): Record<string, () => unknown> {
    return {
      late_rest: () => f.late(FIXED, 130_000_000),
      late_young: () => f.late(FIXED, 20_000_000),
      late_built: () => f.late(FIXED, 30_000_000, { machines: 0, kids: 0 }),
      late_edgeBuilt: () => f.late(FIXED, 25_000_000),
      late_edgeDeep: () => f.late(FIXED, 70_000_000),
      late_full: () => f.late(FIXED, 240_000_000, { legacy: 2 }),
      late_both: () =>
        f.late(
          FIXED - 5000,
          40_000_000,
          { helpers: 65 },
          {
            bench: {
              recipe: "sturdy-props",
              startedAt: FIXED - 1000,
              endsAt: FIXED + 1000,
            },
          },
        ),
      late_quiet: () =>
        f.late(FIXED, 20_000_000, f.quietCrew({ pocket: 2_000_000 }), {
          materials: { clay: 1, iron: 2, crystal: 3, heartstone: 4 },
        }),
      late_quiet2: () =>
        f.late(
          FIXED - 7,
          20_000_000,
          f.quietCrew({ pocket: 20, helpers: 0, carts: 0 }),
        ),
      quietBare: () => f.quietCrew(),
      quietExtra: () => f.quietCrew({ pocket: 40_000 }),
      playCrewSave: () => f.playCrewSave(),
      playEdgeSave: () => f.playEdgeSave(),
      playAwaySave: () => f.playAwaySave(),
      playBriefSave: () => f.playBriefSave(),
    };
  }

  it("pins every builder", () => {
    expect(Object.keys(calls()).sort()).toEqual(
      Object.keys(EXPECTED_AUDIT).sort(),
    );
  });

  it.each(Object.keys(EXPECTED_AUDIT))("%s builds the same save", (name) => {
    const build = calls()[name];
    if (build === undefined) throw new Error(name);
    expect(JSON.stringify(build())).toBe(EXPECTED_AUDIT[name]);
  });
});
