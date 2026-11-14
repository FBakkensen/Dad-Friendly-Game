/**
 * Seed saves shared by the real-browser scripts: the layout guard
 * (scripts/visual-check.mjs), the screen audit (scripts/ui-audit.mjs) and the
 * play-test shots (scripts/play.mjs).
 * Each is what a tab finds in localStorage on its first load.
 */

import type { BoostId } from "../../src/boosts.ts";
import type { DutyEngineer, EngineerName } from "../../src/engineers.ts";
import type { FindId, SavedExpedition } from "../../src/expeditions.ts";
import type { MaterialId } from "../../src/layers.ts";
import type { SaveDocument } from "../../src/persist.ts";
import type { SaveGame } from "../../src/save-format.ts";
import type { TeachId } from "../../src/teach.ts";
import type { UpgradeId } from "../../src/upgrades.ts";
import type { Bench, RecipeId } from "../../src/workshop.ts";

export { SAVE_KEY } from "./harness.ts";

/**
 * A mountain as a seed writes it, in the game's own field names. The scripts
 * leave out what they do not need (the game reads a missing fact as its
 * default), so only the first three fields are required.
 */
export type SeedMountain = {
  readonly remaining: number;
  readonly pocket: number;
  readonly helpers: number;
  readonly carts?: number;
  readonly hoists?: number;
  readonly drills?: number;
  readonly borers?: number;
  readonly trains?: number;
  readonly machines?: number;
  readonly kids?: number;
  readonly upgrades?: Readonly<Partial<Record<UpgradeId, number>>>;
  readonly boosts?: Readonly<Partial<Record<BoostId, number>>>;
  readonly startedAt?: number;
  /** The run's generation: how many times the mine was passed down. */
  readonly legacy?: number;
  /** An engineer away on a trip is at post "tunnel", as the save keeps it. */
  readonly engineers?: readonly DutyEngineer[];
  readonly expeditions?: readonly SavedExpedition[];
  readonly finds?: readonly FindId[];
};

/** The workshop's half of a seed: materials, recipes, crafts and their clocks. */
export type SeedWorkshop = {
  readonly materials?: Readonly<Partial<Record<MaterialId, number>>>;
  readonly recipes?: readonly RecipeId[];
  readonly crafted?: Readonly<Partial<Record<RecipeId, number>>>;
  readonly bench?: Bench;
  readonly chargeUntil?: number;
  readonly axleUntil?: number;
  readonly flareUntil?: number;
  readonly emberUntil?: number;
  readonly seen?: readonly TeachId[];
  readonly taught?: readonly TeachId[];
};

/** A seed save: what a tab finds on its first load, before `seedJson` writes it as version 8. */
export type Seed = {
  readonly lastSeen: number;
  readonly mountain: SeedMountain;
  readonly workshop?: SeedWorkshop;
};

/** A seed that always carries its workshop half. */
export type WorkshopSeed = Seed & { readonly workshop: SeedWorkshop };

/** A stored value with no mountain, written as it is: a later build's save, or none. */
export type StoredAsIs = {
  readonly mountain?: undefined;
  readonly [key: string]: unknown;
};

/** Anything seedJson stores. */
export type SeedSave = Seed | StoredAsIs;

// Every tier so far on screen: the compact, three-to-a-row grid.
export const CREW: SeedMountain = {
  remaining: 240_000_000 - 9_300_000,
  pocket: 9_765,
  helpers: 51,
  carts: 24,
  drills: 6,
  borers: 2,
  // Both boosts running: their chips must sit in the mountain, not the flow.
  boosts: { sharper: Date.now() + 3_600_000, overtime: Date.now() + 3_600_000 },
};

/** A save that owns a borer has its first engineer. */
function withFirstEngineer(mountain: SeedMountain): SeedMountain {
  if ((mountain.borers ?? 0) < 1 || mountain.engineers !== undefined) {
    return mountain;
  }
  return {
    ...mountain,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
  };
}

/** The stones on the mountain at the start of a run. */
export const MOUNTAIN = 240_000_000;

