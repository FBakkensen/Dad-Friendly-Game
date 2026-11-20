import { describe, expect, it } from "vitest";
import { placeOrder } from "./city";
import { withFactors } from "./economy/factors";
import { workersView } from "./frame-view";
import { createMountain, type Mountain } from "./mountain";
import { crewedStart } from "./test-fixtures";
import { levels, partThree as granite } from "./part-three.harness";
import { makerPrice } from "./makers";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import {
  LINE_STANDS,
  NOTHING_TO_BUY,
  PRODUCTION_RUNS,
  nextView,
  siteCounts,
  siteLamp,
  siteOpen,
  stageCount,
  workforceCount,
} from "./next-view";

/** What Next and the lamps count (slice 1, #659). */
const fresh = <T>(body: () => T): T => withFactors({}, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0 }, body);

function withStones(mountain: Mountain, stones: number): Mountain {
  return { ...mountain, stock: { ...mountain.stock, stones } };
}

/** A fresh mine with the crew of 21, the Light Tower ordered and this many stones. */
function ordered(stones: number): Mountain {
  return withStones(placeOrder(crewedStart()), stones);
}

describe("next view", () => {
  it("points at the building nobody has ordered", () => {
    fresh(() => {
      const view = nextView(createMountain());
      expect(view).toEqual({
        kind: "order",
        head: "Next · City",
        line: "Order the Light Tower",
        ready: 1,
      });
    });
  });

  it("adds the order to what is affordable while nobody has ordered", () => {
    fresh(() => {
      const view = nextView(withStones(createMountain(), 1_000));
      expect(view.kind).toBe("order");
      // The cart (600) and the horse wagon (500), and the order.
      expect(view.ready).toBe(3);
    });
  });

  it("says nothing is affordable and the line runs, after the order", () => {
    fresh(() => {
      expect(nextView(ordered(0))).toEqual({
        kind: "nothing",
        line: NOTHING_TO_BUY,
        then: PRODUCTION_RUNS,
        ready: 0,
      });
    });
  });

  it("says the line stands when no stage moves rock (#703)", () => {
    fresh(() => {
      const start = ordered(0);
      // Nobody hoists, so rock moves into the piles until they are full.
      const short = { ...start, jobs: { ...start.jobs, hoisting: 0 } };
      expect(nextView(short)).toMatchObject({ then: PRODUCTION_RUNS });
      const stood = { ...short, piles: { face: 300, shaft: 300, kiln: 0 } };
      const view = nextView(stood);
      expect(view.kind === "nothing" && view.then).toBe(LINE_STANDS);
    });
  });

  it("says production runs while the lone worker drills (#703)", () => {
    fresh(() => {
      const view = nextView(placeOrder(createMountain()));
      expect(view).toMatchObject({ kind: "nothing", then: PRODUCTION_RUNS });
    });
  });

  it("counts each site's buys and never names them", () => {
    fresh(() => {
      const view = nextView(ordered(1_000));
      expect(view).toEqual({
        kind: "affordable",
        head: "Affordable now",
        counts: [
          { where: "mine", name: "Mine", count: 1 },
          { where: "city", name: "City", count: 1 },
        ],
        line: "Mine 1 · City 1",
        ready: 2,
      });
    });
  });

  it("does not count a worker: hiring is nearly always affordable", () => {
    fresh(() => {
      // A worker is 121; the cart 600 and the wagon 500 are not affordable.
      const mountain = ordered(400);
      expect(siteCounts(mountain)).toEqual({
        mine: 0,
        refinery: 0,
        factory: 0,
        city: 0,
      });
      expect(nextView(mountain).kind).toBe("nothing");
      expect(siteLamp(mountain, "mine")).toBe("dark");
      expect(siteLamp(mountain, "city")).not.toBe("green");
      expect(workersView(mountain).lamp).toBe(false);
    });
  });

  it("counts the worker's upgrades for the workforce, not the mine", () => {
    fresh(() => {
      const mountain = ordered(1_625_000);
      expect(workforceCount(mountain)).toBe(1);
      const view = nextView(mountain);
      expect(view.kind === "affordable" && view.line).toBe(
        "Mine 3 · City 1 · Workforce 1",
      );
      expect(view.ready).toBe(5);
    });
  });

  it("counts a machine upgrade once its row is shown", () => {
    fresh(() => {
      const start = ordered(2_000_000);
      const carts = { ...start, owned: { ...start.owned, cart: 5 } };
      expect(siteCounts(start).mine).toBe(3);
      expect(siteCounts(carts).mine).toBe(4);
    });
  });
});

