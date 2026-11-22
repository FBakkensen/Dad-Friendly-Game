import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  JOB_IDS,
  LEVEL_JOBS,
  NO_JOBS,
  freeWorker,
  freeWorkers,
  haulageWorkers,
  jobOpen,
  jobRoom,
  lineWork,
  placeable,
  placeWorker,
  stageWork,
  toolSpeed,
  workersOnJobs,
  STAGE_JOB,
  type LevelStage,
  type StageMachine,
} from "./workforce";
import { createMountain, type Mountain } from "./mountain";
import { withFactors } from "./economy/factors";
import { effectiveRates } from "./rates";
import { applyMove, listActions, valueOf } from "./economy/actions";
import { promote } from "./engineers";
import { fieldEntry } from "./field-log";
import { synergyBonus, upgradeById } from "./upgrades";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import {
  MINE_LEVEL_IDS,
  NO_GRANITE_PILES,
  NO_LEVEL_MACHINES,
  type LevelMachineId,
  type MineLevelId,
} from "./mine-levels";
import { STAGES, type Stage } from "./line";
import { tripSeconds } from "./cages";
import {
  TIERS,
  machineStaff,
  tierById,
  tierInPlay,
  tierRecord,
  type MachineId,
  type TierId,
} from "./tiers";

const fresh = <T>(body: () => T): T => withFactors({}, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0 }, body);
const partThree = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);
const PART_THREE_ON = { [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 };

/** The mountain with the shaft sunk, as `sinkShaft` leaves it. */
const sunk = (mountain: Mountain): Mountain => ({
  ...mountain,
  mineLevels: {
    granite: {
      machines: NO_LEVEL_MACHINES,
      piles: NO_GRANITE_PILES,
    },
  },
});

function crew(helpers: number, jobs: Partial<Mountain["jobs"]> = {}): Mountain {
  const start = fresh(() => createMountain());
  return {
    ...start,
    owned: { ...start.owned, helper: helpers },
    jobs: {
      drilling: 0,
      haulage: 0,
      hoisting: 0,
      driving: 0,
      building: 0,
      kilns: 0,
      graniteDrilling: 0,
      graniteHaulage: 0,
      saws: 0,
      crystalDrilling: 0,
      crystalHaulage: 0,
      ...jobs,
    },
  };
}

describe("one workforce (slice 1, rule 2, #689)", () => {
  it("has the five jobs of part 1, the kilns of part 2 (#666), the Granite's two (#673), and Crystal's two (#770)", () => {
    expect(JOB_IDS).toEqual([
      "drilling",
      "haulage",
      "hoisting",
      "driving",
      "building",
      "kilns",
      "graniteDrilling",
      "graniteHaulage",
      "saws",
      "crystalDrilling",
      "crystalHaulage",
    ]);
  });

  it("opens the Granite's drilling and haulage with the shaft, in part 3 only (rule 5.1)", () => {
    const start = partTwo(() => createMountain());
    for (const job of ["graniteDrilling", "graniteHaulage"] as const) {
      expect(partThree(() => jobOpen(start, job))).toBe(false);
      expect(partThree(() => jobOpen(sunk(start), job))).toBe(true);
      expect(partTwo(() => jobOpen(sunk(start), job))).toBe(false);
    }
    expect(partThree(() => jobOpen(start, "drilling"))).toBe(true);
  });

  it("opens the saws' job with the saw: the shaft sunk, in part 3 only (#673)", () => {
    const start = partTwo(() => createMountain());
    expect(partThree(() => jobOpen(start, "saws"))).toBe(false);
    expect(partThree(() => jobOpen(sunk(start), "saws"))).toBe(true);
    expect(partTwo(() => jobOpen(sunk(start), "saws"))).toBe(false);
  });

  it("gives each level its face and haul jobs (#673, #770)", () => {
    expect(LEVEL_JOBS).toEqual({
      topsoil: { face: "drilling", haul: "haulage" },
      granite: { face: "graniteDrilling", haul: "graniteHaulage" },
      crystal: { face: "crystalDrilling", haul: "crystalHaulage" },
    });
  });

  it("lists the Granite's moves once the shaft is sunk, and none before", () => {
    const start = partThree(() => ({
      ...crew(3),
      operational: ["lightTower"] as Mountain["operational"],
    }));
    const place = {
      kind: "placeWorker",
      job: "graniteHaulage",
      count: 1,
    } as const;
    expect(partThree(() => listActions(start, 0))).not.toContainEqual(place);
    expect(partThree(() => listActions(sunk(start), 0))).toContainEqual(place);
    expect(partTwo(() => listActions(sunk(start), 0))).not.toContainEqual(
      place,
    );
    const refused = partThree(() => applyMove(start, place, 0));
    expect(refused.kind).toBe("refused");
  });

  it("never changes how many workers he has, with the Granite's jobs too (#673)", () => {
    fc.assert(
      fc.property(
        fc.nat(20),
        fc.array(
          fc.record({
            job: fc.constantFrom(...JOB_IDS),
            place: fc.boolean(),
            count: fc.constantFrom(1, 10, Infinity),
          }),
          { maxLength: 40 },
        ),
        (helpers, moves) => {
          let state = sunk(crew(helpers));
          for (const move of moves) {
            state = partThree(() =>
              move.place
                ? placeWorker(state, move.job, move.count)
                : freeWorker(state, move.job, move.count),
            );
            expect(state.owned.helper).toBe(helpers);
            expect(freeWorkers(state)).toBeGreaterThanOrEqual(0);
            expect(workersOnJobs(state)).toBeLessThanOrEqual(helpers);
          }
        },
      ),
    );
  });

  it("takes a worker off a Granite job even while it is closed: no lock", () => {
    const stuck = crew(3, { graniteDrilling: 2 });
    const freed = partTwo(() => freeWorker(stuck, "graniteDrilling"));
    expect(freed.jobs.graniteDrilling).toBe(1);
    expect(partTwo(() => listActions(stuck, 0))).toContainEqual({
      kind: "freeWorker",
      job: "graniteDrilling",
      count: 1,
    });
  });

  it("starts a fresh mine with its one worker on a job: drilling (#703)", () => {
    const start = fresh(() => createMountain());
    expect(start.owned.helper).toBe(1);
    expect(start.jobs).toEqual({ ...NO_JOBS, drilling: 1 });
    expect(freeWorkers(start)).toBe(0);
  });

  it("counts the free workers as the ones on no job", () => {
    const some = crew(7, { drilling: 2, driving: 1 });
    expect(workersOnJobs(some)).toBe(3);
    expect(freeWorkers(some)).toBe(4);
  });

  it("moves one free worker onto a job, and one off, for free", () => {
    const some = crew(2, { haulage: 1 });
    const placed = placeWorker(some, "hoisting");
    expect(placed.jobs.hoisting).toBe(1);
    expect(freeWorkers(placed)).toBe(0);
    expect(placed.stock).toEqual(some.stock);
    expect(placeWorker(placed, "drilling")).toBe(placed);
    const freed = freeWorker(placed, "haulage");
    expect(freed.jobs.haulage).toBe(0);
    expect(freeWorkers(freed)).toBe(1);
    expect(freeWorker(freed, "haulage")).toBe(freed);
  });

  it("moves no worker for a count below one, and whole ones for a fraction", () => {
    const start = createMountain();
    const crew = {
      ...start,
      owned: { ...start.owned, helper: 5 },
      jobs: { ...NO_JOBS, drilling: 3 },
    };
    expect(freeWorker(crew, "drilling", -5)).toBe(crew);
    expect(placeWorker(crew, "haulage", Number.NaN)).toBe(crew);
    expect(placeWorker(crew, "haulage", 1.9).jobs.haulage).toBe(1);
  });

  it("moves up to a count at once: the ones there are, and no more (#659)", () => {
    const some = crew(14, { haulage: 3 });
    const placed = placeWorker(some, "drilling", 10);
    expect(placed.jobs.drilling).toBe(10);
    expect(freeWorkers(placed)).toBe(1);
    // Fewer free than ten: ×10 moves the ones there are.
    expect(placeWorker(placed, "hoisting", 10).jobs.hoisting).toBe(1);
    expect(freeWorker(placed, "haulage", 10).jobs.haulage).toBe(0);
    expect(freeWorkers(freeWorker(placed, "haulage", 10))).toBe(4);
    expect(placeWorker(placed, "drilling", Infinity).jobs.drilling).toBe(11);
    expect(placeWorker(some, "drilling", 0)).toBe(some);
  });

  it("stops transport at the vehicles: one driver each (#715)", () => {
    const some = { ...crew(30), fleet: { horseWagon: 13, truck: 0 } };
    expect(placeWorker(some, "driving", Infinity).jobs.driving).toBe(13);
    expect(placeWorker(some, "driving", 10).jobs.driving).toBe(10);
    const full = placeWorker(some, "driving", Infinity);
    expect(placeWorker(full, "driving")).toBe(full);
    expect(jobRoom(full, "driving")).toBe(0);
    expect(placeable(full, "driving")).toBe(0);
    expect(placeable(full, "building")).toBe(17);
    expect(placeWorker(full, "building", Infinity).jobs.building).toBe(17);
    // A save with more drivers than vehicles is read as it is.
    const over = {
      ...crew(30, { driving: 20 }),
      fleet: { horseWagon: 13, truck: 0 },
    };
    expect(jobRoom(over, "driving")).toBe(0);
    expect(placeWorker(over, "driving")).toBe(over);
    expect(freeWorker(over, "driving").jobs.driving).toBe(19);
  });

  it("never changes how many workers he has", () => {
    fc.assert(
      fc.property(
        fc.nat(20),
        fc.array(
          fc.record({
            job: fc.constantFrom(...JOB_IDS),
            place: fc.boolean(),
            count: fc.constantFrom(1, 10, Infinity),
          }),
          { maxLength: 40 },
        ),
        (helpers, moves) => {
          let state = crew(helpers);
          for (const move of moves) {
            state = move.place
              ? placeWorker(state, move.job, move.count)
              : freeWorker(state, move.job, move.count);
            expect(state.owned.helper).toBe(helpers);
            expect(freeWorkers(state)).toBeGreaterThanOrEqual(0);
            for (const job of JOB_IDS) {
              expect(state.jobs[job]).toBeGreaterThanOrEqual(0);
            }
          }
        },
      ),
    );
  });
});

describe("a stage's workers run its machines (rule 2.5)", () => {
  const cart: StageMachine = { id: "cart", owned: 2, staff: 1, speed: 18 };
  const train: StageMachine = { id: "train", owned: 1, staff: 8, speed: 3_201 };

  it("works with tools when it has no machine", () => {
    expect(stageWork([], 4, 3)).toEqual({
      running: {},
      tools: 4,
      moves: 12,
      short: 0,
    });
  });

  it("leaves a machine idle until the stage has the workers it takes", () => {
    expect(stageWork([train], 7, 3)).toEqual({
      running: { train: 0 },
      tools: 7,
      moves: 21,
      short: 8,
    });
    expect(stageWork([train], 9, 3)).toEqual({
      running: { train: 1 },
      tools: 1,
      moves: 3_204,
      short: 0,
    });
  });

  it("runs the machines that together move the most", () => {
    // Ten workers: the locomotive (8) and two carts (2) beat four carts.
    expect(stageWork([cart, train], 10, 3)).toEqual({
      running: { cart: 2, train: 1 },
      tools: 0,
      moves: 3_237,
      short: 0,
    });
  });

  it("stays on the tools where they move more than a machine", () => {
    const slow: StageMachine = { id: "cart", owned: 3, staff: 2, speed: 5 };
    expect(stageWork([slow], 4, 3)).toEqual({
      running: { cart: 0 },
      tools: 4,
      moves: 12,
      short: 0,
    });
  });

  it("never moves less with one more worker or one more machine", () => {
    fc.assert(
      fc.property(
        fc.nat(6),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 400 }),
        fc.nat(4),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 4_000 }),
        fc.nat(60),
        fc.integer({ min: 1, max: 10 }),
        (ownA, staffA, speedA, ownB, staffB, speedB, workers, tool) => {
          const a: StageMachine = {
            id: "cart",
            owned: ownA,
            staff: staffA,
            speed: speedA,
          };
          const b: StageMachine = {
            id: "train",
            owned: ownB,
            staff: staffB,
            speed: speedB,
          };
          const now = stageWork([a, b], workers, tool).moves;
          expect(
            stageWork([a, b], workers + 1, tool).moves,
          ).toBeGreaterThanOrEqual(now);
          expect(
            stageWork([{ ...a, owned: ownA + 1 }, b], workers, tool).moves,
          ).toBeGreaterThanOrEqual(now);
          expect(
            stageWork([a, { ...b, owned: ownB + 1 }], workers, tool).moves,
          ).toBeGreaterThanOrEqual(now);
        },
      ),
    );
  });
});

