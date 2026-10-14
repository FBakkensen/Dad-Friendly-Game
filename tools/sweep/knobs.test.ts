import { describe, expect, it } from "vitest";
import { withFactors } from "../../src/economy/factors";
import { tendingTenths } from "../../src/engineers";
import { LAYERS } from "../../src/layers";
import { effectiveRates } from "../../src/rates";
import { MOUNTAIN_STONES } from "../../src/scale";
import { tierById, tierCost, TIERS, type TierId } from "../../src/tiers";
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
      new Set(["price", "growth", "output", "tending", "hardness"]),
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
