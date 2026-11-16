import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { applyMove, listActions, valueOf } from "./economy/actions";
import { FRESH_OFF } from "./line-switch";
import {
  MOUNTAIN_STONES,
  accrue,
  accrueAway,
  createMountain,
  type Mountain,
} from "./mountain";
import { effectiveRates } from "./rates";
import { EMPTY_STOCK } from "./stock";
import type { Project } from "./city";

/** Orders and transport in a fresh mine (slice 1, rules 4, 6, 7, #654). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const HOUR = 60 * 60 * 1000;
const NO_TROUBLE = { trouble: undefined };

/** The Light Tower at `step` with `stones` arrived, all built in. */
function site(step: 0 | 1 | 2, stones = 0): Project {
  return {
    kind: "delivering",
    site: {
      building: "lightTower",
      step,
      arrived: { ...EMPTY_STOCK, stones },
      onSite: EMPTY_STOCK,
    },
  };
}

/**
 * A fresh mine with `perStage` workers on each stage, a driver on each
 * wagon, two builders a wagon (16 built in a second, past the wagon's 9,
 * so the site never holds transport back), and this pocket and project.
 */
function mine(
  perStage: number,
  pocket: number,
  wagons: number,
  project: Project,
  operational: Mountain["operational"] = [],
): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: 3 * perStage + 3 * wagons },
    jobs: {
      drilling: perStage,
      haulage: perStage,
      hoisting: perStage,
      driving: wagons,
      building: 2 * wagons,
      kilns: 0,
      graniteDrilling: 0,
      graniteHaulage: 0,
      saws: 0,
    },
    stock: { ...start.stock, stones: pocket },
    fleet: { ...start.fleet, horseWagon: wagons },
    project,
    operational,
  };
}

describe("live play: he orders, transport delivers (rule 7)", () => {
  it("digs, then carries from the pocket to the order, each second", () => {
    fresh(() => {
      // Two on each stage dig 6 a second; one wagon carries 9 a second.
      const start = mine(2, 1_000, 1, site(0));
      const minute = accrue({
        mountain: start,
        from: 0,
        to: 60_000,
        live: true,
      });
      expect(minute.mined).toBe(360);
      expect(minute.mountain.project).toEqual(site(0, 540));
      expect(minute.mountain.stock.stones).toBe(1_000 + 360 - 540);
    });
  });

  it("delivers nothing before he orders, and nothing on hold", () => {
    fresh(() => {
      const idle = accrue({
        mountain: mine(3, 1_000, 1, { kind: "unordered" }),
        from: 0,
        to: 60_000,
        live: true,
      });
      expect(idle.mountain.stock.stones).toBe(1_540);
      const held = applyMove(
        mine(3, 1_000, 1, site(0)),
        { kind: "holdOrder" },
        0,
        NO_TROUBLE,
      );
      if (held.kind !== "applied") {
        throw new Error("hold refused");
      }
      const later = accrue({
        mountain: held.mountain,
        from: 0,
        to: 60_000,
        live: true,
      });
      expect(later.mountain.stock.stones).toBe(1_540);
    });
  });

  it("keeps transport's part seconds when the crew digs nothing", () => {
    fresh(() => {
      // Ticks of 999 ms: each leaves a part second for the next.
      let state = mine(0, 10_000, 1, site(0));
      let settled = 0;
      for (let now = 999; now <= 60 * 999; now += 999) {
        const tick = accrue({
          mountain: state,
          from: settled,
          to: now,
          live: true,
        });
        state = tick.mountain;
        settled = tick.settledAt;
      }
      expect(state.project).toEqual(site(0, 9 * 59));
    });
  });

  it("raises the whole building from one order, step after step", () => {
    fresh(() => {
      const start = mine(3, 2_000_000, 400, { kind: "unordered" });
      const ordered = applyMove(start, { kind: "placeOrder" }, 0, NO_TROUBLE);
      if (ordered.kind !== "applied") {
        throw new Error("order refused");
      }
      // 3,600 a second: the 1.275M stone building takes 355 s.
      const done = accrue({
        mountain: ordered.mountain,
        from: 0,
        to: 400_000,
        live: true,
      });
      expect(done.mountain.operational).toEqual(["lightTower"]);
      expect(done.mountain.project).toEqual({ kind: "unordered" });
      expect(done.mountain.stock.stones).toBe(
        2_000_000 + done.mined - 1_275_000,
      );
    });
  });
});

