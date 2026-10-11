import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";

/** A mountain after `count` hand taps. */
export function minedMountain(count: number): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - count,
    pocket: count,
  };
}