const TIER_IDS = {
  helpers: "helper",
  carts: "cart",
  hoists: "hoist",
  drills: "drill",
  borers: "borer",
  trains: "train",
  machines: "machine",
  kids: "kid",
} as const;

const TIMER_IDS = {
  chargeUntil: "blasting-charge",
  axleUntil: "axle-grease",
  flareUntil: "crystal-flare",
  emberUntil: "heartstone-ember",
} as const;

const MOUNTAIN_KEYS: readonly string[] = [
  "remaining",
  "pocket",
  "upgrades",
  "boosts",
  "startedAt",
  "legacy",
  "engineers",
  "expeditions",
  "finds",
  ...Object.keys(TIER_IDS),
];
const WORKSHOP_KEYS: readonly string[] = [
  "materials",
  "recipes",
  "crafted",
  "bench",
  "seen",
  "taught",
  ...Object.keys(TIMER_IDS),
];

/** A field the converter does not know would be lost without a word: fail loudly. */
function knownKeys(part: object, known: readonly string[], what: string): void {
  const odd = Object.keys(part).filter((key) => !known.includes(key));
  if (odd.length > 0) {
    throw new Error(`fixtures: ${what} has no save fact for ${odd.join(", ")}`);
  }
}

/** The non-zero counts, as the writer keeps them. */
function counts<K extends string>(
  entries: readonly (readonly [K, number | undefined])[],
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const [id, amount] of entries) {
    if (amount !== undefined && amount !== 0) {
      out[id] = amount;
    }
  }
  return out;
}

/** The key only when its value is not empty, as the writer leaves it out. */
function some<K extends string, V extends object>(
  key: K,
  value: V | undefined,
): Partial<Record<K, V>> {
  if (value === undefined) {
    return {};
  }
  const empty = Array.isArray(value)
    ? value.length === 0
    : Object.keys(value).length === 0;
  return empty ? {} : ({ [key]: value } as Record<K, V>);
}

/**
 * A seed as the version 8 save the game writes for it (#558). A mirror of
 * `writeGame` in src/save-format.ts: the browser scripts load this file under
 * Node's type stripping, which cannot load `src` modules. fixtures.test.ts
 * proves the real reader takes each seed, and the real writer writes it back
 * the same.
 */
export function toDocument(seed: Seed): SaveDocument {
  const mountain = withFirstEngineer(seed.mountain);
  const workshop = seed.workshop ?? {};
  knownKeys(mountain, MOUNTAIN_KEYS, "the mountain");
  knownKeys(workshop, WORKSHOP_KEYS, "the workshop");
  const tiers = Object.entries(TIER_IDS) as [keyof typeof TIER_IDS, string][];
  const timers = Object.entries(TIMER_IDS) as [
    keyof typeof TIMER_IDS,
    string,
  ][];
  const dug = MOUNTAIN - Math.ceil(mountain.remaining);
  const game = {
    ...some("owned", counts(tiers.map(([field, id]) => [id, mountain[field]]))),
    ...some(
      "stock",
      counts([
        ["stones", mountain.pocket],
        ...Object.entries(workshop.materials ?? {}),
      ]),
    ),
    ...some(
      "levels",
      counts([
        ...Object.entries(mountain.upgrades ?? {}),
        ...Object.entries(workshop.crafted ?? {}),
      ]),
    ),
    ...some(
      "clocks",
      counts([
        ...Object.entries(mountain.boosts ?? {}),
        ...timers.map(([field, id]) => [id, workshop[field]] as const),
      ]),
    ),
    ...some("marks", {
      ...some("seen", workshop.seen),
      ...some("taught", workshop.taught),
      ...some("recipes", workshop.recipes),
      ...some("finds", mountain.finds),
    }),
    ...some(
      "run",
      counts([
        ["generation", mountain.legacy],
        ["dug", dug],
      ]),
    ),
    ...some("engineers", mountain.engineers),
    ...some("expeditions", mountain.expeditions),
    ...(workshop.bench === undefined ? {} : { bench: workshop.bench }),
  } as SaveGame;
  const startedAt = mountain.startedAt ?? 0;
  return {
    version: 8,
    lastSeen: seed.lastSeen,
    ...(startedAt === 0 ? {} : { startedAt }),
    game,
  };
}

