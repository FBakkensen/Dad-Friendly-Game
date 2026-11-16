import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { promote, station } from "./engineers";
import type { Trouble } from "./hazards";
import { lineRating } from "./line";
import {
  AWAY_PAY_RATE,
  effectiveRates,
  firstIdleTier,
  firstTend,
  moveGain,
  paidAwayMs,
  promotePayoff,
} from "./rates";
import { createMountain, type Mountain } from "./mountain";
import { crewedStart } from "./test-fixtures";
import { TIERS } from "./tiers";
import { NO_UPGRADES } from "./upgrades";

describe("effectiveRates", () => {
  it("reads one mountain once when no clock is passed", () => {
    const mountain = crewedStart();
    const first = effectiveRates(mountain);
    expect(effectiveRates(mountain)).toBe(first);
    expect(effectiveRates({ ...mountain })).not.toBe(first);
    expect(effectiveRates({ ...mountain })).toEqual(first);
  });

  it("reads the same mountain again under a sweep, then puts it back", () => {
    const mountain = crewedStart();
    const plain = effectiveRates(mountain);
    withFactors({ "output.cart": 2 }, () => {
      expect(effectiveRates(mountain).tierSpeed.cart).toBe(
        plain.tierSpeed.cart * 2,
      );
    });
    expect(effectiveRates(mountain).tierSpeed.cart).toBe(plain.tierSpeed.cart);
  });

  it("is the line's table with no upgrades: each tier at its rating, and the line's pace", () => {
    const rates = effectiveRates(crewedStart());
    expect(rates.tierSpeed).toEqual(
      Object.fromEntries(
        TIERS.map((tier) => [tier.id, tier.perSecond * lineRating(tier.id)]),
      ),
    );
    // Six on each stage, with tools: the line moves 18 a second.
    expect(rates.crewPerSecond).toBe(18);
    expect(rates.exactCrewPerSecond).toBe(rates.crewPerSecond);
    expect(rates.helpersShort).toBe(0);
    expect(rates.awayPay).toBe(AWAY_PAY_RATE);
  });

  it("keeps the fraction the crew line floors away", () => {
    const rates = effectiveRates({
      ...crewedStart(),
      upgrades: { ...NO_UPGRADES, boots: 1 },
    });
    expect(rates.exactCrewPerSecond).toBeCloseTo(42.48, 10);
    expect(rates.crewPerSecond).toBe(42);
  });

  it("slows the troubled tier from a quarter toward a half, and not the others", () => {
    const start = crewedStart();
    const crew = { ...start, owned: { ...start.owned, cart: 1, drill: 1 } };
    const trouble: Trouble = { kind: "cave-in", tier: "cart", startedAt: 0 };
    const plain = effectiveRates(crew, 0);
    const started = effectiveRates(crew, 0, trouble);
    const cart = plain.tierSpeed.cart;
    expect(started.tierSpeed.cart).toBe(cart * 0.75);
    expect(started.tierSpeed.drill).toBe(plain.tierSpeed.drill);
    expect(started.awayPay).toBe(plain.awayPay);
    expect(effectiveRates(crew, 60_000, trouble).tierSpeed.cart).toBe(
      cart * 0.625,
    );
    expect(effectiveRates(crew, 120_000, trouble).tierSpeed.cart).toBe(
      cart * 0.5,
    );
    expect(effectiveRates(crew, 180_000, trouble).tierSpeed.cart).toBe(
      cart * 0.5,
    );
    expect(effectiveRates(crew, undefined, trouble).tierSpeed.cart).toBe(
      cart * 0.75,
    );
  });
});

describe("the first idle machine (#246)", () => {
  it("is the biggest kind owned past what runs, and none when all run", () => {
    const start = createMountain();
    // Two carts and nobody on haulage: both stand idle.
    const idle = { ...start, owned: { ...start.owned, cart: 2 } };
    expect(effectiveRates(idle).running.cart).toBe(0);
    expect(firstIdleTier(idle)).toBe("cart");
    const both = { ...idle, owned: { ...idle.owned, drill: 1 } };
    expect(firstIdleTier(both)).toBe("cart");
    expect(firstIdleTier(crewedStart())).toBeUndefined();
  });
});

const ada = { name: "Ada", rank: 0, trips: 0, post: "camp" } as const;

/**
 * The face is the narrow stage: one drill (108) against two carts and two
 * hoists (120 each), a first borer for the engineers, and one worker free.
 */
function tendable(): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: {
      ...start.owned,
      helper: 6,
      drill: 1,
      cart: 2,
      hoist: 2,
      borer: 1,
    },
    jobs: { ...start.jobs, drilling: 1, haulage: 2, hoisting: 2 },
    stock: { ...start.stock, stones: 1e9 },
    engineers: [ada],
  };
}

describe("tending in a fresh mine", () => {
  it("prices a move as the line's rise, and guides the first tend to the narrow stage", () => {
    const crew = tendable();
    const gain = moveGain(crew, 0, "drill");
    expect(gain).toBe(
      effectiveRates(station(crew, 0, "drill")).crewPerSecond -
        effectiveRates(crew).crewPerSecond,
    );
    expect(gain).toBeGreaterThanOrEqual(1);
    // The carts are not narrow: tending them moves nothing.
    expect(moveGain(crew, 0, "cart")).toBe(0);
    expect(firstTend(crew)).toEqual({ index: 0, post: "drill" });
    // Already on the drill, nothing pays more: no guided step down.
    expect(firstTend(station(crew, 0, "drill"))).toBeUndefined();
    expect(firstTend({ ...crew, engineers: [] })).toBeUndefined();
  });

  it("skips an engineer out on a trip, for the next one at home", () => {
    const nils = { ...ada, name: "Nils" } as const;
    const out: Mountain = {
      ...tendable(),
      engineers: [ada, nils],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "side-seam",
          sentAt: 0,
          returnsAt: 60_000,
          find: { kind: "quiet" },
        },
      ],
    };
    expect(firstTend(out, 0)).toEqual({ index: 1, post: "drill" });
  });

  it("counts the worker who steps up in the second engineer's payoff", () => {
    const crew = tendable();
    const payoff = promotePayoff(crew, 0);
    expect(payoff?.name).toBe("Nils");
    expect(payoff?.post).toBe("drill");
    const after = effectiveRates(station(promote(crew), 1, "drill"), 0);
    expect(payoff?.gain).toBe(
      after.crewPerSecond - effectiveRates(crew, 0).crewPerSecond,
    );
    // With no engineer yet, the first hand is Ada.
    expect(promotePayoff({ ...crew, engineers: [] }, 0)?.name).toBe("Ada");
    // Out of reach, or nothing left to tend that pays: no payoff.
    expect(
      promotePayoff({ ...crew, stock: { ...crew.stock, stones: 0 } }, 0),
    ).toBeUndefined();
    expect(
      promotePayoff({ ...crew, engineers: [{ ...ada, post: "drill" }] }, 0),
    ).toBeUndefined();
  });
});

describe("the away slope the lab's values read (#278)", () => {
  const HOUR = 60 * 60 * 1000;

  it.each([
    [4, 4],
    [6, 6],
    [8, 6.8],
    [12, 8.4],
    [16, 10],
    [24, 13.2],
    [48, 13.2],
  ])("%d hours away pays %d hours", (away, paid) => {
    expect(paidAwayMs(away * HOUR)).toBeCloseTo(paid * HOUR, 3);
  });

  it("pays nothing for a clock that went backwards", () => {
    expect(paidAwayMs(-HOUR)).toBe(0);
  });
});
