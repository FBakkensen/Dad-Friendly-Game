import { describe, expect, it } from "vitest";
import {
  assignHoists,
  cageAt,
  cageRates,
  legSeconds,
  shaftCages,
  shortestRound,
  tripSeconds,
  unassignedHoists,
  unassignHoists,
} from "./cages";
import { cageInstant, type ShaftScene } from "./cage-trips";
import { applyMove, listActions, valueOf } from "./economy/actions";
import { withFactors } from "./economy/factors";
import { fieldEntry } from "./field-log";
import { sticker } from "./lab/decide";
import { planPrice } from "./lab/fresh-kit";
import { LAB_FACTORS } from "./lab/run";
import {
  MINE_LEVEL_IDS,
  crystalOpen,
  crystalShaftOpen,
  crystalShaftPrice,
  levelMachines,
  openLevels,
  shaftOpen,
  shaftPrice,
  sinkShaft,
} from "./mine-levels";
import { steadyLevels } from "./mine-piles";
import { accrue, type Mountain } from "./mountain";
import {
  PART_THREE_OFF,
  PART_TWO_OFF,
  PLAY_FACTORS,
  SLICE_2_PART_1_OFF,
  SLICE_2_PART_2_OFF,
  slice2Part2On,
} from "./part-switch";
import { levels, slice2Part1 } from "./part-three.harness";
import { SAVE_VERSION } from "./persist";
import { readGame, writeGame } from "./save-format";
import { mergeSaves } from "./save-merge";
import {
  accrueSlice2Live,
  accrueSlice2Stretches,
  slice2SteadyIncome,
} from "./slice2-flow";
import { planTransportTransfer } from "./transport";
import { haulageWorkers, jobOpen, lineWork, placeWorker } from "./workforce";

const SLICE_2_PART_2_FACTORS = {
  [PART_TWO_OFF]: 0,
  [PART_THREE_OFF]: 0,
  [SLICE_2_PART_1_OFF]: 0,
  [SLICE_2_PART_2_OFF]: 0,
} as const;

const slice2Part2 = <T>(body: () => T): T =>
  withFactors(SLICE_2_PART_2_FACTORS, body);

function readyForCrystal(): Mountain {
  const base = levels({
    sunk: true,
    operational: ["lightTower", "warehouse", "foundry"],
    topsoil: 4,
    granite: 4,
    hoisting: 6,
    hoists: 3,
    driving: 4,
    fleet: { horseWagon: 4, truck: 0 },
  });
  return {
    ...base,
    owned: { ...base.owned, helper: base.owned.helper + 10 },
    stock: {
      ...base.stock,
      stones: 50_000_000,
      brick: 30_000_000,
      cutStone: 20_000_000,
    },
  };
}

describe("Slice 2 Part 2 switch (#770)", () => {
  it("stays off in PLAY_FACTORS and LAB_FACTORS and requires slice2Part1On()", () => {
    expect(withFactors(PLAY_FACTORS, () => slice2Part2On())).toBe(false);
    expect(withFactors(LAB_FACTORS, () => slice2Part2On())).toBe(false);
    expect(
      withFactors(
        {
          [PART_TWO_OFF]: 0,
          [PART_THREE_OFF]: 0,
          [SLICE_2_PART_1_OFF]: 1,
          [SLICE_2_PART_2_OFF]: 0,
        },
        () => slice2Part2On(),
      ),
    ).toBe(false);
    expect(slice2Part2(() => slice2Part2On())).toBe(true);
  });
});

