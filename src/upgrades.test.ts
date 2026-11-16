import { describe, expect, it } from "vitest";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";
import {
  buyUpgrade,
  parseUpgrades,
  synergyBonus,
  tierSynergy,
  upgradeById,
  upgradeCost,
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

describe("Work boots", () => {
  const base = {
    ...minedMountain(0),
    stock: { ...minedMountain(0).stock, stones: 20_000_000 },
  };

  it("unlocks from the crew at 10 helpers", () => {
    const boots = upgradeById("boots");
    expect(
      upgradeUnlocked({ ...base, owned: { ...base.owned, helper: 9 } }, boots),
    ).toBe(false);
    expect(
      upgradeUnlocked({ ...base, owned: { ...base.owned, helper: 10 } }, boots),
    ).toBe(true);
    // Locked: buying does nothing.
    expect(buyUpgrade(base, "boots")).toBe(base);
  });

  it("is a one-time buy", () => {
    const once = buyUpgrade(
      { ...base, owned: { ...base.owned, helper: 10 } },
      "boots",
    );
    expect(once.upgrades).toEqual({ ...NO_UPGRADES, boots: 1 });
    expect(once.stock.stones).toBe(
      20_000_000 - mustCost(upgradeCost(upgradeById("boots"), 0)),
    );
    expect(buyUpgrade(once, "boots")).toBe(once);
    expect(upgradeCost(upgradeById("boots"), 1)).toBeUndefined();
  });

  it("Work boots makes workers faster, and leaves the machines alone", () => {
    const crew = {
      ...base,
      owned: { ...base.owned, helper: 15, cart: 2 },
      upgrades: { ...NO_UPGRADES, boots: 1 },
    };
    const rates = effectiveRates(crew);
    expect(rates.tierSpeed.helper).toBeCloseTo(2.36);
    expect(rates.tierSpeed.cart).toBe(effectiveRates(base).tierSpeed.cart);
  });

  it("reads saved levels and rejects anything odd", () => {
    expect(parseUpgrades({})).toEqual(NO_UPGRADES);
    expect(parseUpgrades({ boots: 1 })).toEqual({ ...NO_UPGRADES, boots: 1 });
    for (const bad of [
      null,
      [],
      { boots: -1 },
      { boots: 0.5 },
      { boots: 2 },
      { boots: "1" },
      { wings: 1 },
    ]) {
      expect(parseUpgrades(bad)).toBeUndefined();
    }
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
    // Loading crews counts the workers on haulage (rule 2.9).
    const crew = {
      ...rich,
      owned: { ...rich.owned, helper: 21, cart: 10, drill: 4 },
      jobs: { ...rich.jobs, haulage: 20 },
    };
    const plain = effectiveRates(crew);
    expect(synergyBonus(crew, upgradeById("cartSyn"))).toBeCloseTo(0.2);
    expect(synergyBonus(crew, upgradeById("boots"))).toBe(0);
    expect(tierSynergy(crew, "cart")).toBe(0);
    const boosted = { ...crew, upgrades: { ...NO_UPGRADES, cartSyn: 1 } };
    expect(tierSynergy(boosted, "cart")).toBeCloseTo(0.2);
    const rates = effectiveRates(boosted);
    expect(rates.tierSpeed.cart).toBeCloseTo(plain.tierSpeed.cart * 1.2, 9);
    expect(rates.tierSpeed.drill).toBe(plain.tierSpeed.drill);
  });

  it("stacks with Work boots and other synergies", () => {
    const crew = {
      ...rich,
      owned: { ...rich.owned, helper: 40, cart: 10, drill: 10 },
      jobs: { ...rich.jobs, haulage: 20 },
    };
    const plain = effectiveRates(crew);
    const rates = effectiveRates({
      ...crew,
      upgrades: { ...NO_UPGRADES, boots: 1, cartSyn: 1, drillSyn: 1 },
    });
    expect(rates.tierSpeed.helper).toBeCloseTo(plain.tierSpeed.helper * 2.36);
    // Twenty on haulage: +20% on the carts.
    expect(rates.tierSpeed.cart).toBeCloseTo(plain.tierSpeed.cart * 1.2, 9);
    // Ten carts: +10% on the drills.
    expect(rates.tierSpeed.drill).toBeCloseTo(plain.tierSpeed.drill * 1.1, 9);
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
