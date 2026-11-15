import { factor } from "./economy/factors";
import { freshMineOn } from "./line-switch";

/**
 * The sweep factor that switches slice 1's part 2 (#666): kilns, brick, the
 * stockyard, a night that runs until the stockyard is full, and the
 * Warehouse's project. 1 is off (play), and a lab run sets it to 0. Part 2's
 * switch-on (#672) turns it on in play. Its own leaf, beside the fresh mine's
 * switch it builds on, so the rules modules can read it.
 */
export const PART_TWO_OFF = "part2.off";

/** True when part 2's rules play: only ever in a fresh mine. */
export function partTwoOn(): boolean {
  return freshMineOn() && factor(PART_TWO_OFF) === 0;
}