describe("Crystal Caves shaft, machines, workforce, and actions (#770)", () => {
  it("gates Crystal Caves behind slice2Part2On(), Foundry operational, and Granite sunk", () => {
    const ready = readyForCrystal();
    // Off in Part 1 even with Foundry operational and Granite sunk.
    slice2Part1(() => {
      expect(crystalShaftOpen(ready)).toBe(false);
      expect(shaftOpen(ready, "crystal")).toBe(false);
      expect(sinkShaft(ready, "crystal")).toBe(ready);
    });
    slice2Part2(() => {
      expect(crystalShaftOpen(ready)).toBe(true);
      expect(shaftOpen(ready, "crystal")).toBe(true);
      // Missing Foundry blocks Crystal shaft.
      const noFoundry: Mountain = {
        ...ready,
        operational: ["lightTower", "warehouse"],
      };
      expect(crystalShaftOpen(noFoundry)).toBe(false);
      // Missing Granite blocks Crystal shaft.
      const noGranite: Mountain = { ...ready, mineLevels: {} };
      expect(crystalShaftOpen(noGranite)).toBe(false);
      // Price is Brick + Cut stone scaled by price.crystalShaft.
      expect(crystalShaftPrice()).toEqual([
        { good: "brick", amount: 25_000_000 },
        { good: "cutStone", amount: 15_000_000 },
      ]);
      expect(shaftPrice("crystal")).toEqual(crystalShaftPrice());
      withFactors({ "price.crystalShaft": 0.5 }, () => {
        expect(crystalShaftPrice()).toEqual([
          { good: "brick", amount: 12_500_000 },
          { good: "cutStone", amount: 7_500_000 },
        ]);
      });
      // Unaffordable stock refuses sink.
      const poor: Mountain = {
        ...ready,
        stock: { ...ready.stock, brick: 100, cutStone: 100 },
      };
      expect(sinkShaft(poor, "crystal")).toBe(poor);
      // Sinking deducts Brick + Cut stone and creates an empty Crystal level.
      const sunk = sinkShaft(ready, "crystal");
      expect(crystalOpen(sunk)).toBe(true);
      expect(crystalShaftOpen(sunk)).toBe(false);
      expect(openLevels(sunk)).toEqual(["topsoil", "granite", "crystal"]);
      expect(sunk.stock.brick).toBe(ready.stock.brick - 25_000_000);
      expect(sunk.stock.cutStone).toBe(ready.stock.cutStone - 15_000_000);
      expect(sunk.mineLevels.crystal?.machines).toEqual({
        cart: 0,
        drill: 0,
        borer: 0,
        train: 0,
      });
      expect(sunk.jobs.crystalDrilling).toBe(0);
      expect(sunk.jobs.crystalHaulage).toBe(0);
    });
  });

  it("exposes Crystal sink, machine buys, jobs, and hoists only when slice2Part2 is on", () => {
    const ready = readyForCrystal();
    const sunk = slice2Part2(() => sinkShaft(ready, "crystal"));
    // Off in Part 1 even on a mountain where Crystal is already sunk.
    slice2Part1(() => {
      const actions = listActions(sunk, 0);
      expect(
        actions.some(
          (a) =>
            (a.kind === "sinkShaft" && a.level === "crystal") ||
            (a.kind === "buyGraniteMachine" && a.level === "crystal") ||
            (a.kind === "assignHoist" && a.level === "crystal") ||
            (a.kind === "placeWorker" &&
              (a.job === "crystalDrilling" || a.job === "crystalHaulage")),
        ),
      ).toBe(false);
      expect(openLevels(sunk)).toEqual(["topsoil", "granite"]);
      expect(jobOpen(sunk, "crystalDrilling")).toBe(false);
      expect(jobOpen(sunk, "crystalHaulage")).toBe(false);
      expect(
        applyMove(
          sunk,
          {
            kind: "buyGraniteMachine",
            id: "drill",
            count: 1,
            level: "crystal",
          },
          0,
        ),
      ).toEqual({ kind: "refused" });
    });

    slice2Part2(() => {
      // Before sinking: lists Crystal sinkShaft; planPrice reads full multi-good cost while stone-only sticker/valueOf return 0.
      const beforeActions = listActions(ready, 0);
      expect(beforeActions).toContainEqual({
        kind: "sinkShaft",
        level: "crystal",
      });
      expect(
        planPrice(ready, [{ kind: "sinkShaft", level: "crystal" }]),
      ).toEqual([
        { good: "brick", amount: 25_000_000 },
        { good: "cutStone", amount: 15_000_000 },
      ]);
      expect(sticker(ready, { kind: "sinkShaft", level: "crystal" })).toBe(0);
      expect(
        valueOf(ready, { kind: "sinkShaft", level: "crystal" }, 600, {
          liveSeconds: 600,
          awaySeconds: 0,
        }),
      ).toEqual({ gainPerSec: 0, cost: 0, paybackSec: Infinity });

      const sunkMove = applyMove(
        ready,
        { kind: "sinkShaft", level: "crystal" },
        0,
      );
      expect(sunkMove.kind).toBe("applied");
      if (sunkMove.kind !== "applied") {
        return;
      }
      expect(sunkMove.events).toEqual([
        { kind: "shaftSunk", level: "crystal" },
      ]);
      expect(fieldEntry({ kind: "shaftSunk", level: "crystal" })).toEqual({
        code: "shaft.sink",
        data: { id: "crystal" },
      });

      // After sinking: lists Crystal machine buys, jobs, and hoist assignment.
      const afterActions = listActions(sunkMove.mountain, 0);
      expect(afterActions).toContainEqual({
        kind: "buyGraniteMachine",
        id: "drill",
        count: 1,
        level: "crystal",
      });
      expect(afterActions).toContainEqual({
        kind: "assignHoist",
        level: "crystal",
        count: 1,
      });
      expect(afterActions).toContainEqual({
        kind: "placeWorker",
        job: "crystalDrilling",
        count: 1,
      });
      expect(afterActions).toContainEqual({
        kind: "placeWorker",
        job: "crystalHaulage",
        count: 1,
      });

      // Buying a drill for Crystal increments owned.drill and crystal.machines.drill only.
      const bought = applyMove(
        sunkMove.mountain,
        { kind: "buyGraniteMachine", id: "drill", count: 1, level: "crystal" },
        0,
      );
      expect(bought.kind).toBe("applied");
      if (bought.kind !== "applied") {
        return;
      }
      expect(bought.mountain.owned.drill).toBe(
        sunkMove.mountain.owned.drill + 1,
      );
      expect(levelMachines(bought.mountain, "crystal").drill).toBe(1);
      expect(levelMachines(bought.mountain, "granite").drill).toBe(
        levelMachines(sunkMove.mountain, "granite").drill,
      );
      expect(levelMachines(bought.mountain, "topsoil").drill).toBe(
        levelMachines(sunkMove.mountain, "topsoil").drill,
      );
      expect(bought.events).toEqual([
        {
          kind: "graniteMachineBought",
          id: "drill",
          count: 1,
          level: "crystal",
        },
      ]);
      expect(
        fieldEntry({
          kind: "graniteMachineBought",
          id: "drill",
          count: 1,
          level: "crystal",
        }),
      ).toEqual({ code: "crystal.buy", data: { id: "drill", count: 1 } });

      // Placing workers on Crystal haulage counts in haulageWorkers (Loading crews).
      const withCrew = placeWorker(
        placeWorker(bought.mountain, "crystalDrilling", 3),
        "crystalHaulage",
        2,
      );
      expect(haulageWorkers(withCrew)).toBe(
        withCrew.jobs.haulage +
          withCrew.jobs.graniteHaulage +
          withCrew.jobs.crystalHaulage,
      );
      // Off in Part 1, Crystal haulage is excluded from haulageWorkers.
      expect(slice2Part1(() => haulageWorkers(withCrew))).toBe(
        withCrew.jobs.haulage + withCrew.jobs.graniteHaulage,
      );
    });
  });
});

