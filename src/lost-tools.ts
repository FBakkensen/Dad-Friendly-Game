import { expeditionCraftScale, type Crafted } from "./workshop";

/**
 * Lost tools (M7 §4). One of each, brought home from below and kept on
 * `mountain.finds`. The effects are applied in `effectiveRates`, `veins`,
 * `expeditions`, and (for the boots) `hazards` via `wearsSteelToes`.
 * The engineer's kit shortens the next expedition on top of the worn map.
 * See docs/DESIGN.md.
 */

/** Closed list. Order is the shelf order on the Upgrades sheet. */
export const LOST_TOOLS = ["pick", "lamp", "map", "boots"] as const;

export type LostToolId = (typeof LOST_TOOLS)[number];

type Shelf = {
  readonly finds?: readonly string[];
  readonly crafted?: Crafted;
};

/** Grandfather's pick: five fourths of the bare tap, rounded up. */
export const PICK_TAP_NUMERATOR = 5;
export const PICK_TAP_DENOMINATOR = 4;

/** Old miner's lamp: a golden vein glints this many times as long. */
export const LAMP_LINGER_SCALE = 2;

/** Worn map: the next expedition takes three quarters of the tunnel's time. */
export const MAP_RETURN_NUMERATOR = 3;
export const MAP_RETURN_DENOMINATOR = 4;

export function hasLostTool(mountain: Shelf, id: LostToolId): boolean {
  return mountain.finds?.includes(id) ?? false;
}

/**
 * Steel-toe boots. Hazards reads this and stretches the gap between troubles.
 */
export function wearsSteelToes(mountain: Shelf): boolean {
  return hasLostTool(mountain, "boots");
}

/** The bare tap, a little stronger once Grandfather's pick is home. */
export function tapWithPick(bareTap: number, mountain: Shelf): number {
  if (!hasLostTool(mountain, "pick")) {
    return bareTap;
  }
  return Math.ceil((bareTap * PICK_TAP_NUMERATOR) / PICK_TAP_DENOMINATOR);
}

/** How many times longer a golden vein stays, once the old lamp is home. */
export function glintScale(mountain: Shelf): number {
  return hasLostTool(mountain, "lamp") ? LAMP_LINGER_SCALE : 1;
}

/** How long the next expedition stays out. Already-walking parties keep their clock. */
export function expeditionAwayMs(awayMs: number, mountain: Shelf): number {
  const mapped = hasLostTool(mountain, "map")
    ? Math.round((awayMs * MAP_RETURN_NUMERATOR) / MAP_RETURN_DENOMINATOR)
    : awayMs;
  return Math.round(mapped * expeditionCraftScale(mountain));
}
