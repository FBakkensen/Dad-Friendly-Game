import { EMPTY_STOCK } from "./stock";
import { NONE_OWNED, patched, type MountainPatch } from "./test-fixtures";
import { describe, expect, it } from "vitest";
import { NO_BOOSTS } from "./boosts";
import { formatCompact, formatCount } from "./format";
import { createMountain, type Mountain } from "./mountain";
import { oneOffStretch } from "./scale";
import { upgradeEffectLine, upgradeWhyLine } from "./screen-words";
import { upgradeRowView } from "./upgrade-rows";
import { UPGRADES, upgradeById, upgradeCost, NO_UPGRADES } from "./upgrades";
import { COLD_CLOCKS } from "./workshop";

const NOW = 1_700_000_000_000;
const arms = upgradeById("tap");
const boots = upgradeById("boots");

function mountainWith(fields: MountainPatch): Mountain {
  return patched(createMountain(), fields);
}

function nextUpgradeCost(
  mountain: Mountain,
  id: "tap" | "steady" | "cartSyn",
  level = 0,
): number {
  const cost = upgradeCost(upgradeById(id), level, oneOffStretch(mountain));
  if (cost === undefined) {
    throw new Error("maxed");
  }
  return cost;
}

describe("lasting upgrade rows", () => {
  it("a lasting upgrade", () => {
    const climbing = mountainWith({
      owned: { ...NONE_OWNED, cart: 3 },
      upgrades: { ...NO_UPGRADES, tap: 2 },
    });
    const cost = nextUpgradeCost(climbing, "tap", 2);
    const view = upgradeRowView(
      { ...climbing, stock: { ...climbing.stock, stones: cost } },
      NOW,
      arms,
    );
    expect(view).toMatchObject({
      name: "Strong arms",
      badge: "Lv 2/10",
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
        arms,
        { ...climbing, stock: { ...climbing.stock, stones: cost } },
        NOW,
      ),
    ]);
    expect(view.why).toBe(
      upgradeWhyLine(arms, {
        ...climbing,
        stock: { ...climbing.stock, stones: cost },
      }),
    );
    expect(view.aria).toBe(
      `Strong arms. ${view.info[0] ?? ""} Buy for ${formatCount(cost)} stone`,
    );

    const dear = upgradeRowView(
      { ...climbing, stock: { ...climbing.stock, stones: cost - 1 } },
      NOW,
      arms,
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

  it("every level bought still reads Owned, with its badge", () => {
    const maxed = upgradeRowView(
      mountainWith({
        upgrades: { ...NO_UPGRADES, tap: 10 },
        owned: { ...NONE_OWNED, cart: 3 },
      }),
      NOW,
      arms,
    );
    expect(maxed).toMatchObject({
      badge: "Lv 10/10",
      state: "owned",
      price: "Owned",
    });
  });

  it("hides an upgrade until its count opens it", () => {
    expect(upgradeRowView(createMountain(), NOW, arms).shown).toBe(false);
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
      upgrades: { ...NO_UPGRADES, tap: 2, boots: 1 },
      boosts: { ...NO_BOOSTS, overtime: NOW + 60_000 },
      finds: ["pick", "map"],
      seen: ["upgrade:tap"],
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
