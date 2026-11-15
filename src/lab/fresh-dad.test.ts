import { describe, expect, it } from "vitest";
import { placeOrder, holdOrder } from "../city";
import { applyAction } from "../economy/actions";
import { withFactors } from "../economy/factors";
import { FRESH_OFF } from "../line-switch";
import { createMountain, type Mountain } from "../mountain";
import { effectiveRates } from "../rates";
import { PILE_HOLDS } from "../mine-piles";
import { NO_JOBS, type JobId, type Jobs } from "../workforce";
import {
  bestRaise,
  drainsTheMine,
  fleetSize,
  freshPlan,
  hirePrice,
  lineRaise,
  playFresh,
  siteIdle,
  upgradeRaises,
  type Plan,
} from "./fresh-dad";
import { nextUpgradeCost } from "../upgrades";
import type { FreshHabits } from "./policy";

/** How part 1's dad plays a fresh mine (#655). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const ONCE: FreshHabits = { moves: "once", hold: "on-value", upgrades: false };
const MOVER: FreshHabits = { ...ONCE, moves: "idle" };
const NO_HOLD: FreshHabits = { ...ONCE, hold: "never" };

/** A fresh mine with these jobs, `free` workers on none, this pocket, wagons and piles. */
function mine(
  jobs: Partial<Jobs>,
  { free = 0, pocket = 0, wagons = 1, face = 0, shaft = 0 } = {},
): Mountain {
  const start = createMountain();
  const placed = { ...NO_JOBS, ...jobs };
  const onJobs = Object.values(placed).reduce((sum, n) => sum + n, 0);
  return {
    ...start,
    owned: { ...start.owned, helper: onJobs + free },
    jobs: placed,
    stock: { ...start.stock, stones: pocket },
    fleet: { ...start.fleet, horseWagon: wagons },
    piles: { face, shaft, kiln: 0 },
  };
}

/** One worker moved from one job to another. */
function move(from: JobId, to: JobId): Plan {
  return [
    { kind: "freeWorker", job: from, count: 1 },
    { kind: "placeWorker", job: to, count: 1 },
  ];
}

const STAGES = { drilling: 6, haulage: 6, hoisting: 6 };

function line(mountain: Mountain): number {
  return effectiveRates(mountain).exactCrewPerSecond;
}

function run(mountain: Mountain, plan: Plan): Mountain {
  return plan.reduce((next, action) => applyAction(next, action, 0), mountain);
}

describe("the fresh dad's first moves (#655)", () => {
  it("orders the next building before anything else", () => {
    fresh(() => {
      expect(freshPlan(createMountain(), ONCE, 1)).toEqual([
        { kind: "placeOrder" },
      ]);
    });
  });

  it("puts a free worker on an idle wagon, then a builder, then where rock waits", () => {
    fresh(() => {
      const idleWagon = placeOrder(
        mine({ ...STAGES, building: 2 }, { free: 1 }),
      );
      expect(freshPlan(idleWagon, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "driving", count: 1 },
      ]);
      const noBuilder = placeOrder(
        mine({ ...STAGES, driving: 1 }, { free: 1 }),
      );
      expect(freshPlan(noBuilder, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "building", count: 1 },
      ]);
      // Haulage is short, so drilled rock waits (#703).
      const short = placeOrder(
        mine(
          {
            drilling: 6,
            haulage: 4,
            hoisting: 6,
            driving: 1,
            building: 2,
            kilns: 0,
          },
          { free: 1, face: 300 },
        ),
      );
      expect(freshPlan(short, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "haulage", count: 1 },
      ]);
    });
  });
});