describe("3-level hoisting, 30 s Crystal trips, and pithead flow (#770)", () => {
  it("gives Crystal Caves a 30 s round trip (15 s down, 15 s up) and 60 s 3-level unassigned round", () => {
    expect(tripSeconds("crystal")).toBe(30);
    expect(legSeconds("crystal", "down")).toBe(15);
    expect(legSeconds("crystal", "up")).toBe(15);
    withFactors({ "trip.crystal": 0.5 }, () => {
      expect(tripSeconds("crystal")).toBe(15);
    });

    const bothCage = {
      key: "hoist:0" as const,
      load: 600,
      runs: true,
      serves: "both" as const,
    };
    const crystalCage = {
      key: "hoist:1" as const,
      load: 600,
      runs: true,
      serves: "crystal" as const,
    };
    expect(shortestRound([bothCage], "topsoil", ["topsoil", "granite"])).toBe(
      30,
    );
    expect(shortestRound([bothCage], "crystal", ["topsoil", "granite"])).toBe(
      Infinity,
    );
    expect(
      shortestRound([bothCage], "crystal", ["topsoil", "granite", "crystal"]),
    ).toBe(60);
    expect(
      shortestRound([bothCage, crystalCage], "crystal", [
        "topsoil",
        "granite",
        "crystal",
      ]),
    ).toBe(30);
    expect(cageRates([crystalCage]).own).toEqual({
      topsoil: 0,
      granite: 0,
      crystal: 20,
    });
  });

  it("assigns hoists across all 3 open levels and cycles unassigned cages topsoil -> granite -> crystal -> topsoil", () => {
    slice2Part2(() => {
      const sunk = sinkShaft(readyForCrystal(), "crystal");
      expect(unassignedHoists(sunk)).toBe(3);
      const assigned = assignHoists(
        assignHoists(assignHoists(sunk, "topsoil", 1), "granite", 1),
        "crystal",
        1,
      );
      expect(assigned.cages.assigned).toEqual({
        topsoil: 1,
        granite: 1,
        crystal: 1,
      });
      expect(unassignedHoists(assigned)).toBe(0);
      const freed = unassignHoists(assigned, "crystal", 1);
      expect(freed.cages.assigned.crystal).toBe(0);
      expect(unassignedHoists(freed)).toBe(1);

      const speed = {
        helper: 1,
        cart: 10,
        hoist: 60,
        drill: 10,
        borer: 50,
        train: 200,
        machine: 480,
        kid: 0,
      };
      const work = lineWork(assigned, speed);
      const cages = shaftCages({
        owned: assigned.owned,
        speed,
        hoisting: work.hoisting,
        pay: 1,
        assigned: assigned.cages.assigned,
        levels: openLevels(assigned),
      });
      expect(cages.map((c) => [c.key, c.serves])).toEqual([
        ["hoist:0", "topsoil"],
        ["hoist:1", "granite"],
        ["hoist:2", "crystal"],
        ["winch", "both"],
      ]);

      // Unassigned cage cycles topsoil -> granite -> crystal -> topsoil over 60 s.
      expect(cageAt({}, "hoist:0", 0, MINE_LEVEL_IDS).level).toBe("crystal");
      expect(cageAt({}, "hoist:1", 1, MINE_LEVEL_IDS).level).toBe("topsoil");
      expect(cageAt({}, "hoist:2", 2, MINE_LEVEL_IDS).level).toBe("granite");

      const shaftScene: ShaftScene = {
        stone: { held: 0, holds: 100_000 },
        levels: {
          topsoil: {
            shaft: { held: 10_000, holds: 10_000 },
            maker: { held: 0, holds: 0 },
            coming: true,
            inTurn: true,
          },
          granite: {
            shaft: { held: 10_000, holds: 10_000 },
            maker: { held: 0, holds: 0 },
            coming: true,
            inTurn: true,
          },
          crystal: {
            shaft: { held: 10_000, holds: 10_000 },
            maker: { held: 0, holds: 0 },
            coming: true,
            inTurn: true,
          },
        },
      };
      const cage = {
        key: "hoist:0" as const,
        load: 600,
        runs: true,
        serves: "both" as const,
      };
      // Start at top having just arrived from crystal -> next is topsoil.
      const step1 = cageInstant(
        [cage],
        { "hoist:0": { level: "crystal", carried: 0, leg: { kind: "top" } } },
        shaftScene,
      );
      expect(step1.trips["hoist:0"]?.level).toBe("topsoil");
      expect(step1.trips["hoist:0"]?.leg).toEqual({ kind: "down", left: 5 });
      // After returning from topsoil -> next is granite.
      const step2 = cageInstant(
        [cage],
        {
          "hoist:0": {
            level: "topsoil",
            carried: 600,
            leg: { kind: "up", left: 0 },
          },
        },
        shaftScene,
      );
      expect(step2.trips["hoist:0"]?.level).toBe("granite");
      expect(step2.trips["hoist:0"]?.leg).toEqual({ kind: "down", left: 10 });
      // After returning from granite -> next is crystal.
      const step3 = cageInstant(
        [cage],
        {
          "hoist:0": {
            level: "granite",
            carried: 600,
            leg: { kind: "up", left: 0 },
          },
        },
        shaftScene,
      );
      expect(step3.trips["hoist:0"]?.level).toBe("crystal");
      expect(step3.trips["hoist:0"]?.leg).toEqual({ kind: "down", left: 15 });
      // After returning from crystal -> wraps back to topsoil.
      const step4 = cageInstant(
        [cage],
        {
          "hoist:0": {
            level: "crystal",
            carried: 600,
            leg: { kind: "up", left: 0 },
          },
        },
        shaftScene,
      );
      expect(step4.trips["hoist:0"]?.level).toBe("topsoil");
      expect(step4.trips["hoist:0"]?.leg).toEqual({ kind: "down", left: 5 });
    });
  });

  it("flows rock from all 3 open levels into pithead and Stone with live vs. offline agreement", () => {
    slice2Part2(() => {
      const sunk = sinkShaft(readyForCrystal(), "crystal");
      const staffed = assignHoists(
        placeWorker(
          placeWorker(sunk, "crystalDrilling", 4),
          "crystalHaulage",
          4,
        ),
        "crystal",
        1,
      );
      const start: Mountain = {
        ...staffed,
        stock: { ...staffed.stock, stones: 0 },
        stockyard: 10,
      };
      // Proportional draw across all 3 pitheads for pitToStockyardStones.
      const withPitheads: Mountain = {
        ...start,
        pithead: { topsoil: 100, granite: 100, crystal: 200 },
      };
      const transfer = planTransportTransfer(withPitheads, 40);
      expect(transfer.moved.pitToStockyardStones).toBe(40);
      expect(transfer.stoneFromPithead).toEqual({
        topsoil: 10,
        granite: 10,
        crystal: 20,
      });

      // Steady levels report positive face, haul, lift on all 3 levels.
      const steady = steadyLevels(start);
      expect(steady.crystal.face).toBeGreaterThan(0);
      expect(steady.crystal.haul).toBeGreaterThan(0);
      expect(steady.crystal.lift).toBeGreaterThan(0);
      expect(slice2SteadyIncome(start).stones ?? 0).toBeGreaterThan(0);

      // 8-hour live vs. stretch comparison with all 3 levels active (spec rule 5.3: <= 1%).
      const eightHoursMs = 8 * 3_600_000;
      const live = accrueSlice2Live(start, 0, eightHoursMs, 1);
      const offline = accrueSlice2Stretches(start, 0, eightHoursMs, 1);
      expect(live.mined).toBeGreaterThan(0);
      expect(offline.mined).toBeGreaterThan(0);
      const minedGap =
        Math.abs(live.mined - offline.mined) / Math.max(1, offline.mined);
      expect(minedGap).toBeLessThan(0.01);
      const liveStones = live.mountain.stock.stones;
      const offStones = offline.mountain.stock.stones;
      expect(liveStones).toBeGreaterThan(0);
      const stoneGap =
        Math.abs(liveStones - offStones) / Math.max(1, offStones);
      expect(stoneGap).toBeLessThan(0.01);

      // Accrue wrapper also advances Crystal Caves cleanly in live mode.
      const stepped = accrue({
        mountain: start,
        from: 0,
        to: 120_000,
        live: true,
      });
      expect(stepped.mountain.rockDug).toBeGreaterThan(start.rockDug);
    });
  }, 15_000);

  it("matches live vs. offline within 1% under pure 3-level cyclic turn-taking (0 assigned hoists)", () => {
    slice2Part2(() => {
      const sunk = sinkShaft(readyForCrystal(), "crystal");
      const start: Mountain = {
        ...placeWorker(
          placeWorker(sunk, "crystalDrilling", 4),
          "crystalHaulage",
          4,
        ),
        stock: { ...sunk.stock, stones: 0 },
        stockyard: 10,
      };
      const eightHoursMs = 8 * 3_600_000;
      const liveTurn = accrueSlice2Live(start, 0, eightHoursMs, 1);
      const offTurn = accrueSlice2Stretches(start, 0, eightHoursMs, 1);
      expect(
        Math.abs(liveTurn.mined - offTurn.mined) / Math.max(1, offTurn.mined),
      ).toBeLessThan(0.01);
      expect(
        Math.abs(
          liveTurn.mountain.stock.stones - offTurn.mountain.stock.stones,
        ) / Math.max(1, offTurn.mountain.stock.stones),
      ).toBeLessThan(0.01);
    });
  }, 15_000);

  it("matches live vs. offline within 1% when one of 3 open levels is idle (40 s Topsoil+Crystal cycle)", () => {
    slice2Part2(() => {
      const sunk = sinkShaft(readyForCrystal(), "crystal");
      const staffed = placeWorker(
        placeWorker(sunk, "crystalDrilling", 4),
        "crystalHaulage",
        4,
      );
      const skipGranite: Mountain = {
        ...staffed,
        stock: { ...staffed.stock, stones: 0 },
        stockyard: 10,
        jobs: {
          ...staffed.jobs,
          graniteDrilling: 0,
          graniteHaulage: 0,
        },
      };
      const eightHoursMs = 8 * 3_600_000;
      const liveSkip = accrueSlice2Live(skipGranite, 0, eightHoursMs, 1);
      const offSkip = accrueSlice2Stretches(skipGranite, 0, eightHoursMs, 1);
      expect(
        Math.abs(liveSkip.mined - offSkip.mined) / Math.max(1, offSkip.mined),
      ).toBeLessThan(0.01);
    });
  }, 15_000);
});

