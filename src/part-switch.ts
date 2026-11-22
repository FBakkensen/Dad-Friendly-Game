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
 * The sweep factor that switches slice 2's part 1 (#766): generalized
 * mineLevels, pithead buffers with zero Stone bypass, single-good physical
 * transport runs (even share), per-good SITE_GOOD_CAP, cycleMicros, and the
 * coupled-stretch solver. Switched on in play in #769.
 */
export const SLICE_2_PART_1_OFF = "slice2Part1.off";

/**
 * The mine the live game plays: Slice 2 Part 1 (#769), built on Slice 1's
 * fresh mine with parts 2 and 3 (#664, #672, #682). Boot holds these on every
 * page, and the strategy lab plays under them (#737, #767).
 */
export const PLAY_FACTORS: Readonly<Record<string, 0>> = Object.freeze({
  [PART_TWO_OFF]: 0,
  [PART_THREE_OFF]: 0,
  [SLICE_2_PART_1_OFF]: 0,
});

/** True when part 3's rules play: part 3 stands on part 2's stockyard and brick. */
export function partThreeOn(): boolean {
  return partTwoOn() && factor(PART_THREE_OFF) === 0;
}

/** True when slice 2 part 1's rules play: stands on slice 1 part 3. */
export function slice2Part1On(): boolean {
  return partThreeOn() && factor(SLICE_2_PART_1_OFF) === 0;
}

/**
 * The sweep factor that switches slice 2's part 2 (#770): Crystal Caves,
 * 3-level hoisting, multi-input Refinery & Factory, and the Research Lab.
 * Stays off in play until Part 2's switch-on (#780).
 */
export const SLICE_2_PART_2_OFF = "slice2Part2.off";

/** True when slice 2 part 2's rules play: stands on slice 2 part 1. */
export function slice2Part2On(): boolean {
  return slice2Part1On() && factor(SLICE_2_PART_2_OFF) === 0;
}
