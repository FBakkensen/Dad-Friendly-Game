import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";

/** A mountain after `count` hand taps. */
export function minedMountain(count: number): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - count,
    pocket: count,
  };
}

/** A save from before machines needed helpers (#89): no `staffed` mark. */
export function unstaffedSave(mountain: Mountain): Mountain {
  return Object.fromEntries(
    Object.entries(mountain).filter(([key]) => key !== "staffed"),
  ) as Mountain;
}
