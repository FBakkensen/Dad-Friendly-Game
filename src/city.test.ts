import { describe, expect, it } from "vitest";
import {
  BUILDINGS,
  holdOrder,
  nextBuilding,
  nightShiftShare,
  placeOrder,
  receive,
  resumeOrder,
  stillRequired,
  type Project,
} from "./city";
import { createMountain, type Mountain } from "./mountain";
import { EMPTY_STOCK, priceAmount } from "./stock";

const delivering = (step: 0 | 1 | 2, stones = 0): Project => ({
  kind: "delivering",
  site: {
    building: "lightTower",
    step,
    arrived: { ...EMPTY_STOCK, stones },
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
      150_000, 1_500_000, 6_000_000,
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
    const busy = at(delivering(1, 400));
    const held = holdOrder(busy);
    expect(held.project).toEqual({
      kind: "onHold",
      site: {
        building: "lightTower",
        step: 1,
        arrived:
          busy.project.kind === "delivering"
            ? busy.project.site.arrived
            : EMPTY_STOCK,
      },
    });
    expect(held.stock).toEqual(busy.stock);
    expect(resumeOrder(held).project).toEqual(busy.project);
    expect(holdOrder(held)).toBe(held);
    expect(resumeOrder(busy)).toBe(busy);
  });

  it("says what the step in hand still requires", () => {
    const project = delivering(0, 100_000);
    if (project.kind !== "delivering") {
      throw new Error("delivering");
    }
    expect(stillRequired(project.site).stones).toBe(50_000);
  });
});

describe("goods that arrive (rule 7.8)", () => {
  it("counts a part delivery and keeps it", () => {
    expect(receive(at(delivering(0)), { stones: 10 }).project).toEqual(
      delivering(0, 10),
    );
  });

  it("starts the next step when one is complete, with nothing carried over", () => {
    expect(receive(at(delivering(0, 149_990)), { stones: 10 }).project).toEqual(
      delivering(1),
    );
  });

  it("makes the building operational when the roof's goods are in", () => {
    const roofed = receive(at(delivering(2, 5_999_000)), { stones: 1_000 });
    expect(roofed.project).toEqual({ kind: "unordered" });
    expect(roofed.operational).toEqual(["lightTower"]);
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
