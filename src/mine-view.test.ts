import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import {
  DEEPER_STRATA,
  levelPlate,
  machineKeys,
  mineScene,
  printedParts,
  rowParts,
  stageRows,
} from "./mine-view";
import { PILE_HOLDS } from "./mine-piles";
import { createMountain, type Mountain } from "./mountain";
import { crewedStart } from "./test-fixtures";
import { effectiveRates } from "./rates";
import { toolSpeed } from "./workforce";

/** The mine's views (#660), on a fresh mine. */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

function withStones(mountain: Mountain, stones: number): Mountain {
  return { ...mountain, stock: { ...mountain.stock, stones } };
}

describe("machine keys", () => {
  it("has a key for each stage's next machine, with what it moves, its price and its workers", () => {
    fresh(() => {
      const mountain = createMountain();
      const speed = effectiveRates(mountain).tierSpeed;
      const keys = machineKeys(mountain, "one");
      expect(keys.map((key) => key.id)).toEqual(["drill", "cart", "hoist"]);
      const cart = keys[1];
      expect(cart?.face).toBe(`+Cart · ${String(speed.cart)}/s`);
      expect(cart?.staff).toBe("1 to run");
      expect(cart?.can).toBe(false);
      expect(keys.some((key) => /hire|worker/i.test(key.face))).toBe(false);
    });
  });

  it("follows the amount key and lights what he can afford", () => {
    fresh(() => {
      const mountain = withStones(createMountain(), 1_000_000);
      const speed = effectiveRates(mountain).tierSpeed;
      const cart = machineKeys(mountain, "ten")[1];
      expect(cart?.count).toBe(10);
      expect(cart?.face).toBe(`+10 Carts · ${String(speed.cart * 10)}/s`);
      expect(cart?.staff).toBe("10 to run");
      expect(cart?.can).toBe(true);
    });
  });
});