/**
 * The counts a stored version 8 save holds, in the mountain's field names:
 * what the browser checks compare after a tap. Missing reads as zero.
 */
export function storedCounts(document: unknown): {
  readonly remaining: number;
  readonly pocket: number;
  readonly helpers: number;
  readonly carts: number;
  readonly drills: number;
  readonly borers: number;
  readonly engineers: readonly DutyEngineer[];
} {
  const game = (document as { game?: SaveGame } | null)?.game ?? {};
  const owned = game.owned ?? {};
  return {
    remaining: MOUNTAIN - (game.run?.dug ?? 0),
    pocket: game.stock?.stones ?? 0,
    helpers: owned.helper ?? 0,
    carts: owned.cart ?? 0,
    drills: owned.drill ?? 0,
    borers: owned.borer ?? 0,
    engineers: game.engineers ?? [],
  };
}

/** The stored JSON for a seed save. */
export function seedJson(save: SeedSave): string {
  return JSON.stringify(save.mountain === undefined ? save : toDocument(save));
}

/** A save a later build wrote: this build opens the update card and writes nothing (#558). */
export function newerSave(now: number): StoredAsIs {
  return { version: 9, lastSeen: now, game: {} };
}

export function workshopSave(now: number, busy: boolean): WorkshopSeed {
  return {
    lastSeen: now,
    mountain: {
      remaining: 240_000_000 - 12_000_000,
      pocket: busy ? 50_000 : 200_000,
      helpers: 4,
      carts: 1,
      startedAt: now - 1_000,
    },
    workshop: {
      materials: {
        clay: busy ? 0 : 2,
        iron: busy ? 0 : 1,
        crystal: 0,
        heartstone: 0,
      },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
      ...(busy
        ? {
            bench: {
              recipe: "sturdy-props",
              startedAt: now - 60_000,
              endsAt: now + 9 * 60_000,
            },
            axleUntil: now + 12 * 60_000,
          }
        : {}),
    },
  };
}

/** The free bench with 10 clay: the charge can be crafted, and the Workshop is not taught (#374). */
export function firstCraftSave(now: number): Seed {
  const save = workshopSave(now, false);
  return {
    ...save,
    workshop: {
      ...save.workshop,
      materials: { ...save.workshop.materials, clay: 10 },
    },
  };
}

/** The first charge working: its row shows the payoff (#374). */
export function chargePayoffSave(now: number): Seed {
  const save = workshopSave(now, false);
  return {
    ...save,
    workshop: {
      ...save.workshop,
      crafted: { "blasting-charge": 1 },
      chargeUntil: now + 20 * 60_000,
      seen: ["workshop"],
      taught: ["workshop"],
    },
  };
}

const EMPTY_WORKSHOP: SeedWorkshop = {
  materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
  recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
};

/** A fresh mountain. lastSeen is now so the welcome card stays shut. */
export function freshMountain(): Seed {
  return {
    lastSeen: Date.now(),
    mountain: { remaining: 240_000_000, pocket: 0, helpers: 0 },
    workshop: EMPTY_WORKSHOP,
  };
}

// Hammer depth, so three relics glow. Granite is open and a borer is owned,
// so Workshop and Engineers open too.
export function openMountain(): WorkshopSeed {
  return {
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 25_000_000,
      pocket: 5_000_000,
      helpers: 20,
      carts: 5,
      drills: 2,
      borers: 1,
    },
    workshop: {
      ...EMPTY_WORKSHOP,
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
    },
  };
}

/** A crewed Topsoil, so both lists are long and the crew line is on screen. */
export function crewMountain(): Seed {
  return {
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 500_000,
      pocket: 6_854,
      helpers: 18,
      carts: 6,
    },
    workshop: EMPTY_WORKSHOP,
  };
}

/** The last stone of a run: one tap finds the legend and offers to pass the mine. */
export function lastStoneSave(): Seed {
  return {
    mountain: {
      remaining: 1,
      pocket: 0,
      helpers: 999,
      kids: 999,
      legacy: 1,
    },
    lastSeen: Date.now(),
  };
}