describe("the line in a fresh mine (rule 2.5, 2.9)", () => {
  /** A fresh mine with these jobs, these machines, and every worker on a job unless `free` says otherwise. */
  function line(
    jobs: Partial<Mountain["jobs"]>,
    machines: Partial<Mountain["owned"]> = {},
    free = 0,
    boots = 0,
  ): Mountain {
    const placed = crew(0, jobs);
    const start = fresh(() => createMountain());
    return {
      ...placed,
      owned: {
        ...start.owned,
        ...machines,
        helper: workersOnJobs(placed) + free,
      },
      upgrades: { ...start.upgrades, boots },
    };
  }

  it("moves what its slowest stage moves, and no worker spreads to it", () => {
    fresh(() => {
      // A worker with a tool moves 3 a second on his stage.
      const rates = effectiveRates(
        line({ drilling: 4, haulage: 1, hoisting: 3 }),
      );
      expect(rates.crewPerSecond).toBe(3);
      expect(rates.running.helper).toBe(8);
    });
  });

  it("runs a machine when its stage has the workers, and the rest work with tools", () => {
    fresh(() => {
      // Drilling: a drill (108) and two picks (6). Haulage: a cart (60, its
      // fresh rating) and two barrows (6). Hoisting: a hoist (60) and two
      // winches (6).
      const rates = effectiveRates(
        line(
          { drilling: 3, haulage: 3, hoisting: 3 },
          { drill: 1, cart: 1, hoist: 1 },
        ),
      );
      expect(rates.running).toMatchObject({
        drill: 1,
        cart: 1,
        hoist: 1,
        helper: 6,
      });
      expect(rates.crewPerSecond).toBe(66);
    });
  });

  it("leaves a machine idle while its stage has nobody for it", () => {
    fresh(() => {
      const rates = effectiveRates(
        line({ drilling: 3, haulage: 0, hoisting: 3 }, { cart: 2 }),
      );
      expect(rates.running.cart).toBe(0);
      expect(rates.crewPerSecond).toBe(0);
      expect(rates.helpersShort).toBe(2);
    });
  });

  it("is short of nobody when a tool moves more than an idle machine", () => {
    fresh(() => {
      // A cart slower than a tool (18 against 24 at 100 workers) stands.
      const mountain = line(
        { drilling: 5, haulage: 5, hoisting: 5 },
        { cart: 2 },
        85,
      );
      const speed = { ...effectiveRates(mountain).tierSpeed, cart: 18 };
      const work = lineWork(mountain, speed);
      expect(toolSpeed(speed, "haul")).toBeGreaterThan(18);
      expect(work.running.cart).toBe(0);
      expect(work.short).toBe(0);
    });
  });

  it("keeps a cart ahead of a tool at 100 workers with Work boots (#655, risk 15)", () => {
    fresh(() => {
      const rates = effectiveRates(
        line({ drilling: 5, haulage: 5, hoisting: 5 }, { cart: 2 }, 85, 1),
      );
      expect(toolSpeed(rates.tierSpeed, "haul")).toBeLessThan(
        rates.tierSpeed.cart,
      );
      expect(rates.running.cart).toBe(2);
    });
  });

  it("does no work with a free worker, but counts him for the marks", () => {
    fresh(() => {
      const placed = { drilling: 1, haulage: 1, hoisting: 1 };
      expect(effectiveRates(line(placed, {}, 5)).crewPerSecond).toBe(3);
      // At 25 workers he owns, the worker marks double every tool.
      expect(effectiveRates(line(placed, {}, 22)).crewPerSecond).toBe(6);
    });
  });

  it("lifts only a worker with a tool with Work boots, never a machine", () => {
    fresh(() => {
      const booted = effectiveRates(
        line(
          { drilling: 2, haulage: 2, hoisting: 2 },
          { cart: 1, hoist: 1, drill: 1 },
          0,
          1,
        ),
      );
      expect(booted.tierSpeed.cart).toBe(60);
      expect(booted.tierSpeed.helper).toBeCloseTo(2.36);
    });
  });

  it("counts haulage's workers on both levels for Loading crews (rule 5.2)", () => {
    partThree(() => {
      const hands = upgradeById("cartSyn");
      const both = sunk(
        line({ haulage: 2, graniteHaulage: 3, drilling: 1 }, {}, 3),
      );
      const one = line({ haulage: 5, drilling: 1 }, {}, 3);
      expect(haulageWorkers(both)).toBe(5);
      expect(synergyBonus(both, hands)).toBeCloseTo(0.05);
      expect(synergyBonus(both, hands)).toBe(synergyBonus(one, hands));
    });
  });

  it("counts only the Topsoil's haulage for Loading crews with part 3 off (#673)", () => {
    partTwo(() => {
      const hands = upgradeById("cartSyn");
      const deep = sunk(
        line({ haulage: 2, graniteHaulage: 3, drilling: 1 }, {}, 3),
      );
      const shallow = line({ haulage: 2, drilling: 1 }, {}, 6);
      expect(haulageWorkers(deep)).toBe(2);
      expect(synergyBonus(deep, hands)).toBeCloseTo(0.02);
      expect(synergyBonus(deep, hands)).toBe(synergyBonus(shallow, hands));
    });
  });

  it("counts haulage's workers for Loading crews", () => {
    fresh(() => {
      const hands = upgradeById("cartSyn");
      expect(
        synergyBonus(line({ haulage: 7, drilling: 2 }, {}, 3), hands),
      ).toBeCloseTo(0.07);
    });
  });
});