describe("unattended before the stockyard (rule 4)", () => {
  it("stops the mine at eight hours, and transport goes on from the pocket", () => {
    fresh(() => {
      // 40 on each stage with tools (126 workers, with their marks) dig 960
      // a second, 288 at night; two wagons carry 5.4 a second at night.
      const start = mine(40, 0, 2, site(2));
      expect(effectiveRates(start).crewPerSecond).toBe(960);
      const night = accrueAway({
        mountain: start,
        lastSeen: 0,
        now: 12 * HOUR,
      });
      expect(night.mined).toBe(288 * 8 * 3600);
      // Transport carries 5.4 a second for all twelve hours.
      expect(night.mountain.project).toEqual(site(2, 233_280));
      expect(night.mountain.stock.stones).toBe(288 * 8 * 3600 - 233_280);
      expect(night.mountain.remaining).toBe(MOUNTAIN_STONES);
    });
  });

  it("pays a short night in full and carries for all of it", () => {
    fresh(() => {
      const start = mine(40, 0, 2, site(2));
      const night = accrueAway({ mountain: start, lastSeen: 0, now: 2 * HOUR });
      expect(night.mined).toBe(288 * 2 * 3600);
      expect(night.mountain.project).toEqual(site(2, 38_880));
    });
  });

  it("runs part 1's night after the Light Tower's roof at 45% for eight hours", () => {
    fresh(() => {
      const lit = mine(40, 0, 2, { kind: "unordered" }, ["lightTower"]);
      expect(effectiveRates(lit).awayPay).toBe(0.45);
      const night = accrueAway({ mountain: lit, lastSeen: 0, now: 10 * HOUR });
      expect(night.mined).toBe(432 * 8 * 3600);
    });
  });

  it("lights the rest of the night from the moment the roof goes on", () => {
    fresh(() => {
      // 1,000 stone short of the roof; one wagon carries 2.7 a second at
      // night, so the roof goes on 371 s in, from the pocket.
      const start = mine(40, 1_000, 1, site(2, 999_000));
      const night = accrueAway({ mountain: start, lastSeen: 0, now: 4 * HOUR });
      expect(night.mountain.operational).toEqual(["lightTower"]);
      const lit = 4 * 3600 - 371;
      // 371 s at 288 a second (30%), the rest at 432 (45%).
      expect(night.mined).toBe(371 * 288 + lit * 432);
    });
  });
});

describe("the builders at night (rule 7.12, #690)", () => {
  it("build at the night shift output, and a full site stops transport", () => {
    fresh(() => {
      const start = mine(3, 100_000, 2, site(0));
      const none = { ...start, jobs: { ...start.jobs, building: 0 } };
      const night = accrueAway({ mountain: none, lastSeen: 0, now: 2 * HOUR });
      // Nobody builds: transport fills the site and stops there.
      expect(night.mountain.project).toEqual({
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 0,
          arrived: { ...EMPTY_STOCK, stones: 500 },
          onSite: { ...EMPTY_STOCK, stones: 500 },
        },
      });
      // One builder: 2.4 a second at night, the site full from early on.
      const one = { ...start, jobs: { ...start.jobs, building: 1 } };
      const built = accrueAway({ mountain: one, lastSeen: 0, now: 2 * HOUR });
      expect(built.mountain.project).toEqual({
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 0,
          arrived: { ...EMPTY_STOCK, stones: 17_280 + 500 },
          onSite: { ...EMPTY_STOCK, stones: 500 },
        },
      });
    });
  });

  it("build in a roof on hold, and light the rest of the night from then", () => {
    fresh(() => {
      // The roof all arrived, 300 on the site and on hold; two builders
      // build 4.8 a second at night, so it goes on 63 s in.
      const start = mine(40, 0, 1, {
        kind: "onHold",
        site: {
          building: "lightTower",
          step: 2,
          arrived: { ...EMPTY_STOCK, stones: 1_000_000 },
          onSite: { ...EMPTY_STOCK, stones: 300 },
        },
      });
      const held = { ...start, jobs: { ...start.jobs, building: 2 } };
      const night = accrueAway({ mountain: held, lastSeen: 0, now: HOUR });
      expect(night.mountain.operational).toEqual(["lightTower"]);
      expect(night.mined).toBe(63 * 288 + (3_600 - 63) * 432);
    });
  });
});