/** The Crystal Caves (#371): drills and borers at work, the window's third view. */
export function crystalMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      remaining: 180_000_000,
      pocket: 3_000_000,
      helpers: 30,
      carts: 10,
      drills: 6,
      borers: 2,
    },
  };
}

/**
 * The Deep Heart on a kid's run (#371): the Great Machine on the surface, a
 * kid by the lamp, and the Legacy plate on the window's frame.
 */
export function heartMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      remaining: 110_000_000,
      pocket: 40_000_000,
      helpers: 60,
      kids: 3,
      carts: 20,
      drills: 10,
      borers: 4,
      machines: 1,
      legacy: 1,
    },
  };
}

/**
 * Granite with a hand free and nothing affordable (#372): the Ready now plate
 * saves for a cart, with the time.
 */
export function savingMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      remaining: 240_000_000 - 25_000_000,
      pocket: 100,
      helpers: 18,
      carts: 6,
      borers: 1,
    },
  };
}

/** A big Granite fleet (#372): 120 carts, so the cart bay shows three flaps. */
export function fleetMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      remaining: 240_000_000 - 30_000_000,
      pocket: 50_000_000,
      helpers: 170,
      carts: 120,
      drills: 30,
      borers: 2,
    },
  };
}

/**
 * Granite with a borer he can afford but not staff (#373): three hands free
 * beside 6 carts, 4 drills and the borer, and a pocket over the next borer's
 * price. The borer row reads "Needs 8 workers".
 */
export function shortMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      remaining: 240_000_000 - 25_000_000,
      pocket: 6_000_000,
      helpers: 21,
      carts: 6,
      drills: 4,
      borers: 1,
    },
  };
}

/**
 * Carts standing idle on a crewed Topsoil (#373): 6 carts and 3 workers, and
 * staffing never taught, so Buys shows the staffing New row.
 */
export function idleMountain(): Seed {
  return {
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 500_000,
      pocket: 6_854,
      helpers: 3,
      carts: 6,
    },
    workshop: EMPTY_WORKSHOP,
  };
}

/**
 * The mid save with upgrades owned and levelled (#373): Better boots bought,
 * Strong arms at level 2, and Grandfather's pick and the old lamp found.
 */
export function toolsMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      ...open.mountain,
      upgrades: { boots: 1, tap: 2 },
      finds: ["pick", "lamp"],
    },
  };
}

/**
 * The Great Machine with the Kid row locked (#373): past the Hammer with one
 * Great Machine and no kids, short of the Crown (70M stones down), so the Kid
 * worker row shows, dim and locked. Buys runs longer than the drawer (C1).
 * With ?trouble=cave-in the cart, which has no bay beside the machine, lights
 * the Buys key's red lamp (C3).
 */
export function machineMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      remaining: 240_000_000 - 60_000_000,
      pocket: 2_000_000,
      helpers: 75,
      kids: 0,
      carts: 20,
      drills: 10,
      borers: 4,
      machines: 1,
    },
  };
}

/** A kid's run after one pass (#338): the crewed Topsoil, Grandpa on the carts. */
export function heirMountain(): Seed {
  const crew = crewMountain();
  return { ...crew, mountain: { ...crew.mountain, legacy: 1 } };
}

/**
 * A full Granite before the Great Machine (#373): so many hands on carts,
 * drills and borers, with two engineers, that the Buys crew chips take two
 * rows. Mid-game Buys still fits its drawer.
 */
export function fullGraniteMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      remaining: 240_000_000 - 30_000_000,
      pocket: 80_000_000,
      helpers: 80,
      carts: 24,
      drills: 8,
      borers: 3,
      engineers: [
        { name: "Ada", rank: 0, trips: 0, post: "borer" },
        { name: "Nils", rank: 0, trips: 0, post: "drill" },
      ],
      upgrades: { tap: 3, boots: 1, steady: 1, cartSyn: 1 },
    },
  };
}

