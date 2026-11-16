import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SITE_HOLDS } from "./building-site";
import type { Project } from "./city";
import { withFactors } from "./economy/factors";
import {
  IDLE_STATION,
  loadOf,
  requiredLoads,
  type BlueprintId,
  type Station,
} from "./factory";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "./mine-levels";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { EMPTY_STOCK, GOOD_IDS, type Stock } from "./stock";
import {
  deliver,
  drawChange,
  orderNumbers,
  orderShares,
  stockDraw,
} from "./transport";

/**
 * The work order and the city's project share transport (slice 1, rules 7.7
 * and 7.13, #674): half each, what one cannot use to the other, and clay
 * and iron count as 500 stone of a load. With the station idle the city's
 * order is carried exactly as before.
 */
const partThree = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);

/** The Warehouse's foundation, delivering, with nothing arrived. */
const WAREHOUSE: Project = {
  kind: "delivering",
  site: {
    building: "warehouse",
    step: 0,
    arrived: EMPTY_STOCK,
    onSite: EMPTY_STOCK,
  },
};

const delivering = (
  blueprint: BlueprintId,
  arrived: Partial<Stock> = {},
): Station => ({
  kind: "delivering",
  blueprint,
  arrived: { ...EMPTY_STOCK, ...arrived },
});

/**
 * A mine with the shaft sunk and nobody drilling: `wagons` horse wagons with
 * a driver each (9 goods a second each), `builders` builders, this stock,
 * this project and this station.
 */
function yard({
  wagons = 40,
  builders = 1_000,
  stock = { stones: 50_000_000, brick: 5_000_000, clay: 10, iron: 35 },
  project = WAREHOUSE,
  station = IDLE_STATION,
}: {
  wagons?: number;
  builders?: number;
  stock?: Partial<Stock>;
  project?: Project;
  station?: Station;
}): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: wagons + builders },
    jobs: { ...start.jobs, drilling: 0, driving: wagons, building: builders },
    fleet: { ...start.fleet, horseWagon: wagons },
    stock: { ...EMPTY_STOCK, ...stock },
    operational: ["lightTower"],
    stockyard: 3,
    granite: {
      kind: "sunk",
      machines: NO_LEVEL_MACHINES,
      piles: NO_GRANITE_PILES,
    },
    project,
    station,
  };
}

/** Loads arrived at the station in all. */
function stationLoads(mountain: Mountain): number {
  const { station } = mountain;
  if (station.kind === "idle") {
    return 0;
  }
  const arrived =
    station.kind === "done"
      ? requiredLoads(station.blueprint)
      : station.arrived;
  return GOOD_IDS.reduce((sum, good) => sum + arrived[good], 0);
}

/** Goods arrived for the city's step in hand. */
function cityGoods(mountain: Mountain): number {
  const { project } = mountain;
  return project.kind === "unordered"
    ? 0
    : GOOD_IDS.reduce((sum, good) => sum + project.site.arrived[good], 0);
}

