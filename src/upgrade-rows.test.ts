import { describe, expect, it } from "vitest";
import { boostById, boostCost, NO_BOOSTS } from "./boosts";
import { formatCompact, formatCount } from "./format";
import { LOST_TOOLS } from "./lost-tools";
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { oneOffStretch, stretch } from "./scale";
import {
  FOUND_LABEL,
  boostOutcome,
  formatClock,
  lostToolWords,
  upgradeEffectLine,
  upgradeWhyLine,
} from "./screen-words";
import {
  BOOST_WHY,
  anyUpgradeAffordable,
  boostInfo,
  boostRowView,
  newRowId,
  toolRowView,
  upgradeRowView,
} from "./upgrade-rows";
import { UPGRADES, upgradeById, upgradeCost, NO_UPGRADES } from "./upgrades";
import { COLD_CLOCKS } from "./workshop";

const NOW = 1_700_000_000_000;
const sharper = boostById("sharper");
const overtime = boostById("overtime");
const arms = upgradeById("tap");
const boots = upgradeById("boots");

function mountainWith(fields: Partial<Mountain>): Mountain {
  return { ...createMountain(), ...fields };
}

/** What a boost costs now: priced from the unboosted crew, as the buy is. */
function boostPrice(mountain: Mountain, id: "sharper" | "overtime"): number {
  return boostCost(boostById(id), effectiveRates(mountain), stretch(mountain));
}

