import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SITE_HOLDS } from "./building-site";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { EMPTY_STOCK, priceAmount } from "./stock";
import {
  VEHICLES,
  buyVehicle,
  deliver,
  drivenFleet,
  fleetRate,
  orderLimit,
  orderNumbers,
  secondsToFinish,
  vehiclePrice,
} from "./transport";
import { stepRequires, type Project } from "./city";

const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

/** The Light Tower at `step`, `stones` arrived and `onSite` of them not built in. */
function site(
  step: 0 | 1 | 2,
  stones = 0,
  kind: "delivering" | "onHold" = "delivering",
  onSite = 0,
): Project {
  return {
    kind,
    site: {
      building: "lightTower",
      step,
      arrived: { ...EMPTY_STOCK, stones },
      onSite: { ...EMPTY_STOCK, stones: onSite },
    },
  };
}

/** Builders enough that they never hold transport back. */
const MANY = 1_000;

/**
 * A fresh mine with this many horse wagons, a driver on each, this pocket,
 * this project and these builders.
 */
function mine(
  wagons: number,
  pocket: number,
  project: Project,
  drivers = wagons,
  builders = MANY,
): Mountain {
  const start = fresh(() => createMountain());
  return {
    ...start,
    owned: { ...start.owned, helper: 9 + drivers + builders },
    jobs: { ...start.jobs, driving: drivers, building: builders },
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

  it("runs a vehicle only with a driver on it (rule 2.7, #689)", () => {
    expect(fleetRate(mine(3, 0, { kind: "unordered" }, 0))).toBe(0);
    expect(fleetRate(mine(3, 0, { kind: "unordered" }, 2))).toBe(50);
    expect(fleetRate(mine(3, 0, { kind: "unordered" }, 5))).toBe(75);
    expect(drivenFleet(mine(3, 0, { kind: "unordered" }, 2))).toEqual({
      horseWagon: 2,
    });
    const idle = mine(2, 10_000, site(0), 0);
    expect(deliver(idle, 10, 1)).toBe(idle);
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
    // 1,000 a second: the foundation's last 1,000 take a second, and the
    // structure has the other nine.
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

describe("the building site and the builders (rule 7.8, #690)", () => {
  it("starts a fresh mine with two builders, twelve workers in all", () => {
    const start = fresh(() => createMountain());
    expect(start.jobs.building).toBe(2);
    expect(start.owned.helper).toBe(12);
  });

  it("holds 500, and transport brings no more until the builders make room", () => {
    const after = deliver(mine(2, 10_000, site(0), 2, 0), 100, 1);
    expect(after.project).toEqual(site(0, SITE_HOLDS, "delivering", 500));
    expect(after.stock.stones).toBe(10_000 - 500);
  });

  it("builds in 20 a second a builder, and a full site lets transport bring only that", () => {
    // 50 brought a second, 20 built in: the site fills in 500 / 30 s, and
    // from then on transport brings what the builder makes room for.
    const after = deliver(mine(2, 10_000, site(0), 2, 1), 100, 1);
    expect(after.project).toEqual(site(0, 2_500, "delivering", 500));
    expect(after.stock.stones).toBe(10_000 - 2_500);
  });

  it("builds in what arrives when the builders are faster than transport", () => {
    const after = deliver(mine(1, 10_000, site(0), 1, 2), 100, 1);
    expect(after.project).toEqual(site(0, 2_500));
  });

  it("finishes a step only when what it requires is built in", () => {
    // All of it arrived; 300 still on the site and one builder: 15 s.
    const waiting = mine(1, 0, site(0, 150_000, "delivering", 300), 1, 1);
    expect(deliver(waiting, 10, 1).project).toEqual(
      site(0, 150_000, "delivering", 100),
    );
    expect(deliver(waiting, 15, 1).project).toEqual(site(1));
  });

  it("still builds in on hold, and brings nothing from the pocket", () => {
    const held = mine(4, 10_000, site(0, 1_000, "onHold", 300), 4, 1);
    const after = deliver(held, 10, 1);
    expect(after.project).toEqual(site(0, 1_000, "onHold", 100));
    expect(after.stock.stones).toBe(10_000);
    // The step built in on hold gives way to the next one, still on hold.
    const last = mine(4, 10_000, site(0, 150_000, "onHold", 300), 4, 1);
    expect(deliver(last, 100, 1).project).toEqual(site(1, 0, "onHold"));
  });

  it("builds at the night shift's share, and a full site stops transport", () => {
    const night = deliver(mine(4, 100_000, site(0), 4, 1), 1_000, 0.3);
    // 30 brought and 6 built in a second: 6,000 built in, 500 on the site.
    expect(night.project).toEqual(site(0, 6_500, "delivering", 500));
    const nobody = deliver(mine(4, 100_000, site(0), 4, 0), 10_000, 0.3);
    expect(nobody.project).toEqual(site(0, 500, "delivering", 500));
  });

  it("never holds more than the site holds, builds in no more than required, and loses nothing", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 3_000_000 }),
        fc.integer({ min: 0, max: 149_999 }),
        fc.integer({ min: 0, max: SITE_HOLDS }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.constantFrom(1, 0.3, 0.45),
        fc.boolean(),
        (wagons, builders, pocket, arrived, held, seconds, share, hold) => {
          const onSite = Math.min(held, arrived);
          const start = mine(
            wagons,
            pocket,
            site(0, arrived, hold ? "onHold" : "delivering", onSite),
            wagons,
            builders,
          );
          const after = deliver(start, seconds, share);
          expect(after.stock.stones).toBeGreaterThanOrEqual(0);
          const project = after.project;
          if (project.kind === "unordered") {
            return;
          }
          const { site: now } = project;
          const need = stepRequires(now)[0]?.amount ?? 0;
          expect(now.onSite.stones).toBeLessThanOrEqual(SITE_HOLDS);
          expect(now.onSite.stones).toBeGreaterThanOrEqual(0);
          expect(now.onSite.stones).toBeLessThanOrEqual(now.arrived.stones);
          expect(now.arrived.stones).toBeLessThanOrEqual(need);
          // What left the pocket is on a site or built in.
          const builtBefore = arrived - onSite;
          const gone = pocket - after.stock.stones;
          const landed =
            now.step === 0
              ? now.arrived.stones - arrived
              : 150_000 -
                arrived +
                (now.step === 2 ? 1_500_000 : 0) +
                now.arrived.stones;
          expect(gone).toBe(landed);
          expect(builtBefore).toBeLessThanOrEqual(150_000);
        },
      ),
    );
  });
});

