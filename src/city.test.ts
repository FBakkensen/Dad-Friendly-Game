import { describe, expect, it } from "vitest";
import {
  BUILDINGS,
  buildIn,
  holdOrder,
  nextBuilding,
  nightShiftShare,
  placeOrder,
  receive,
  resumeOrder,
  stillRequired,
  stillToBuild,
  type Project,
} from "./city";
import { createMountain, type Mountain } from "./mountain";
import { EMPTY_STOCK, priceAmount } from "./stock";

/** The Light Tower at `step`, `stones` arrived and `onSite` of them not built in. */
const delivering = (
  step: 0 | 1 | 2,
  stones = 0,
  onSite = 0,
  kind: "delivering" | "onHold" = "delivering",
): Project => ({
  kind,
  site: {
    building: "lightTower",
    step,
    arrived: { ...EMPTY_STOCK, stones },
    onSite: { ...EMPTY_STOCK, stones: onSite },
  },
});

const at = (project: Project, operational: Mountain["operational"] = []) => ({
  ...createMountain(),
  project,
  operational,
});

describe("the city's buildings (rule 6)", () => {
  it("has the Light Tower first, in three steps of stone", () => {
    const tower = BUILDINGS[0];
    expect(tower?.id).toBe("lightTower");
    expect(tower?.steps.map((step) => priceAmount(step, "stones"))).toEqual([
      25_000, 250_000, 1_000_000,
    ]);
  });

  it("offers the first building that is not operational, and none when all are", () => {
    expect(nextBuilding(createMountain())?.id).toBe("lightTower");
    expect(
      nextBuilding(at({ kind: "unordered" }, ["lightTower"])),
    ).toBeUndefined();
  });
});

describe("the order (rule 7)", () => {
  it("starts nothing until he orders, then delivers to the foundation", () => {
    const fresh = createMountain();
    expect(fresh.project).toEqual({ kind: "unordered" });
    expect(placeOrder(fresh).project).toEqual(delivering(0));
  });

  it("orders nothing twice, and nothing when every building is operational", () => {
    const ordered = placeOrder(createMountain());
    expect(placeOrder(ordered)).toBe(ordered);
    const done = at({ kind: "unordered" }, ["lightTower"]);
    expect(placeOrder(done)).toBe(done);
  });

  it("holds and resumes for free, keeping what has arrived", () => {
    const busy = at(delivering(1, 400, 100));
    const held = holdOrder(busy);
    expect(held.project).toEqual(delivering(1, 400, 100, "onHold"));
    expect(held.stock).toEqual(busy.stock);
    expect(resumeOrder(held).project).toEqual(busy.project);
    expect(holdOrder(held)).toBe(held);
    expect(resumeOrder(busy)).toBe(busy);
  });

  it("says what the step in hand still requires", () => {
    const project = delivering(0, 20_000);
    if (project.kind !== "delivering") {
      throw new Error("delivering");
    }
    expect(stillRequired(project.site).stones).toBe(5_000);
  });

  it("says what the step still requires built in, counting what waits on the site", () => {
    const project = delivering(0, 20_000, 400);
    if (project.kind !== "delivering") {
      throw new Error("delivering");
    }
    expect(stillRequired(project.site).stones).toBe(5_000);
    expect(stillToBuild(project.site).stones).toBe(5_400);
  });
});

describe("goods that arrive (rule 7.8)", () => {
  it("lays a part delivery on the site and keeps it", () => {
    expect(receive(at(delivering(0, 0)), { stones: 10 }).project).toEqual(
      delivering(0, 10, 10),
    );
  });

  it("finishes no step on arrival: the goods wait for the builders (#690)", () => {
    expect(receive(at(delivering(0, 24_990)), { stones: 10 }).project).toEqual(
      delivering(0, 25_000, 10),
    );
  });

  it("brings nothing on hold or with nothing ordered", () => {
    const held = at(delivering(0, 0, 0, "onHold"));
    expect(receive(held, { stones: 10 })).toBe(held);
  });
});

describe("goods the builders build in (rule 7.8, #690)", () => {
  it("takes what they built in from the site, never more than is on it", () => {
    expect(buildIn(at(delivering(0, 100, 60)), { stones: 20 }).project).toEqual(
      delivering(0, 100, 40),
    );
    expect(buildIn(at(delivering(0, 100, 60)), { stones: 90 }).project).toEqual(
      delivering(0, 100, 0),
    );
  });

  it("starts the next step when what one requires is built in, with nothing carried over", () => {
    expect(
      buildIn(at(delivering(0, 25_000, 10)), { stones: 10 }).project,
    ).toEqual(delivering(1));
  });

  it("builds on hold, and the next step starts on hold too", () => {
    expect(
      buildIn(at(delivering(0, 25_000, 10, "onHold")), { stones: 10 }).project,
    ).toEqual(delivering(1, 0, 0, "onHold"));
  });

  it("makes the building operational when the roof is built in", () => {
    const roofed = buildIn(at(delivering(2, 6_000_000, 1_000)), {
      stones: 1_000,
    });
    expect(roofed.project).toEqual({ kind: "unordered" });
    expect(roofed.operational).toEqual(["lightTower"]);
  });

  it("does nothing with nothing ordered", () => {
    const idle = at({ kind: "unordered" });
    expect(buildIn(idle, { stones: 5 })).toBe(idle);
  });
});

describe("a building's power", () => {
  it("lights the night once the Light Tower is operational: 45%", () => {
    expect(nightShiftShare(createMountain())).toBeUndefined();
    expect(nightShiftShare(at({ kind: "unordered" }, ["lightTower"]))).toBe(
      0.45,
    );
  });
});
