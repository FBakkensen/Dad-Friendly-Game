import { describe, expect, it } from "vitest";
import { placeOrder } from "../city";
import { applyAction, type Action } from "../economy/actions";
import type { Mountain } from "../mountain";
import { levels, partThree, type Setup } from "../part-three.harness";
import { freshPlan } from "./fresh-dad";
import { levelMoves, waitsForShaft } from "./fresh-levels";
import type { FreshHabits, LevelHabit } from "./policy";

/** How a fresh dad plays the levels of part 3 (#675, rulings 3 and 8). */

const habits = (levelHabit: LevelHabit): FreshHabits => ({
  moves: "once",
  hold: "on-value",
  upgrades: false,
  levels: levelHabit,
});

const BOTH_UP: Mountain["operational"] = ["lightTower", "warehouse"];

/** A part 3 mine with the Warehouse up and the Foundry ordered. */
const ordered = (setup: Setup): Mountain =>
  partThree(() =>
    placeOrder({
      ...levels({ operational: BOTH_UP, ...setup }),
      stockyard: 2,
    }),
  );

/** His plans one after another, as a sitting plays them, until he has none. */
function played(mountain: Mountain): readonly Action[] {
  const done: Action[] = [];
  let next = mountain;
  for (let step = 0; step < 40; step += 1) {
    const plan = partThree(() => freshPlan(next, habits("need"), 1));
    if (plan.length === 0) {
      break;
    }
    done.push(...plan);
    next = apply(next, plan);
  }
  return done;
}

const apply = (mountain: Mountain, plan: readonly Action[]): Mountain =>
  partThree(() =>
    plan.reduce((next, action) => applyAction(next, action, 0), mountain),
  );

const moves = (mountain: Mountain, levelHabit: LevelHabit) =>
  partThree(() => levelMoves(mountain, habits(levelHabit)));

/** Workers on a level's drilling and haulage. */
const onLevel = (mountain: Mountain, level: "topsoil" | "granite"): number =>
  level === "topsoil"
    ? mountain.jobs.drilling + mountain.jobs.haulage
    : mountain.jobs.graniteDrilling + mountain.jobs.graniteHaulage;

describe("the shaft (ruling 3)", () => {
  it("waits for the shaft before ordering the Foundry, and sinks it when the pocket holds its price", () => {
    const unsunk = {
      ...partThree(() =>
        levels({
          sunk: false,
          topsoil: 6,
          hoisting: 2,
          hoists: 1,
          operational: BOTH_UP,
        }),
      ),
      stockyard: 2,
    };
    expect(partThree(() => waitsForShaft(unsunk))).toBe(true);
    const poor = played(unsunk);
    expect(poor).not.toContainEqual({ kind: "placeOrder" });
    expect(poor).not.toContainEqual({ kind: "sinkShaft" });
    const rich = {
      ...unsunk,
      stock: { ...unsunk.stock, stones: 12_000_000, brick: 2_000_000 },
    };
    expect(played(rich)).toContainEqual({ kind: "sinkShaft" });
    const sunk = partThree(() => levels({ operational: BOTH_UP }));
    expect(partThree(() => waitsForShaft(sunk))).toBe(false);
    expect(played(sunk)).toContainEqual({ kind: "placeOrder" });
  });
});

describe("the level habits (ruling 8)", () => {
  it("moves nothing between the levels before the Granite is open or ordered", () => {
    const shut = partThree(() => levels({ sunk: false, topsoil: 8 }));
    const unordered = partThree(() => levels({ topsoil: 8 }));
    for (const levelHabit of ["need", "even", "whole"] as const) {
      expect(moves(shut, levelHabit)).toEqual([]);
      expect(moves(unordered, levelHabit)).toEqual([]);
    }
  });

  it("splits the Topsoil's drilling and haulage once for the even dad, and never again", () => {
    const start = ordered({ topsoil: 9, hoisting: 2, hoists: 1 });
    const split = apply(start, moves(start, "even"));
    expect(split.jobs.graniteDrilling).toBe(4);
    expect(split.jobs.graniteHaulage).toBe(4);
    expect(onLevel(split, "topsoil")).toBe(10);
    expect(moves(split, "even")).toEqual([]);
  });

  it("keeps the whole workforce on one level, and moves it when the other level's good is short by far", () => {
    // The Foundry's first step: 15M brick and 4M cut stone, with 14M brick in stock.
    const start = ordered({
      topsoil: 8,
      hoisting: 2,
      hoists: 1,
      saws: 1,
      stock: { brick: 14_000_000 },
    });
    const moved = apply(start, moves(start, "whole"));
    expect(onLevel(moved, "topsoil")).toBe(0);
    expect(onLevel(moved, "granite")).toBe(16);
    expect(moves(moved, "whole")).toEqual([]);
    // With the brick short by far more than the cut stone, he goes back.
    const short = {
      ...moved,
      stock: { ...moved.stock, brick: 0, cutStone: 3_000_000 },
    };
    const back = apply(short, moves(short, "whole"));
    expect(onLevel(back, "topsoil")).toBe(16);
    expect(onLevel(back, "granite")).toBe(0);
  });

  it("leaves the Granite when he cannot buy a saw there and nobody makes brick", () => {
    const stranded = ordered({
      granite: 8,
      hoisting: 2,
      hoists: 1,
      stock: { brick: 0, cutStone: 0 },
    });
    const moved = apply(stranded, moves(stranded, "whole"));
    expect(onLevel(moved, "topsoil")).toBe(16);
    expect(onLevel(moved, "granite")).toBe(0);
  });

  it("takes only moves that bring the Foundry sooner for the need dad, so none is undone", () => {
    let mountain = ordered({
      topsoil: 12,
      hoisting: 3,
      hoists: 2,
      kilns: 2,
      saws: 1,
      driving: 1,
      building: 2,
    });
    const seen: string[] = [];
    for (let step = 0; step < 20; step += 1) {
      const plan = moves(mountain, "need");
      if (plan.length === 0) {
        break;
      }
      seen.push(JSON.stringify(plan));
      mountain = apply(mountain, plan);
    }
    expect(moves(mountain, "need")).toEqual([]);
    // He put workers on the Granite, where the saw had no rock.
    expect(onLevel(mountain, "granite")).toBeGreaterThan(0);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
