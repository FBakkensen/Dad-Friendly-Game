import {
  BLUEPRINT_IDS,
  ROCK_PER_UNIT,
  requiredLoads,
  workOrderPrice,
  type BlueprintId,
} from "../factory";
import { GOOD_IDS, priceAmount } from "../stock";
import { STATION_SHARE } from "../transport";
import { HOUR_MS, MS_PER_SECOND, PART_THREE_START } from "./targets";

/**
 * How the lab sizes the work orders with no clock (slice 1, rule 7.13,
 * #674). A work order's time is what transport takes to carry it and what
 * its materials take to be drilled, so its requirement is sized against a
 * part 3 mine as the lab's players reach it: the end of part 2, when the
 * shaft opens the factory (`PART_THREE_START`). The whole slice's replay is
 * #675.
 */

/** A part 3 mine to size against: transport, and the rock each level drills a second. */
export type Reference = {
  readonly carry: number;
  readonly topsoil: number;
  readonly granite: number;
};

export type WorkOrderTime = {
  readonly blueprint: BlueprintId;
  /** Hours to carry it all at the work order's share of the fleet (rule 7.7). */
  readonly carryHours: number;
  /** Hours its materials take to be drilled from nothing, the slower of clay and iron. */
  readonly materialHours: number;
};

/** Seconds as hours. */
function hours(seconds: number): number {
  return (seconds * MS_PER_SECOND) / HOUR_MS;
}

/** One work order's time at `reference`. */
function workOrderTime(
  blueprint: BlueprintId,
  reference: Reference,
): WorkOrderTime {
  const loads = requiredLoads(blueprint);
  const total = GOOD_IDS.reduce((sum, good) => sum + loads[good], 0);
  const price = workOrderPrice(blueprint);
  const clay =
    (priceAmount(price, "clay") * ROCK_PER_UNIT.clay) / reference.topsoil;
  const iron =
    (priceAmount(price, "iron") * ROCK_PER_UNIT.iron) / reference.granite;
  return {
    blueprint,
    carryHours: hours(total / (reference.carry * STATION_SHARE)),
    materialHours: hours(Math.max(clay, iron)),
  };
}

/** Every blueprint's time at `reference`, in the blueprints' order. */
export function workOrderTimes(
  reference: Reference = PART_THREE_START,
): readonly WorkOrderTime[] {
  return BLUEPRINT_IDS.map((id) => workOrderTime(id, reference));
}
