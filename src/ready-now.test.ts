import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import type { Trouble } from "./hazards";
import { createMountain, stonesPerSecond, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { readyNow } from "./ready-now";
import { MOUNTAIN_STONES } from "./scale";
import { tierById, tierCost, type TierId } from "./tiers";
import { NO_BOOSTS } from "./boosts";

const NOW = 1_700_000_000_000;

function mountainWith(fields: Partial<Mountain>): Mountain {
  return { ...createMountain(), ...fields };
}

/** What the next one of a tier costs on this mountain. */
function priceOf(mountain: Mountain, id: TierId, owned: number): number {
  return tierCost(tierById(id), owned, mountain.stretch);
}

/** Stones mined out so far: this deep. */
function at(depth: number): Pick<Mountain, "remaining"> {
  return { remaining: MOUNTAIN_STONES - depth };
}

describe("readyNow", () => {
  it("the biggest machine he can run and afford", () => {
    const crew = { helpers: 24, carts: 6, drills: 2, borers: 1 };
    const borerPrice = priceOf(createMountain(), "borer", 1);
    const drillPrice = priceOf(createMountain(), "drill", 2);

    expect(
      readyNow(mountainWith({ ...crew, pocket: borerPrice }), NOW),
    ).toEqual(
      expect.objectContaining({
        kind: "ready",
        tier: "borer",
        price: borerPrice,
        free: 8,
      }),
    );
    expect(
      readyNow(mountainWith({ ...crew, pocket: drillPrice }), NOW),
    ).toEqual(
      expect.objectContaining({
        kind: "ready",
        tier: "drill",
        price: drillPrice,
        free: 8,
      }),
    );
  });

  it("exactly enough", () => {
    // 8 free and a borer takes 8; the pocket is the borer's price to the stone.
    const crew = { helpers: 24, carts: 6, drills: 2, borers: 1 };
    const price = priceOf(createMountain(), "borer", 1);

    const exact = readyNow(mountainWith({ ...crew, pocket: price }), NOW);
    expect(exact).toMatchObject({ kind: "ready", tier: "borer", free: 8 });

    const short = readyNow(mountainWith({ ...crew, pocket: price - 1 }), NOW);
    expect(short).toMatchObject({ kind: "ready", tier: "drill" });

    const shortHand = readyNow(
      mountainWith({ ...crew, helpers: 23, pocket: price }),
      NOW,
    );
    expect(shortHand).toMatchObject({ kind: "ready", tier: "drill", free: 7 });
  });

  it("a machine he can afford but not staff is passed over", () => {
    const pocket = priceOf(createMountain(), "borer", 1);
    const mountain = mountainWith({
      helpers: 19,
      carts: 6,
      drills: 2,
      borers: 1,
      pocket,
    });

    expect(readyNow(mountain, NOW)).toMatchObject({
      kind: "ready",
      tier: "drill",
      price: priceOf(mountain, "drill", 2),
      free: 3,
    });
  });

  it("a free hand saves for a machine, never a worker", () => {
    const fresh = createMountain();
    const pocket = priceOf(fresh, "helper", 1) + 1;
    expect(pocket).toBeLessThan(priceOf(fresh, "cart", 0));

    expect(readyNow(mountainWith({ helpers: 1, pocket }), NOW)).toMatchObject({
      kind: "saving",
      tier: "cart",
      price: priceOf(fresh, "cart", 0),
      free: 1,
    });
  });

  it("saving for the cheapest machine a free hand can run", () => {
    const mountain = mountainWith({ helpers: 18, carts: 6, pocket: 100 });
    const price = priceOf(mountain, "cart", 6);

    expect(readyNow(mountain, NOW)).toEqual({
      kind: "saving",
      tier: "cart",
      price,
      gain: effectiveRates(mountain, NOW).tierSpeed.cart,
      free: 12,
      etaMs: ((price - 100) / stonesPerSecond(mountain, NOW)) * 1000,
    });
  });

  it("a tie on price goes to the lower tier", () => {
    withFactors({ "price.cart": 1.218, "price.drill": 0.01 }, () => {
      const fresh = createMountain();
      expect(priceOf(fresh, "cart", 0)).toBe(731);
      expect(priceOf(fresh, "drill", 0)).toBe(731);

      expect(
        readyNow(mountainWith({ helpers: 2, pocket: 700 }), NOW),
      ).toMatchObject({ kind: "saving", tier: "cart", price: 731 });
      expect(
        readyNow(mountainWith({ helpers: 2, pocket: 731 }), NOW),
      ).toMatchObject({ kind: "ready", tier: "drill", price: 731 });
    });
  });

  describe("a worker only when no hand is free", () => {
    it("is ready when the pocket covers one", () => {
      const fresh = createMountain();
      const pocket = priceOf(fresh, "cart", 6) + priceOf(fresh, "helper", 6);
      const mountain = mountainWith({ helpers: 6, carts: 6, pocket });

      expect(readyNow(mountain, NOW)).toEqual({
        kind: "ready",
        tier: "helper",
        price: priceOf(mountain, "helper", 6),
        gain: effectiveRates(mountain, NOW).tierSpeed.helper,
        free: 0,
      });
    });

    it("is saved for, with its time, when it does not", () => {
      const mountain = mountainWith({ helpers: 6, carts: 6, pocket: 5 });
      const price = priceOf(mountain, "helper", 6);

      expect(readyNow(mountain, NOW)).toEqual({
        kind: "saving",
        tier: "helper",
        price,
        gain: effectiveRates(mountain, NOW).tierSpeed.helper,
        free: 0,
        etaMs: ((price - 5) / stonesPerSecond(mountain, NOW)) * 1000,
      });
    });
  });

  describe("no time when the speed cannot give one", () => {
    it("zero speed shows no time", () => {
      const fresh = createMountain();
      expect(readyNow(fresh, NOW)).toMatchObject({
        kind: "saving",
        tier: "helper",
        price: priceOf(fresh, "helper", 0),
        etaMs: undefined,
      });
      expect(priceOf(fresh, "helper", 0)).toBe(20);
    });

    it("an endless speed shows no time", () => {
      withFactors({ "output.helper": Infinity }, () => {
        const mountain = mountainWith({ helpers: 6, carts: 6 });
        expect(stonesPerSecond(mountain, NOW)).toBe(Infinity);
        expect(readyNow(mountain, NOW)).toMatchObject({
          kind: "saving",
          etaMs: undefined,
        });
      });
    });

    it("a broken speed shows no time", () => {
      withFactors({ "output.helper": Number.NaN }, () => {
        const mountain = mountainWith({ helpers: 6, carts: 6 });
        expect(stonesPerSecond(mountain, NOW)).toBeNaN();
        expect(readyNow(mountain, NOW)).toMatchObject({
          kind: "saving",
          etaMs: undefined,
        });
      });
    });

    it("a broken pocket shows no time", () => {
      const mountain = mountainWith({
        helpers: 6,
        carts: 6,
        pocket: Number.NaN,
      });
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "saving",
        tier: "helper",
        etaMs: undefined,
      });
    });
  });

  describe("locked tiers and kids are never offered", () => {
    it("passes over the borer in the Topsoil", () => {
      const pocket = priceOf(createMountain(), "borer", 0) + 1;
      const mountain = mountainWith({ helpers: 40, pocket });

      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "ready",
        tier: "drill",
        free: 40,
      });
    });

    it("never picks the Great Machine without the Hammer", () => {
      // Its depth is lifted, so only the missing Hammer holds it back.
      withFactors({ "opens.machine": 0 }, () => {
        const pocket = priceOf(createMountain(), "machine", 0) * 2;
        const mountain = mountainWith({
          ...at(15_000_000),
          helpers: 40,
          pocket,
        });

        const pick = readyNow(mountain, NOW);
        expect(pick).toMatchObject({ kind: "ready", tier: "borer" });
      });
    });

    it("never picks a kid with the Crown", () => {
      const pocket = priceOf(createMountain(), "machine", 0) * 2;
      const deep = at(130_000_000);

      const busy = readyNow(mountainWith({ ...deep, pocket }), NOW);
      expect(busy).toMatchObject({ kind: "ready", tier: "helper" });

      const poor = readyNow(mountainWith({ ...deep, pocket: 0 }), NOW);
      expect(poor).toMatchObject({ kind: "saving", tier: "helper" });

      const crewed = readyNow(
        mountainWith({ ...deep, helpers: 20, kids: 2, pocket }),
        NOW,
      );
      expect(crewed).toMatchObject({ kind: "ready", tier: "machine" });
    });
  });

  it("the Great Machine's tended bill", () => {
    const price = priceOf(createMountain(), "machine", 0);
    const onSale = { ...at(120_000_000), helpers: 5, pocket: price + 1 };

    const tended = readyNow(
      mountainWith({
        ...onSale,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
      }),
      NOW,
    );
    expect(tended).toMatchObject({
      kind: "ready",
      tier: "machine",
      price,
      free: 5,
    });

    // In the tunnel she cannot tend it, so it would take all 10.
    const away = readyNow(
      mountainWith({
        ...onSale,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
      }),
      NOW,
    );
    expect(away).toMatchObject({ kind: "ready", tier: "drill" });
  });

  it("a troubled machine stays in the pick, at its troubled gain", () => {
    const mountain = mountainWith({
      helpers: 1,
      pocket: priceOf(createMountain(), "cart", 0),
    });
    const trouble: Trouble = { kind: "cave-in", tier: "cart", startedAt: NOW };
    const gain = effectiveRates(mountain, NOW, trouble).tierSpeed.cart;
    expect(gain).toBeLessThan(effectiveRates(mountain, NOW).tierSpeed.cart);

    expect(readyNow(mountain, NOW, trouble)).toEqual({
      kind: "ready",
      tier: "cart",
      price: priceOf(mountain, "cart", 0),
      gain,
      free: 1,
    });
  });

  it("mined out", () => {
    const mountain = mountainWith({ remaining: 0, helpers: 40, pocket: 1e12 });
    expect(readyNow(mountain, NOW)).toEqual({ kind: "mined-out" });
  });

  it("display only", () => {
    const ready = mountainWith({
      helpers: 24,
      carts: 6,
      drills: 2,
      borers: 1,
      pocket: priceOf(createMountain(), "borer", 1),
    });
    const saving = mountainWith({ helpers: 18, carts: 6, pocket: 100 });
    for (const mountain of [ready, saving]) {
      const before = structuredClone(mountain);
      const frozen = Object.freeze({
        ...mountain,
        materials: Object.freeze({ ...mountain.materials }),
        recipes: Object.freeze([...mountain.recipes]),
      }) as Mountain;

      readyNow(frozen, NOW);

      expect(frozen).toEqual(before);
    }
  });

  it("a boost shortens the time", () => {
    const overtimeEnds = NOW + 60_000;
    const mountain = mountainWith({
      helpers: 18,
      carts: 6,
      pocket: 100,
      boosts: { ...NO_BOOSTS, overtime: overtimeEnds },
    });
    const price = priceOf(mountain, "cart", 6);
    const later = overtimeEnds + 1;

    const boosted = readyNow(mountain, NOW);
    const plain = readyNow(mountain, later);
    if (boosted.kind !== "saving" || plain.kind !== "saving") {
      throw new Error("expected saving picks");
    }

    expect(boosted.etaMs).toBe(
      ((price - 100) / stonesPerSecond(mountain, NOW)) * 1000,
    );
    expect(stonesPerSecond(mountain, NOW)).toBeGreaterThan(
      stonesPerSecond(mountain, later),
    );
    expect(boosted.etaMs).toBeLessThan(plain.etaMs ?? 0);
  });
});
