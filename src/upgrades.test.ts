import { BAND_SCALE } from "./scale";
import { describe, expect, it } from "vitest";
import { accrue, accrueAway, mineByHand, stonesPerSecond } from "./mountain";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import {
  buyUpgrade,
  parseUpgrades,
  synergyBonus,
  tierSynergy,
  upgradeById,
  upgradeCost,
  upgradeLevel,
  upgradeUnlocked,
  NO_UPGRADES,
} from "./upgrades";

/** A price that must exist: the upgrade is not maxed. */
function mustCost(price: number | undefined): number {
  if (price === undefined) {
    throw new Error("expected a price");
  }
  return price;
}

const crew = {
  ...minedMountain(0),
  owned: { ...minedMountain(0).owned, helper: 500 },
}; // 500 workers, x8 at the 100 mark: 4,000 a second

describe("Strong arms (tap power)", () => {
  const arms = upgradeById("tap");

  // The price and growth are pinned in src/tuning.test.ts (#381).
  it("climbs its growth each level, up to level 10", () => {
    expect([0, 1, 2, 3].map((level) => upgradeCost(arms, level))).toEqual(
      [0, 1, 2, 3].map((level) =>
        Math.ceil(
          Number((arms.firstCost * arms.costGrowth ** level).toPrecision(12)),
        ),
      ),
    );
    expect(upgradeCost(arms, 9)).toBeDefined();
    expect(upgradeCost(arms, 10)).toBeUndefined();
  });

  it("buys one level at a time from the pocket", () => {
    // Strong arms opens with the third cart (#250).
    const shut = {
      ...crew,
      stock: { ...crew.stock, stones: 1e9 },
      owned: { ...crew.owned, cart: 2 },
    };
    expect(buyUpgrade(shut, "tap")).toBe(shut);
    const open = { ...crew, owned: { ...crew.owned, cart: 3 } };
    const first = mustCost(upgradeCost(arms, 0));
    const second = mustCost(upgradeCost(arms, 1));
    const poor = { ...open, stock: { ...open.stock, stones: first - 1 } };
    expect(buyUpgrade(poor, "tap")).toBe(poor);
    const one = buyUpgrade(
      { ...open, stock: { ...open.stock, stones: first + second } },
      "tap",
    );
    expect(upgradeLevel(one, "tap")).toBe(1);
    expect(one.stock.stones).toBe(second);
    const two = buyUpgrade(one, "tap");
    expect(upgradeLevel(two, "tap")).toBe(2);
    expect(two.stock.stones).toBe(0);
    const maxed = {
      ...crew,
      stock: { ...crew.stock, stones: 1e15 },
      upgrades: { ...NO_UPGRADES, tap: 10 },
    };
    expect(buyUpgrade(maxed, "tap")).toBe(maxed);
  });

  it("adds 1% of crew speed per level to every tap, rounded down", () => {
    expect(effectiveRates(crew).tapYield).toBe(1);
    expect(
      effectiveRates({ ...crew, upgrades: { ...NO_UPGRADES, tap: 1 } })
        .tapYield,
    ).toBe(67);
    expect(
      effectiveRates({ ...crew, upgrades: { ...NO_UPGRADES, tap: 3 } })
        .tapYield,
    ).toBe(199);
    const tapped = mineByHand({
      ...crew,
      upgrades: { ...NO_UPGRADES, tap: 3 },
    });
    expect(tapped.stock.stones).toBe(199);
    expect(tapped.remaining).toBe(crew.remaining - 199);
    // A tap never digs past the bottom.
    // One depth left in the Heart band is BAND_SCALE[3] stones, rounded up to
    // whole stones (#357: 32.4, so 33); a strong tap clears it whole.
    const last = mineByHand({
      ...crew,
      remaining: 1,
      upgrades: { ...NO_UPGRADES, tap: 5 },
    });
    expect(
      effectiveRates({ ...crew, upgrades: { ...NO_UPGRADES, tap: 5 } })
        .tapYield,
    ).toBeGreaterThanOrEqual(Math.ceil(BAND_SCALE[3]));
    expect(last.remaining).toBe(0);
    expect(last.stock.stones).toBe(
      crew.stock.stones + Math.ceil(BAND_SCALE[3]),
    );
  });

  it("doesn't change the crew's own speed or away pay", () => {
    const strong = { ...crew, upgrades: { ...NO_UPGRADES, tap: 5 } };
    expect(stonesPerSecond(strong)).toBe(4_000);
    expect(effectiveRates(strong).awayPay).toBe(effectiveRates(crew).awayPay);
  });

  it("reads saved levels and rejects anything odd", () => {
    expect(parseUpgrades({})).toEqual(NO_UPGRADES);
    expect(parseUpgrades({ tap: 3 })).toEqual({ ...NO_UPGRADES, tap: 3 });
    for (const bad of [
      null,
      [],
      { tap: -1 },
      { tap: 1.5 },
      { tap: 11 },
      { tap: "2" },
      { wings: 1 },
    ]) {
      expect(parseUpgrades(bad)).toBeUndefined();
    }
  });
});

