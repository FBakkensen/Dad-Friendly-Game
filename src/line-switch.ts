import { factor } from "./economy/factors";

/**
 * The sweep factor that switches the line (M15, #532). A factor reads 1 when
 * no sweep runs, so 1 is off (play today) and a lab run sets it to 0 to play
 * the line. Its own leaf, so the tier table can read the switch while the
 * line's rule (`src/line.ts`) reads the table's stages.
 */
export const LINE_OFF = "line.off";

/**
 * The sweep factor that switches the fresh mine (slice 1, part 1, #653): one
 * level that never runs out, no depth, a few workers to start with, and
 * machines that open by what he owns. 1 is off (play today), and a lab run
 * sets it to 0. Part 1's switch-on (#664) turns it on in play.
 */
export const FRESH_OFF = "fresh.off";

/** True when the mine is slice 1's fresh mine, not today's mountain. */
export function freshMineOn(): boolean {
  return factor(FRESH_OFF) === 0;
}

/**
 * True when the crew moves what the line moves, not the sum of its parts. A
 * fresh mine is built on the line (slice 1, rule 2), so it turns the line on.
 */
export function lineOn(): boolean {
  return factor(LINE_OFF) === 0 || freshMineOn();
}
