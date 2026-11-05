/**
 * Seed saves shared by the real-browser scripts: the layout guard
 * (scripts/visual-check.mjs) and the play-test shots (scripts/play.mjs).
 * Each is what a tab finds in localStorage on its first load.
 */

export const SAVE_KEY = "dad-friendly-session";

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