describe("a stage's row", () => {
  const hoist = (owned: number) => ({
    id: "hoist" as const,
    owned,
    staff: 3,
    speed: 1200,
  });

  it("is the workers with tools when there is no machine", () => {
    expect(rowParts([hoist(0)], 3, 100)).toEqual([
      { kind: "tools", count: 3, moves: 300 },
    ]);
    expect(rowParts([hoist(0)], 0, 100)).toEqual([
      { kind: "tools", count: 0, moves: 0 },
    ]);
  });

  it("shows a kind's workers of the workers it takes, then the tools", () => {
    expect(rowParts([hoist(2)], 5, 100)).toEqual([
      {
        kind: "runs",
        id: "hoist",
        owned: 2,
        running: 1,
        has: 3,
        takes: 6,
        moves: 1200,
      },
      { kind: "tools", count: 2, moves: 200 },
    ]);
  });

  it("has a third state: the workers stay on their tools because that moves more", () => {
    const cart = { id: "cart" as const, owned: 1, staff: 12, speed: 360 };
    const tool = 430 / 12;
    const parts = rowParts([cart], 14, tool);
    expect(parts[0]).toMatchObject({
      kind: "stands",
      standing: 1,
      workers: 12,
      onMachines: 360,
    });
    expect(parts[0]?.moves).toBeCloseTo(430);
    expect(parts[1]).toMatchObject({ kind: "tools", count: 2 });
    const total = parts.reduce((sum, part) => sum + part.moves, 0);
    expect(total).toBeCloseTo(14 * tool);
  });

  it("counts every idle slow machine as standing, and says one worker so", () => {
    const cart = { id: "cart" as const, owned: 3, staff: 1, speed: 1.8 };
    expect(rowParts([cart], 2, 3)).toEqual([
      {
        kind: "stands",
        id: "cart",
        standing: 3,
        workers: 2,
        moves: 6,
        onMachines: 3.6,
      },
    ]);
    expect(rowParts([cart], 0, 3)).toEqual([
      {
        kind: "stands",
        id: "cart",
        standing: 3,
        workers: 0,
        moves: 0,
        onMachines: 0,
      },
    ]);
    fresh(() => {
      withFactors({ [FRESH_OFF]: 0, "output.cart": 0.03 }, () => {
        const start = createMountain();
        const one = {
          ...start,
          owned: { ...start.owned, cart: 1 },
          jobs: { ...start.jobs, haulage: 1 },
        };
        const tool = effectiveRates(one).tierSpeed.helper * 3;
        const cart = effectiveRates(one).tierSpeed.cart;
        expect(stageRows(one)[1]?.sum[0]).toBe(
          `1 cart stands · 1 worker moves ${String(tool)}/s with a barrow, ${String(cart)}/s on the cart`,
        );
        const none = { ...one, jobs: { ...one.jobs, haulage: 0 } };
        expect(stageRows(none)[1]?.sum[0]).toBe("1 cart stands");
        expect(mineScene(none).stages.haul).toMatchObject({
          owned: 1,
          running: 0,
          standing: 1,
        });
      });
    });
  });

  it("prints parts that add up to the printed total", () => {
    expect(printedParts([1.5, 1.6], 3.1)).toEqual({
      parts: ["1.5", "1.6"],
      total: "3.1",
    });
    const thirds = printedParts([100 / 3, 100 / 3, 100 / 3], 100);
    expect(thirds.total).toBe("100");
    expect(thirds.parts.map(Number).reduce((a, b) => a + b, 0)).toBe(100);
    const big = printedParts([1_234.4, 2_000.4, 0.4], 3_235.2);
    expect(big.total).toBe("3,235");
    expect(
      big.parts
        .map((part) => Number(part.replace(/,/g, "")))
        .reduce((a, b) => a + b, 0),
    ).toBe(3_235);
  });

  it("says what each stage moves now of what it can move, and its workers", () => {
    fresh(() => {
      const mountain = crewedStart();
      const rows = stageRows(mountain);
      const rates = effectiveRates(mountain);
      expect(rows.map((row) => row.name)).toEqual([
        "Drilling",
        "Haulage",
        "Hoisting",
      ]);
      const drilling = rows[0];
      const each = rates.tierSpeed.helper * 3;
      expect(drilling?.now).toBe(String(rates.crewPerSecond));
      // Every stage starts with the same crew.
      const crew = mountain.jobs.drilling;
      const moves = String(crew * each);
      expect(drilling?.can).toBe(`${moves}/s`);
      expect(rows.map((row) => row.sum[0])).toEqual([
        `${String(crew)} with picks ${moves}/s`,
        `${String(crew)} with barrows ${moves}/s`,
        `${String(crew)} on winches ${moves}/s`,
      ]);
      expect(drilling?.workers).toBe(crew);
      expect(drilling?.canPlace).toBe(false);
      expect(drilling?.canFree).toBe(true);
    });
  });

  it("each stage says what it moves now, and the pile after it", () => {
    fresh(() => {
      const start = createMountain();
      const mountain = { ...start, piles: { face: 200, shaft: 0, kiln: 0 } };
      const rows = stageRows(mountain);
      const pick = toolSpeed(effectiveRates(mountain).tierSpeed);
      expect(mountain.jobs.drilling).toBe(1);
      expect(rows.map((row) => row.now)).toEqual([String(pick), "0", "0"]);
      expect(rows[0]?.can).toBe(`${String(pick)}/s`);
      expect(rows.map((row) => row.pile)).toEqual([
        { label: "Drilled rock", held: 200, holds: PILE_HOLDS.face },
        { label: "Rock at the shaft", held: 0, holds: PILE_HOLDS.shaft },
        undefined,
      ]);
      expect(PILE_HOLDS.face).toBe(300);
      // Full drilled rock with nobody hauling: drilling stands too.
      const full = stageRows({
        ...mountain,
        piles: { face: 300, shaft: 0, kiln: 0 },
      });
      expect(full[0]?.now).toBe("0");
      expect(full[0]?.band.now).toBe(0);
    });
  });

  it("says one worker of one machine", () => {
    fresh(() => {
      const start = createMountain();
      const mountain = {
        ...start,
        owned: { ...start.owned, cart: 1 },
        jobs: { ...start.jobs, haulage: 1 },
      };
      const cart = effectiveRates(mountain).tierSpeed.cart;
      expect(stageRows(mountain)[1]?.sum[0]).toBe(
        `1 cart: 1 of 1 worker ${String(cart)}/s`,
      );
    });
  });

  it("names no stage as the limit, and never says hands", () => {
    fresh(() => {
      const start = withStones(createMountain(), 0);
      const mountain = {
        ...start,
        owned: { ...start.owned, cart: 2, helper: 14 },
        jobs: { ...start.jobs, haulage: 5 },
      };
      const words = JSON.stringify(stageRows(mountain));
      expect(words).not.toMatch(
        /bottleneck|limit|best|slowest|\bhands?\b|by hand/i,
      );
      const haulage = stageRows(mountain)[1];
      expect(haulage?.sum[0]).toMatch(
        /^2 carts: 2 of 2 workers .*\/s \+ 3 with barrows .*\/s$/,
      );
    });
  });
});