describe("lasting upgrades: Work boots and Night foreman", () => {
  const base = {
    ...minedMountain(0),
    stock: { ...minedMountain(0).stock, stones: 20_000_000 },
  };

  it("unlock from the crew: boots at 10 helpers, Night foreman with a first cart", () => {
    const boots = upgradeById("boots");
    const steady = upgradeById("steady");
    expect(
      upgradeUnlocked({ ...base, owned: { ...base.owned, helper: 9 } }, boots),
    ).toBe(false);
    expect(
      upgradeUnlocked({ ...base, owned: { ...base.owned, helper: 10 } }, boots),
    ).toBe(true);
    expect(upgradeUnlocked(base, steady)).toBe(false);
    expect(
      upgradeUnlocked({ ...base, owned: { ...base.owned, cart: 1 } }, steady),
    ).toBe(true);
    // Locked: buying does nothing.
    expect(buyUpgrade(base, "boots")).toBe(base);
    expect(buyUpgrade(base, "steady")).toBe(base);
  });

  it("are one-time buys", () => {
    const once = buyUpgrade(
      { ...base, owned: { ...base.owned, helper: 10 } },
      "boots",
    );
    expect(once.upgrades).toEqual({ ...NO_UPGRADES, boots: 1 });
    expect(once.stock.stones).toBe(
      20_000_000 - mustCost(upgradeCost(upgradeById("boots"), 0)),
    );
    expect(buyUpgrade(once, "boots")).toBe(once);
    expect(upgradeCost(upgradeById("steady"), 1)).toBeUndefined();
  });

  it("Work boots makes helpers 10% faster, in whole stones a second", () => {
    const crew = {
      ...base,
      owned: { ...base.owned, helper: 15, cart: 2 },
      upgrades: { ...NO_UPGRADES, boots: 1 },
    };
    const rates = effectiveRates(crew);
    expect(rates.tierSpeed.helper).toBeCloseTo(2.36);
    expect(rates.tierSpeed.cart).toBe(effectiveRates(base).tierSpeed.cart);
    // 15 × 2.36 = 35.4 → 35, plus 2 carts.
    expect(rates.crewPerSecond).toBe(35 + 2 * rates.tierSpeed.cart);
    expect(
      effectiveRates({ ...crew, owned: { ...crew.owned, helper: 10 } })
        .crewPerSecond,
    ).toBe(23 + 2 * rates.tierSpeed.cart);
  });

  it("Night foreman pays time away 25% more, and live play is untouched", () => {
    const crew = { ...base, owned: { ...base.owned, helper: 100 } };
    const steady = { ...crew, upgrades: { ...NO_UPGRADES, steady: 1 } };
    expect(effectiveRates(steady).awayPay).toBeCloseTo(AWAY_PAY_RATE * 1.25);
    expect(
      accrueAway({ mountain: crew, lastSeen: 0, now: 100_000 }).mined,
    ).toBe(24_000);
    expect(
      accrueAway({ mountain: steady, lastSeen: 0, now: 100_000 }).mined,
    ).toBe(30_000);
    expect(
      accrue({ mountain: steady, from: 0, to: 100_000, live: true }).mined,
    ).toBe(80_000);
  });

  it("saves and reads all three, and rejects levels past the top", () => {
    expect(parseUpgrades({ tap: 3, boots: 1, steady: 1 })).toEqual({
      ...NO_UPGRADES,
      tap: 3,
      boots: 1,
      steady: 1,
    });
    expect(parseUpgrades({ boots: 2 })).toBeUndefined();
    expect(parseUpgrades({ steady: -1 })).toBeUndefined();
  });
});