describe("the order's limit (rule 7.11, for the lab)", () => {
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

  it("is the builders when they take longer than transport", () => {
    // 150,000 at one builder's 20 a second: 7,500 s, past transport's 3,000.
    expect(orderLimit(mine(2, 200_000, site(0), 2, 1), 10)).toEqual({
      kind: "delivering",
      perSecond: 50,
      secondsLeft: 7_500,
      limit: "builders",
    });
    expect(orderLimit(mine(2, 200_000, site(0), 2, 0), 10)).toMatchObject({
      secondsLeft: Infinity,
      limit: "builders",
    });
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

describe("an order's numbers (rule 7.11, #690)", () => {
  it("shows what transport brings, what the builders build in, the site and what is still required", () => {
    expect(
      orderNumbers(mine(2, 10_000, site(0, 100, "delivering", 40), 2, 1), 0),
    ).toEqual({
      kind: "delivering",
      brings: 50,
      builds: 20,
      onSite: { ...EMPTY_STOCK, stones: 40 },
      stillRequires: { ...EMPTY_STOCK, stones: 149_940 },
    });
  });

  it("brings no more than the builders build in while the site is full", () => {
    const full = mine(2, 10_000, site(0, 500, "delivering", 500), 2, 1);
    expect(orderNumbers(full, 0)).toMatchObject({ brings: 20, builds: 20 });
  });

  it("builds in no more than arrives while the site is empty", () => {
    const empty = mine(1, 10_000, site(0), 1, 3);
    expect(orderNumbers(empty, 0)).toMatchObject({ brings: 25, builds: 25 });
    const dry = mine(1, 0, site(0), 1, 3);
    expect(orderNumbers(dry, 0)).toMatchObject({ brings: 0, builds: 0 });
  });

  it("brings nothing on hold, and the builders still build in what is on the site", () => {
    const held = mine(2, 10_000, site(0, 300, "onHold", 300), 2, 1);
    expect(orderNumbers(held, 0)).toMatchObject({
      kind: "onHold",
      brings: 0,
      builds: 20,
    });
    expect(orderNumbers(mine(2, 0, { kind: "unordered" }), 0)).toEqual({
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

  it("counts the builders where they are slower than transport", () => {
    // One builder: 7,650,000 at 20 a second.
    expect(secondsToFinish(mine(4, 10_000_000, site(0), 4, 1), 1, 0)).toBe(
      382_500,
    );
  });

  it("finishes a roof on hold when it has all arrived and the builders build it in", () => {
    const roof = mine(4, 0, site(2, 6_000_000, "onHold", 500), 4, 1);
    expect(secondsToFinish(roof, 1, 0)).toBe(25);
    const after = deliver(roof, 25, 1);
    expect(after.operational).toEqual(["lightTower"]);
  });

  it("is Infinity when nothing can arrive or nobody builds", () => {
    expect(secondsToFinish(mine(4, 0, site(0)), 1, 0)).toBe(Infinity);
    expect(secondsToFinish(mine(4, 10, site(0, 0, "onHold")), 1, 10)).toBe(
      Infinity,
    );
    expect(secondsToFinish(mine(4, 10_000_000, site(0), 4, 0), 1, 0)).toBe(
      Infinity,
    );
    expect(secondsToFinish(mine(4, 0, { kind: "unordered" }), 1, 0)).toBe(
      Infinity,
    );
  });
});
