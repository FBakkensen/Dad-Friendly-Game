import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  JOB_IDS,
  NO_JOBS,
  freeWorker,
  freeWorkers,
  lineWork,
  placeWorker,
  stageWork,
  toolSpeed,
  workersOnJobs,
  type StageMachine,
} from "./workforce";
import { createMountain, type Mountain } from "./mountain";
import { withFactors } from "./economy/factors";
import { effectiveRates } from "./rates";
import { applyMove, listActions, valueOf } from "./economy/actions";
import { promote } from "./engineers";
import { fieldEntry } from "./field-log";
import { synergyBonus, upgradeById } from "./upgrades";
import { FRESH_OFF } from "./line-switch";

const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

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
      ...jobs,
    },
  };
}

describe("one workforce (slice 1, rule 2, #689)", () => {
  it("has the five jobs of part 1, and the kilns of part 2 (#666)", () => {
    expect(JOB_IDS).toEqual([
      "drilling",
      "haulage",
      "hoisting",
      "driving",
      "building",
      "kilns",
    ]);
  });

  it("starts a fresh mine with its one worker on a job: drilling (#703)", () => {
    const start = fresh(() => createMountain());
    expect(start.owned.helper).toBe(1);
    expect(start.jobs).toEqual({ ...NO_JOBS, drilling: 1 });
    expect(freeWorkers(start)).toBe(0);
    expect(createMountain().jobs).toEqual(NO_JOBS);
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
      expect(toolSpeed(speed)).toBeGreaterThan(18);
      expect(work.running.cart).toBe(0);
      expect(work.short).toBe(0);
    });
  });

  it("keeps a cart ahead of a tool at 100 workers with Better boots (#655, risk 15)", () => {
    fresh(() => {
      const rates = effectiveRates(
        line({ drilling: 5, haulage: 5, hoisting: 5 }, { cart: 2 }, 85, 1),
      );
      expect(toolSpeed(rates.tierSpeed)).toBeLessThan(rates.tierSpeed.cart);
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

  it("lifts only a worker with a tool with Better boots, never a machine", () => {
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

  it("counts haulage's workers for Helping hands", () => {
    fresh(() => {
      const hands = upgradeById("cartSyn");
      expect(
        synergyBonus(line({ haulage: 7, drilling: 2 }, {}, 3), hands),
      ).toBeCloseTo(0.07);
    });
  });
});

describe("the moves (rule 2.4)", () => {
  const NO_TROUBLE = { trouble: undefined };

  it("lists a free worker's move onto each job, and a move off each job with someone on it", () => {
    fresh(() => {
      const moves = (mountain: Mountain): string[] =>
        listActions(mountain, 0).flatMap((action) =>
          action.kind === "placeWorker" || action.kind === "freeWorker"
            ? [`${action.kind}:${action.job}`]
            : [],
        );
      expect(moves(crew(1, { haulage: 1 }))).toEqual(["freeWorker:haulage"]);
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
        NO_TROUBLE,
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
        NO_TROUBLE,
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
        NO_TROUBLE,
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

  it("refuses them with nobody free or nobody on the job, and in today's game", () => {
    fresh(() => {
      expect(
        applyMove(
          crew(1, { haulage: 1 }),
          { kind: "placeWorker", job: "drilling", count: 1 },
          0,
          NO_TROUBLE,
        ).kind,
      ).toBe("refused");
      expect(
        applyMove(
          crew(1),
          { kind: "freeWorker", job: "drilling", count: 1 },
          0,
          NO_TROUBLE,
        ).kind,
      ).toBe("refused");
    });
    const today = {
      ...createMountain(),
      owned: { ...createMountain().owned, helper: 3 },
    };
    expect(
      listActions(today, 0).some((action) => action.kind === "placeWorker"),
    ).toBe(false);
    expect(
      applyMove(
        today,
        { kind: "placeWorker", job: "drilling", count: 1 },
        0,
        NO_TROUBLE,
      ).kind,
    ).toBe("refused");
  });

  it("values a move at what the line gains, for free", () => {
    fresh(() => {
      const context = { tapsPerSecond: 0, liveSeconds: 60, awaySeconds: 0 };
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