describe("one worker at the start, moved between the jobs (#703)", () => {
  it("moves the lone worker to the stage whose pile lets him move rock", () => {
    fresh(() => {
      const full = PILE_HOLDS.face;
      // The drilled rock is full and the shaft's is empty: haulage.
      const atFace = placeOrder(mine({ drilling: 1 }, { face: full }));
      expect(freshPlan(atFace, ONCE, 1)).toEqual(move("drilling", "haulage"));
      // The shaft pile is full: hoisting.
      const atShaft = placeOrder(
        mine({ haulage: 1 }, { shaft: PILE_HOLDS.shaft }),
      );
      expect(freshPlan(atShaft, ONCE, 1)).toEqual(move("haulage", "hoisting"));
      // Both piles are empty: drilling.
      const empty = placeOrder(mine({ hoisting: 1 }));
      expect(freshPlan(empty, ONCE, 1)).toEqual(move("hoisting", "drilling"));
      // The mover moves him the same way.
      expect(freshPlan(atFace, MOVER, 1)).toEqual(move("drilling", "haulage"));
    });
  });

  it("leaves him where he is while his stage moves rock", () => {
    fresh(() => {
      const drilling = placeOrder(mine({ drilling: 1 }, { face: 200 }));
      expect(freshPlan(drilling, ONCE, 1)).toEqual([]);
      const hauling = placeOrder(mine({ haulage: 1 }, { face: 200 }));
      expect(freshPlan(hauling, ONCE, 1)).toEqual([]);
    });
  });

  it("moves one at a time, and only until no stage stands", () => {
    fresh(() => {
      const start = placeOrder(
        mine({ drilling: 3 }, { face: PILE_HOLDS.face }),
      );
      const moves: string[] = [];
      const settled = playFresh(start, 0, ONCE, 1, (_, action) => {
        moves.push(action.kind);
      });
      expect(moves).toEqual(["freeWorker", "placeWorker"]);
      expect(settled.jobs).toEqual({ ...NO_JOBS, drilling: 2, haulage: 1 });
    });
  });

  it("places a hire where a pile waits, else on drilling", () => {
    fresh(() => {
      const crewed = { drilling: 1, driving: 1, building: 1, kilns: 0 };
      const waits = placeOrder(
        mine(crewed, { free: 1, face: 300, shaft: 100 }),
      );
      expect(freshPlan(waits, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "haulage", count: 1 },
      ]);
      const shaft = placeOrder(
        mine(crewed, { free: 1, face: 100, shaft: 400 }),
      );
      expect(freshPlan(shaft, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "hoisting", count: 1 },
      ]);
      const empty = placeOrder(mine(crewed, { free: 1 }));
      expect(freshPlan(empty, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "drilling", count: 1 },
      ]);
    });
  });

  it("gets a driver and a builder once an order is in and the line moves, hiring when none is free", () => {
    fresh(() => {
      const price = hirePrice(mine({ drilling: 3 }));
      // The lone worker's line does not move yet: the wagon would carry off
      // every stone he brings up.
      const lone = placeOrder(mine({ drilling: 1 }, { pocket: price }));
      expect(freshPlan(lone, ONCE, 1)).not.toContainEqual({
        kind: "placeWorker",
        job: "driving",
        count: 1,
      });
      const line = { drilling: 1, haulage: 1, hoisting: 1 };
      const ordered = placeOrder(mine(line, { pocket: price }));
      expect(freshPlan(ordered, ONCE, 1)).toEqual([
        { kind: "buyTier", id: "helper" },
        { kind: "placeWorker", job: "driving", count: 1 },
      ]);
      const driven = placeOrder(
        mine(
          { ...line, driving: 1 },
          { pocket: hirePrice(mine({ ...line, driving: 1 })) },
        ),
      );
      expect(freshPlan(driven, ONCE, 1)).toEqual([
        { kind: "buyTier", id: "helper" },
        { kind: "placeWorker", job: "building", count: 1 },
      ]);
      // A dad who never holds waits while the wagon would take the mine.
      expect(freshPlan(ordered, NO_HOLD, 1)).not.toContainEqual({
        kind: "placeWorker",
        job: "driving",
        count: 1,
      });
      // The mover hires him too: he never takes the mine's last line.
      expect(freshPlan(ordered, MOVER, 1)).toEqual([
        { kind: "buyTier", id: "helper" },
        { kind: "placeWorker", job: "driving", count: 1 },
      ]);
      // A free worker drives first, then builds.
      const free = placeOrder(mine(line, { free: 2 }));
      const placed = run(free, freshPlan(free, ONCE, 1));
      expect(placed.jobs.driving).toBe(1);
      expect(freshPlan(placed, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "building", count: 1 },
      ]);
    });
  });
});

describe("raising the line (#655)", () => {
  it("buys on every stage tied at the slowest until the line rises, and says what it gains", () => {
    fresh(() => {
      const start = mine({ ...STAGES, driving: 1, building: 2 });
      const raise = lineRaise(start);
      expect(raise).toBeDefined();
      if (raise === undefined) {
        return;
      }
      const rich = {
        ...start,
        stock: { ...start.stock, stones: raise.cost },
      };
      const after = run(rich, raise.plan);
      expect(after.stock.stones).toBeCloseTo(0, 6);
      expect(line(after) - line(start)).toBeCloseTo(raise.gain, 9);
      expect(raise.gain).toBeGreaterThan(0);
      // Three stages tie at 18: each needs a buy before the line moves.
      const jobs = raise.plan.flatMap((action) =>
        action.kind === "placeWorker" ? [action.job] : [],
      );
      expect(new Set(jobs).size).toBe(3);
    });
  });

  it("weighs the upgrades only for a dad who looks at them", () => {
    fresh(() => {
      const start = mine({ ...STAGES, driving: 1, building: 2 });
      expect(bestRaise(start, ONCE)).toEqual(lineRaise(start));
      // Work boots lifts every tool, at its sticker price.
      const boots = upgradeRaises(start).find(
        (raise) =>
          raise.plan[0]?.kind === "buyUpgrade" && raise.plan[0].id === "boots",
      );
      expect(boots?.gain).toBeGreaterThan(0);
      expect(boots?.cost).toBe(nextUpgradeCost(start, "boots"));
      // In part 1 a worker always pays back sooner, so he never buys it.
      expect(bestRaise(start, { ...ONCE, upgrades: true })).toEqual(
        lineRaise(start),
      );
    });
  });

  it("buys the raise when the pocket covers it, hoarding `hoardK` times its price", () => {
    fresh(() => {
      // Two wagons (18) and three builders (24) carry and build more than
      // the line (15).
      const start = placeOrder(
        mine(
          {
            drilling: 5,
            haulage: 5,
            hoisting: 5,
            driving: 2,
            building: 3,
            kilns: 0,
          },
          { wagons: 2 },
        ),
      );
      const raise = lineRaise(start);
      const cost = raise?.cost ?? 0;
      const rich = { ...start, stock: { ...start.stock, stones: cost * 3 } };
      expect(freshPlan(rich, ONCE, 2)).toEqual(raise?.plan);
      expect(freshPlan(rich, ONCE, 4)).not.toEqual(raise?.plan);
    });
  });
});