describe("v11 backwards compatibility & save merge (#770)", () => {
  it("stays on SAVE_VERSION 11, reads Part 1 v11 saves with zero crystal keys, and merges Crystal progress", () => {
    expect(SAVE_VERSION).toBe(11);
    const part1Save = {
      owned: { helper: 6, hoist: 2 },
      mineLevels: { granite: {} },
      pithead: { topsoil: 12, granite: 5 },
      cages: { assigned: { topsoil: 1, granite: 1 } },
    };
    const loaded = readGame(part1Save, 0);
    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") {
      return;
    }
    expect(loaded.mountain.pithead.crystal).toBe(0);
    expect(loaded.mountain.jobs.crystalDrilling).toBe(0);
    expect(loaded.mountain.jobs.crystalHaulage).toBe(0);
    expect(loaded.mountain.cages.assigned.crystal).toBe(0);
    const written = writeGame(loaded.mountain);
    expect(written.pithead).toEqual({ topsoil: 12, granite: 5 });
    expect(written.cages).toEqual({ assigned: { topsoil: 1, granite: 1 } });

    // Sinking Crystal Caves fast-forwards over a Granite-only save.
    const before = readyForCrystal();
    const after = slice2Part2(() => sinkShaft(before, "crystal"));
    const merged = mergeSaves(
      { mountain: before, lastSeen: 1000, rev: 1 },
      { mountain: after, lastSeen: 2000, rev: 2 },
    );
    expect(merged.kind).toBe("fast-forward");
    if (merged.kind === "fast-forward") {
      expect(merged.mountain).toBe(after);
    }

    // Machine bought on Crystal vs Granite with equal rockDug is a conflict.
    const buyOnGranite = slice2Part2(() =>
      applyMove(after, { kind: "buyGraniteMachine", id: "drill", count: 1 }, 0),
    );
    const buyOnCrystal = slice2Part2(() =>
      applyMove(
        after,
        { kind: "buyGraniteMachine", id: "drill", count: 1, level: "crystal" },
        0,
      ),
    );
    expect(buyOnGranite.kind).toBe("applied");
    expect(buyOnCrystal.kind).toBe("applied");
    if (buyOnGranite.kind === "applied" && buyOnCrystal.kind === "applied") {
      const split = mergeSaves(
        { mountain: buyOnGranite.mountain, lastSeen: 1000, rev: 1 },
        { mountain: buyOnCrystal.mountain, lastSeen: 1000, rev: 2 },
      );
      expect(split.kind).toBe("conflict");
    }
  });
});
