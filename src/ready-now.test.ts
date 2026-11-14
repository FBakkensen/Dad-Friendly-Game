import { NONE_OWNED, patched, type MountainPatch } from "./test-fixtures";
import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import type { Trouble } from "./hazards";
import { createMountain, stonesPerSecond, type Mountain } from "./mountain";
import { handsGain, machineGain } from "./rates";
import { readyNow } from "./ready-now";
import { MOUNTAIN_STONES, stonesLeft } from "./scale";
import { tierById, tierCost, tierShown, type TierId } from "./tiers";
import { NO_BOOSTS } from "./boosts";

const NOW = 1_700_000_000_000;

function mountainWith(fields: MountainPatch): Mountain {
  return patched(createMountain(), fields);
}

/** What the next one of a tier costs on this mountain. */
function priceOf(mountain: Mountain, id: TierId, owned: number): number {
  return tierCost(tierById(id), owned, mountain.stretch);
}

/** Stones mined out so far: this deep. */
function at(depth: number): Pick<Mountain, "remaining"> {
  return { remaining: MOUNTAIN_STONES - depth };
}

/** Topsoil with every stage running: the face (one drill) moves the least. */
const faceLow = {
  owned: { ...NONE_OWNED, helper: 40, cart: 10, hoist: 3, drill: 1 },
};

/** Granite with every stage running and the face the lowest: drill and borer both on sale. */
const graniteFaceLow = {
  ...at(10_000_000),
  owned: { ...NONE_OWNED, helper: 30, cart: 10, hoist: 3, drill: 1 },
};

/** Every machine up to the train running, so the Great Machine shows; the lift moves the least. */
const LIFT_LOW = {
  ...NONE_OWNED,
  cart: 10,
  hoist: 1,
  drill: 3,
  borer: 1,
  train: 1,
};

