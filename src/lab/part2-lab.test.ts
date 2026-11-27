import { describe, expect, it } from "vitest";
import { placeOrder } from "../city";
import { applyAction, type Action } from "../economy/actions";
import { withFactors } from "../economy/factors";
import { createMountain, type Mountain } from "../mountain";
import { PLAY_FACTORS, SLICE_2_PART_2_OFF } from "../part-switch";
import { RESEARCH_IDS, researchPrice, startResearch } from "../research";
import { slice2OrderRates, slice2SteadyIncome } from "../slice2-flow";
import { EMPTY_STOCK, priceAmount } from "../stock";
import { freshPlan, playFresh } from "./fresh-dad";
import { goodRaise, levelMoves, makersWanted } from "./fresh-levels";
import type { FreshHabits, LevelHabit } from "./policy";
import { LAB_FACTORS } from "./run";

const habits = (levels: LevelHabit): FreshHabits => ({
  moves: "once",
  hold: "on-value",
  upgrades: false,
  levels,
});

function part2<T>(body: () => T): T {
  return withFactors(LAB_FACTORS, body);
}

function applyPlan(mountain: Mountain, plan: readonly Action[]): Mountain {
  return part2(() =>
    plan.reduce((state, action) => applyAction(state, action, 0), mountain),
  );
}

function foundryRoofMountain(): Mountain {
  const base = createMountain();
  return {
    ...base,
    operational: ["lightTower", "warehouse", "foundry"],
    stockyard: 4,
    owned: {
      ...base.owned,
      helper: 140,
      cart: 10,
      drill: 8,
      borer: 1,
      hoist: 6,
      machine: 2,
    },
    mineLevels: {
      granite: {
        machines: { cart: 4, drill: 3, borer: 1, train: 0 },
        piles: { face: 0, shaft: 0, saw: 0 },
      },
    },
    cages: { assigned: { topsoil: 3, granite: 3, crystal: 0 }, trips: {} },
    makers: {
      kiln: 18,
      saw: 6,
      glassworks: 0,
      partsPress: 1,
      precisionAssembly: 0,
    },
    fleet: { horseWagon: 20, truck: 10 },
    jobs: {
      drilling: 18,
      haulage: 14,
      graniteDrilling: 12,
      graniteHaulage: 10,
      crystalDrilling: 0,
      crystalHaulage: 0,
      hoisting: 8,
      kilns: 18,
      saws: 6,
      glassworks: 0,
      partsPress: 2,
      precisionAssembly: 0,
      driving: 30,
      building: 8,
    },
    stock: {
      stones: 50_000_000,
      brick: 10_000_000,
      cutStone: 6_000_000,
      glass: 0,
      parts: 0,
    },
  };
}