describe("transport split between the two orders (rule 7.7, #674)", () => {
  it("gives each half while both deliver", () => {
    partThree(() => {
      const both = yard({ station: delivering("iron-rails") });
      expect(orderShares(both, 1, {})).toEqual({ station: 180, city: 180 });
      const after = deliver(both, 10, 1);
      expect(stationLoads(after)).toBe(1_800);
      expect(cityGoods(after)).toBe(1_800);
    });
  });

  it("gives all of it to an order alone", () => {
    partThree(() => {
      const factory = yard({
        project: { kind: "unordered" },
        station: delivering("iron-rails"),
      });
      expect(orderShares(factory, 1, {})).toEqual({ station: 360, city: 0 });
      expect(stationLoads(deliver(factory, 10, 1))).toBe(3_600);
      const onHold = yard({
        project: { ...WAREHOUSE, kind: "onHold" },
        station: delivering("iron-rails"),
      });
      expect(orderShares(onHold, 1, {}).station).toBe(360);
      const city = yard({});
      expect(orderShares(city, 1, {})).toEqual({ station: 0, city: 360 });
    });
  });

  it("gives the station what the city cannot take once its site is full", () => {
    partThree(() => {
      // Ten builders build in 80 a second, and the site is full.
      const full: Project = {
        ...WAREHOUSE,
        site: {
          ...WAREHOUSE.site,
          arrived: { ...EMPTY_STOCK, stones: SITE_HOLDS },
          onSite: { ...EMPTY_STOCK, stones: SITE_HOLDS },
        },
      };
      const mountain = yard({
        builders: 10,
        project: full,
        station: delivering("iron-rails"),
      });
      expect(orderShares(mountain, 1, {})).toEqual({ station: 280, city: 80 });
    });
  });

  it("gives the city what the station cannot take: a material it waits for", () => {
    partThree(() => {
      // All the stone has arrived; the rails wait for iron, and none is in stock.
      const waiting = yard({
        stock: { stones: 50_000_000, brick: 5_000_000 },
        station: delivering("iron-rails", { stones: 250_000 }),
      });
      expect(orderShares(waiting, 1, {})).toEqual({ station: 0, city: 360 });
      const after = deliver(waiting, 10, 1);
      expect(after.station).toEqual(waiting.station);
      expect(cityGoods(after)).toBe(3_600);
    });
  });

  it("carries a clay or an iron as 500 stone of a load", () => {
    partThree(() => {
      const greased = yard({
        project: { kind: "unordered" },
        station: delivering("axle-grease"),
      });
      // 360 loads a second: the one iron's 500 take two seconds.
      const second = deliver(greased, 1, 1);
      expect(second.station).toEqual(delivering("axle-grease", { iron: 360 }));
      expect(second.stock.iron).toBe(34);
      expect(deliver(second, 1, 1).station).toEqual({
        kind: "done",
        blueprint: "axle-grease",
      });
    });
  });

  it("carries at the night shift output at night", () => {
    partThree(() => {
      const both = yard({ station: delivering("iron-rails") });
      const share = orderShares(both, 0.45, {});
      expect(share.station).toBeCloseTo(81, 9);
      expect(share.city).toBeCloseTo(81, 9);
    });
  });

  it("leaves the city's numbers as they were while the station is idle", () => {
    partThree(() => {
      const city = yard({});
      const withWork = yard({ station: delivering("iron-rails") });
      const alone = orderNumbers(city, 0);
      const shared = orderNumbers(withWork, 0);
      expect(alone.kind === "delivering" && alone.brings).toBe(360);
      expect(shared.kind === "delivering" && shared.brings).toBe(180);
    });
  });
});

describe("the stockpiles drain into both orders (#674)", () => {
  it("draws the station's goods beside the city's", () => {
    partThree(() => {
      const both = yard({ station: delivering("iron-rails") });
      const draw = stockDraw(both, 1, {});
      // The city: 180 split between stone and brick. The station: 180 loads
      // split between stone and iron, the iron's 90 loads a fifth... of a unit.
      expect(draw.stones).toBeCloseTo(90 + 90, 9);
      expect(draw.brick).toBeCloseTo(90, 9);
      expect(draw.iron).toBeCloseTo(90 / 500, 9);
      const alone = yard({});
      expect(stockDraw(alone, 1, {})).toEqual({ stones: 180, brick: 180 });
    });
  });

  it("splits a stretch where the work order's need is met", () => {
    partThree(() => {
      const nearly = yard({
        project: { kind: "unordered" },
        station: delivering("blasting-charge", {
          stones: 50_000 - 1_800,
          clay: 2_000,
        }),
      });
      // 360 a second, evenly on 1,800 stone and 0 more clay loads: 5 seconds.
      expect(drawChange(nearly, 1, { take: {}, income: {} })).toBeCloseTo(5, 9);
      expect(
        drawChange(yard({ project: { kind: "unordered" } }), 1, {
          take: {},
          income: {},
        }),
      ).toBe(Infinity);
    });
  });
});

