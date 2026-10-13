import { describe, expect, it } from "vitest";
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
});
