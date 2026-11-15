import { describe, expect, it } from "vitest";
import { placeOrder } from "./city";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { workersView } from "./frame-view";
import { createMountain, type Mountain } from "./mountain";
import { crewedStart } from "./test-fixtures";
import {
  LINE_STANDS,
  NOTHING_TO_BUY,
  PRODUCTION_RUNS,
  nextView,
  siteCounts,
  siteLamp,
  workforceCount,
} from "./next-view";

/** What Next and the lamps count (slice 1, #659). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

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

  it("says the line stands when a stage has nobody on it", () => {
    fresh(() => {
      const start = ordered(0);
      const stood = { ...start, jobs: { ...start.jobs, hoisting: 0 } };
      const view = nextView(stood);
      expect(view.kind === "nothing" && view.then).toBe(LINE_STANDS);
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
      expect(siteCounts(mountain)).toEqual({ mine: 0, city: 0 });
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
