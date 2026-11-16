/**
 * A multiplier on one economy number. Unset, every read is 1. The strategy
 * lab and the journeys install a map (`withFactors`, `holdFactors`), and
 * every page holds the game's switches the same way. The map replaces the
 * outer one; a missing id is 1.
 */

let active: Readonly<Record<string, number>> | undefined;

/** Today's number times this. 1 when no map is installed. */
export function factor(id: string): number {
  const value = active?.[id];
  return value === undefined ? 1 : value;
}

/**
 * The multipliers in force right now, or undefined when none is installed. Only its
 * identity matters: a cache keeps a result for the map it was read under.
 */
export function activeFactors(): Readonly<Record<string, number>> | undefined {
  return active;
}

/** Runs `body` with these multipliers, then restores whatever was outside. */
export function withFactors<T>(
  factors: Readonly<Record<string, number>>,
  body: () => T,
): T {
  const previous = active;
  // An empty map sets every factor to 1, the same as no map. Holding it as
  // no map skips a missed lookup on every read (#314).
  active = Object.keys(factors).length === 0 ? undefined : factors;
  try {
    return body();
  } finally {
    active = previous;
  }
}

/**
 * Holds these multipliers for the rest of the page (#659): every boot holds
 * the game's switches this way (`PLAY_FACTORS`, part 2 since #672), so the
 * page plays the game it ships. The rules themselves never call it.
 */
export function holdFactors(factors: Readonly<Record<string, number>>): void {
  active = Object.keys(factors).length === 0 ? undefined : factors;
}
