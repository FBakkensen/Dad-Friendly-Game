/** All game numbers live here. See docs/DESIGN.md "Numbers and tuning". */
export const MOUNTAIN_STONES = 1_000_000;

export type Mountain = {
  /** Stones still in the mountain. 0..MOUNTAIN_STONES. */
  readonly remaining: number;
  /** Stones mined and not yet spent. */
  readonly pocket: number;
  /** Helper miners hired. Mining by helpers arrives with issue #49. */
  readonly helpers: number;
};

export function createMountain(): Mountain {
  return { remaining: MOUNTAIN_STONES, pocket: 0, helpers: 0 };
}

export function minedOut(mountain: Mountain): number {
  return MOUNTAIN_STONES - mountain.remaining;
}

/** One tap, one stone. An empty mountain returns the same object. */
export function mineByHand(mountain: Mountain): Mountain {
  if (mountain.remaining === 0) {
    return mountain;
  }
  return {
    ...mountain,
    remaining: mountain.remaining - 1,
    pocket: mountain.pocket + 1,
  };
}

/** Builds a mountain from untrusted data; every field must be a sane whole number. */
export function parseMountain(value: unknown): Mountain | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { remaining, pocket, helpers } = value as Record<string, unknown>;
  if (
    !isCount(remaining) ||
    remaining > MOUNTAIN_STONES ||
    !isCount(pocket) ||
    !isCount(helpers)
  ) {
    return undefined;
  }
  return { remaining, pocket, helpers };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