describe("a work order over live play and a night (#674)", () => {
  it("is done when its goods have arrived, then waits for him to install it", () => {
    partThree(() => {
      const placed = yard({
        project: { kind: "unordered" },
        station: delivering("blasting-charge"),
      });
      // 52,000 loads at 360 a second: 145 seconds.
      const live = accrue({ mountain: placed, from: 0, to: 200_000 });
      expect(live.mountain.station).toEqual({
        kind: "done",
        blueprint: "blasting-charge",
      });
      expect(live.mountain.stock.stones).toBe(50_000_000 - 50_000);
      expect(live.mountain.stock.clay).toBe(6);
      expect(live.mountain.crafted["blasting-charge"]).toBe(0);
      const night = accrueAway({
        mountain: placed,
        lastSeen: 0,
        now: 8 * 3_600_000,
      });
      expect(night.mountain.station).toEqual({
        kind: "done",
        blueprint: "blasting-charge",
      });
      expect(night.mountain.clocks["blasting-charge"]).toBe(0);
    });
  });

  it("shares the night with the city's project", () => {
    partThree(() => {
      const both = yard({ station: delivering("iron-rails") });
      const night = accrueAway({ mountain: both, lastSeen: 0, now: 3_600_000 });
      expect(night.mountain.station).toEqual({
        kind: "done",
        blueprint: "iron-rails",
      });
      const alone = accrueAway({
        mountain: yard({}),
        lastSeen: 0,
        now: 3_600_000,
      });
      // The rails took 252,000 loads of the night from the Warehouse.
      expect(cityGoods(alone.mountain) - cityGoods(night.mountain)).toBe(
        252_000,
      );
    });
  });
});

describe("the night's report counts the clay and iron drilled (#674)", () => {
  it("shows them produced, and what the work order took of them delivered", () => {
    partThree(() => {
      const start = yard({
        project: { kind: "unordered" },
        station: delivering("axle-grease"),
        stock: { stones: 1_000_000, clay: 0, iron: 0 },
      });
      // Both levels a few rock short of their next 1M.
      const drilling: Mountain = {
        ...start,
        owned: { ...start.owned, helper: start.owned.helper + 12 },
        jobs: {
          ...start.jobs,
          drilling: 2,
          haulage: 2,
          graniteDrilling: 2,
          graniteHaulage: 2,
          hoisting: 4,
        },
        rockDug: 1_999_990,
        graniteDug: 999_995,
      };
      const night = accrueAway({
        mountain: drilling,
        lastSeen: 0,
        now: 3_600_000,
      });
      const facts = night.report.night;
      expect(facts.produced.clay).toBe(1);
      expect(facts.produced.iron).toBe(1);
      expect(facts.delivered.iron).toBe(1);
      expect(facts.delivered.clay).toBe(0);
      expect(night.mountain.stock).toMatchObject({ clay: 1, iron: 0 });
      expect(night.mountain.station).toEqual({
        kind: "done",
        blueprint: "axle-grease",
      });
    });
  });
});

describe("no good is lost or made between the stockyard and the orders (#674)", () => {
  it("holds for any fleet, stock and seconds", () => {
    partThree(() => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 60 }),
          fc.integer({ min: 0, max: 400_000 }),
          fc.integer({ min: 0, max: 12 }),
          fc.integer({ min: 0, max: 40 }),
          fc.constantFrom<BlueprintId>(
            "iron-rails",
            "sturdy-props",
            "blasting-charge",
            "reinforce",
            "axle-grease",
          ),
          fc.integer({ min: 1, max: 600 }),
          fc.boolean(),
          (wagons, stones, clay, iron, blueprint, seconds, city) => {
            const before = yard({
              wagons,
              stock: { stones, brick: 1_000_000, clay, iron },
              project: city ? WAREHOUSE : { kind: "unordered" },
              station: delivering(blueprint),
            });
            const after = deliver(before, seconds, 1);
            const required = requiredLoads(blueprint);
            const station = after.station;
            const arrived =
              station.kind === "delivering"
                ? station.arrived
                : station.kind === "done"
                  ? required
                  : EMPTY_STOCK;
            for (const good of GOOD_IDS) {
              expect(arrived[good]).toBeLessThanOrEqual(required[good]);
              const taken = Math.ceil(arrived[good] / loadOf(good));
              const toCity =
                after.project.kind === "unordered"
                  ? 0
                  : after.project.site.arrived[good];
              expect(after.stock[good] + taken + toCity).toBe(
                before.stock[good],
              );
            }
            const carried = stationLoads(after) + cityGoods(after);
            expect(carried).toBeLessThanOrEqual(wagons * 9 * seconds);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