/**
 * The Great Machine era with the Great Machine the Ready now pick and Ada
 * tending it (#373): its row's flag gives way on the name's line.
 */
export function machinePickMountain(): Seed {
  const machine = machineMountain();
  return {
    ...machine,
    mountain: {
      ...machine.mountain,
      pocket: 200_000_000,
      helpers: 90,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "machine" }],
    },
  };
}

// ---------------------------------------------------------------------------
// The visual check's builders: one per screen state it seeds.
// ---------------------------------------------------------------------------

/** The save the craft-done notice and layer-card sections start from. */
export function noticeSave({
  mined,
  lastSeen,
  mountain = {},
  workshop = {},
}: {
  readonly mined: number;
  readonly lastSeen: number;
  readonly mountain?: Partial<SeedMountain>;
  readonly workshop?: Partial<SeedWorkshop>;
}): Seed {
  return {
    lastSeen,
    mountain: {
      remaining: 240_000_000 - mined,
      pocket: 20,
      helpers: 0,
      carts: 0,
      ...mountain,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
      ...workshop,
    },
  };
}

export function crewSave(pocket: number): Seed {
  return {
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 12_000_000,
      pocket,
      helpers: 18,
      carts: 7,
      drills: 2,
    },
    workshop: {
      materials: { clay: 10, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge", "reinforce"],
    },
  };
}

/** The running countdowns: how many are on screen decides what the save holds (0, 1, 2, 3, 12). */
export function effectSave(count: number): Seed {
  const now = Date.now();
  // 0, 1, and 3 are that many chips. 12 is both boosts, four craft clocks, the bench, and five trips.
  const names: readonly EngineerName[] = ["Ada", "Nils", "Ruth", "Otto", "Mae"];
  const full = count >= 12;
  const tripCount = full ? 5 : count >= 3 ? 1 : 0;
  const expeditions = Array.from(
    { length: tripCount },
    (_, index): SavedExpedition => ({
      engineer: names[index] as EngineerName,
      tunnel: "side-seam",
      sentAt: now - 60_000,
      // Longer than the boosts, so a clock stays on screen when the row is full.
      returnsAt: now + (40 + index) * 60_000,
      home: "camp",
      find: { kind: "quiet" },
    }),
  );
  const boosts =
    count >= 2
      ? { sharper: now + 10 * 60_000, overtime: now + 20 * 60_000 }
      : count >= 1
        ? { sharper: now + 10 * 60_000 }
        : {};
  const engineers = names
    .slice(0, Math.max(1, tripCount))
    .map((name, index): DutyEngineer => ({
      name,
      rank: 0,
      trips: 0,
      post: index < tripCount ? "tunnel" : "camp",
    }));
  return {
    lastSeen: now,
    mountain: {
      remaining: 240_000_000 - 12_000_000,
      pocket: 5_000_000,
      helpers: 20,
      carts: 2,
      borers: 1,
      engineers,
      expeditions,
      boosts,
    },
    workshop: {
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
      ...(full
        ? {
            chargeUntil: now + 8 * 60_000,
            axleUntil: now + 12 * 60_000,
            flareUntil: now + 50 * 60_000,
            emberUntil: now + 15 * 60_000,
            bench: {
              recipe: "iron-rails",
              startedAt: now - 1_000,
              endsAt: now + 9 * 60_000,
            },
          }
        : {}),
    },
  };
}

export function guardSave(
  lastSeen: number,
  remaining: number = 200_000_000,
): Seed {
  return {
    lastSeen,
    mountain: {
      remaining,
      pocket: 3_250_000,
      helpers: 34,
      carts: 12,
      drills: 4,
      borers: 1,
      engineers: [{ name: "Ada", rank: 1, trips: 3, post: "camp" }],
      boosts: { sharper: lastSeen + 3_600_000 },
    },
    workshop: {
      materials: { clay: 12, iron: 6, crystal: 2, heartstone: 0 },
      recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
    },
  };
}

export function overtimeSave(): Seed {
  const save = openMountain();
  return {
    ...save,
    mountain: {
      ...save.mountain,
      boosts: { overtime: Date.now() + 20 * 60_000 },
    },
  };
}

