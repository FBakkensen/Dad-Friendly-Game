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
import { formatCompact } from "./format";
import { orderStrip } from "./frame-view";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { createMountain, type Mountain } from "./mountain";
import { EMPTY_STOCK } from "./stock";

/** The city's views (#662), on a fresh mine. */
const fresh = <T>(body: () => T): T => withFactors({}, body);

/** A fresh mine with one driver and two builders, whatever a fresh start puts on them. */
const start = (): Mountain => {
  const mountain = createMountain();
  return {
    ...mountain,
    owned: { ...mountain.owned, helper: 9 },
    jobs: {
      drilling: 2,
      haulage: 2,
      hoisting: 2,
      driving: 1,
      building: 2,
      kilns: 0,
      graniteDrilling: 0,
      graniteHaulage: 0,
      saws: 0,
    },
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

  it("says when it serves the factory, alone or beside the city (#681)", () => {
    fresh(() => {
      const arrived = EMPTY_STOCK;
      const station = {
        kind: "delivering",
        blueprint: "reinforce",
        arrived,
      } as const;
      const ordered = placeOrder(withStones(start(), 0));
      expect(transportPlate({ ...start(), station }).state).toBe(
        "serving the factory",
      );
      expect(transportPlate({ ...ordered, station }).state).toBe(
        "shared: city, factory",
      );
      expect(
        transportPlate({
          ...ordered,
          station: { kind: "done", blueprint: "reinforce" },
        }).state,
      ).toBe("serving the city");
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
      const [key] = vehicleKeys(withStones(start(), 10_000), "one");
      expect(key).toMatchObject({
        id: "horseWagon",
        can: true,
        face: "+Wagon · 9/s",
        price: "500",
        staff: "1 to run",
      });
      expect(vehicleKeys(withStones(start(), 0), "one")[0]?.can).toBe(false);
    });
  });

  it("follows the amount key: ten wagons, and as many as the pocket holds (#715)", () => {
    fresh(() => {
      const [ten] = vehicleKeys(withStones(start(), 100_000), "ten");
      expect(ten).toMatchObject({
        id: "horseWagon",
        count: 10,
        can: true,
        face: "+10 Wagons · 90/s",
        staff: "10 to run",
      });
      expect(ten?.label).toBe(
        `Buy 10 horse wagons for ${ten?.price ?? ""} stone. They carry 90/s and take 10 to run.`,
      );
      const [max] = vehicleKeys(withStones(start(), 1_200), "max");
      expect(max).toMatchObject({ count: 2, face: "+2 Wagons · 18/s" });
      expect(max?.price).toBe(formatCompact(1_110));
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
        lines: ["Foundation 25K", "Structure 250K", "Roof 1M"],
        can: true,
        run: false,
        label: "Place order · Foundation 25K · Structure 250K · Roof 1M",
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
      expect(card.key.kind).toBe("hold");
      expect(card.key.title).toBe("Delivering");
      expect(card.key.run).toBe(true);
      // One wagon carries 9/s; the site is empty, so the builders build in
      // what arrives. The pocket's 5,000 runs dry after 1,667 s, then the
      // line's 6/s feeds the rest of the 25K: 3,333 s in all, about 56m.
      expect(card.key.lines).toEqual([
        "arriving 9/s",
        "building 9/s · 56m",
        "tap to hold",
      ]);
      expect(card.key.lines[2]).toBe("tap to hold");
      expect(card.builders.line).toBe("2 builders ×8/s · on site 0 of 500");
    });
  });

  it("leaves the time out while the step cannot finish", () => {
    fresh(() => {
      const mountain = withJobs(placeOrder(start()), { building: 0 });
      const card = projectCard(mountain);
      if (card.kind !== "project") {
        throw new Error("no project");
      }
      expect(card.key.lines[1]).toBe("building 0/s");
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

  it("drives the wagons while they carry the factory's work order (#681)", () => {
    fresh(() => {
      const begin = withStones(start(), 50_000);
      const scene = cityScene({
        ...begin,
        station: {
          kind: "delivering",
          blueprint: "iron-rails",
          arrived: EMPTY_STOCK,
        },
      });
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

describe("the truck key (#673)", () => {
  const warehoused = {
    ...createMountain(),
    operational: ["lightTower", "warehouse"] as const,
  };
  const partThree = <T>(body: () => T): T =>
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);

  it("shows no truck key with part 3 off, even with the Warehouse operational", () => {
    withFactors({ [PART_TWO_OFF]: 0 }, () => {
      expect(vehicleKeys(warehoused, "one").map((key) => key.id)).toEqual([
        "horseWagon",
      ]);
    });
    withFactors({}, () => {
      expect(vehicleKeys(warehoused, "one").map((key) => key.id)).toEqual([
        "horseWagon",
      ]);
    });
  });

  it("shows the truck key once part 3 plays and the Warehouse is operational", () => {
    partThree(() => {
      expect(vehicleKeys(warehoused, "one").map((key) => key.id)).toEqual([
        "horseWagon",
        "truck",
      ]);
      const early = { ...warehoused, operational: ["lightTower" as const] };
      expect(vehicleKeys(early, "one").map((key) => key.id)).toEqual([
        "horseWagon",
      ]);
    });
  });
});

describe("what a building opens, in part 2 (#671)", () => {
  const partTwo = <T>(body: () => T): T =>
    withFactors({ [PART_TWO_OFF]: 0 }, body);

  it("says the Light Tower opens the refinery, and only once part 2 plays", () => {
    partTwo(() => {
      const card = projectCard(createMountain());
      expect(card.kind === "project" && card.completion).toBe(
        "On completion: night shift output 45%, up from 30%. Opens the refinery.",
      );
    });
  });

  it("says what the Warehouse gives the stockyard", () => {
    partTwo(() => {
      const lit = { ...createMountain(), operational: ["lightTower" as const] };
      const card = projectCard(lit);
      expect(card.kind === "project" && card.completion).toBe(
        "On completion: stockyard capacity ×2.",
      );
    });
  });
});