describe("the level's plate and the scene", () => {
  it("names the Topsoil, its rock a second and its crews, and not the next level", () => {
    fresh(() => {
      const mountain = createMountain();
      const plate = levelPlate(mountain);
      expect(plate.name).toBe("Topsoil");
      expect(plate.rate).toBe(
        `${String(effectiveRates(mountain).crewPerSecond)}/s`,
      );
      expect(plate.line).toBe("4 crews · all rock is hoisted as stone");
      expect(DEEPER_STRATA).not.toMatch(/granite/i);
    });
  });

  it("shows an even line with bare piles and every worker busy", () => {
    fresh(() => {
      const scene = mineScene(crewedStart());
      expect(scene.moving).toBe(true);
      expect(scene.facePile).toBe(0);
      expect(scene.shaftPile).toBe(0);
      expect(scene.stages.face.busy).toBe(1);
      expect(scene.stages.lift.busy).toBe(1);
    });
  });

  it("draws the piles as full as they are, and stands who waits on one (#703)", () => {
    fresh(() => {
      const start = crewedStart();
      // A full shaft pile: haulage moves only what hoisting lifts, the
      // tubs queue at the shaft, and the face fills behind them.
      const queued = mineScene({
        ...start,
        jobs: { ...start.jobs, hoisting: 1 },
        piles: { face: 150, shaft: PILE_HOLDS.shaft, kiln: 0 },
      });
      expect(queued.facePile).toBe(150 / PILE_HOLDS.face);
      expect(queued.shaftPile).toBe(1);
      expect(queued.unload).toBeCloseTo(1 / start.jobs.haulage);
      expect(queued.stages.haul.busy).toBeCloseTo(1 / start.jobs.haulage);
      expect(queued.stages.face.busy).toBe(1);
      // One worker on drilling, nobody after him: he works, the rest stand.
      const lone = mineScene({
        ...start,
        jobs: { ...start.jobs, drilling: 1, haulage: 0, hoisting: 0 },
        piles: { face: 120, shaft: 0, kiln: 0 },
      });
      expect(lone.moving).toBe(true);
      expect(lone.stages.face.busy).toBe(1);
      // A bare face: the tubs leave as full as drilling keeps them.
      const bare = mineScene({
        ...start,
        jobs: { ...start.jobs, drilling: 1 },
      });
      expect(bare.load).toBeCloseTo(1 / start.jobs.haulage);
    });
  });

  it("stands the line once a stage has nobody and its pile is full", () => {
    fresh(() => {
      const start = crewedStart();
      const scene = mineScene({
        ...start,
        jobs: { ...start.jobs, hoisting: 0 },
      });
      // Rock still moves into the shaft pile until it is full.
      expect(scene.moving).toBe(true);
      expect(scene.stages.lift.workers).toBe(0);
      const full = mineScene({
        ...start,
        jobs: { ...start.jobs, hoisting: 0 },
        piles: { face: PILE_HOLDS.face, shaft: PILE_HOLDS.shaft, kiln: 0 },
      });
      expect(full.moving).toBe(false);
      expect(full.shaftPile).toBe(1);
    });
  });
});
