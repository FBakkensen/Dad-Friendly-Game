/**
 * A multiplier on one economy number. The game leaves this unset, so every
 * read is 1. The sensitivity sweep installs a map for the length of one run.
 * The map replaces the outer one; a missing id is 1.
 */

let active: Readonly<Record<string, number>> | undefined;

/** Today's number times this. 1 when no sweep is running. */
export function factor(id: string): number {
  const value = active?.[id];
  return value === undefined ? 1 : value;
}

/** Runs `body` with these multipliers, then restores whatever was outside. */
export function withFactors<T>(
  factors: Readonly<Record<string, number>>,
  body: () => T,
): T {
  const previous = active;
  active = factors;
  try {
    return body();
  } finally {
    active = previous;
  }
}