describe("a stage's count", () => {
  it("counts its machine and the upgrades shown in its list, and the mine is their sum", () => {
    fresh(() => {
      const start = ordered(2_000_000);
      const carts = { ...start, owned: { ...start.owned, cart: 5 } };
      expect(stageCount(start, "haul")).toBe(1);
      expect(stageCount(carts, "haul")).toBe(2);
      expect(stageCount(carts, "face")).toBe(1);
      expect(stageCount(carts, "lift")).toBe(1);
      expect(siteCounts(carts).mine).toBe(
        stageCount(carts, "face") +
          stageCount(carts, "haul") +
          stageCount(carts, "lift"),
      );
    });
  });

  it("is 0 on a stage with nothing he can afford", () => {
    fresh(() => {
      const poor = ordered(0);
      expect(stageCount(poor, "face")).toBe(0);
      expect(stageCount(poor, "haul")).toBe(0);
      expect(stageCount(poor, "lift")).toBe(0);
    });
  });
});

describe("site lamps", () => {
  it("is green on a site with something affordable", () => {
    fresh(() => {
      const mountain = ordered(1_000);
      expect(siteLamp(mountain, "mine")).toBe("green");
      expect(siteLamp(mountain, "city")).toBe("green");
    });
  });

  it("is amber on the city while an order is delivering, and dark otherwise", () => {
    fresh(() => {
      expect(siteLamp(ordered(0), "city")).toBe("amber");
      expect(siteLamp(ordered(0), "mine")).toBe("dark");
      expect(siteLamp(createMountain(), "city")).toBe("dark");
    });
  });
});

describe("the refinery's site (#671)", () => {
  /** The Light Tower operational, nothing ordered, and this stock. */
  function lit(stones: number, brick = 0): Mountain {
    const start = crewedStart();
    return {
      ...start,
      operational: ["lightTower"],
      stock: { ...start.stock, stones, brick },
    };
  }

  it("opens with the Light Tower in part 2, and never in part 1", () => {
    fresh(() => {
      expect(siteOpen(lit(0), "refinery")).toBe(false);
      expect(siteOpen(lit(0), "mine")).toBe(true);
      expect(siteOpen(lit(0), "city")).toBe(true);
    });
    partTwo(() => {
      expect(siteOpen(crewedStart(), "refinery")).toBe(false);
      expect(siteOpen(lit(0), "refinery")).toBe(true);
    });
  });

  it("counts a kiln and a stockyard level he can afford", () => {
    partTwo(() => {
      // A kiln is 15,000 stone; a stockyard level 150K brick.
      expect(siteCounts(lit(14_000)).refinery).toBe(0);
      expect(siteCounts(lit(15_000)).refinery).toBe(1);
      expect(siteCounts(lit(15_000, 150_000)).refinery).toBe(2);
      expect(siteCounts(lit(0, 150_000)).refinery).toBe(1);
    });
  });

  it("counts a saw he can afford in the refinery (#754)", () => {
    granite(() => {
      const poor = levels({});
      const brick = makerPrice(poor, "saw")[0]?.amount ?? 0;
      const rich = levels({ stock: { brick } });
      expect(brick).toBeGreaterThan(0);
      expect(siteCounts(rich).refinery).toBe(siteCounts(poor).refinery + 1);
      // With the Granite shut, no saw is counted.
      const shut = levels({ sunk: false, stock: { brick } });
      expect(siteCounts(shut).refinery).toBe(
        siteCounts(levels({ sunk: false })).refinery,
      );
    });
  });

  it("takes its place on Next's line between the mine and the city", () => {
    partTwo(() => {
      const mountain = placeOrder(lit(15_000, 150_000));
      const view = nextView(mountain);
      expect(view.kind === "affordable" && view.line).toMatch(
        /^Mine \d+ · Refinery 2 · City \d+$/,
      );
    });
  });

  it("is never counted in part 1, where it has no tab", () => {
    fresh(() => {
      expect(siteCounts(lit(15_000, 150_000)).refinery).toBe(0);
    });
  });

  it("has a green lamp with something to afford, else dark", () => {
    partTwo(() => {
      expect(siteLamp(lit(15_000), "refinery")).toBe("green");
      const running = { ...lit(0), makers: { kiln: 1, saw: 0 } };
      expect(siteLamp(running, "refinery")).toBe("dark");
    });
  });
});