describe("crew synergies", () => {
  const rich = {
    ...minedMountain(0),
    stock: { ...minedMountain(0).stock, stones: 90_000_000 },
  };

  it("are one-time buys, unlocked by owning enough of the boosted tier", () => {
    const helping = upgradeById("cartSyn");
    expect(helping.name).toBe("Loading crews");
    expect(
      upgradeUnlocked({ ...rich, owned: { ...rich.owned, cart: 4 } }, helping),
    ).toBe(false);
    expect(
      buyUpgrade({ ...rich, owned: { ...rich.owned, cart: 4 } }, "cartSyn")
        .upgrades,
    ).toEqual(NO_UPGRADES);
    const bought = buyUpgrade(
      { ...rich, owned: { ...rich.owned, cart: 5 } },
      "cartSyn",
    );
    expect(bought.upgrades).toEqual({ ...NO_UPGRADES, cartSyn: 1 });
    expect(bought.stock.stones).toBe(
      90_000_000 - mustCost(upgradeCost(upgradeById("cartSyn"), 0)),
    );
    expect(buyUpgrade(bought, "cartSyn")).toBe(bought);
    expect(
      ["drillSyn", "borerSyn", "machineSyn"].map((id) => {
        const upgrade = upgradeById(id as "drillSyn");
        // Their prices are pinned in src/tuning.test.ts.
        return [upgrade.unlock, upgrade.synergy];
      }),
    ).toEqual([
      [
        { tier: "drill", count: 5 },
        { from: "cart", to: "drill" },
      ],
      [
        { tier: "borer", count: 3 },
        { from: "drill", to: "borer" },
      ],
      [
        { tier: "machine", count: 1 },
        { from: "borer", to: "machine" },
      ],
    ]);
  });

  it("each unit of the tier below adds 1% to the boosted tier, only once bought", () => {
    const crew = {
      ...rich,
      owned: { ...rich.owned, helper: 20, cart: 10, drill: 4 },
    };
    expect(synergyBonus(crew, upgradeById("cartSyn"))).toBeCloseTo(0.2);
    expect(synergyBonus(crew, upgradeById("boots"))).toBe(0);
    expect(tierSynergy(crew, "cart")).toBe(0);
    const boosted = { ...crew, upgrades: { ...NO_UPGRADES, cartSyn: 1 } };
    expect(tierSynergy(boosted, "cart")).toBeCloseTo(0.2);
    const rates = effectiveRates(boosted);
    // Ten carts is the first mark, so the carts run twice as fast: 7.2 × 2.
    expect(rates.tierSpeed.cart).toBeCloseTo(14.4);
    expect(rates.tierSpeed.drill).toBe(36);
    // 4 drills take 4 workers, so all 10 carts run: 20 + 10×14.4 + 4×36.
    expect(rates.crewPerSecond).toBe(20 + 144 + 144);
    // Away pay uses the same rates.
    expect(
      accrueAway({ mountain: boosted, lastSeen: 0, now: 10_000 }).mined,
    ).toBe(924);
  });

  it("stacks with Work boots and other synergies", () => {
    const crew = {
      ...rich,
      // 40 workers staff 10 carts (10) and 10 drills (10), 20 spare.
      owned: { ...rich.owned, helper: 40, cart: 10, drill: 10 },
      upgrades: { ...NO_UPGRADES, boots: 1, cartSyn: 1, drillSyn: 1 },
    };
    const rates = effectiveRates(crew);
    // 40 workers, 10 carts and 10 drills each hold one ×2 mark.
    expect(rates.tierSpeed.helper).toBeCloseTo(4.72);
    expect(rates.tierSpeed.cart).toBeCloseTo(16.8);
    expect(rates.tierSpeed.drill).toBeCloseTo(79.2);
    expect(rates.crewPerSecond).toBe(188 + 168 + 792);
  });

  it("save and load", () => {
    expect(parseUpgrades({ cartSyn: 1, machineSyn: 1 })).toEqual({
      ...NO_UPGRADES,
      cartSyn: 1,
      machineSyn: 1,
    });
    expect(parseUpgrades({ cartSyn: 2 })).toBeUndefined();
  });
});
