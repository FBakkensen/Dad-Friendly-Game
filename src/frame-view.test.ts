import { describe, expect, it } from "vitest";
import { holdOrder, placeOrder, type Project } from "./city";
import { withFactors } from "./economy/factors";
import { hireKey, orderStrip, stockpiles, workersView } from "./frame-view";
import { FRESH_OFF } from "./line-switch";
import { PART_TWO_OFF } from "./part-switch";
import { createMountain, type Mountain } from "./mountain";
import { crewedStart } from "./test-fixtures";
import { EMPTY_STOCK } from "./stock";
import { tierById, tierQuote } from "./tiers";

/** What the frame shows on every site (slice 1, #659). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

function withProject(mountain: Mountain, project: Project): Mountain {
  return { ...mountain, project };
}

describe("order strip", () => {
  it("names the building nobody has ordered, at its foundation", () => {
    fresh(() => {
      expect(orderStrip(createMountain())).toEqual({
        kind: "project",
        name: "The Light Tower",
        step: "Foundation · not ordered",
        stepName: "Foundation",
        requires: [
          {
            good: "stones",
            name: "Stone",
            built: 0,
            requires: 25_000,
            line: "Stone 0 of 25K",
          },
        ],
        pips: ["now", "later", "later"],
      });
    });
  });

  it("counts what is built in, not what lies on the site", () => {
    fresh(() => {
      const mountain = withProject(createMountain(), {
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 1,
          arrived: { ...EMPTY_STOCK, stones: 1_700 },
          onSite: { ...EMPTY_STOCK, stones: 500 },
        },
      });
      const strip = orderStrip(mountain);
      expect(strip.kind === "project" && strip.step).toBe(
        "Structure · delivering",
      );
      expect(strip.kind === "project" && strip.requires[0]?.line).toBe(
        "Stone 1,200 of 250K",
      );
      expect(strip.pips).toEqual(["done", "now", "later"]);
    });
  });

  it("says an order on hold", () => {
    fresh(() => {
      const strip = orderStrip(holdOrder(placeOrder(createMountain())));
      expect(strip.kind === "project" && strip.step).toBe(
        "Foundation · on hold",
      );
    });
  });

  it("names what is operational after the part's last roof, with every pip done", () => {
    fresh(() => {
      const done: Mountain = {
        ...createMountain(),
        operational: ["lightTower"],
      };
      expect(orderStrip(done)).toEqual({
        kind: "planning",
        name: "The Light Tower",
        line: "The Light Tower is operational · the city is planning its next building",
        pips: ["done", "done", "done"],
      });
    });
  });
});

describe("top row", () => {
  it("shows the stone with no room in part 1", () => {
    fresh(() => {
      const mountain = createMountain();
      const rich = {
        ...mountain,
        stock: { ...mountain.stock, stones: 23_700 },
      };
      expect(stockpiles(rich)).toEqual([
        { good: "stones", count: 23_700, text: "23.7K" },
      ]);
    });
  });

  it("shows stone and brick with their rooms once the stockyard opens (#671)", () => {
    withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, () => {
      const start = createMountain();
      const lit: Mountain = {
        ...start,
        operational: ["lightTower"],
        stock: { ...start.stock, stones: 33_200, brick: 1_000_000 },
      };
      expect(stockpiles(lit)).toEqual([
        {
          good: "stones",
          count: 33_200,
          text: "33.2K",
          room: "of 6M",
          fill: 33_200 / 6_000_000,
          full: false,
        },
        {
          good: "brick",
          count: 1_000_000,
          text: "1M",
          room: "of 1M",
          fill: 1,
          full: true,
        },
      ]);
      // Before the Light Tower there is no stockyard: stone alone, no room.
      expect(stockpiles({ ...lit, operational: [] })).toEqual([
        { good: "stones", count: 33_200, text: "33.2K" },
      ]);
    });
  });

  it("counts the workers and the free ones", () => {
    fresh(() => {
      const mountain = crewedStart();
      const hired = {
        ...mountain,
        owned: { ...mountain.owned, helper: mountain.owned.helper + 2 },
      };
      expect(workersView(hired)).toEqual({ owned: 23, free: 2, lamp: false });
    });
  });

  it("lights the count while the worker's upgrades are affordable", () => {
    fresh(() => {
      const mountain = crewedStart();
      const rich = {
        ...mountain,
        stock: { ...mountain.stock, stones: 2_000_000 },
      };
      expect(workersView(rich).lamp).toBe(true);
    });
  });

  it("prices the hire key at the amount key's amount", () => {
    fresh(() => {
      const start = crewedStart();
      const mountain = { ...start, stock: { ...start.stock, stones: 1_000 } };
      const one = hireKey(mountain, "one");
      expect(one).toMatchObject({ count: 1, face: "+Worker", can: true });
      expect(one.cost).toBe(
        tierQuote(mountain, tierById("helper"), "one").cost,
      );
      const ten = hireKey(mountain, "ten");
      expect(ten.count).toBe(10);
      expect(ten.face).toBe("+10 Workers");
      expect(ten.can).toBe(false);
      const max = hireKey(mountain, "max");
      expect(max.can).toBe(true);
      expect(max.cost).toBeLessThanOrEqual(1_000);
      expect(max.face).toBe(`+${String(max.count)} Workers`);
    });
  });
});
