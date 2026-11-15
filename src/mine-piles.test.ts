import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { PILE_HOLDS, flowMine, mineChain, mineChange } from "./mine-piles";
import { NO_JOBS, freeWorker, placeWorker, type JobId } from "./workforce";

/** Drilled rock and rock at the shaft in a fresh mine (#703, rule 2). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

/** A fresh mine with one worker, on `job`, and these piles. */
function lone(job: JobId, piles = { face: 0, shaft: 0 }): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: 1 },
    jobs: { ...NO_JOBS, [job]: 1 },
    stock: { ...start.stock, stones: 0 },
    piles,
  };
}

/** The lone worker moved from one job to another, as the dad does it. */
const move = (mountain: Mountain, from: JobId, to: JobId): Mountain =>
  placeWorker(freeWorker(mountain, from), to);

/** Rock in the mine: in the stock and in both piles. */
const rock = (mountain: Mountain): number =>
  mountain.stock.stones + mountain.piles.face + mountain.piles.shaft;

describe("rock dug in all (#664, call 13)", () => {
  it("counts the rock drilling digs, and only grows", () => {
    fresh(() => {
      const start = lone("drilling");
      expect(start.rockDug).toBe(0);
      const drilled = flowMine(start, 50, 1, true).mountain;
      expect(drilled.rockDug).toBe(150);
      // A full pile stops drilling: nothing more is dug.
      const full = flowMine(drilled, 1_000, 1, true).mountain;
      expect(full.rockDug).toBe(300);
      // Haulage and hoisting move rock already dug.
      const hauled = flowMine(move(full, "drilling", "haulage"), 50, 1, true);
      expect(hauled.mountain.rockDug).toBe(300);
    });
  });
});

describe("the mine's two piles (#703)", () => {
  it("holds 300 drilled rock and 300 at the shaft, as the lab set them (#703)", () => {
    expect(PILE_HOLDS).toEqual({ face: 300, shaft: 300 });
  });

  it("builds the line's chain: each stage's own rate, times pay", () => {
    fresh(() => {
      const chain = mineChain(
        lone("drilling", { face: 20, shaft: 7 }),
        1,
        true,
      );
      expect(chain.source).toBe(Infinity);
      expect(chain.rates).toEqual([3, 0, 0]);
      expect(chain.piles).toEqual([
        { held: 20, holds: 300 },
        { held: 7, holds: 300 },
      ]);
      expect(mineChain(lone("drilling"), 0.3, false).rates).toEqual([0, 0, 0]);
      expect(mineChain(lone("hoisting"), 0.5, true).rates).toEqual([0, 0, 1.5]);
    });
  });

  it("one worker on drilling fills the drilled-rock pile and no stone comes up", () => {
    fresh(() => {
      const start = lone("drilling");
      expect(mineChange(start, 1, true)).toBeCloseTo(300 / 3, 9);
      const after = flowMine(start, 1_000, 1, true);
      expect(after.mined).toBe(0);
      expect(after.mountain.piles).toEqual({ face: 300, shaft: 0 });
      expect(after.mountain.stock.stones).toBe(0);
      expect(mineChange(after.mountain, 1, true)).toBe(Infinity);
    });
  });

  it("moved to haulage, then hoisting, he brings the drilled rock up", () => {
    fresh(() => {
      const drilled = flowMine(lone("drilling"), 100, 1, true).mountain;
      expect(drilled.piles).toEqual({ face: 300, shaft: 0 });
      const hauled = flowMine(
        move(drilled, "drilling", "haulage"),
        200,
        1,
        true,
      );
      expect(hauled.mined).toBe(0);
      expect(hauled.mountain.piles).toEqual({ face: 0, shaft: 300 });
      const lifted = flowMine(
        move(hauled.mountain, "haulage", "hoisting"),
        60,
        1,
        true,
      );
      expect(lifted.mined).toBe(180);
      expect(lifted.mountain.stock.stones).toBe(180);
      expect(lifted.mountain.piles).toEqual({ face: 0, shaft: 120 });
      // Nothing is made or lost: the 300 drilled are in the stock or a pile.
      expect(rock(lifted.mountain)).toBe(300);
    });
  });

  it("a move between ticks keeps the piles", () => {
    fresh(() => {
      const first = flowMine(lone("drilling"), 1, 1, true).mountain;
      expect(first.piles).toEqual({ face: 3, shaft: 0 });
      const second = flowMine(move(first, "drilling", "haulage"), 1, 1, true);
      expect(second.mountain.piles).toEqual({ face: 0, shaft: 3 });
      expect(second.mountain.jobs.haulage).toBe(1);
    });
  });

  it("stops drilling when not drilling, and haulage and hoisting drain the piles", () => {
    fresh(() => {
      const start = createMountain();
      const crew: Mountain = {
        ...start,
        owned: { ...start.owned, helper: 9 },
        jobs: { ...NO_JOBS, drilling: 3, haulage: 3, hoisting: 3 },
        stock: { ...start.stock, stones: 0 },
        piles: { face: 400, shaft: 400 },
      };
      const after = flowMine(crew, 1_000, 1, false);
      expect(after.mined).toBe(800);
      expect(after.mountain.piles).toEqual({ face: 0, shaft: 0 });
    });
  });

  it("leaves the mountain as it was when nothing moves", () => {
    fresh(() => {
      const start = lone("driving");
      const after = flowMine(start, 1_000, 1, true);
      expect(after).toEqual({ mountain: start, mined: 0 });
      expect(after.mountain).toBe(start);
    });
  });
});