/** The mid save with hands and stones for the borer: the borer is the pick, Ada on it. */
export function borerPickMountain(): Seed {
  const open = openMountain();
  return {
    ...open,
    mountain: { ...open.mountain, helpers: 28, pocket: 6_000_000 },
  };
}

// The inline literals the visual check wrote where it used them.

/** The crew with both boosts running. */
export function boostedCrewSave(): Seed {
  return { mountain: CREW, lastSeen: Date.now() };
}

/** The Buys drawer's fit check: the crew's tiers on a big pocket and a long mountain. */
export function buysFitSave(
  crew: Omit<SeedMountain, "remaining" | "pocket"> & {
    remaining?: number;
    pocket?: number;
  },
): Seed {
  return {
    mountain: {
      remaining: 240_000_000 - 50_000_000,
      pocket: 49_999_999,
      ...crew,
    },
    lastSeen: Date.now(),
  };
}

// One stone short of the Lantern of Guidance, away for ten minutes.
const BEFORE_LANTERN: SeedMountain = {
  remaining: 240_000_000 - 999_999,
  pocket: 180,
  helpers: 0,
  carts: 0,
};

/** The welcome-back card, then the relic it uncovered. */
export function welcomeBackSave(): Seed {
  return {
    mountain: { ...BEFORE_LANTERN, helpers: 5 },
    lastSeen: Date.now() - 10 * 60 * 1000,
  };
}

const FOUND_BELOW: SeedMountain = {
  remaining: 240_000_000 - 26_000_000,
  pocket: 100,
  helpers: 12,
  carts: 2,
  drills: 1,
  borers: 1,
  machines: 0,
  kids: 0,
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
};

/** Every tool and keepsake found: the found sheets must fit. */
export function foundBelowSave(): Seed {
  return { mountain: FOUND_BELOW, lastSeen: Date.now() };
}

/** Every relic found: the shelf scrolls inside itself. */
export function fullShelfSave(): Seed {
  return {
    mountain: {
      remaining: 0,
      pocket: 0,
      helpers: 40,
      carts: 10,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    },
    lastSeen: Date.now(),
  };
}

/** One stone left on the 240M mountain, so the tap finds the Mantle. */
export function mantleSave(): Seed {
  return {
    mountain: {
      remaining: 1,
      pocket: 0,
      helpers: 999,
      carts: 999,
      drills: 999,
      borers: 999,
      machines: 999,
      kids: 999,
    },
    lastSeen: Date.now(),
  };
}

/** An engineer out on a trip: the Running now note shows its clock. */
export function awayTripSave(now: number): Seed {
  return {
    mountain: {
      remaining: 240_000_000 - 9_300_000,
      pocket: 9_765,
      helpers: 51,
      carts: 24,
      drills: 6,
      borers: 2,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "old-shaft",
          sentAt: now,
          returnsAt: now + 40 * 60_000,
          home: "borer",
          find: { kind: "quiet" },
        },
      ],
    },
    lastSeen: now,
  };
}

/** Five engineers on their posts and one trip out. */
export function campPostsSave(now: number): Seed {
  return {
    mountain: {
      remaining: 240_000_000 - 9_300_000,
      pocket: 9_765,
      helpers: 51,
      carts: 24,
      drills: 6,
      borers: 2,
      engineers: [
        { name: "Ada", rank: 1, trips: 3, post: "borer" },
        { name: "Nils", rank: 0, trips: 0, post: "camp" },
        { name: "Ruth", rank: 2, trips: 9, post: "drill" },
        { name: "Otto", rank: 0, trips: 0, post: "tunnel" },
        { name: "Mae", rank: 0, trips: 0, post: "cart" },
      ],
      expeditions: [
        {
          engineer: "Otto",
          tunnel: "old-shaft",
          sentAt: now,
          returnsAt: now + 40 * 60_000,
          home: "camp",
          find: { kind: "quiet" },
        },
      ],
      finds: ["drawing", "watch"],
    },
    lastSeen: now,
  };
}

