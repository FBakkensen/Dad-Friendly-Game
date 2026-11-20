import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import {
  BLUEPRINT_IDS,
  ORDER_IDS,
  IDLE_STATION,
  MATERIAL_HOLDS,
  blueprintOpen,
  cancelWorkOrder,
  installWorkOrder,
  installable,
  loadOf,
  loadStation,
  loadable,
  placeWorkOrder,
  requiredLoads,
  stationOpen,
  stillToArrive,
  withMaterials,
  workOrderPrice,
  type Station,
} from "./factory";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { EMPTY_STOCK, type Stock } from "./stock";
import { AXLE_MS, CHARGE_MS, recipeById, RECIPE_IDS } from "./workshop";

/**
 * The factory (slice 1, rule 7.13, #674): one station, one work order, no
 * clock. Off in play: it opens with the shaft, behind part 3's switch.
 */
const partThree = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0 }, body);

/** A fresh mine with the shaft sunk, this stock and this station. */
function sunk(
  stock: Partial<Stock> = {},
  station: Station = IDLE_STATION,
): Mountain {
  return {
    ...createMountain(),
    operational: ["lightTower"],
    stock: { ...EMPTY_STOCK, ...stock },
    mineLevels: {
      granite: {
        machines: NO_LEVEL_MACHINES,
        piles: NO_GRANITE_PILES,
      },
    },
    station,
  };
}

const delivering = (
  blueprint: (typeof BLUEPRINT_IDS)[number],
  arrived: Partial<Stock> = {},
): Station => ({
  kind: "delivering",
  blueprint,
  arrived: { ...EMPTY_STOCK, ...arrived },
});

describe("the blueprints (#674)", () => {
  it("are the recipes whose materials an open level gives: clay and iron, no crystal or heartstone", () => {
    expect(BLUEPRINT_IDS).toEqual([
      "iron-rails",
      "sturdy-props",
      "blasting-charge",
      "reinforce",
      "axle-grease",
    ]);
    for (const id of RECIPE_IDS) {
      const materials = Object.keys(recipeById(id).materials);
      const open = materials.every((m) => m === "clay" || m === "iron");
      expect((BLUEPRINT_IDS as readonly string[]).includes(id), id).toBe(
        open && id !== "engineers-kit",
      );
    }
  });

  it("require stone as the lab sized it, and today's materials", () => {
    expect(workOrderPrice("iron-rails")).toEqual([
      { good: "stones", amount: 250_000 },
      { good: "iron", amount: 4 },
    ]);
    expect(workOrderPrice("sturdy-props")).toEqual([
      { good: "stones", amount: 250_000 },
      { good: "clay", amount: 10 },
      { good: "iron", amount: 4 },
    ]);
    expect(workOrderPrice("blasting-charge")).toEqual([
      { good: "stones", amount: 50_000 },
      { good: "clay", amount: 4 },
    ]);
    expect(workOrderPrice("reinforce")).toEqual([{ good: "iron", amount: 5 }]);
    expect(workOrderPrice("axle-grease")).toEqual([
      { good: "iron", amount: 1 },
    ]);
  });

  it("scale with the recipe's cost factor", () => {
    withFactors({ "recipe.iron-rails.cost": 2 }, () => {
      expect(workOrderPrice("iron-rails")).toEqual([
        { good: "stones", amount: 500_000 },
        { good: "iron", amount: 8 },
      ]);
    });
  });

  it("count one clay or one iron as 500 stone of a load", () => {
    expect(loadOf("clay")).toBe(500);
    expect(loadOf("iron")).toBe(500);
    expect(loadOf("stones")).toBe(1);
    expect(loadOf("brick")).toBe(1);
    expect(requiredLoads("sturdy-props")).toEqual({
      ...EMPTY_STOCK,
      stones: 250_000,
      clay: 5_000,
      iron: 2_000,
    });
  });
});

