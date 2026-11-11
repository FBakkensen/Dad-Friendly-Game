import type { Mountain } from "./mountain";

/**
 * The Gold rush (#468, docs/superpowers/specs/2026-11-11-gold-rush-design.md).
 * After at least an hour away, part of the away haul is held back for the
 * rush (`rushBank`). Tapping the quick vein starts it: the held stones come
 * in over 90 seconds of live play, so the crew digs ×10 while he watches. A
 * missed rush pays the held stones anyway, so the total is the same either way
 * and the rush moves no finish day (Flemming's ruling, 11 Nov 2026).
 */
export const RUSH_MULTIPLIER = 10;
/** How long a Gold rush lasts, in live play. */
export const RUSH_MS = 90 * 1000;
/** Time away that holds stones for a rush, and ends a paused one. */
export const QUICK_VEIN_AWAY_MS = 60 * 60 * 1000;

/**
 * Holds back the rush's stones from an away haul: what the crew it came back
 * to digs on top of itself in a rush, never more than the haul.
 */
export function holdForRush(
  mountain: Mountain,
  mined: number,
  crewPerSecond: number,
): Mountain {
  const bank = Math.min(
    mined,
    Math.floor((RUSH_MULTIPLIER - 1) * crewPerSecond * (RUSH_MS / 1000) + 1e-9),
  );
  if (bank <= 0) {
    return mountain;
  }
  return { ...mountain, pocket: mountain.pocket - bank, rushBank: bank };
}

/** Stones held for a rush that has not started: a quick vein is owed. */
export function rushOwed(mountain: Mountain): boolean {
  return (mountain.rushBank ?? 0) > 0 && mountain.rushUntil === undefined;
}

/** Starts the owed Gold rush now. With nothing held there is no rush. */
export function startRush(mountain: Mountain, now: number): Mountain {
  return rushOwed(mountain)
    ? { ...mountain, rushUntil: now + RUSH_MS }
    : mountain;
}

/** Milliseconds left on the rush; 0 when none runs or the mountain is dug out. */
export function rushLeft(mountain: Mountain, now: number): number {
  const until = mountain.rushUntil;
  if (
    until === undefined ||
    (mountain.rushBank ?? 0) <= 0 ||
    mountain.remaining === 0
  ) {
    return 0;
  }
  // Capped at the full length, so a clock set back can't stretch a rush.
  return Math.min(RUSH_MS, Math.max(0, until - now));
}

/**
 * The held stones a second the rush pays while it runs: the bank spread over
 * the time left. Away pay passes no `now`, so time away never earns it.
 */
export function rushPerSecond(
  mountain: Mountain,
  now: number | undefined,
): number {
  if (now === undefined) {
    return 0;
  }
  const left = rushLeft(mountain, now);
  return left === 0
    ? 0
    : (mountain.rushBank ?? 0) / Math.max(1, Math.floor(left / 1000));
}

/** Pays every held stone at once and ends the rush: nothing held is ever lost. */
export function releaseRush(mountain: Mountain): Mountain {
  if (mountain.rushBank === undefined && mountain.rushUntil === undefined) {
    return mountain;
  }
  const next = {
    ...mountain,
    pocket: mountain.pocket + (mountain.rushBank ?? 0),
  };
  Reflect.deleteProperty(next, "rushBank");
  Reflect.deleteProperty(next, "rushUntil");
  return next;
}

/**
 * The rush's live pay over `seconds` whole seconds from `from`: the held
 * stones at `rushPerSecond`, and all that is left once the rush ends.
 */
export function payRush(
  mountain: Mountain,
  from: number,
  seconds: number,
): { readonly mountain: Mountain; readonly paid: number } {
  if (mountain.rushUntil === undefined) {
    return { mountain, paid: 0 };
  }
  const bank = mountain.rushBank ?? 0;
  const to = from + seconds * 1000;
  if (rushLeft(mountain, to) === 0) {
    return { mountain: releaseRush(mountain), paid: bank };
  }
  const paid = Math.min(
    bank,
    Math.floor(seconds * rushPerSecond(mountain, from) + 1e-9),
  );
  return paid === 0
    ? { mountain, paid: 0 }
    : {
        mountain: {
          ...mountain,
          pocket: mountain.pocket + paid,
          rushBank: bank - paid,
        },
        paid,
      };
}

/**
 * Close is pause: a rush running when the game closed keeps its time left
 * over a short break. After an hour away, or once it has ended, the held
 * stones land, and a fresh hold waits for the next quick vein.
 */
export function resumeRush(
  mountain: Mountain,
  from: number,
  to: number,
): Mountain {
  const gap = Math.max(0, to - from);
  if (gap >= QUICK_VEIN_AWAY_MS) {
    return releaseRush(mountain);
  }
  if (mountain.rushUntil === undefined) {
    return mountain;
  }
  if (rushLeft(mountain, from) === 0) {
    return releaseRush(mountain);
  }
  return { ...mountain, rushUntil: mountain.rushUntil + gap };
}

/**
 * The mountain with no rush running. A 90-second burst is not the crew's
 * speed over hours, so what a buy is worth reads the crew without it.
 */
export function withoutRush(mountain: Mountain): Mountain {
  if (mountain.rushUntil === undefined) {
    return mountain;
  }
  const next = { ...mountain };
  Reflect.deleteProperty(next, "rushUntil");
  return next;
}
