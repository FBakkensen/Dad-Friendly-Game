import { factor } from "./economy/factors";

/**
 * The sweep factor that switches slice 1's part 2 (#666): kilns, brick, the
 * stockyard, a night that runs until the stockyard is full, and the
 * Warehouse's project. It reads 1 (off) unless set: every page holds it at 0
 * since part 2's switch-on (#672, `boot`), and the labs and tests set it.
 * Its own leaf, so the rules modules can read it.
 */
export const PART_TWO_OFF = "part2.off";

/** True when part 2's rules play. */
export function partTwoOn(): boolean {
  return factor(PART_TWO_OFF) === 0;
}

/**
 * The sweep factor that switches slice 1's part 3 (#673): the shaft to the
 * Granite, its machines and its jobs, the factory, trucks and the Foundry.
 * It reads 1 (off) unless set: every page holds it at 0 since part 3's
 * switch-on (#682, `boot`), and the labs and tests set it.
 */
export const PART_THREE_OFF = "part3.off";

/**
 * The mine the live game plays: the fresh mine with parts 2 and 3 (#664,
 * #672, #682). The fresh mine is the only mine since #739, so only the two
 * part switches are held. Boot holds them on every page, and the strategy
 * lab plays under them (#737), so the lab's run is the game's.
 */
export const PLAY_FACTORS: Readonly<Record<string, 0>> = Object.freeze({
  [PART_TWO_OFF]: 0,
  [PART_THREE_OFF]: 0,
});

/** True when part 3's rules play: part 3 stands on part 2's stockyard and brick. */
export function partThreeOn(): boolean {
  return partTwoOn() && factor(PART_THREE_OFF) === 0;
}
