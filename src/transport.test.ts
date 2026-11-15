import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { EMPTY_STOCK, priceAmount } from "./stock";
import {
  VEHICLES,
  buyVehicle,
  deliver,
  fleetRate,
  orderLimit,
  secondsToFinish,
  vehiclePrice,
} from "./transport";
import type { Project } from "./city";

const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

function site(
  step: 0 | 1 | 2,
  stones = 0,
  kind: "delivering" | "onHold" = "delivering",
): Project {
  return {
    kind,
    site: { building: "lightTower", step, arrived: { ...EMPTY_STOCK, stones } },
  };
}

/** A fresh mine with this many horse wagons, this pocket and this project. */
function mine(wagons: number, pocket: number, project: Project): Mountain {
  const start = fresh(() => createMountain());
  return {
    ...start,
    fleet: { ...start.fleet, horseWagon: wagons },
    stock: { ...start.stock, stones: pocket },
    project,
  };
}

describe("the fleet (rule 7.5, 7.6)", () => {
  it("is horse wagons that carry 25 goods a second each", () => {
    expect(VEHICLES.map((vehicle) => vehicle.id)).toEqual(["horseWagon"]);
    expect(fleetRate(mine(1, 0, { kind: "unordered" }))).toBe(25);
    expect(fleetRate(mine(4, 0, { kind: "unordered" }))).toBe(100);
  });

  it("gives a fresh mine its first wagon, and today's game none", () => {
    expect(fresh(() => createMountain()).fleet.horseWagon).toBe(1);
    expect(createMountain().fleet.horseWagon).toBe(0);
  });

  it("prices the next wagon from 500 stone, ×1.219, past the one given", () => {
    const one = mine(1, 0, { kind: "unordered" });
    expect(priceAmount(vehiclePrice(one, "horseWagon"), "stones")).toBe(500);
    const two = mine(2, 0, { kind: "unordered" });
    expect(priceAmount(vehiclePrice(two, "horseWagon"), "stones")).toBe(610);
  });

  it("buys a wagon when the pocket covers it, and nothing when it does not", () => {
    const rich = mine(1, 600, { kind: "unordered" });
    const bought = buyVehicle(rich, "horseWagon");
    expect(bought.fleet.horseWagon).toBe(2);
    expect(bought.stock.stones).toBe(100);
    const poor = mine(1, 499, { kind: "unordered" });
    expect(buyVehicle(poor, "horseWagon")).toBe(poor);
  });
});

describe("delivery (rule 7.2, 7.7)", () => {
  it("carries the fleet's rate a second from the pocket to the step", () => {
    const after = deliver(mine(2, 10_000, site(0)), 10, 1);
    expect(after.stock.stones).toBe(10_000 - 500);
    expect(after.project).toEqual(site(0, 500));
  });

  it("carries only what the pocket holds", () => {
    const after = deliver(mine(2, 120, site(0)), 10, 1);
    expect(after.stock.stones).toBe(0);
    expect(after.project).toEqual(site(0, 120));
  });

  it("carries only what the step requires, then goes on to the next step", () => {
    const after = deliver(mine(40, 1_000_000, site(0, 149_000)), 10, 1);
    // 10,000 carried: 1,000 finishes the foundation, 9,000 go to the structure.
    expect(after.project).toEqual(site(1, 9_000));
    expect(after.stock.stones).toBe(990_000);
  });

  it("carries at the night shift's share unattended", () => {
    const after = deliver(mine(4, 10_000, site(0)), 100, 0.3);
    expect(after.stock.stones).toBe(10_000 - 3_000);
  });

  it("carries nothing on hold or with nothing ordered", () => {
    const held = mine(4, 10_000, site(0, 0, "onHold"));
    expect(deliver(held, 100, 1)).toBe(held);
    const none = mine(4, 10_000, { kind: "unordered" });
    expect(deliver(none, 100, 1)).toBe(none);
  });

  it("finishes the building and stops carrying", () => {
    const after = deliver(mine(400, 10_000_000, site(2, 5_999_000)), 10, 1);
    expect(after.operational).toEqual(["lightTower"]);
    expect(after.project).toEqual({ kind: "unordered" });
    expect(after.stock.stones).toBe(10_000_000 - 1_000);
  });
});

describe("the order's limit (rule 7.10)", () => {
  it("is transport while the pocket covers the step", () => {
    expect(orderLimit(mine(2, 200_000, site(0)), 10)).toEqual({
      kind: "delivering",
      perSecond: 50,
      secondsLeft: 3_000,
      limit: "transport",
    });
  });

  it("is the good when the pocket runs dry and the mine digs less than transport carries", () => {
    // 1,000 in the pocket and 10 a second dug, 50 carried: the pocket lasts
    // 25 s (1,250 carried), then 148,750 more at 10 a second.
    expect(orderLimit(mine(2, 1_000, site(0)), 10)).toEqual({
      kind: "delivering",
      perSecond: 50,
      secondsLeft: 25 + 14_875,
      limit: "stones",
    });
  });

  it("is transport again when the mine digs faster than it carries", () => {
    const limit = orderLimit(mine(2, 0, site(0)), 80);
    expect(limit).toMatchObject({ perSecond: 50, limit: "transport" });
  });

  it("says on hold, and nothing to deliver when nothing is ordered", () => {
    expect(orderLimit(mine(2, 0, site(0, 0, "onHold")), 10)).toEqual({
      kind: "onHold",
    });
    expect(orderLimit(mine(2, 0, { kind: "unordered" }), 10)).toEqual({
      kind: "unordered",
    });
  });
});

describe("the time to finish the building", () => {
  it("counts every step left, at the share and the income", () => {
    // 7,650,000 stone at 100 a second with the pocket full: 76,500 s.
    expect(secondsToFinish(mine(4, 10_000_000, site(0)), 1, 0)).toBe(76_500);
    // At the night's 30%, 30 a second.
    expect(secondsToFinish(mine(4, 10_000_000, site(0)), 0.3, 0)).toBe(255_000);
  });

  it("is Infinity when nothing can arrive", () => {
    expect(secondsToFinish(mine(4, 0, site(0)), 1, 0)).toBe(Infinity);
    expect(secondsToFinish(mine(4, 10, site(0, 0, "onHold")), 1, 10)).toBe(
      Infinity,
    );
  });
});
