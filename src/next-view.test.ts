import { describe, expect, it } from "vitest";
import { placeOrder } from "./city";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { workersView } from "./frame-view";
import { createMountain, type Mountain } from "./mountain";
import { crewedStart } from "./test-fixtures";
import { PART_TWO_OFF } from "./part-switch";
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
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

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
      expect(siteCounts(mountain)).toEqual({ mine: 0, refinery: 0, city: 0 });
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