describe("the moves (rule 2.4)", () => {
  it("lists a free worker's move onto each job, and a move off each job with someone on it", () => {
    fresh(() => {
      const moves = (mountain: Mountain): string[] =>
        listActions(mountain, 0).flatMap((action) =>
          action.kind === "placeWorker" || action.kind === "freeWorker"
            ? [`${action.kind}:${action.job}`]
            : [],
        );
      expect(moves(crew(1, { haulage: 1 }))).toEqual(["freeWorker:haulage"]);
      // Transport has no room past the one wagon he is given (#715).
      expect(moves(crew(3, { driving: 1 }))).not.toContain(
        "placeWorker:driving",
      );
      expect(moves(crew(2, { haulage: 1 }))).toEqual([
        "placeWorker:drilling",
        "placeWorker:haulage",
        "freeWorker:haulage",
        "placeWorker:hoisting",
        "placeWorker:driving",
        "placeWorker:building",
      ]);
    });
  });

  it("moves as many as the amount key says, and logs the job's new count (#659)", () => {
    fresh(() => {
      const moved = applyMove(
        crew(12, { haulage: 1 }),
        { kind: "placeWorker", job: "drilling", count: 10 },
        0,
      );
      expect(moved.kind === "applied" && moved.mountain.jobs.drilling).toBe(10);
      expect(moved.kind === "applied" && moved.events).toEqual([
        { kind: "workerPlaced", job: "drilling", count: 10 },
      ]);
    });
  });

  it("moves a worker for free and logs it", () => {
    fresh(() => {
      const moved = applyMove(
        crew(2, { haulage: 1 }),
        { kind: "placeWorker", job: "hoisting", count: 1 },
        0,
      );
      if (moved.kind !== "applied") {
        throw new Error("move refused");
      }
      expect(moved.mountain.jobs.hoisting).toBe(1);
      expect(moved.events).toEqual([
        { kind: "workerPlaced", job: "hoisting", count: 1 },
      ]);
      expect(moved.spent.stones).toBe(0);
      const back = applyMove(
        moved.mountain,
        { kind: "freeWorker", job: "hoisting", count: 1 },
        0,
      );
      expect(back.kind === "applied" && back.events).toEqual([
        { kind: "workerFreed", job: "hoisting", count: 0 },
      ]);
      expect(
        fieldEntry({ kind: "workerPlaced", job: "hoisting", count: 1 }),
      ).toEqual({
        code: "worker.place",
        data: { id: "hoisting", count: 1 },
      });
      expect(
        fieldEntry({ kind: "workerFreed", job: "driving", count: 0 }),
      ).toEqual({
        code: "worker.free",
        data: { id: "driving", count: 0 },
      });
    });
  });

  it("refuses them with nobody free or nobody on the job", () => {
    fresh(() => {
      expect(
        applyMove(
          crew(1, { haulage: 1 }),
          { kind: "placeWorker", job: "drilling", count: 1 },
          0,
        ).kind,
      ).toBe("refused");
      expect(
        applyMove(crew(1), { kind: "freeWorker", job: "drilling", count: 1 }, 0)
          .kind,
      ).toBe("refused");
    });
  });

  it("values a move at what the line gains, for free", () => {
    fresh(() => {
      const context = { liveSeconds: 60, awaySeconds: 0 };
      // One on each stage moves 3; a fourth on haulage moves nothing more.
      const mine = crew(4, { drilling: 1, haulage: 1, hoisting: 1 });
      const haul = valueOf(
        mine,
        { kind: "placeWorker", job: "haulage", count: 1 },
        3600,
        context,
      );
      expect(haul.gainPerSec).toBe(0);
      expect(haul.cost).toBe(0);
      const off = valueOf(
        mine,
        { kind: "freeWorker", job: "drilling", count: 1 },
        3600,
        context,
      );
      expect(off.gainPerSec).toBeLessThan(0);
    });
  });

  it("takes a promotion from a free worker only", () => {
    fresh(() => {
      const placed = {
        ...crew(3, { drilling: 3 }),
        stock: { ...createMountain().stock, stones: 1e9 },
      };
      const withBorer = { ...placed, owned: { ...placed.owned, borer: 1 } };
      expect(promote(withBorer)).toBe(withBorer);
      const one = { ...withBorer, owned: { ...withBorer.owned, helper: 4 } };
      const promoted = promote(one);
      expect(promoted.owned.helper).toBe(3);
      expect(freeWorkers(promoted)).toBe(0);
    });
  });
});