describe("the station opens with the shaft (#674)", () => {
  it("is closed with part 3 off, and before the shaft", () => {
    partTwo(() => {
      expect(stationOpen(sunk())).toBe(false);
    });
    partThree(() => {
      expect(stationOpen(createMountain())).toBe(false);
      expect(stationOpen(sunk())).toBe(true);
    });
  });

  it("places no work order while closed, nor a gear at its last level", () => {
    partTwo(() => {
      const closed = sunk();
      expect(placeWorkOrder(closed, "iron-rails")).toBe(closed);
    });
    partThree(() => {
      const railed = {
        ...sunk(),
        crafted: { ...sunk().crafted, "iron-rails": 2 },
      };
      expect(blueprintOpen(railed, "iron-rails")).toBe(false);
      expect(placeWorkOrder(railed, "iron-rails")).toBe(railed);
      expect(blueprintOpen(railed, "reinforce")).toBe(true);
    });
  });

  it("places no sturdy props: trouble is out of the game (16 Nov 2026)", () => {
    partThree(() => {
      const open = sunk();
      expect(blueprintOpen(open, "sturdy-props")).toBe(false);
      expect(placeWorkOrder(open, "sturdy-props")).toBe(open);
      expect(ORDER_IDS).not.toContain("sturdy-props");
    });
  });

  it("places no work order for the gear the bench is taking to its last level", () => {
    partThree(() => {
      const bench = {
        recipe: "sturdy-props",
        startedAt: 0,
        endsAt: 1,
      } as const;
      const benched = { ...sunk(), bench };
      expect(blueprintOpen(benched, "sturdy-props")).toBe(false);
      expect(blueprintOpen(benched, "iron-rails")).toBe(true);
      const rails = {
        ...sunk(),
        bench: { ...bench, recipe: "iron-rails" },
      } as const;
      expect(blueprintOpen(rails, "iron-rails")).toBe(true);
    });
  });
});

describe("a work order (#674)", () => {
  it("is placed on an idle station for nothing, and one at a time", () => {
    partThree(() => {
      const before = sunk({ stones: 1_000 });
      const placed = placeWorkOrder(before, "iron-rails");
      expect(placed.station).toEqual(delivering("iron-rails"));
      expect(placed.stock).toEqual(before.stock);
      expect(placeWorkOrder(placed, "reinforce")).toBe(placed);
      const done = {
        ...before,
        station: { kind: "done", blueprint: "reinforce" } as const,
      };
      expect(placeWorkOrder(done, "iron-rails")).toBe(done);
    });
  });

  it("still requires what has not arrived, in loads", () => {
    expect(
      stillToArrive(delivering("iron-rails", { stones: 1_000, iron: 600 })),
    ).toEqual({ ...EMPTY_STOCK, stones: 249_000, iron: 1_400 });
    expect(stillToArrive(IDLE_STATION)).toEqual(EMPTY_STOCK);
  });

  it("can take what the stockpiles hold, and the rest of a part-carried good", () => {
    const mountain = sunk(
      { stones: 100, iron: 1 },
      delivering("iron-rails", { iron: 600 }),
    );
    // Two irons have left the stockyard for 600 loads: 400 loads of the
    // second are still to carry, and one more iron is in stock.
    expect(loadable(mountain)).toEqual({ stones: 100, iron: 900 });
    expect(loadable(sunk({ stones: 100 }))).toEqual({});
  });

  it("carries whole loads, split evenly, and takes a good from the stockpile when its first load goes", () => {
    const mountain = sunk(
      { stones: 1_000_000, iron: 4 },
      delivering("iron-rails"),
    );
    const once = loadStation(mountain, 300);
    expect(once.used).toBe(300);
    expect(once.mountain.station).toEqual(
      delivering("iron-rails", { stones: 150, iron: 150 }),
    );
    expect(once.mountain.stock.stones).toBe(1_000_000 - 150);
    // The first iron left the stockyard whole.
    expect(once.mountain.stock.iron).toBe(3);
    const again = loadStation(once.mountain, 800);
    expect(again.mountain.station).toEqual(
      delivering("iron-rails", { stones: 550, iron: 550 }),
    );
    expect(again.mountain.stock.iron).toBe(2);
  });

  it("gives what one good cannot take to the others, and carries nothing it does not need", () => {
    const short = sunk({ stones: 1_000_000 }, delivering("iron-rails"));
    const carried = loadStation(short, 1_000);
    // No iron in stock: all the load is stone.
    expect(carried.mountain.station).toEqual(
      delivering("iron-rails", { stones: 1_000 }),
    );
    expect(loadStation(sunk({}, delivering("iron-rails")), 1_000)).toEqual({
      mountain: sunk({}, delivering("iron-rails")),
      used: 0,
    });
  });

  it("is done when everything it requires has arrived, with no builders and no clock", () => {
    const mountain = sunk(
      { stones: 10, iron: 3 },
      delivering("axle-grease", { iron: 400 }),
    );
    const carried = loadStation(mountain, 1_000);
    expect(carried.used).toBe(100);
    expect(carried.mountain.station).toEqual({
      kind: "done",
      blueprint: "axle-grease",
    });
    // The iron was taken when its first load went.
    expect(carried.mountain.stock).toEqual(mountain.stock);
  });

  it("gives back, when cancelled, every good that left the stockyard for it", () => {
    const placed = sunk({ stones: 10_000, iron: 4 }, delivering("iron-rails"));
    const carried = loadStation(placed, 2_001).mountain;
    const cancelled = cancelWorkOrder(carried);
    expect(cancelled.station).toEqual(IDLE_STATION);
    expect(cancelled.stock).toEqual(placed.stock);
    const done = sunk({}, { kind: "done", blueprint: "reinforce" });
    expect(cancelWorkOrder(done).stock.iron).toBe(5);
    const idle = sunk();
    expect(cancelWorkOrder(idle)).toBe(idle);
  });
});

