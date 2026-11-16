import {
  BLUEPRINT_IDS,
  requiredLoads,
  workOrderPrice,
  type BlueprintId,
} from "../factory";
import { MATERIAL_EVERY } from "../layers";
import { GOOD_IDS, priceAmount } from "../stock";

/**
 * How the lab sizes the work orders with no clock (slice 1, rule 7.13,
 * #674). A work order's time is what transport takes to carry it and what
 * its materials take to be drilled, so its requirement is sized against a
 * part 3 mine as the lab's players reach it: the end of part 2, when the
 * shaft opens the factory. The whole slice's replay is #675.
 */

/** A part 3 mine to size against: transport, and the rock each level drills a second. */
export type Reference = {
  /** Goods a second the fleet carries. */
  readonly carry: number;
  /** Rock a second drilled on the Topsoil (its clay) and on the Granite (its iron). */
  readonly topsoil: number;
  readonly granite: number;
};

/**
 * The lab's player types at the Warehouse's roof (the part 2 replay, seed 1,
 * 16 Nov 2026): 288 to 351 goods a second of horse wagons, and 1,800 to
 * 7,272 stone a second up the shaft. The Granite opens with nobody on it;
 * one drill's 600 a second is its first guess.
 */
export const PART_THREE_START: Reference = {
  carry: 320,
  topsoil: 3_000,
  granite: 600,
};

export type WorkOrderTime = {
  readonly blueprint: BlueprintId;
  /** Minutes to carry it all at half the fleet (the city's order has the other half, rule 7.7). */
  readonly carryMinutes: number;
  /** Hours its materials take to be drilled from nothing, the slower of clay and iron. */
  readonly materialHours: number;
};

/** One work order's time at `reference`. */
export function workOrderTime(
  blueprint: BlueprintId,
  reference: Reference,
): WorkOrderTime {
  const loads = requiredLoads(blueprint);
  const total = GOOD_IDS.reduce((sum, good) => sum + loads[good], 0);
  const price = workOrderPrice(blueprint);
  const clayHours =
    (priceAmount(price, "clay") * MATERIAL_EVERY.clay) /
    reference.topsoil /
    3_600;
  const ironHours =
    (priceAmount(price, "iron") * MATERIAL_EVERY.iron) /
    reference.granite /
    3_600;
  return {
    blueprint,
    carryMinutes: total / (reference.carry / 2) / 60,
    materialHours: Math.max(clayHours, ironHours),
  };
}

/** Every blueprint's time at `reference`, in the blueprints' order. */
export function workOrderTimes(
  reference: Reference = PART_THREE_START,
): readonly WorkOrderTime[] {
  return BLUEPRINT_IDS.map((id) => workOrderTime(id, reference));
}
