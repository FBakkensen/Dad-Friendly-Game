import type { Mountain } from "./mountain";
import { expeditionCraftScale } from "./workshop";

/**
 * Lost tools (M7 §4). One of each, brought home from below and kept on
 * `mountain.finds`. The effects are applied in `expeditions`, and (for
 * the boots) `hazards` via `wearsSteelToes`.
 * The engineer's kit shortens the next expedition on top of the worn map.
 * See docs/DESIGN.md.
 */

/** Closed list. Order is the shelf order on the Upgrades sheet. */
export const LOST_TOOLS = ["map", "boots"] as const;

export type LostToolId = (typeof LOST_TOOLS)[number];

type Shelf = Pick<Mountain, "finds" | "crafted">;

/** Worn map: the next expedition takes three quarters of the tunnel's time. */
export const MAP_RETURN_NUMERATOR = 3;
export const MAP_RETURN_DENOMINATOR = 4;

export function hasLostTool(mountain: Shelf, id: LostToolId): boolean {
  return mountain.finds.includes(id);
}

/**
 * Steel-toe boots. Hazards reads this and stretches the gap between troubles.
 */
export function wearsSteelToes(mountain: Shelf): boolean {
  return hasLostTool(mountain, "boots");
}

/** How long the next expedition stays out. Already-walking parties keep their clock. */
export function expeditionAwayMs(awayMs: number, mountain: Shelf): number {
  const mapped = hasLostTool(mountain, "map")
    ? Math.round((awayMs * MAP_RETURN_NUMERATOR) / MAP_RETURN_DENOMINATOR)
    : awayMs;
  return Math.round(mapped * expeditionCraftScale(mountain));
}