function upgradePrice(
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

describe("boost rows", () => {
  it("a boost ready, dear and running", () => {
    const base = mountainWith({ carts: 1 });
    const cost = boostPrice(base, "sharper");

    const ready = boostRowView(
      { ...base, pocket: cost + 1 },
      NOW,
      sharper,
      false,
    );
    expect(ready).toMatchObject({
      name: "Sharper picks",
      badge: "",
      need: "",
      why: BOOST_WHY.sharper,
      flag: [],
      gain: "",
      state: "ready",
      lamp: "green",
      verb: "Buy",
      price: formatCompact(cost),
      dimTag: false,
      can: true,
      pick: false,
      shown: true,
    });
    expect(ready.info).toEqual([
      boostOutcome(
        "sharper",
        sharper.effect,
        sharper.multiplier,
        effectiveRates({ ...base, pocket: cost + 1 }, NOW),
        false,
      ),
    ]);
    expect(ready.aria).toBe(
      `Sharper picks. ${ready.info[0] ?? ""} Buy for ${formatCount(cost)} stones`,
    );

    const dear = boostRowView(
      { ...base, pocket: cost - 1 },
      NOW,
      sharper,
      false,
    );
    expect(dear).toMatchObject({
      state: "dear",
      lamp: "off",
      verb: "Buy",
      price: formatCompact(cost),
      dimTag: true,
      can: false,
    });

    const running = boostRowView(
      {
        ...base,
        pocket: cost * 10,
        boosts: { ...NO_BOOSTS, sharper: NOW + (4 * 60 + 12) * 1000 },
      },
      NOW,
      sharper,
      false,
    );
    expect(running).toMatchObject({
      state: "running",
      price: formatClock(252_000),
      verb: "Running",
      lamp: "off",
      dimTag: false,
      can: false,
    });
    expect(running.price).toBe("4:12");
    expect(running.aria).toBe(
      `Sharper picks. ${running.info[0] ?? ""} Running, 4:12 left`,
    );
    // Running, the line shows the taps he has, not ×2 again.
    expect(running.info).toEqual([
      boostOutcome(
        "sharper",
        sharper.effect,
        sharper.multiplier,
        effectiveRates(
          { ...base, boosts: { ...NO_BOOSTS, sharper: NOW + 252_000 } },
          NOW,
        ),
        true,
      ),
    ]);
  });

  it("shows a boost only from its first machine", () => {
    expect(boostRowView(createMountain(), NOW, sharper, false).shown).toBe(
      false,
    );
    expect(
      boostRowView(mountainWith({ carts: 1 }), NOW, overtime, false).shown,
    ).toBe(false);
    expect(
      boostRowView(mountainWith({ drills: 1 }), NOW, overtime, false).shown,
    ).toBe(true);
  });

  it("Overtime names the crew it would really have", () => {
    // Axle grease already runs the crew at ×2. Overtime would not make it ×4.
    const greased = mountainWith({
      helpers: 4,
      carts: 3,
      drills: 1,
      clocks: { ...COLD_CLOCKS, "axle-grease": NOW + 12 * 60_000 },
    });
    const would = effectiveRates(
      {
        ...greased,
        boosts: { ...NO_BOOSTS, overtime: NOW + overtime.durationMs },
      },
      NOW,
    );
    const expected = boostOutcome(
      "overtime",
      overtime.effect,
      overtime.multiplier,
      would,
      true,
    );
    const view = boostRowView(greased, NOW, overtime, false);
    expect(view.info).toEqual([expected]);
    expect(boostInfo(greased, NOW, overtime)).toBe(expected);
    const live = effectiveRates(greased, NOW);
    expect(view.info[0]).toBe(
      `${overtime.effect} ${formatCompact(live.crewPerSecond)}/s.`,
    );
    expect(view.info[0]).not.toBe(
      `${overtime.effect} ${formatCompact(live.crewPerSecond * 2)}/s.`,
    );

    // While it runs, the line reads the crew as it is.
    const running = {
      ...greased,
      boosts: { ...NO_BOOSTS, overtime: NOW + 60_000 },
    };
    expect(boostRowView(running, NOW, overtime, false).info).toEqual([
      boostOutcome(
        "overtime",
        overtime.effect,
        overtime.multiplier,
        effectiveRates(running, NOW),
        true,
      ),
    ]);
  });
});

describe("lasting upgrade rows", () => {
  it("a lasting upgrade", () => {
    const climbing = mountainWith({
      carts: 3,
      upgrades: { ...NO_UPGRADES, tap: 2 },
    });
    const cost = upgradePrice(climbing, "tap", 2);
    const view = upgradeRowView(
      { ...climbing, pocket: cost },
      NOW,
      arms,
      false,
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
      upgradeEffectLine(arms, { ...climbing, pocket: cost }, NOW),
    ]);
    expect(view.why).toBe(
      upgradeWhyLine(arms, { ...climbing, pocket: cost }, NOW),
    );
    expect(view.aria).toBe(
      `Strong arms. ${view.info[0] ?? ""} Buy for ${formatCount(cost)} stones`,
    );

    const dear = upgradeRowView(
      { ...climbing, pocket: cost - 1 },
      NOW,
      arms,
      false,
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
        helpers: 10,
        upgrades: { ...NO_UPGRADES, boots: 1 },
        pocket: 1e15,
      }),
      NOW,
      boots,
      false,
    );
    expect(bought).toMatchObject({
      name: "Better boots",
      badge: "",
      state: "owned",
      price: "Owned",
      dimTag: true,
      verb: "",
      lamp: "off",
      can: false,
      shown: true,
    });
    expect(bought.aria).toBe(`Better boots. ${bought.info[0] ?? ""} Owned`);
  });

  it("every level bought still reads Owned, with its badge", () => {
    const maxed = upgradeRowView(
      mountainWith({ carts: 3, upgrades: { ...NO_UPGRADES, tap: 10 } }),
      NOW,
      arms,
      false,
    );
    expect(maxed).toMatchObject({
      badge: "Lv 10/10",
      state: "owned",
      price: "Owned",
    });
  });

  it("hides an upgrade until its count opens it", () => {
    expect(upgradeRowView(createMountain(), NOW, arms, false).shown).toBe(
      false,
    );
  });
});

describe("found tools", () => {
  it("found tools", () => {
    const found = toolRowView(mountainWith({ finds: ["pick"] }), "pick");
    const words = lostToolWords("pick");
    expect(found).toEqual({
      name: words.name,
      badge: "",
      info: [words.line],
      need: "",
      why: "",
      flag: [],
      gain: "",
      price: FOUND_LABEL,
      dimTag: false,
      verb: "",
      lamp: "off",
      state: "found",
      pick: false,
      can: false,
      aria: `${words.name}. ${words.line} ${FOUND_LABEL}`,
      shown: true,
    });
    expect(found.price).toBe("Found");
    for (const id of LOST_TOOLS) {
      expect(toolRowView(createMountain(), id).shown).toBe(false);
    }
  });
});