describe("the order's limit (#655)", () => {
  it("buys a wagon with its driver and the builders to keep pace when transport holds the order back", () => {
    fresh(() => {
      const start = placeOrder(
        mine({ ...STAGES, driving: 1, building: 2 }, { pocket: 50_000 }),
      );
      const plan = freshPlan(start, ONCE, 1);
      expect(plan[0]).toEqual({ kind: "buyVehicle", id: "horseWagon" });
      const after = run(start, plan);
      expect(fleetSize(after)).toBe(2);
      expect(after.jobs.driving).toBe(2);
      expect(after.jobs.building).toBe(3);
    });
  });

  it("adds a builder when the builders hold the order back", () => {
    fresh(() => {
      const start = placeOrder(
        mine({ ...STAGES, driving: 1, building: 1 }, { pocket: 50_000 }),
      );
      expect(freshPlan(start, ONCE, 1)).toEqual([
        { kind: "buyTier", id: "helper" },
        { kind: "placeWorker", job: "building", count: 1 },
      ]);
    });
  });

  it("knows when the order takes more than half of what the mine makes", () => {
    fresh(() => {
      // Wagon 9 a second against a line of 12, then of 18.
      const thin = placeOrder(
        mine({
          drilling: 4,
          haulage: 4,
          hoisting: 4,
          driving: 1,
          building: 2,
          kilns: 0,
        }),
      );
      expect(drainsTheMine(thin)).toBe(true);
      const wide = placeOrder(mine({ ...STAGES, driving: 1, building: 2 }));
      expect(drainsTheMine(wide)).toBe(false);
      // On hold it would drain the mine as soon as it resumes.
      expect(drainsTheMine(holdOrder(thin))).toBe(true);
    });
  });
});

describe("on hold (#655)", () => {
  const thin = {
    drilling: 4,
    haulage: 4,
    hoisting: 4,
    driving: 1,
    building: 2,
    kilns: 0,
  };

  it("holds while a raise pays back sooner than the building takes, and the order drains the mine", () => {
    fresh(() => {
      const start = placeOrder(mine(thin));
      expect(freshPlan(start, ONCE, 1)).toEqual([{ kind: "holdOrder" }]);
    });
  });

  it("never holds for a dad who keeps the order going", () => {
    fresh(() => {
      expect(freshPlan(placeOrder(mine(thin)), NO_HOLD, 1)).toEqual([]);
    });
  });

  it("resumes when the order no longer drains the mine", () => {
    fresh(() => {
      const held = holdOrder(
        placeOrder(mine({ ...STAGES, driving: 1, building: 2 })),
      );
      expect(freshPlan(held, ONCE, 1)).toEqual([{ kind: "resumeOrder" }]);
    });
  });
});

describe("the mover (#655)", () => {
  it("sends drivers and builders with nothing to do to the mine", () => {
    fresh(() => {
      const held = holdOrder(
        placeOrder(
          mine({
            drilling: 4,
            haulage: 4,
            hoisting: 4,
            driving: 1,
            building: 2,
            kilns: 0,
          }),
        ),
      );
      expect(siteIdle(held)).toBe(true);
      expect(freshPlan(held, MOVER, 1)).toEqual([
        { kind: "freeWorker", job: "driving", count: 1 },
      ]);
      // The dad who sets them once leaves them where they are.
      expect(freshPlan(held, ONCE, 1)).toEqual([]);
    });
  });

  it("settles in a few moves on hold, never trading the hold back and forth", () => {
    fresh(() => {
      const start = placeOrder(
        mine({
          drilling: 4,
          haulage: 4,
          hoisting: 4,
          driving: 1,
          building: 2,
          kilns: 0,
        }),
      );
      const moves: string[] = [];
      const settled = playFresh(start, 0, MOVER, 1, (_, action) => {
        moves.push(action.kind);
      });
      expect(moves.length).toBeLessThan(20);
      expect(freshPlan(settled, MOVER, 1)).toEqual([]);
      expect(settled.project.kind).toBe("onHold");
    });
  });

  it("prices a hire at the next worker's price", () => {
    fresh(() => {
      const start = mine({ ...STAGES });
      expect(hirePrice(start)).toBeGreaterThan(60);
    });
  });
});