describe("readyNow", () => {
  describe("the lowest stage first (#536)", () => {
    it("looks at the stage that moves the least, a tie in rock order", () => {
      // A cart and nothing else: the face and the lift move nothing. The face
      // comes first, but its drill is not shown before a hoist, so the lift.
      const mountain = mountainWith({
        owned: { ...NONE_OWNED, helper: 20, cart: 1 },
        stock: { stones: 1e9 },
      });
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "ready",
        tier: "hoist",
        gain: machineGain(mountain, "hoist", 1, NOW),
      });

      const hoisted = mountainWith({
        owned: { ...NONE_OWNED, helper: 20, cart: 1, hoist: 1 },
        stock: { stones: 1e9 },
      });
      expect(readyNow(hoisted, NOW)).toMatchObject({
        kind: "ready",
        tier: "drill",
      });
    });

    it("the biggest machine there he can run and afford", () => {
      const borerPrice = priceOf(createMountain(), "borer", 0);
      const drillPrice = priceOf(createMountain(), "drill", 1);
      expect(
        readyNow(
          mountainWith({ ...graniteFaceLow, stock: { stones: borerPrice } }),
          NOW,
        ),
      ).toMatchObject({ kind: "ready", tier: "borer", price: borerPrice });
      expect(
        readyNow(
          mountainWith({
            ...graniteFaceLow,
            stock: { stones: borerPrice - 1 },
          }),
          NOW,
        ),
      ).toMatchObject({ kind: "ready", tier: "drill", price: drillPrice });
      expect(
        readyNow(
          mountainWith({
            ...graniteFaceLow,
            stock: { stones: drillPrice - 1 },
          }),
          NOW,
        ),
      ).toMatchObject({ kind: "saving", tier: "drill", price: drillPrice });
    });

    it("a machine he can afford but not staff is passed over", () => {
      // 14 run machines, so 7 free and a borer takes 8.
      const pocket = priceOf(createMountain(), "borer", 0);
      const mountain = mountainWith({
        ...graniteFaceLow,
        owned: { ...graniteFaceLow.owned, helper: 21 },
        stock: { stones: pocket },
      });
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "ready",
        tier: "drill",
        free: 7,
      });
    });

    it("never offers a machine that adds nothing", () => {
      // Twelve workers and a cart: a second cart adds nothing, so with a
      // cart's price in the pocket the plate saves for a hoist instead.
      const base = mountainWith({
        owned: { ...NONE_OWNED, helper: 12, cart: 1 },
      });
      const cart = priceOf(base, "cart", 1);
      const mountain = { ...base, stock: { ...base.stock, stones: cart } };
      expect(machineGain(mountain, "cart", 1, NOW)).toBe(0);
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "saving",
        tier: "hoist",
      });
    });

    it("with nothing shown that helps, a worker", () => {
      // Before the cart shows, a free hand has no machine to save for.
      const mountain = mountainWith({
        stock: { stones: 1_000 },
        owned: { ...NONE_OWNED, helper: 7 },
      });
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "ready",
        tier: "helper",
        free: 7,
        gain: handsGain(mountain, "helper", 1, NOW),
      });
    });

    it("the plate and the Buys row agree on what a machine adds", () => {
      const mountain = mountainWith({
        ...faceLow,
        stock: { stones: 1e9 },
      });
      const pick = readyNow(mountain, NOW);
      if (pick.kind === "mined-out" || pick.tier === "helper") {
        throw new Error("expected a machine");
      }
      expect(pick.gain).toBe(machineGain(mountain, pick.tier, 1, NOW));
      expect(pick.gain).toBeGreaterThan(0);
    });

    it("a tie on price goes to the lower tier", () => {
      const drill = priceOf(createMountain(), "drill", 1);
      const borer = priceOf(createMountain(), "borer", 0);
      withFactors({ "price.borer": drill / borer }, () => {
        const fresh = mountainWith(graniteFaceLow);
        expect(priceOf(fresh, "borer", 0)).toBe(priceOf(fresh, "drill", 1));
        expect(
          readyNow(
            mountainWith({ ...graniteFaceLow, stock: { stones: 1 } }),
            NOW,
          ),
        ).toMatchObject({ kind: "saving", tier: "drill" });
      });
    });
  });

  describe("a worker only when no hand is free", () => {
    it("is ready when the pocket covers one", () => {
      const fresh = createMountain();
      const pocket = priceOf(fresh, "cart", 6) + priceOf(fresh, "helper", 6);
      const mountain = mountainWith({
        stock: { stones: pocket },
        owned: { ...NONE_OWNED, helper: 6, cart: 6 },
      });

      expect(readyNow(mountain, NOW)).toEqual({
        kind: "ready",
        tier: "helper",
        price: priceOf(mountain, "helper", 6),
        gain: handsGain(mountain, "helper", 1, NOW),
        free: 0,
      });
    });

    it("is saved for, with its time, when it does not", () => {
      const mountain = mountainWith({
        stock: { stones: 5 },
        owned: { ...NONE_OWNED, helper: 6, cart: 6 },
      });
      const price = priceOf(mountain, "helper", 6);

      expect(readyNow(mountain, NOW)).toEqual({
        kind: "saving",
        tier: "helper",
        price,
        gain: handsGain(mountain, "helper", 1, NOW),
        free: 0,
        etaMs: ((price - 5) / stonesPerSecond(mountain, NOW)) * 1000,
      });
    });
  });

  describe("a worker who starts an idle machine (#490)", () => {
    it("adds the machine he starts, and names it", () => {
      // 3 workers on 6 carts: no hand free, and the next one starts a cart.
      const mountain = mountainWith({
        stock: { stones: 1_000 },
        owned: { ...NONE_OWNED, helper: 3, cart: 6 },
      });
      expect(readyNow(mountain, NOW)).toEqual({
        kind: "ready",
        tier: "helper",
        price: priceOf(mountain, "helper", 3),
        gain: handsGain(mountain, "helper", 1, NOW),
        free: 0,
        starts: "cart",
      });
    });

    it("saving for him reads the same gain", () => {
      const mountain = mountainWith({
        stock: { stones: 1 },
        owned: { ...NONE_OWNED, helper: 3, cart: 6 },
      });
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "saving",
        tier: "helper",
        gain: handsGain(mountain, "helper", 1, NOW),
        starts: "cart",
      });
    });
  });

  describe("the first worker on a mountain with no crew (#517)", () => {
    it("says he is the first, since no hand is busy", () => {
      const fresh = mountainWith({ stock: { stones: 60 } });
      expect(readyNow(fresh, NOW)).toEqual({
        kind: "ready",
        tier: "helper",
        price: 60,
        gain: handsGain(fresh, "helper", 1, NOW),
        free: 0,
        firstWorker: true,
      });
    });

    it("names the idle cart he starts instead, when there is one", () => {
      const idle = mountainWith({
        stock: { stones: 20 },
        owned: { ...NONE_OWNED, cart: 2 },
      });
      const pick = readyNow(idle, NOW);
      expect(pick).toMatchObject({ tier: "helper", starts: "cart" });
      expect(pick).not.toHaveProperty("firstWorker");
    });

    it("is no first worker once one is on the crew", () => {
      const pick = readyNow(
        mountainWith({
          stock: { stones: 50 },
          owned: { ...NONE_OWNED, helper: 1, cart: 1 },
        }),
        NOW,
      );
      expect(pick).toMatchObject({ tier: "helper" });
      expect(pick).not.toHaveProperty("firstWorker");
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
      expect(priceOf(fresh, "helper", 0)).toBe(60);
    });

    it("an endless speed shows no time", () => {
      withFactors({ "output.helper": Infinity }, () => {
        const mountain = mountainWith({
          owned: { ...NONE_OWNED, helper: 6, cart: 6 },
        });
        expect(stonesPerSecond(mountain, NOW)).toBe(Infinity);
        expect(readyNow(mountain, NOW)).toMatchObject({
          kind: "saving",
          etaMs: undefined,
        });
      });
    });

    it("a broken speed shows no time", () => {
      withFactors({ "output.helper": Number.NaN }, () => {
        const mountain = mountainWith({
          owned: { ...NONE_OWNED, helper: 6, cart: 6 },
        });
        expect(stonesPerSecond(mountain, NOW)).toBeNaN();
        expect(readyNow(mountain, NOW)).toMatchObject({
          kind: "saving",
          etaMs: undefined,
        });
      });
    });

    it("a price past the stones left shows no time (#610)", () => {
      const mountain = mountainWith({
        owned: { ...NONE_OWNED, helper: 18, cart: 6 },
        stock: { stones: 100 },
        remaining: 1,
      });
      const price = priceOf(mountain, "hoist", 0);
      expect(price - 100).toBeGreaterThan(stonesLeft(mountain));
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "saving",
        tier: "hoist",
        price,
        etaMs: undefined,
      });
    });

    it("a price the stones left can still pay keeps its time", () => {
      const mountain = mountainWith({
        owned: { ...NONE_OWNED, helper: 18, cart: 6 },
        stock: { stones: 100 },
        remaining: 10_000,
      });
      const price = priceOf(mountain, "hoist", 0);
      expect(stonesLeft(mountain)).toBeGreaterThanOrEqual(price - 100);
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "saving",
        tier: "hoist",
        etaMs: ((price - 100) / stonesPerSecond(mountain, NOW)) * 1000,
      });
    });

    it("a price exactly the stones left away keeps its time", () => {
      const base = mountainWith({
        remaining: 30,
        owned: { ...NONE_OWNED, helper: 18, cart: 6 },
      });
      const price = priceOf(base, "hoist", 0);
      const mountain = {
        ...base,
        stock: { ...base.stock, stones: price - stonesLeft(base) },
      };
      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "saving",
        tier: "hoist",
        etaMs: (stonesLeft(base) / stonesPerSecond(mountain, NOW)) * 1000,
      });
    });

    it("a broken pocket shows no time", () => {
      const mountain = mountainWith({
        owned: { ...NONE_OWNED, helper: 6, cart: 6 },
        stock: { stones: Number.NaN },
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
      const mountain = mountainWith({
        ...faceLow,
        owned: { ...faceLow.owned, borer: 0 },
        stock: { stones: pocket },
      });

      expect(readyNow(mountain, NOW)).toMatchObject({
        kind: "ready",
        tier: "drill",
      });
    });

    it("never picks the Great Machine without the Hammer", () => {
      // Its depth is lifted, so only the missing Hammer holds it back.
      withFactors({ "opens.machine": 0 }, () => {
        const pocket = priceOf(createMountain(), "machine", 0) * 2;
        // The lift moves the least, and its Great Machine is shown.
        const mountain = mountainWith({
          ...at(15_000_000),
          owned: { ...LIFT_LOW, helper: 60 },
          stock: { stones: pocket },
        });

        expect(tierShown(mountain, tierById("machine"))).toBe(true);
        const pick = readyNow(mountain, NOW);
        expect(pick).toMatchObject({ kind: "ready", tier: "hoist" });
      });
    });

    it("never picks a kid with the Crown", () => {
      const pocket = priceOf(createMountain(), "machine", 0) * 2;
      const deep = at(130_000_000);

      const busy = readyNow(
        mountainWith({ ...deep, stock: { stones: pocket } }),
        NOW,
      );
      expect(busy).toMatchObject({ kind: "ready", tier: "helper" });

      const poor = readyNow(
        mountainWith({ ...deep, stock: { stones: 0 } }),
        NOW,
      );
      expect(poor).toMatchObject({ kind: "saving", tier: "helper" });

      const crewed = readyNow(
        mountainWith({
          ...deep,
          stock: { stones: pocket },
          owned: { ...NONE_OWNED, helper: 20, kid: 2 },
        }),
        NOW,
      );
      // Only the cart is shown to twenty workers.
      expect(crewed).toMatchObject({ kind: "ready", tier: "cart" });
    });
  });

  it("the Great Machine's tended bill", () => {
    const price = priceOf(createMountain(), "machine", 0);
    const onSale = {
      ...at(120_000_000),
      stock: { stones: price + 1 },
      // Thirty run the line's machines: five free.
      owned: { ...LIFT_LOW, helper: 35 },
    };

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
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "machine" }],
        expeditions: [
          {
            engineer: "Ada",
            tunnel: "side-seam",
            sentAt: NOW,
            returnsAt: NOW + 60_000,
            find: { kind: "quiet" },
          },
        ],
      }),
      NOW,
    );
    expect(away).toMatchObject({ kind: "ready", tier: "hoist" });
  });

  it("a troubled machine stays in the pick, at its troubled gain", () => {
    const mountain = mountainWith({
      owned: { ...NONE_OWNED, helper: 12 },
      stock: { stones: priceOf(createMountain(), "cart", 0) },
    });
    const trouble: Trouble = { kind: "cave-in", tier: "cart", startedAt: NOW };
    const gain = machineGain(mountain, "cart", 1, NOW, trouble);
    expect(gain).toBeLessThan(machineGain(mountain, "cart", 1, NOW));

    expect(readyNow(mountain, NOW, trouble)).toEqual({
      kind: "ready",
      tier: "cart",
      price: priceOf(mountain, "cart", 0),
      gain,
      free: 12,
    });
  });

  it("mined out", () => {
    const mountain = mountainWith({
      remaining: 0,
      stock: { stones: 1e12 },
      owned: { ...NONE_OWNED, helper: 40 },
    });
    expect(readyNow(mountain, NOW)).toEqual({ kind: "mined-out" });
  });

  it("display only", () => {
    const ready = mountainWith({
      ...graniteFaceLow,
      stock: { stones: priceOf(createMountain(), "borer", 0) },
    });
    const saving = mountainWith({
      stock: { stones: 100 },
      owned: { ...NONE_OWNED, helper: 18, cart: 6 },
    });
    for (const mountain of [ready, saving]) {
      const before = structuredClone(mountain);
      const frozen = Object.freeze({
        ...mountain,
        stock: Object.freeze({ ...mountain.stock }),
        recipes: Object.freeze([...mountain.recipes]),
      }) as Mountain;

      readyNow(frozen, NOW);

      expect(frozen).toEqual(before);
    }
  });

  it("a boost shortens the time", () => {
    const overtimeEnds = NOW + 60_000;
    const mountain = mountainWith({
      owned: { ...NONE_OWNED, helper: 18, cart: 6 },
      stock: { stones: 100 },
      boosts: { ...NO_BOOSTS, overtime: overtimeEnds },
    });
    const price = priceOf(mountain, "hoist", 0);
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