/** A trip back with a tool, two hours after the player left. */
export function toolHomeSave(now: number): Seed {
  return {
    mountain: {
      remaining: 240_000_000 - 9_300_000,
      pocket: 9_765,
      helpers: 20,
      carts: 1,
      drills: 1,
      borers: 1,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "old-shaft",
          sentAt: now - 90 * 60_000,
          returnsAt: now - 30 * 60_000,
          home: "borer",
          find: { kind: "tool", id: "pick" },
        },
      ],
    },
    lastSeen: now - 2 * 60 * 60_000,
  };
}

const RECIPES: readonly RecipeId[] = [
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
];
const HOUR = 60 * 60 * 1000;

/**
 * Tiers a shot overrides. A key set to `undefined` drops the tier from the
 * saved JSON (quietCrew does, to leave the crew bare).
 */
export type MountainOverrides = {
  readonly [K in keyof SeedMountain]?: SeedMountain[K] | undefined;
};

/**
 * A late-game save. Real pocket, crew and materials. Spread `mountain` /
 * `workshop` over the defaults when a shot needs a different moment.
 * (The UI audit's builder.)
 */
export function late(
  now: number,
  mined: number,
  mountain: MountainOverrides = {},
  workshop: Partial<SeedWorkshop> = {},
): Seed {
  const deep = mined >= 70_000_000;
  const built = mined >= 25_000_000;
  return {
    lastSeen: now,
    mountain: {
      remaining: MOUNTAIN - mined,
      pocket: 80_000_000,
      helpers: 80,
      kids: deep ? 4 : 0,
      carts: 24,
      drills: 8,
      borers: 3,
      machines: built ? 2 : 0,
      startedAt: now - 86_400_000,
      engineers: [
        {
          name: "Ada",
          rank: 0,
          trips: 0,
          post: built ? "machine" : "borer",
        },
        { name: "Nils", rank: 0, trips: 0, post: "drill" },
      ],
      upgrades: { tap: 3, boots: 1, steady: 1, cartSyn: 1 },
      finds: ["pick", "lamp", "drawing"],
      // The undefined keys quietCrew sends are dropped by JSON; the cast only
      // admits them past exactOptionalPropertyTypes.
      ...(mountain as Partial<SeedMountain>),
    },
    workshop: {
      materials: { clay: 40, iron: 28, crystal: 12, heartstone: 3 },
      recipes: RECIPES,
      ...workshop,
    },
  };
}

/** A small, plain crew: no engineers, finds or upgrades. (The UI audit's.) */
export function quietCrew(extra: MountainOverrides = {}): MountainOverrides {
  return {
    helpers: 8,
    kids: 0,
    carts: 2,
    drills: 0,
    borers: 0,
    machines: 0,
    engineers: undefined,
    finds: undefined,
    upgrades: undefined,
    ...extra,
  };
}

/** play's `edge` save: four stones above the Granite with 13 carts. */
export function playEdgeSave(): Seed {
  return {
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 9_999_996,
      pocket: 2_000_000,
      helpers: 40,
      carts: 13,
      drills: 4,
    },
    workshop: openMountain().workshop,
  };
}

/** play's `away` save: the mid save, last seen 9 hours ago. */
export function playAwaySave(): Seed {
  return { ...openMountain(), lastSeen: Date.now() - 9 * HOUR };
}

/**
 * play's `crafted` save (#464): section 16's craft save, Iron rails on the bench, done three
 * seconds after it opens, so the craft-done card opens on the board.
 */
export function playCraftSave(): Seed {
  const now = Date.now();
  return noticeSave({
    mined: 12_000_000,
    lastSeen: now,
    mountain: { helpers: 1, carts: 1, pocket: 5_000_000 },
    workshop: {
      materials: { clay: 10, iron: 6, crystal: 0, heartstone: 0 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
      ],
      bench: {
        recipe: "iron-rails",
        startedAt: now - 600_000,
        endsAt: now + 3_000,
      },
    },
  });
}

/** play's `brief` save: the mid save, last seen 2 minutes ago. */
export function playBriefSave(): Seed {
  return { ...openMountain(), lastSeen: Date.now() - HOUR / 30 };
}
