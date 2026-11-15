import { describe, expect, it } from "vitest";
import { holdOrder, placeOrder, type Site } from "./city";
import {
  cityScene,
  plots,
  projectCard,
  transportPlate,
  vehicleKeys,
} from "./city-view";
import { withFactors } from "./economy/factors";
import { orderStrip } from "./frame-view";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { EMPTY_STOCK } from "./stock";
import { orderNumbers } from "./transport";

/** The city's views (#662), on a fresh mine. */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

/** A fresh mine with one driver and two builders, whatever a fresh start puts on them. */
const start = (): Mountain => {
  const mountain = createMountain();
  return {
    ...mountain,
    owned: { ...mountain.owned, helper: 9 },
    jobs: { drilling: 2, haulage: 2, hoisting: 2, driving: 1, building: 2 },
  };
};

const withStones = (mountain: Mountain, stones: number): Mountain => ({
  ...mountain,
  stock: { ...mountain.stock, stones },
});

const withJobs = (
  mountain: Mountain,
  jobs: Partial<Mountain["jobs"]>,
): Mountain => ({ ...mountain, jobs: { ...mountain.jobs, ...jobs } });

/** The Light Tower's structure on order, half built in, with `onSite` on its site. */
function structure(mountain: Mountain, onSite: number): Mountain {
  const site: Site = {
    building: "lightTower",
    step: 1,
    arrived: { ...EMPTY_STOCK, stones: 125_000 + onSite },
    onSite: { ...EMPTY_STOCK, stones: onSite },
  };
  return { ...mountain, project: { kind: "delivering", site } };
}

describe("the transport plate", () => {
  it("says its drivers, that it has no order, and the fleet with what it carries", () => {
    fresh(() => {
      const plate = transportPlate(start());
      expect(plate.drivers).toBe("1 driver");
      expect(plate.state).toBe("idle: no order");
      expect(plate.fleet).toBe("1 horse wagon: 1 of 1 driver 9/s");
      expect(plate.steps).toMatchObject({ job: "driving", name: "Transport" });
    });
  });

  it("says it serves the city on order, and on hold when held", () => {
    fresh(() => {
      const ordered = placeOrder(withStones(start(), 0));
      expect(transportPlate(ordered).state).toBe("serving the city");
      expect(transportPlate(holdOrder(ordered)).state).toBe("on hold");
    });
  });

  it("counts the drivers a fleet has of the drivers it takes", () => {
    fresh(() => {
      const begin = start();
      const two = { ...begin, fleet: { ...begin.fleet, horseWagon: 2 } };
      expect(transportPlate(two).fleet).toBe(
        "2 horse wagons: 1 of 2 drivers 9/s",
      );
      expect(transportPlate(withJobs(begin, { driving: 0 }))).toMatchObject({
        drivers: "0 drivers",
        fleet: "1 horse wagon: 0 of 1 driver 0/s",
      });
    });
  });
});

describe("the wagon key", () => {
  it("says what one more wagon carries, its price and its driver, green when he can pay", () => {
    fresh(() => {
      const [key] = vehicleKeys(withStones(start(), 10_000));
      expect(key).toMatchObject({
        id: "horseWagon",
        can: true,
        face: "+Wagon · 9/s",
        price: "500",
        staff: "1 to run",
      });
      expect(vehicleKeys(withStones(start(), 0))[0]?.can).toBe(false);
    });
  });
});

describe("the skyline's plots", () => {
  it("has the Light Tower's plot and two vacant ones", () => {
    fresh(() => {
      expect(plots(start())).toEqual([
        {
          building: "lightTower",
          name: "The Light Tower",
          state: "foundation",
          risen: 0,
        },
        {
          building: undefined,
          name: "Vacant plot",
          state: "unassigned",
          risen: 0,
        },
        {
          building: undefined,
          name: "Vacant plot",
          state: "unassigned",
          risen: 0,
        },
      ]);
    });
  });

  it("rises with what is built in, and stands whole once operational", () => {
    fresh(() => {
      const [half] = plots(structure(start(), 0));
      expect(half).toMatchObject({ state: "structure", risen: 1.5 });
      // What is on the site is not built in yet.
      expect(plots(structure(start(), 400))[0]?.risen).toBe(1.5);
      const done = {
        ...start(),
        operational: ["lightTower" as const],
      };
      expect(plots(done)[0]).toMatchObject({
        state: "operational",
        risen: 3,
      });
    });
  });
});