describe("Slice 2 Part 2 lab policies and steady flow (#772)", () => {
  it("computes Part 2 steady income and order rates without leaking stock into production runs", () => {
    part2(() => {
      const m = placeOrder({
        ...foundryRoofMountain(),
        mineLevels: {
          granite: {
            machines: { cart: 4, drill: 3, borer: 1, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
          crystal: {
            machines: { cart: 2, drill: 2, borer: 0, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        cages: { assigned: { topsoil: 2, granite: 2, crystal: 2 }, trips: {} },
        makers: {
          kiln: 18,
          saw: 6,
          glassworks: 2,
          partsPress: 2,
          precisionAssembly: 1,
        },
        jobs: {
          ...foundryRoofMountain().jobs,
          crystalDrilling: 6,
          crystalHaulage: 4,
          glassworks: 4,
          partsPress: 4,
          precisionAssembly: 3,
        },
      });
      const steady = slice2SteadyIncome(m);
      expect(steady.brick ?? 0).toBeGreaterThan(0);
      expect(steady.cutStone ?? 0).toBeGreaterThan(0);
      expect(steady.glass ?? 0).toBeGreaterThan(0);
      expect(steady.parts ?? 0).toBeGreaterThan(0);

      // Net brick is strictly reduced by Factory brick consumption compared to no Factory lines.
      const noFactory = slice2SteadyIncome({
        ...m,
        makers: { ...m.makers, partsPress: 0, precisionAssembly: 0 },
      });
      expect(steady.brick ?? 0).toBeLessThan(noFactory.brick ?? 0);

      const order = slice2OrderRates(m);
      expect(order.cityCarry).toBeGreaterThan(0);
      expect(order.income.parts ?? 0).toBeGreaterThan(0);

      // Regression: stock.glass > 0 with 0 Crystal workers must NOT invent phantom precisionAssembly parts income.
      const noCrystal = placeOrder({
        ...m,
        makers: { ...m.makers, partsPress: 0, precisionAssembly: 1 },
        jobs: {
          ...m.jobs,
          crystalDrilling: 0,
          crystalHaulage: 0,
          partsPress: 0,
          precisionAssembly: 3,
        },
        stock: { ...m.stock, glass: 10_000, parts: 0 },
      });
      expect(slice2SteadyIncome(noCrystal).parts ?? 0).toBe(0);
      expect(slice2OrderRates(noCrystal).income.parts ?? 0).toBe(0);

      // Zero fleet returns zero steady income cleanly.
      const idleFleet = {
        ...m,
        jobs: { ...m.jobs, driving: 0 },
      };
      expect(slice2SteadyIncome(idleFleet).parts ?? 0).toBe(0);
    });

    // Part 1 invariance: with slice2Part2.off=1, Part 2 stays off and returns 0 glass/parts.
    withFactors({ ...PLAY_FACTORS, [SLICE_2_PART_2_OFF]: 1 }, () => {
      const m = foundryRoofMountain();
      expect(slice2SteadyIncome(m).glass ?? 0).toBe(0);
      expect(slice2SteadyIncome(m).parts ?? 0).toBe(0);
    });
  });

  it("bootstraps Crystal Caves -> Glassworks -> Precision Assembly and respects Crystal rock bottlenecks", () => {
    part2(() => {
      // With Parts Press running and plenty of brick/cutStone, Crystal shaft pays back.
      const ordered = placeOrder({
        ...foundryRoofMountain(),
        makers: {
          ...foundryRoofMountain().makers,
          partsPress: 4,
        },
        jobs: {
          ...foundryRoofMountain().jobs,
          partsPress: 8,
        },
      });
      expect(makersWanted(ordered)).toContain("partsPress");
      const sunkState = playFresh(ordered, 0, habits("need"), 1);
      expect(sunkState.mineLevels.crystal).toBeDefined();
      expect(sunkState.makers.glassworks).toBeGreaterThan(0);
      expect(sunkState.jobs.glassworks).toBeGreaterThanOrEqual(2);

      // Once Crystal and Glassworks are open and fed, goodRaise('parts') prefers Precision Assembly.
      const withCrystal: Mountain = {
        ...ordered,
        mineLevels: {
          ...ordered.mineLevels,
          crystal: {
            machines: { cart: 2, drill: 2, borer: 1, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        cages: { assigned: { topsoil: 2, granite: 2, crystal: 2 }, trips: {} },
        makers: {
          ...ordered.makers,
          glassworks: 1,
          precisionAssembly: 0,
        },
        jobs: {
          ...ordered.jobs,
          crystalDrilling: 8,
          crystalHaulage: 6,
          glassworks: 2,
        },
      };
      expect(makersWanted(withCrystal)).toContain("glassworks");
      expect(makersWanted(withCrystal)).toContain("precisionAssembly");
      const precRaise = goodRaise(
        withCrystal,
        habits("need"),
        "parts",
        (id) => [{ kind: "buyMaker", id }],
      );
      expect(precRaise).toEqual([
        { kind: "buyMaker", id: "precisionAssembly" },
      ]);

      // When Crystal Caves lifts too little rock for Glassworks, goodRaise('parts') raises Crystal instead of adding Precision Assembly.
      const rockStarved: Mountain = {
        ...withCrystal,
        mineLevels: {
          ...withCrystal.mineLevels,
          crystal: {
            machines: { cart: 0, drill: 0, borer: 0, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        makers: {
          ...withCrystal.makers,
          glassworks: 1,
          precisionAssembly: 1,
        },
        jobs: {
          ...withCrystal.jobs,
          crystalDrilling: 2,
          crystalHaulage: 2,
          precisionAssembly: 3,
        },
      };
      const glassFix = goodRaise(rockStarved, habits("need"), "parts", (id) => [
        { kind: "buyMaker", id },
      ]);
      expect(glassFix).toBeDefined();
      expect(
        glassFix?.some(
          (a) => a.kind === "buyMaker" && a.id === "precisionAssembly",
        ),
      ).toBe(false);
    });
  });

  it("splits earlier levels evenly into Crystal Caves for the even dad", () => {
    part2(() => {
      const m = placeOrder({
        ...foundryRoofMountain(),
        mineLevels: {
          ...foundryRoofMountain().mineLevels,
          crystal: {
            machines: { cart: 0, drill: 0, borer: 0, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
      });
      const plan = levelMoves(m, habits("even"));
      expect(plan.length).toBeGreaterThan(0);
      const split = applyPlan(m, plan);
      expect(split.jobs.crystalDrilling).toBeGreaterThan(0);
      expect(split.jobs.crystalHaulage).toBeGreaterThan(0);
      // Never splits again once Crystal has workers.
      expect(levelMoves(split, habits("even"))).toEqual([]);
    });
  });

  it("moves whole workforce to Crystal without looping with crystalBootstrapWeighed", () => {
    part2(() => {
      const base = placeOrder({
        ...foundryRoofMountain(),
        mineLevels: {
          ...foundryRoofMountain().mineLevels,
          crystal: {
            machines: { cart: 0, drill: 0, borer: 0, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        makers: {
          kiln: 18,
          saw: 6,
          glassworks: 1,
          partsPress: 1,
          precisionAssembly: 1,
        },
        jobs: {
          ...foundryRoofMountain().jobs,
          drilling: 18,
          haulage: 14,
          graniteDrilling: 0,
          graniteHaulage: 0,
          crystalDrilling: 0,
          crystalHaulage: 0,
          glassworks: 2,
          precisionAssembly: 3,
        },
        stock: {
          stones: 50_000_000,
          brick: 10_000_000,
          cutStone: 6_000_000,
          glass: 0,
          parts: 0,
        },
      });
      const plan = levelMoves(base, habits("whole"));
      expect(plan.length).toBeGreaterThan(0);
      const moved = applyPlan(base, plan);
      expect(moved.jobs.crystalDrilling).toBe(18);
      expect(moved.jobs.crystalHaulage).toBe(14);
      expect(moved.jobs.drilling).toBe(0);
      expect(moved.jobs.haulage).toBe(0);

      // Regression: whole dad with glassworks=1 and precisionAssembly=0 on Topsoil settles without hiring/moving in a loop.
      const wholePrePrec: Mountain = {
        ...base,
        makers: { ...base.makers, precisionAssembly: 0 },
        jobs: { ...base.jobs, precisionAssembly: 0 },
      };
      const settled = playFresh(wholePrePrec, 0, habits("whole"), 1);
      expect(freshPlan(settled, habits("whole"), 1)).toEqual([]);
    });
  });

  it("starts an earnable Research project, waits while delivering, installs when ready, and stops once all done", () => {
    part2(() => {
      const m: Mountain = {
        ...foundryRoofMountain(),
        operational: ["lightTower", "warehouse", "foundry", "researchLab"],
        mineLevels: {
          ...foundryRoofMountain().mineLevels,
          crystal: {
            machines: { cart: 2, drill: 2, borer: 0, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        makers: {
          kiln: 18,
          saw: 6,
          glassworks: 2,
          partsPress: 2,
          precisionAssembly: 1,
        },
        jobs: {
          ...foundryRoofMountain().jobs,
          crystalDrilling: 6,
          crystalHaulage: 4,
          glassworks: 4,
          partsPress: 4,
          precisionAssembly: 3,
        },
      };
      const startPlan = freshPlan(m, habits("need"), 1);
      expect(startPlan).toHaveLength(1);
      expect(startPlan[0]?.kind).toBe("startResearch");

      // Active and not yet ready: does not start another or install prematurely.
      const started = startResearch(m, "workBoots");
      expect(
        freshPlan(started, habits("need"), 1).some(
          (a) => a.kind === "installResearch" || a.kind === "startResearch",
        ),
      ).toBe(false);

      // Active and ready: installs immediately.
      const price = researchPrice("workBoots");
      const ready: Mountain = {
        ...started,
        research: {
          ...started.research,
          active: {
            id: "workBoots",
            arrived: {
              ...EMPTY_STOCK,
              stones: priceAmount(price, "stones"),
              parts: priceAmount(price, "parts"),
            },
          },
        },
      };
      expect(freshPlan(ready, habits("need"), 1)).toEqual([
        { kind: "installResearch" },
      ]);

      // All research done: emits no research action.
      const allDone: Mountain = {
        ...m,
        research: { done: [...RESEARCH_IDS] },
      };
      expect(
        freshPlan(allDone, habits("need"), 1).some(
          (a) => a.kind === "startResearch" || a.kind === "installResearch",
        ),
      ).toBe(false);
    });
  });
});