describe("installing a work order (#674)", () => {
  it("raises its gear's level and frees the station", () => {
    const done = sunk({}, { kind: "done", blueprint: "iron-rails" });
    const installed = installWorkOrder(done, 5_000);
    expect(installed.crafted["iron-rails"]).toBe(1);
    expect(installed.station).toEqual(IDLE_STATION);
  });

  it("starts a live timer when he installs it, not when it arrived", () => {
    const charge = sunk({}, { kind: "done", blueprint: "blasting-charge" });
    expect(installWorkOrder(charge, 9_000).clocks["blasting-charge"]).toBe(
      9_000 + CHARGE_MS,
    );
    const grease = sunk({}, { kind: "done", blueprint: "axle-grease" });
    expect(installWorkOrder(grease, 9_000).clocks["axle-grease"]).toBe(
      9_000 + AXLE_MS,
    );
  });

  it("installs nothing on gear the bench took to its last level meanwhile, and cancel gives it back", () => {
    const capped = {
      ...sunk({}, { kind: "done", blueprint: "sturdy-props" }),
      crafted: { ...sunk().crafted, "sturdy-props": 1 },
    };
    expect(installable(capped)).toBe(false);
    expect(installWorkOrder(capped, 1)).toBe(capped);
    expect(cancelWorkOrder(capped).stock.stones).toBe(250_000);
    expect(
      installable(sunk({}, { kind: "done", blueprint: "sturdy-props" })),
    ).toBe(true);
    expect(installable(sunk())).toBe(false);
    // A props craft still on the bench takes them to their last level too.
    const benched = {
      ...sunk({}, { kind: "done", blueprint: "sturdy-props" }),
      bench: { recipe: "sturdy-props", startedAt: 0, endsAt: 1 },
    } as const;
    expect(installable(benched)).toBe(false);
    expect(installWorkOrder(benched, 1)).toBe(benched);
  });

  it("installs only a done work order, at a real moment", () => {
    const busy = sunk({}, delivering("iron-rails"));
    expect(installWorkOrder(busy, 1)).toBe(busy);
    const done = sunk({}, { kind: "done", blueprint: "iron-rails" });
    expect(installWorkOrder(done, Number.NaN)).toBe(done);
    expect(installWorkOrder(done, -1)).toBe(done);
  });
});

describe("clay and iron from the drilled rock (rule 5.13, #674)", () => {
  const drilled = (
    mountain: Mountain,
    topsoil: number,
    granite: number,
  ): Mountain => ({
    ...mountain,
    rockDug: mountain.rockDug + topsoil + granite,
    graniteDug: mountain.graniteDug + granite,
  });

  it("gives a clay for each 1M rock drilled on the Topsoil and an iron for each 1M on the Granite", () => {
    partThree(() => {
      const before = { ...sunk(), rockDug: 900_000 };
      const after = drilled(before, 2_200_000, 1_000_000);
      const gained = withMaterials(before, after);
      // 0.9M to 3.1M on the Topsoil crosses 1M, 2M and 3M.
      expect(gained.stock.clay).toBe(3);
      expect(gained.stock.iron).toBe(1);
    });
  });

  it("carries the remainder from one stretch to the next", () => {
    partThree(() => {
      let mountain = sunk();
      let clay = 0;
      for (let step = 0; step < 10; step += 1) {
        const next = drilled(mountain, 300_000, 0);
        mountain = withMaterials(mountain, next);
        clay = mountain.stock.clay;
      }
      expect(clay).toBe(3);
    });
  });

  it("holds 10 clay and 35 iron, and refills up to that", () => {
    partThree(() => {
      const full = sunk({ clay: 9, iron: 35 });
      const after = withMaterials(full, drilled(full, 5_000_000, 5_000_000));
      expect(after.stock.clay).toBe(MATERIAL_HOLDS.clay);
      expect(after.stock.iron).toBe(MATERIAL_HOLDS.iron);
      const over = sunk({ clay: 12 });
      expect(withMaterials(over, drilled(over, 1_000_000, 0)).stock.clay).toBe(
        12,
      );
    });
  });

  it("gives nothing before the shaft, or with part 3 off", () => {
    partThree(() => {
      const before = createMountain();
      const after = { ...before, rockDug: 5_000_000 };
      expect(withMaterials(before, after)).toBe(after);
    });
    partTwo(() => {
      const before = sunk();
      const after = drilled(before, 5_000_000, 5_000_000);
      expect(withMaterials(before, after)).toBe(after);
    });
  });
});