describe("the project's card", () => {
  it("has the steps, a bar for each good, the order key and the power only", () => {
    fresh(() => {
      const card = projectCard(start());
      if (card.kind !== "project") {
        throw new Error("no project");
      }
      expect(card.name).toBe("The Light Tower");
      expect(card.steps).toEqual([
        { name: "Foundation", pip: "now" },
        { name: "Structure", pip: "later" },
        { name: "Roof", pip: "later" },
      ]);
      expect(card.bars).toEqual([
        { good: "stones", line: "Stone 0 of 25K", share: 0 },
      ]);
      expect(card.key).toMatchObject({
        kind: "place",
        title: "Place order",
        lines: ["the whole building", "", ""],
        can: true,
        run: false,
      });
      expect(card.completion).toBe(
        "On completion: night shift output 45%, up from 30%.",
      );
      expect(card.builders.line).toBe("2 builders ×8/s");
    });
  });

  it("reads the bars as the order strip does", () => {
    fresh(() => {
      const mountain = structure(start(), 400);
      const card = projectCard(mountain);
      const strip = orderStrip(mountain);
      if (card.kind !== "project" || strip.kind !== "project") {
        throw new Error("no project");
      }
      expect(card.bars.map((bar) => bar.line)).toEqual(
        strip.requires.map((r) => r.line),
      );
      expect(card.bars[0]?.share).toBe(0.5);
    });
  });

  it("shows the order in numbers while it delivers, and names no limit", () => {
    fresh(() => {
      const mountain = placeOrder(withStones(start(), 5_000));
      const card = projectCard(mountain);
      if (card.kind !== "project") {
        throw new Error("no project");
      }
      const numbers = orderNumbers(
        mountain,
        effectiveRates(mountain).exactCrewPerSecond,
      );
      if (numbers.kind === "unordered") {
        throw new Error("no order");
      }
      expect(card.key.kind).toBe("hold");
      expect(card.key.title).toBe("Delivering");
      expect(card.key.run).toBe(true);
      expect(card.key.lines[0]).toBe(`arriving ${String(numbers.brings)}/s`);
      expect(card.key.lines[1]).toMatch(
        new RegExp(`^building ${String(numbers.builds)}/s · \\d`),
      );
      expect(card.key.lines[2]).toBe("tap to hold");
      expect(card.builders.line).toBe("2 builders ×8/s · on site 0 of 500");
    });
  });

  it("says arriving 0/s with no driver, and no reason", () => {
    fresh(() => {
      const mountain = withJobs(placeOrder(start()), { driving: 0 });
      const card = projectCard(mountain);
      if (card.kind !== "project") {
        throw new Error("no project");
      }
      expect(card.key.lines[0]).toBe("arriving 0/s");
      expect(card.key.lines.join(" ")).not.toMatch(/waiting|stock|limit/i);
    });
  });

  it("resumes an order on hold, building in what is on the site", () => {
    fresh(() => {
      const held = holdOrder(structure(start(), 400));
      const card = projectCard(held);
      if (card.kind !== "project") {
        throw new Error("no project");
      }
      expect(card.key).toMatchObject({
        kind: "resume",
        title: "Resume",
        lines: ["on hold", "building 16/s", ""],
        can: true,
        run: false,
      });
      expect(card.builders.line).toBe("2 builders ×8/s · on site 400 of 500");
    });
  });

  it("after the part's last roof says the strip's line and has no order key", () => {
    fresh(() => {
      const done = {
        ...start(),
        operational: ["lightTower" as const],
      };
      const card = projectCard(done);
      const strip = orderStrip(done);
      expect(card.kind).toBe("planning");
      expect(strip.kind).toBe("planning");
      if (card.kind !== "planning" || strip.kind !== "planning") {
        throw new Error("not planning");
      }
      expect(card.line).toBe(strip.line);
      expect(card.line).toBe(
        "The Light Tower is operational · the city is planning its next building",
      );
      expect(card.builders).toMatchObject({ job: "building", canFree: true });
      expect(transportPlate(done).state).toBe("idle: no order");
    });
  });
});

describe("the city's scene", () => {
  it("lays the site at the building in hand and loads the wagons with what transport brings", () => {
    fresh(() => {
      const mountain = structure(withStones(start(), 50_000), 250);
      const scene = cityScene(mountain);
      expect(scene.sitePlot).toBe(0);
      expect(scene.siteFill).toBe(0.5);
      expect(scene.builders).toBe(2);
      expect(scene.building).toBe(1);
      expect(scene.driven).toBe(1);
      expect(scene.undriven).toBe(0);
      expect(scene.load).toBe(1);
    });
  });

  it("stands the wagons with nothing to carry, and the one with no driver", () => {
    fresh(() => {
      const begin = start();
      const idle = cityScene({
        ...begin,
        fleet: { ...begin.fleet, horseWagon: 2 },
      });
      expect(idle).toMatchObject({
        sitePlot: undefined,
        load: 0,
        driven: 1,
        undriven: 1,
        building: 0,
      });
    });
  });
});