describe("the moves (rule 7.1, 7.9, 7.13)", () => {
  it("lists the order, then hold, then resume, and a wagon to buy", () => {
    fresh(() => {
      const kinds = (mountain: Mountain): string[] =>
        listActions(mountain, 0)
          .map((action) => action.kind)
          .filter((kind) =>
            ["buyVehicle", "placeOrder", "holdOrder", "resumeOrder"].includes(
              kind,
            ),
          );
      expect(kinds(mine(3, 0, 1, { kind: "unordered" }))).toEqual([
        "buyVehicle",
        "placeOrder",
      ]);
      expect(kinds(mine(3, 0, 1, site(0)))).toEqual([
        "buyVehicle",
        "holdOrder",
      ]);
      const held = mine(3, 0, 1, {
        kind: "onHold",
        site: {
          building: "lightTower",
          step: 0,
          arrived: EMPTY_STOCK,
          onSite: EMPTY_STOCK,
        },
      });
      expect(kinds(held)).toEqual(["buyVehicle", "resumeOrder"]);
      expect(
        kinds(mine(3, 0, 1, { kind: "unordered" }, ["lightTower"])),
      ).toEqual(["buyVehicle"]);
    });
  });

  it("lists none of them in today's game", () => {
    const today = createMountain();
    expect(
      listActions(today, 0).some((action) =>
        ["buyVehicle", "placeOrder", "holdOrder", "resumeOrder"].includes(
          action.kind,
        ),
      ),
    ).toBe(false);
    expect(applyMove(today, { kind: "placeOrder" }, 0, NO_TROUBLE).kind).toBe(
      "refused",
    );
    expect(
      applyMove(
        { ...today, stock: { ...today.stock, stones: 1e9 } },
        { kind: "buyVehicle", id: "horseWagon" },
        0,
        NO_TROUBLE,
      ).kind,
    ).toBe("refused");
  });

  it("buys a wagon with its stone, and logs each move", () => {
    fresh(() => {
      const bought = applyMove(
        mine(3, 500, 1, { kind: "unordered" }),
        { kind: "buyVehicle", id: "horseWagon" },
        0,
        NO_TROUBLE,
      );
      expect(
        bought.kind === "applied" && bought.mountain.fleet.horseWagon,
      ).toBe(2);
      expect(bought.kind === "applied" && bought.events).toEqual([
        { kind: "vehicleBought", id: "horseWagon", count: 2 },
      ]);
      const ordered = applyMove(
        mine(3, 0, 1, { kind: "unordered" }),
        { kind: "placeOrder" },
        0,
        NO_TROUBLE,
      );
      expect(ordered.kind === "applied" && ordered.events).toEqual([
        { kind: "orderPlaced", building: "lightTower" },
      ]);
    });
  });

  it("values them at no income gain: the lab learns to order in #655", () => {
    fresh(() => {
      const context = { tapsPerSecond: 0, liveSeconds: 60, awaySeconds: 0 };
      const value = valueOf(
        mine(3, 0, 1, { kind: "unordered" }),
        { kind: "buyVehicle", id: "horseWagon" },
        3600,
        context,
      );
      expect(value.gainPerSec).toBe(0);
      expect(value.cost).toBe(500);
      expect(value.paybackSec).toBe(Infinity);
      for (const kind of ["placeOrder", "holdOrder", "resumeOrder"] as const) {
        expect(
          valueOf(
            mine(3, 0, 1, { kind: "unordered" }),
            { kind },
            3600,
            context,
          ),
        ).toEqual({ gainPerSec: 0, cost: 0, paybackSec: Infinity });
      }
    });
  });
});
