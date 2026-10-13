import { describe, expect, it } from "vitest";
import type { Trouble } from "./hazards";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import { TIERS } from "./tiers";

describe("effectiveRates", () => {
  it("is the plain table with no upgrades: taps 1, tiers at list speed", () => {
    const rates = effectiveRates({
      ...minedMountain(0),
      helpers: 26, // staffs the cart (1) and the Great Machine (25)
      carts: 1,
      machines: 1,
      kids: 0,
    });
    expect(rates.tapYield).toBe(1);
    expect(rates.tierSpeed).toEqual(
      Object.fromEntries(TIERS.map((tier) => [tier.id, tier.perSecond])),
    );
    expect(rates.crewPerSecond).toBe(26 + 10 + 3_500);
    expect(rates.awayPay).toBe(AWAY_PAY_RATE);
  });

  it("slows the troubled tier from a quarter toward a half, and not the others", () => {
    const crew = {
      ...minedMountain(0),
      helpers: 9,
      carts: 1,
      borers: 1,
      kids: 0,
    };
    const trouble: Trouble = { kind: "cave-in", tier: "cart", startedAt: 0 };
    const plain = effectiveRates(crew, 0);
    const started = effectiveRates(crew, 0, trouble);
    expect(plain.crewPerSecond).toBe(369);
    expect(started.tierSpeed.cart).toBe(7.5);
    expect(started.tierSpeed.borer).toBe(plain.tierSpeed.borer);
    expect(started.awayPay).toBe(plain.awayPay);
    expect(started.crewPerSecond).toBe(366);
    expect(effectiveRates(crew, 60_000, trouble).tierSpeed.cart).toBe(6.25);
    expect(effectiveRates(crew, 120_000, trouble).tierSpeed.cart).toBe(5);
    expect(effectiveRates(crew, 180_000, trouble).tierSpeed.cart).toBe(5);
    expect(effectiveRates(crew, undefined, trouble).tierSpeed.cart).toBe(7.5);
  });

  it("Grandfather's pick makes taps a little stronger and leaves the crew alone", () => {
    const crew = {
      ...minedMountain(0),
      helpers: 9,
      carts: 1,
      borers: 1,
      kids: 0,
    };
    const plain = effectiveRates(crew);
    const picked = effectiveRates({ ...crew, finds: ["pick"] });
    expect(picked.tapYield).toBeGreaterThan(plain.tapYield);
    expect(picked.tapYield).toBe(Math.ceil(plain.tapYield * 1.25));
    expect(picked.crewPerSecond).toBe(plain.crewPerSecond);
    expect(picked.tierSpeed).toEqual(plain.tierSpeed);
    expect(picked.awayPay).toBe(plain.awayPay);
    expect(
      effectiveRates({ ...crew, finds: ["lamp", "map", "boots"] }).tapYield,
    ).toBe(plain.tapYield);
  });
});
