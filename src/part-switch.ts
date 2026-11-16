import { factor } from "./economy/factors";
import { freshMineOn } from "./line-switch";

/**
 * The sweep factor that switches slice 1's part 2 (#666): kilns, brick, the
 * stockyard, a night that runs until the stockyard is full, and the
 * Warehouse's project. It reads 1 (off) unless set: every page holds it at 0
 * since part 2's switch-on (#672, `boot`), and the labs and tests set it. Its own leaf, beside the fresh mine's
 * switch it builds on, so the rules modules can read it.
 */
export const PART_TWO_OFF = "part2.off";

/** True when part 2's rules play: only ever in a fresh mine. */
export function partTwoOn(): boolean {
  return freshMineOn() && factor(PART_TWO_OFF) === 0;
}

/**
 * The sweep factor that switches slice 1's part 3 (#673): the shaft to the
 * Granite, its machines and its jobs. It reads 1 (off) unless set, and boot
 * never sets it, so the rules behind it are built and inert until a later
 * sliver switches them on.
 */
export const PART_THREE_OFF = "part3.off";

/** True when part 3's rules play: part 3 stands on part 2's stockyard and brick. */
export function partThreeOn(): boolean {
  return partTwoOn() && factor(PART_THREE_OFF) === 0;
}
