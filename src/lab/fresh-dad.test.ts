import { describe, expect, it } from "vitest";
import { placeOrder, holdOrder } from "../city";
import { applyAction } from "../economy/actions";
import { withFactors } from "../economy/factors";
import { FRESH_OFF } from "../line-switch";
import { createMountain, type Mountain } from "../mountain";
import { effectiveRates } from "../rates";
import { NO_JOBS, type Jobs } from "../workforce";
import {
  bestRaise,
  drainsTheMine,
  fleetSize,
  freshPlan,
  hirePrice,
  lineRaise,
  playFresh,
  siteIdle,
  type Plan,
} from "./fresh-dad";
import type { FreshHabits } from "./policy";

/** How part 1's dad plays a fresh mine (#655). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const ONCE: FreshHabits = { moves: "once", hold: "on-value", upgrades: false };
const MOVER: FreshHabits = { ...ONCE, moves: "idle" };
const NO_HOLD: FreshHabits = { ...ONCE, hold: "never" };

/** A fresh mine with these jobs, `free` workers on none, this pocket and wagons. */
function mine(
  jobs: Partial<Jobs>,
  { free = 0, pocket = 0, wagons = 1 } = {},
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
  };
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

  it("puts a free worker on an idle wagon, then a builder, then the slowest stage", () => {
    fresh(() => {
      const idleWagon = placeOrder(
        mine({ ...STAGES, building: 2 }, { free: 1 }),
      );
      expect(freshPlan(idleWagon, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "driving" },
      ]);
      const noBuilder = placeOrder(
        mine({ ...STAGES, driving: 1 }, { free: 1 }),
      );
      expect(freshPlan(noBuilder, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "building" },
      ]);
      const short = placeOrder(
        mine(
          { drilling: 6, haulage: 4, hoisting: 6, driving: 1, building: 2 },
          { free: 1 },
        ),
      );
      expect(freshPlan(short, ONCE, 1)).toEqual([
        { kind: "placeWorker", job: "haulage" },
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
      const withUpgrades = bestRaise(start, { ...ONCE, upgrades: true });
      expect(withUpgrades).toBeDefined();
    });
  });

  it("buys the raise when the pocket covers it, hoarding `hoardK` times its price", () => {
    fresh(() => {
      // Two wagons (18) and three builders (24) carry and build more than
      // the line (15).
      const start = placeOrder(
        mine(
          { drilling: 5, haulage: 5, hoisting: 5, driving: 2, building: 3 },
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
        { kind: "placeWorker", job: "building" },
      ]);
    });
  });

  it("knows when the order takes more than half of what the mine makes", () => {
    fresh(() => {
      // Wagon 9 a second against a line of 12, then of 18.
      const thin = placeOrder(
        mine({ drilling: 4, haulage: 4, hoisting: 4, driving: 1, building: 2 }),
      );
      expect(drainsTheMine(thin, line(thin))).toBe(true);
      const wide = placeOrder(mine({ ...STAGES, driving: 1, building: 2 }));
      expect(drainsTheMine(wide, line(wide))).toBe(false);
      // On hold it would drain the mine as soon as it resumes.
      expect(drainsTheMine(holdOrder(thin), line(thin))).toBe(true);
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
          }),
        ),
      );
      expect(siteIdle(held)).toBe(true);
      expect(freshPlan(held, MOVER, 1)).toEqual([
        { kind: "freeWorker", job: "driving" },
      ]);
      // The dad who sets them once leaves them where they are.
      expect(freshPlan(held, ONCE, 1)).toEqual([]);
    });
  });

  it("settles in a few moves on hold, never trading the hold back and forth", () => {
    fresh(() => {
      const start = placeOrder(
        mine({ drilling: 4, haulage: 4, hoisting: 4, driving: 1, building: 2 }),
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
