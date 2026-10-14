/**
 * Economy knobs for `npm run lab:sweep`. One entry each.
 * `factor` is the id `tierCost`, crew speed, `tendingTenths`, and layer
 * hardness, and recipe strength and cost already read. `low` and `high` are
 * multipliers on today's number. 1 is the game. A new price, output, growth,
 * tending, hardness, or recipe knob is one entry here. Worker growth is the
 * helper curve, which kids share.
 * Machine growth scales every staffed curve: carts, drills, and the Great
 * Machine double, and borers climb at ×1.5.
 */

import { LAYERS, hardnessFactorId } from "../../src/layers.ts";
import { TIERS } from "../../src/tiers.ts";
import {
  RECIPE_IDS,
  recipeById,
  recipeCostId,
  recipeStrengthId,
} from "../../src/workshop.ts";

type KnobGroup =
  "price" | "growth" | "output" | "tending" | "hardness" | "recipe";

export type Knob = {
  readonly id: string;
  readonly label: string;
  readonly factor: string;
  readonly group: KnobGroup;
  /** Multiplier at the low end of the unit interval. */
  readonly low: number;
  /** Multiplier at the high end of the unit interval. */
  readonly high: number;
};

/**
 * Prices and outputs span half to double. Growth is an exponent, so its
 * range stays close to 1 and the curve still climbs. Hardness is the first
 * cut for the rock, 0.85 to 1.15, and it is 1 in play. Recipe strength and
 * cost run from half to double, and they are 1 in play.
 */
const HARDNESS_LOW = 0.85;
const HARDNESS_HIGH = 1.15;

const RECIPE_KNOBS: readonly Knob[] = RECIPE_IDS.flatMap((id) => {
  const name = recipeById(id).name;
  return [
    {
      id: `recipe-${id}-strength`,
      label: `${name} strength`,
      factor: recipeStrengthId(id),
      group: "recipe" as const,
      low: 0.5,
      high: 2,
    },
    {
      id: `recipe-${id}-cost`,
      label: `${name} cost`,
      factor: recipeCostId(id),
      group: "recipe" as const,
      low: 0.5,
      high: 2,
    },
  ];
});

const HARDNESS_KNOBS: readonly Knob[] = LAYERS.flatMap((layer) =>
  TIERS.map((tier) => ({
    id: `layer-${String(layer.index)}-${tier.id}-hardness`,
    label: `${layer.name} ${tier.shortName} hardness`,
    factor: hardnessFactorId(layer.index, tier.id),
    group: "hardness" as const,
    low: HARDNESS_LOW,
    high: HARDNESS_HIGH,
  })),
);

export const KNOBS: readonly Knob[] = [
  {
    id: "worker-price",
    label: "Worker price",
    factor: "price.helper",
    group: "price",
    low: 0.5,
    high: 2,
  },
  {
    id: "cart-price",
    label: "Cart price",
    factor: "price.cart",
    group: "price",
    low: 0.5,
    high: 2,
  },
  {
    id: "drill-price",
    label: "Drill price",
    factor: "price.drill",
    group: "price",
    low: 0.5,
    high: 2,
  },
  {
    id: "borer-price",
    label: "Borer price",
    factor: "price.borer",
    group: "price",
    low: 0.5,
    high: 2,
  },
  {
    id: "machine-price",
    label: "Great Machine price",
    factor: "price.machine",
    group: "price",
    low: 0.5,
    high: 2,
  },
  {
    id: "worker-growth",
    label: "Worker price growth",
    factor: "growth.worker",
    group: "growth",
    low: 0.85,
    high: 1.15,
  },
  {
    id: "machine-growth",
    label: "Machine price growth",
    factor: "growth.machine",
    group: "growth",
    low: 0.85,
    high: 1.15,
  },
  {
    id: "borer-output",
    label: "Borer output",
    factor: "output.borer",
    group: "output",
    low: 0.5,
    high: 2,
  },
  {
    id: "machine-output",
    label: "Great Machine output",
    factor: "output.machine",
    group: "output",
    low: 0.5,
    high: 2,
  },
  {
    id: "tending-gain",
    label: "Tending gain",
    factor: "tending.gain",
    group: "tending",
    low: 0.5,
    high: 2,
  },
  ...HARDNESS_KNOBS,
  ...RECIPE_KNOBS,
];

/** Maps a unit-interval sample onto this knob's multiplier. */
export function multiplierAt(knob: Knob, unit: number): number {
  const clamped = Math.min(1, Math.max(0, unit));
  return knob.low + clamped * (knob.high - knob.low);
}