describe("Next's city count with trucks (#673)", () => {
  it("counts no truck with part 3 off, even rich with the Warehouse operational", () => {
    partTwo(() => {
      const start = createMountain();
      const rich: Mountain = {
        ...start,
        operational: ["lightTower", "warehouse"],
        stock: { ...start.stock, stones: 0, brick: 10_000_000 },
      };
      expect(siteCounts(rich).city).toBe(0);
    });
  });

  it("counts a truck he can pay for once part 3 plays", () => {
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, () => {
      const start = createMountain();
      const rich: Mountain = {
        ...start,
        operational: ["lightTower", "warehouse"],
        stock: { ...start.stock, stones: 0, brick: 10_000_000 },
      };
      expect(siteCounts(rich).city).toBe(1);
    });
  });
});

describe("the factory's site (#681)", () => {
  const partThree = <T>(body: () => T): T =>
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);

  /** The Light Tower and the Warehouse up, the shaft sunk or not, and this station. */
  function sunk(
    station: Mountain["station"] = { kind: "idle" },
    shaft = true,
  ): Mountain {
    const start = crewedStart();
    return {
      ...start,
      operational: ["lightTower", "warehouse"],
      mineLevels: shaft
        ? {
            granite: {
              machines: { cart: 0, drill: 0, borer: 0, train: 0 },
              piles: { face: 0, shaft: 0, saw: 0 },
            },
          }
        : {},
      project: placeOrder(start).project,
      station,
    };
  }

  it("opens with the shaft in part 3, and never with part 3 off", () => {
    partThree(() => {
      expect(siteOpen(sunk(), "factory")).toBe(true);
      expect(siteOpen(sunk({ kind: "idle" }, false), "factory")).toBe(false);
    });
    partTwo(() => {
      expect(siteOpen(sunk(), "factory")).toBe(false);
    });
  });

  it("counts nothing: a work order costs nothing to place", () => {
    partThree(() => {
      const rich = {
        ...sunk(),
        stock: { ...sunk().stock, stones: 1e9, clay: 10, iron: 35 },
      };
      expect(siteCounts(rich).factory).toBe(0);
    });
  });

  it("is amber while a work order is delivering, green while one waits to be installed", () => {
    partThree(() => {
      const arrived = sunk().stock;
      expect(
        siteLamp(
          sunk({ kind: "delivering", blueprint: "reinforce", arrived }),
          "factory",
        ),
      ).toBe("amber");
      expect(
        siteLamp(sunk({ kind: "done", blueprint: "reinforce" }), "factory"),
      ).toBe("green");
      expect(siteLamp(sunk(), "factory")).toBe("dark");
    });
  });

  it("is dark for a done work order that can no longer be installed, as Next and Install say", () => {
    partThree(() => {
      const done = sunk({ kind: "done", blueprint: "sturdy-props" });
      const full = {
        ...done,
        crafted: { ...done.crafted, "sturdy-props": 1 },
      };
      expect(siteLamp(full, "factory")).toBe("dark");
      expect(nextView(full).kind).not.toBe("install");
    });
  });

  it("has Next point at a work order that waits to be installed", () => {
    partThree(() => {
      const view = nextView(sunk({ kind: "done", blueprint: "iron-rails" }));
      expect(view).toMatchObject({
        kind: "install",
        head: "Next · Factory",
        line: "Install iron rails",
      });
    });
  });

  it("puts a building nobody has ordered first", () => {
    partThree(() => {
      const done = sunk({ kind: "done", blueprint: "iron-rails" });
      // The Warehouse is next once only the Light Tower stands.
      const view = nextView({
        ...done,
        operational: ["lightTower"],
        project: { kind: "unordered" },
      });
      expect(view.kind).toBe("order");
    });
  });
});

describe("a stage's count in part 3 (#680)", () => {
  /** The shaft sunk, so the borer and the locomotive are on sale, with this stock. */
  function granite(cutStone: number): Mountain {
    const start = crewedStart();
    return {
      ...start,
      operational: ["lightTower", "warehouse"],
      mineLevels: {
        granite: {
          machines: { cart: 0, drill: 0, borer: 0, train: 0 },
          piles: { face: 0, shaft: 0, saw: 0 },
        },
      },
      stock: { ...start.stock, stones: 1_000_000_000, cutStone },
    };
  }

  it("weighs the borer and the locomotive against the cut stone they are paid in, not the stones", () => {
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, () => {
      expect(stageCount(granite(40_000), "face")).toBe(
        stageCount(granite(0), "face") + 1,
      );
      expect(stageCount(granite(60_000), "haul")).toBe(
        stageCount(granite(0), "haul") + 1,
      );
    });
  });
});
