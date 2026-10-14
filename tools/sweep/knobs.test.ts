import { describe, expect, it } from "vitest";
import { withFactors } from "../../src/economy/factors";
import { tendingTenths } from "../../src/engineers";
import { LAYERS } from "../../src/layers";
import { createMountain } from "../../src/mountain";
import { effectiveRates } from "../../src/rates";
import { MOUNTAIN_STONES } from "../../src/scale";
import { tierById, tierCost, TIERS, type TierId } from "../../src/tiers";
import {
  chargeCrewMultiplier,
  emberMachineMultiplier,
  expeditionCraftScale,
  gearMultiplier,
  axleCrewMultiplier,
  recipeById,
  recipeCost,
  troubleGapScale,
  veinOftenScale,
  type RecipeId,
} from "../../src/workshop";
import { KNOBS } from "./knobs";

const posted = {
  remaining: 1_000,
  pocket: 0,
  helpers: 0,
  carts: 0,
  drills: 0,
  borers: 1,
  machines: 0,
  kids: 0,
  engineers: [
    {
      name: "Ada" as const,
      rank: 0 as const,
      trips: 0,
      post: "borer" as const,
    },
  ],
};

function reading(factorId: string): number {
  if (factorId.startsWith("price.")) {
    return tierCost(tierById(factorId.slice("price.".length) as TierId), 0);
  }
  if (factorId === "growth.worker") {
    return tierCost(tierById("helper"), 4);
  }
  if (factorId === "growth.machine") {
    return tierCost(tierById("cart"), 2);
  }
  if (factorId.startsWith("output.")) {
    const id = factorId.slice("output.".length) as TierId;
    return effectiveRates(posted).tierSpeed[id];
  }
  if (factorId === "tending.gain") {
    return tendingTenths(posted, "borer");
  }
  if (factorId.startsWith("recipe.") && factorId.endsWith(".cost")) {
    const id = factorId.slice("recipe.".length, -".cost".length) as RecipeId;
    const cost = recipeCost(id);
    return (
      cost.stones +
      cost.materials.clay +
      cost.materials.iron +
      cost.materials.crystal +
      cost.materials.heartstone
    );
  }
  if (factorId.startsWith("recipe.") && factorId.endsWith(".strength")) {
    const id = factorId.slice(
      "recipe.".length,
      -".strength".length,
    ) as RecipeId;
    const geared = {
      ...createMountain(),
      helpers: 1,
      carts: 1,
      drills: 1,
      borers: 1,
      machines: 1,
      crafted: { [id]: 1 },
      chargeUntil: 10_000,
      flareUntil: 10_000,
      emberUntil: 10_000,
    };
    const effect = recipeById(id).effect;
    switch (effect.kind) {
      case "tier":
        return gearMultiplier(geared, effect.tier);
      case "trouble":
        return troubleGapScale(geared);
      case "veins":
        return veinOftenScale(geared);
      case "trip":
        return expeditionCraftScale(geared);
      case "charge":
        return chargeCrewMultiplier(geared, 0);
      case "flare":
        return veinOftenScale(geared, 0);
      case "ember":
        return emberMachineMultiplier(geared, 0);
      case "reinforce":
        return gearMultiplier(geared, "machine");
      case "axle":
        return axleCrewMultiplier({ ...geared, axleUntil: 10_000 }, 0);
    }
  }
  if (factorId.startsWith("layer.")) {
    const [, indexText, tierText] = factorId.split(".");
    const index = Number(indexText);
    const layer = LAYERS.find((band) => band.index === index);
    const tier = TIERS.find((candidate) => candidate.id === tierText);
    if (layer === undefined || tier === undefined) {
      throw new Error(`No reading for ${factorId}`);
    }
    return effectiveRates({
      ...posted,
      remaining: MOUNTAIN_STONES - layer.from,
    }).tierSpeed[tier.id];
  }
  throw new Error(`No reading for ${factorId}`);
}

describe("sweep knobs", () => {
  it("names each economy family once", () => {
    expect(new Set(KNOBS.map((knob) => knob.group))).toEqual(
      new Set(["price", "growth", "output", "tending", "hardness", "recipe"]),
    );
    const hardness = KNOBS.filter((knob) => knob.group === "hardness");
    expect(hardness.map((knob) => knob.factor).sort()).toEqual(
      LAYERS.flatMap((layer) =>
        TIERS.map((tier) => `layer.${String(layer.index)}.${tier.id}.hardness`),
      ).sort(),
    );
    for (const knob of hardness) {
      expect(knob.low).toBe(0.85);
      expect(knob.high).toBe(1.15);
    }
    expect(new Set(KNOBS.map((knob) => knob.id)).size).toBe(KNOBS.length);
    expect(new Set(KNOBS.map((knob) => knob.factor)).size).toBe(KNOBS.length);
    for (const knob of KNOBS) {
      expect(knob.low).toBeGreaterThan(0);
      expect(knob.high).toBeGreaterThan(knob.low);
    }
  });

  it("moves the number each entry names", () => {
    for (const knob of KNOBS) {
      const baseline = reading(knob.factor);
      const scaled = withFactors({ [knob.factor]: 2 }, () =>
        reading(knob.factor),
      );
      expect(scaled).not.toBe(baseline);
    }
  });
});