describe("each level's work (rule 5.1, 5.2, #673)", () => {
  const LEVEL_STAGES: readonly LevelStage[] = ["face", "haul"];
  /** The machines of each level stage's kinds: the one in play first. */
  const STAGE_KINDS: Readonly<Record<LevelStage, readonly LevelMachineId[]>> = {
    face: ["drill", "borer"],
    haul: ["cart", "train"],
  };

  /** Tier speeds: a worker with a tool moves 3, every machine beats him. */
  const SPEED: Readonly<Record<TierId, number>> = {
    ...tierRecord(0),
    helper: 1,
    cart: 50,
    drill: 100,
    borer: 300,
    train: 150,
    hoist: 40,
  };

  type Setup = {
    readonly jobs: Partial<Mountain["jobs"]>;
    readonly topsoil?: Partial<Record<LevelMachineId, number>>;
    readonly granite?: Partial<Record<LevelMachineId, number>>;
    readonly hoists?: number;
  };

  /** A fresh mine with the shaft sunk, these jobs and each level's machines. */
  function levels(setup: Setup): Mountain {
    const placed = crew(0, setup.jobs);
    const granite = { ...NO_LEVEL_MACHINES, ...setup.granite };
    const topsoil = { ...NO_LEVEL_MACHINES, ...setup.topsoil };
    return {
      ...placed,
      owned: {
        ...placed.owned,
        helper: workersOnJobs(placed),
        cart: topsoil.cart + granite.cart,
        drill: topsoil.drill + granite.drill,
        borer: topsoil.borer + granite.borer,
        train: topsoil.train + granite.train,
        hoist: setup.hoists ?? 0,
      },
      mineLevels: {
        granite: { machines: granite, piles: NO_GRANITE_PILES },
      },
    };
  }

  /** The line as it was before the Granite: every machine he owns on the one level. */
  function todaysLine(
    mountain: Mountain,
    speed: Readonly<Record<TierId, number>>,
  ) {
    const running = tierRecord(0);
    const stages = { face: 0, haul: 0, lift: 0 };
    let short = 0;
    for (const stage of STAGES) {
      const machines = TIERS.filter(
        (tier) => tier.stage === stage && tierInPlay(tier),
      ).map((tier) => ({
        id: tier.id as MachineId,
        owned: mountain.owned[tier.id],
        staff: machineStaff(tier),
        speed: speed[tier.id],
      }));
      const work = stageWork(
        machines,
        mountain.jobs[STAGE_JOB[stage]],
        toolSpeed(speed, stage),
      );
      Object.assign(running, work.running);
      running.helper += work.tools;
      stages[stage] = work.moves;
      short += work.short;
    }
    return {
      running,
      stages,
      line: Math.min(stages.face, stages.haul, stages.lift),
      short,
    };
  }

  it("runs a level's machines with that level's workers of that stage only", () => {
    partThree(() => {
      const work = lineWork(
        levels({ jobs: { drilling: 3 }, granite: { drill: 1 } }),
        SPEED,
      );
      expect(work.levels.granite.face).toBe(0);
      expect(work.levels.topsoil.face).toBe(3 * toolSpeed(SPEED, "face"));
      expect(work.stages.face).toBe(9);
      expect(work.running.drill).toBe(0);
      expect(work.running.helper).toBe(3);
      // The Granite's drill stands for want of its three workers there.
      expect(work.short).toBe(3);
    });
  });

  it("moves both levels' machines of a kind at the one tier speed", () => {
    partThree(() => {
      const work = lineWork(
        levels({
          jobs: { drilling: 3, graniteDrilling: 3 },
          topsoil: { drill: 1 },
          granite: { drill: 1 },
        }),
        SPEED,
      );
      expect(work.levels.topsoil.face).toBe(SPEED.drill);
      expect(work.levels.granite.face).toBe(SPEED.drill);
      expect(work.running.drill).toBe(2);
      expect(work.running.helper).toBe(0);
      expect(work.short).toBe(0);
    });
  });

  it("lifts what hoisting lifts or both levels' slowest stages together, whichever is less", () => {
    partThree(() => {
      // Topsoil: two picks (6) and a cart (50). Granite: a drill on its
      // three workers (100) and two barrows (12). Hoisting: a hoist (40).
      const jobs = {
        drilling: 2,
        haulage: 1,
        graniteDrilling: 3,
        graniteHaulage: 2,
        saws: 0,
        hoisting: 1,
      };
      const setup = {
        jobs,
        topsoil: { cart: 1 },
        granite: { drill: 1 },
        hoists: 1,
      };
      const both = lineWork(levels(setup), SPEED);
      const { topsoil, granite } = both.levels;
      expect(topsoil).toEqual({ face: 6, haul: 50 });
      expect(granite).toEqual({ face: 100, haul: 12 });
      expect(both.stages).toEqual({ face: 6, haul: 50, lift: 40 });
      expect(both.line).toBe(18);
      expect(both.line).toBe(
        Math.min(
          both.stages.lift,
          Math.min(topsoil.face, topsoil.haul) +
            Math.min(granite.face, granite.haul),
        ),
      );
      // One winch (9) lifts less than both levels bring.
      const winch = lineWork(levels({ ...setup, hoists: 0 }), SPEED);
      expect(winch.stages.lift).toBe(9);
      expect(winch.line).toBe(9);
    });
  });

  it("sets the stages apart from part 3: tools move more down the line, and a drill takes three (rule 2.14, #675)", () => {
    const drill = tierById("drill");
    const tools = () => STAGES.map((stage) => toolSpeed(SPEED, stage));
    expect(tools()).toEqual([3, 3, 3]);
    expect(machineStaff(drill)).toBe(1);
    partThree(() => {
      expect(tools()).toEqual([3, 6, 9]);
      expect(machineStaff(drill)).toBe(3);
      expect(machineStaff(tierById("cart"))).toBe(1);
      expect(machineStaff(tierById("helper"))).toBe(0);
      expect(
        withFactors(
          { ...PART_THREE_ON, "staff.drill": 2, "tool.lift": 2 },
          () => [machineStaff(drill), toolSpeed(SPEED, "lift")],
        ),
      ).toEqual([6, 18]);
    });
  });

  it("puts the most workers on drilling and the fewest on hoisting in a line in balance, on both levels (rule 2.14, #675)", () => {
    partThree(() => {
      const speed = effectiveRates(createMountain()).tierSpeed;
      // What one worker moves on a stage at best: a tool or a machine.
      const perWorker = (stage: Stage, level: MineLevelId): number => {
        const trips = tripSeconds("topsoil") / tripSeconds(level);
        const lift = stage === "lift" ? trips : 1;
        const machines = TIERS.filter(
          (tier) => tier.stage === stage && tierInPlay(tier),
        ).map((tier) => speed[tier.id] / machineStaff(tier));
        return Math.max(toolSpeed(speed, stage), ...machines) * lift;
      };
      // Part 3's rule 2.14 invariant covers Topsoil (10 s) and Granite (20 s);
      // Crystal Caves (30 s) is Slice 2 Part 2 (tuned in #772, Winding Engine retired).
      for (const level of ["topsoil", "granite"] as const) {
        // Workers a stage takes for each rock a second the line moves.
        const [face, haul, lift] = STAGES.map(
          (stage) => 1 / perWorker(stage, level),
        );
        expect(face, level).toBeGreaterThan(haul ?? 0);
        expect(haul, level).toBeGreaterThan(lift ?? 0);
      }
    });
  });

  it("names hoisting's work: the hoists that run and the winch's workers (#724)", () => {
    partThree(() => {
      // Three on hoisting and two hoists: each hoist takes one, one on the winch.
      const work = lineWork(
        levels({ jobs: { hoisting: 3 }, hoists: 2 }),
        SPEED,
      );
      expect(work.hoisting.running.hoist).toBe(2);
      expect(work.hoisting.tools).toBe(1);
      expect(work.hoisting.moves).toBe(work.stages.lift);
      expect(work.hoisting.moves).toBe(
        2 * SPEED.hoist + toolSpeed(SPEED, "lift"),
      );
    });
  });

  it("is part 2's line while the Granite is not open", () => {
    fc.assert(
      fc.property(
        fc.record({
          drilling: fc.nat(12),
          haulage: fc.nat(12),
          hoisting: fc.nat(12),
          graniteDrilling: fc.nat(12),
          graniteHaulage: fc.nat(12),
        }),
        fc.nat(3),
        fc.nat(3),
        fc.nat(3),
        fc.nat(3),
        fc.nat(3),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 20 }),
        (jobs, cart, drill, hoist, graniteCart, graniteDrill, fast, hand) => {
          const speed = { ...SPEED, helper: hand, drill: fast };
          const sunkMine = levels({
            jobs,
            topsoil: { cart, drill },
            granite: { cart: graniteCart, drill: graniteDrill },
            hoists: hoist,
          });
          const unsunk: Mountain = { ...sunkMine, mineLevels: {} };
          const shut = { face: 0, haul: 0 };
          for (const [run, mountain] of [
            [partThree, unsunk],
            [partTwo, unsunk],
            [partTwo, sunkMine],
          ] as const) {
            run(() => {
              const work = lineWork(mountain, speed);
              const today = todaysLine(mountain, speed);
              expect(work.line).toBe(today.line);
              expect(work.stages).toEqual(today.stages);
              expect(work.running).toEqual(today.running);
              expect(work.short).toBe(today.short);
              expect(work.levels.granite).toEqual(shut);
              expect(work.levels.topsoil).toEqual({
                face: today.stages.face,
                haul: today.stages.haul,
              });
            });
          }
        },
      ),
    );
  });

  it("never moves less on a level with one more machine or worker there, and never changes the other level (#673)", () => {
    const counts = fc.record({
      drilling: fc.nat(12),
      haulage: fc.nat(12),
      hoisting: fc.nat(12),
      graniteDrilling: fc.nat(12),
      graniteHaulage: fc.nat(12),
    });
    const machines = fc.record({
      cart: fc.nat(3),
      drill: fc.nat(3),
      borer: fc.nat(3),
      train: fc.nat(3),
    });
    fc.assert(
      fc.property(
        counts,
        machines,
        machines,
        fc.nat(3),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 20 }),
        (jobs, topsoil, granite, hoists, fast, hand) => {
          partThree(() => {
            const speed = { ...SPEED, helper: hand, cart: fast };
            const setup: Setup = { jobs, topsoil, granite, hoists };
            const now = lineWork(levels(setup), speed);
            const check = (
              more: Setup,
              level: MineLevelId,
              stage: LevelStage,
            ) => {
              const then = lineWork(levels(more), speed);
              const other = MINE_LEVEL_IDS.find((id) => id !== level);
              expect(then.levels[level][stage]).toBeGreaterThanOrEqual(
                now.levels[level][stage],
              );
              expect(then.levels[other ?? level]).toEqual(
                now.levels[other ?? level],
              );
              expect(then.line).toBeGreaterThanOrEqual(now.line);
            };
            for (const level of MINE_LEVEL_IDS) {
              const own = level === "topsoil" ? topsoil : granite;
              for (const stage of LEVEL_STAGES) {
                const job = LEVEL_JOBS[level][stage];
                check(
                  {
                    ...setup,
                    jobs: { ...jobs, [job]: (setup.jobs[job] ?? 0) + 1 },
                  },
                  level,
                  stage,
                );
                for (const kind of STAGE_KINDS[stage]) {
                  const added = { ...own, [kind]: own[kind] + 1 };
                  check({ ...setup, [level]: added }, level, stage);
                }
              }
            }
            for (const more of [
              { ...setup, jobs: { ...jobs, hoisting: jobs.hoisting + 1 } },
              { ...setup, hoists: hoists + 1 },
            ]) {
              const then = lineWork(levels(more), speed);
              expect(then.stages.lift).toBeGreaterThanOrEqual(now.stages.lift);
              expect(then.levels).toEqual(now.levels);
              expect(then.line).toBeGreaterThanOrEqual(now.line);
            }
          });
        },
      ),
    );
  });
});