describe("the New row", () => {
  it("the New row", () => {
    // Strong arms and boots bought; Steady hands (dear) comes before
    // Helping hands (cheaper). Sharper picks is used, so it has no dot.
    const open = mountainWith({
      helpers: 10,
      carts: 5,
      upgrades: { ...NO_UPGRADES, tap: 1, boots: 1 },
      boosts: { ...NO_BOOSTS, sharper: 1 },
    });
    const steady = upgradePrice(open, "steady");
    const helping = upgradePrice(open, "cartSyn");
    expect(helping).toBeLessThan(steady);

    expect(newRowId({ ...open, pocket: helping }, NOW)).toBe("upgrade:cartSyn");
    expect(newRowId({ ...open, pocket: 0 }, NOW)).toBe("upgrade:steady");
    // A fresh mountain has no dotted row.
    expect(newRowId(createMountain(), NOW)).toBeUndefined();

    // A dotted boost he can afford leads over every upgrade.
    const boostFirst = mountainWith({ carts: 3, pocket: 1e9 });
    expect(newRowId(boostFirst, NOW)).toBe("boost:sharper");

    expect(boostRowView(open, NOW, sharper, true).flag).toEqual(["New"]);
    const steadyRow = UPGRADES.find((upgrade) => upgrade.id === "steady");
    if (steadyRow === undefined) {
      throw new Error("no steady");
    }
    expect(upgradeRowView(open, NOW, steadyRow, true).flag).toEqual(["New"]);
    expect(upgradeRowView(open, NOW, steadyRow, false).flag).toEqual([]);
  });
});

describe("the Upgrades key's glow", () => {
  it("anything affordable", () => {
    const base = mountainWith({ carts: 1 });
    const cost = boostPrice(base, "sharper");
    expect(anyUpgradeAffordable({ ...base, pocket: cost }, NOW)).toBe(true);
    expect(anyUpgradeAffordable({ ...base, pocket: 0 }, NOW)).toBe(false);
    // Sharper picks is running; nothing else is open or affordable.
    expect(
      anyUpgradeAffordable(
        {
          ...base,
          pocket: cost,
          boosts: { ...NO_BOOSTS, sharper: NOW + 60_000 },
        },
        NOW,
      ),
    ).toBe(false);
    // A boost not shown yet does not count, however full the pocket.
    expect(
      anyUpgradeAffordable({ ...createMountain(), pocket: 1e6 }, NOW),
    ).toBe(false);
    // An affordable shown upgrade counts.
    const arms3 = mountainWith({
      carts: 3,
      boosts: { ...NO_BOOSTS, sharper: NOW + 60_000 },
    });
    expect(
      anyUpgradeAffordable(
        { ...arms3, pocket: upgradePrice(arms3, "tap") },
        NOW,
      ),
    ).toBe(true);
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
      helpers: 10,
      carts: 5,
      drills: 1,
      pocket: 5_000_000,
      upgrades: { ...NO_UPGRADES, tap: 2, boots: 1 },
      boosts: { ...NO_BOOSTS, overtime: NOW + 60_000 },
      finds: ["pick", "map"],
      seen: ["upgrade:tap"],
      clocks: { ...COLD_CLOCKS, "axle-grease": NOW + 60_000 },
    };
    const mountain = deepFreeze(mountainWith(fields));
    const copy = structuredClone(mountainWith(fields));
    for (const boost of [sharper, overtime]) {
      boostRowView(mountain, NOW, boost, true);
    }
    for (const upgrade of UPGRADES) {
      upgradeRowView(mountain, NOW, upgrade, false);
    }
    for (const id of LOST_TOOLS) {
      toolRowView(mountain, id);
    }
    newRowId(mountain, NOW);
    anyUpgradeAffordable(mountain, NOW);
    expect(mountain).toEqual(copy);
  });
});
