import { EMPTY_STOCK } from "./stock";
import { NONE_OWNED, patched, type MountainPatch } from "./test-fixtures";
import { describe, expect, it } from "vitest";
import { formatCompact, formatCount } from "./format";
import { createMountain, type Mountain } from "./mountain";
import { upgradeEffectLine, upgradeWhyLine } from "./screen-words";
import { upgradeRowView } from "./upgrade-rows";
import { UPGRADES, upgradeById, upgradeCost, NO_UPGRADES } from "./upgrades";
import { COLD_CLOCKS } from "./workshop";

const NOW = 1_700_000_000_000;
const crews = upgradeById("cartSyn");
const boots = upgradeById("boots");

function mountainWith(fields: MountainPatch): Mountain {
  return patched(createMountain(), fields);
}

function firstUpgradeCost(id: "cartSyn"): number {
  const cost = upgradeCost(upgradeById(id), 0);
  if (cost === undefined) {
    throw new Error("maxed");
  }
  return cost;
}

describe("lasting upgrade rows", () => {
  it("a lasting upgrade", () => {
    const climbing = mountainWith({
      owned: { ...NONE_OWNED, cart: 5 },
    });
    const cost = firstUpgradeCost("cartSyn");
    const view = upgradeRowView(
      { ...climbing, stock: { ...climbing.stock, stones: cost } },
      NOW,
      crews,
    );
    expect(view).toMatchObject({
      name: "Loading crews",
      badge: "",
      need: "",
      gain: "",
      flag: [],
      state: "ready",
      lamp: "green",
      verb: "Buy",
      price: formatCompact(cost),
      dimTag: false,
      can: true,
      pick: false,
      shown: true,
    });
    expect(view.info).toEqual([
      upgradeEffectLine(
        crews,
        { ...climbing, stock: { ...climbing.stock, stones: cost } },
        NOW,
      ),
    ]);
    expect(view.why).toBe(
      upgradeWhyLine(crews, {
        ...climbing,
        stock: { ...climbing.stock, stones: cost },
      }),
    );
    expect(view.aria).toBe(
      `Loading crews. ${view.info[0] ?? ""} Buy for ${formatCount(cost)} stone`,
    );

    const dear = upgradeRowView(
      { ...climbing, stock: { ...climbing.stock, stones: cost - 1 } },
      NOW,
      crews,
    );
    expect(dear).toMatchObject({
      state: "dear",
      lamp: "off",
      dimTag: true,
      can: false,
      price: formatCompact(cost),
    });

    const bought = upgradeRowView(
      mountainWith({
        owned: { ...NONE_OWNED, helper: 10 },
        upgrades: { ...NO_UPGRADES, boots: 1 },
        stock: { stones: 1e15 },
      }),
      NOW,
      boots,
    );
    expect(bought).toMatchObject({
      name: "Work boots",
      badge: "",
      state: "owned",
      price: "Owned",
      dimTag: true,
      verb: "",
      lamp: "off",
      can: false,
      shown: true,
    });
    expect(bought.aria).toBe(`Work boots. ${bought.info[0] ?? ""} Owned`);
  });

  it("hides an upgrade until its count opens it", () => {
    expect(upgradeRowView(createMountain(), NOW, crews).shown).toBe(false);
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) {
      deepFreeze(inner);
    }
    Object.freeze(value);
  }
  return value;
}

describe("display only", () => {
  it("display only", () => {
    const fields: Partial<Mountain> = {
      owned: { ...NONE_OWNED, helper: 10, cart: 5, drill: 1 },
      stock: { ...EMPTY_STOCK, stones: 5_000_000 },
      upgrades: { ...NO_UPGRADES, cartSyn: 1, boots: 1 },
      finds: ["boots", "map"],
      seen: ["upgrade:drillSyn"],
      clocks: { ...COLD_CLOCKS, "axle-grease": NOW + 60_000 },
    };
    const mountain = deepFreeze(mountainWith(fields));
    const copy = structuredClone(mountainWith(fields));
    for (const upgrade of UPGRADES) {
      upgradeRowView(mountain, NOW, upgrade);
    }
    expect(mountain).toEqual(copy);
  });
});
