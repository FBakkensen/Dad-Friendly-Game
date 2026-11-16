/**
 * The sweep factor that once switched the fresh mine (slice 1, part 1,
 * #653). The fresh mine is the only mine since #739, so nothing reads it.
 */
export const FRESH_OFF = "fresh.off";

/** True: the mine is slice 1's fresh mine, the only mine since #739. */
export function freshMineOn(): boolean {
  return true;
}
