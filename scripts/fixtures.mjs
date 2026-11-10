/**
 * Seed saves shared by the real-browser scripts: the layout guard
 * (scripts/visual-check.mjs) and the play-test shots (scripts/play.mjs).
 * Each is what a tab finds in localStorage on its first load.
 */

export { SAVE_KEY } from "../tools/browser/harness.ts";

// Every tier so far on screen: the compact, three-to-a-row grid.
export const CREW = {
  remaining: 90_700_000,
  pocket: 9_765,
  helpers: 51,
  carts: 24,
  drills: 6,
  borers: 2,
  // Both boosts running: their chips must sit in the mountain, not the flow.
  boosts: { sharper: Date.now() + 3_600_000, overtime: Date.now() + 3_600_000 },
};

/** A current save that owns a borer already has its first engineer. */
function withCurrentEngineer(mountain) {
  if ((mountain.borers ?? 0) < 1 || mountain.engineers !== undefined) {
    return mountain;
  }
  return {
    ...mountain,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
  };
}

/** The stored JSON for a seed save. */
export function seedJson(save) {
  // Seeds are current saves (M7 staffing grant already done) unless they say `legacy`.
  return JSON.stringify(
    save.legacy || save.mountain === undefined
      ? { ...save, legacy: undefined }
      : {
          ...save,
          mountain: withCurrentEngineer({ staffed: 2, ...save.mountain }),
        },
  );
}

export function workshopSave(now, busy) {
  return {
    version: 6,
    lastSeen: now,
    mountain: {
      remaining: 240_000_000 - 12_000_000,
      pocket: busy ? 50_000 : 200_000,
      helpers: 4,
      carts: 1,
      staffed: 2,
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

const EMPTY_WORKSHOP = {
  materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
  recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
};

/** A v6 save. lastSeen is now so the welcome card stays shut. */
export function freshMountain() {
  return {
    version: 6,
    lastSeen: Date.now(),
    mountain: { remaining: 240_000_000, pocket: 0, helpers: 0 },
    workshop: EMPTY_WORKSHOP,
  };
}

// Hammer depth, so three relics glow. Granite is open and a borer is owned,
// so Workshop and Engineers open too.
export function openMountain() {
  return {
    version: 6,
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 25_000_000,
      pocket: 5_000_000,
      helpers: 20,
      carts: 5,
      drills: 2,
      borers: 1,
      staffed: 2,
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
export function crewMountain() {
  return {
    version: 6,
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 500_000,
      pocket: 6_854,
      helpers: 18,
      carts: 6,
      staffed: 2,
    },
    workshop: EMPTY_WORKSHOP,
  };
}

/** The last stone of a run: one tap finds the legend and offers to pass the mine. */
export function lastStoneSave() {
  return {
    version: 5,
    mountain: {
      remaining: 1,
      pocket: 0,
      helpers: 999,
      kids: 999,
      staffed: 2,
      legacy: 1,
    },
    lastSeen: Date.now(),
  };
}

/** The Crystal Caves (#371): drills and borers at work, the window's third view. */
export function crystalMountain() {
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
      staffed: 2,
    },
  };
}

/**
 * The Deep Heart on a kid's run (#371): the Great Machine on the surface, a
 * kid by the lamp, and the Legacy plate on the window's frame.
 */
export function heartMountain() {
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
      staffed: 2,
      legacy: 1,
    },
  };
}

/**
 * Granite with a hand free and nothing affordable (#372): the Ready now plate
 * saves for a cart, with the time.
 */
export function savingMountain() {
  const open = openMountain();
  return {
    ...open,
    mountain: {
      remaining: 240_000_000 - 25_000_000,
      pocket: 100,
      helpers: 18,
      carts: 6,
      borers: 1,
      staffed: 2,
    },
  };
}

/** A big Granite fleet (#372): 120 carts, so the cart bay shows three flaps. */
export function fleetMountain() {
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
      staffed: 2,
    },
  };
}

/**
 * Granite with a borer he can afford but not staff (#373): three hands free
 * beside 6 carts, 4 drills and the borer, and a pocket over the next borer's
 * price. The borer row reads "Needs 8 workers".
 */
export function shortMountain() {
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
      staffed: 2,
    },
  };
}

/**
 * Carts standing idle on a crewed Topsoil (#373): 6 carts and 3 workers, and
 * staffing never taught, so Buys shows the staffing New row.
 */
export function idleMountain() {
  return {
    version: 6,
    lastSeen: Date.now(),
    mountain: {
      remaining: 240_000_000 - 500_000,
      pocket: 6_854,
      helpers: 3,
      carts: 6,
      staffed: 2,
      taught: [],
    },
    workshop: EMPTY_WORKSHOP,
  };
}

/**
 * The mid save with upgrades owned and levelled (#373): Better boots bought,
 * Strong arms at level 2, and Grandfather's pick and the old lamp found.
 */
export function toolsMountain() {
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
export function machineMountain() {
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
      staffed: 2,
    },
  };
}

/** A kid's run after one pass (#338): the crewed Topsoil, Grandpa on the carts. */
export function heirMountain() {
  const crew = crewMountain();
  return { ...crew, mountain: { ...crew.mountain, legacy: 1 } };
}

/**
 * A full Granite before the Great Machine (#373): so many hands on carts,
 * drills and borers, with two engineers, that the Buys crew chips take two
 * rows. Mid-game Buys still fits its drawer.
 */
export function fullGraniteMountain() {
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
      staffed: 2,
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
export function machinePickMountain() {
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
