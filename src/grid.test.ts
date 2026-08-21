import { describe, expect, it } from "vitest";
import {
  combine,
  createPocketGrid,
  dig,
  dugCount,
  parsePocketGrid,
  place,
  settleStones,
} from "./grid";

describe("createPocketGrid", () => {
  it("starts every cell covered and holding a stone", () => {
    const grid = createPocketGrid();

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(3);
    expect(grid.cells.every((cell) => cell.kind === "covered")).toBe(true);
    expect(dugCount(grid)).toBe(0);
  });
});

describe("dig", () => {
  it("uncovers a covered cell", () => {
    const grid = dig({ grid: createPocketGrid(), index: 4 });

    expect(grid.cells[4]).toEqual({ kind: "dug" });
    expect(dugCount(grid)).toBe(1);
    expect(
      grid.cells.filter((cell, index) => index !== 4 && cell.kind === "covered")
        .length,
    ).toBe(8);
  });

  it("keeps a dug cell dug", () => {
    const once = dig({ grid: createPocketGrid(), index: 0 });
    const twice = dig({ grid: once, index: 0 });

    expect(twice).toBe(once);
    expect(twice.cells[0]).toEqual({ kind: "dug" });
  });

  it("does not dig a cell that already has a stone", () => {
    const dug = dig({ grid: createPocketGrid(), index: 1 });
    const placed = place({ grid: dug, index: 1 });
    const again = dig({ grid: placed, index: 1 });

    expect(again).toBe(placed);
    expect(again.cells[1]).toEqual({ kind: "stone" });
  });
});

describe("place", () => {
  it("sets the held stone on a dug cell", () => {
    const dug = dig({ grid: createPocketGrid(), index: 2 });
    const placed = place({ grid: dug, index: 2 });

    expect(placed.cells[2]).toEqual({ kind: "stone" });
    expect(dugCount(placed)).toBe(1);
  });

  it("does not place on covered earth", () => {
    const grid = createPocketGrid();
    const placed = place({ grid, index: 0 });

    expect(placed).toBe(grid);
  });

  it("places a second stone on a second dug hole", () => {
    const firstDug = dig({ grid: createPocketGrid(), index: 0 });
    const placed = place({ grid: firstDug, index: 0 });
    const secondDug = dig({ grid: placed, index: 1 });
    const twice = place({ grid: secondDug, index: 1 });

    expect(twice.cells[0]).toEqual({ kind: "stone" });
    expect(twice.cells[1]).toEqual({ kind: "stone" });
  });

  it("does not place on a cell that already has a stone", () => {
    const dug = dig({ grid: createPocketGrid(), index: 0 });
    const placed = place({ grid: dug, index: 0 });
    const again = place({ grid: placed, index: 0 });

    expect(again).toBe(placed);
    expect(again.cells[0]).toEqual({ kind: "stone" });
  });
});

describe("combine", () => {
  it("fuses two neighbor stones into a chunk and frees a hole", () => {
    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 0 }),
      index: 0,
    });
    const grid = place({
      grid: dig({ grid: first, index: 1 }),
      index: 1,
    });
    const fused = combine({ grid, from: 0, to: 1 });

    expect(fused.cells[0]).toEqual({ kind: "dug" });
    expect(fused.cells[1]).toEqual({ kind: "chunk" });
    expect(dugCount(fused)).toBe(2);
  });

  it("does not fuse stones that are not neighbors", () => {
    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 0 }),
      index: 0,
    });
    const grid = place({
      grid: dig({ grid: first, index: 2 }),
      index: 2,
    });
    const skipped = combine({ grid, from: 0, to: 2 });

    expect(skipped).toBe(grid);
  });

  it("does not fuse diagonal stones", () => {
    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 0 }),
      index: 0,
    });
    const grid = place({
      grid: dig({ grid: first, index: 4 }),
      index: 4,
    });
    const skipped = combine({ grid, from: 0, to: 4 });

    expect(skipped).toBe(grid);
  });

  it("does not fuse a stone with a chunk", () => {
    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 0 }),
      index: 0,
    });
    const two = place({
      grid: dig({ grid: first, index: 1 }),
      index: 1,
    });
    const fused = combine({ grid: two, from: 0, to: 1 });
    const third = place({
      grid: dig({ grid: fused, index: 2 }),
      index: 2,
    });
    const skipped = combine({ grid: third, from: 2, to: 1 });

    expect(skipped).toBe(third);
    expect(third.cells[1]).toEqual({ kind: "chunk" });
    expect(third.cells[2]).toEqual({ kind: "stone" });
  });
});

describe("parsePocketGrid", () => {
  it("rebuilds a valid grid", () => {
    const dug = dig({ grid: createPocketGrid(), index: 2 });
    const parsed = parsePocketGrid({
      width: 3,
      height: 3,
      cells: dug.cells.map((cell) => ({ kind: cell.kind })),
    });

    expect(parsed).toEqual(dug);
  });

  it("rebuilds a grid with a placed stone", () => {
    const placed = place({
      grid: dig({ grid: createPocketGrid(), index: 5 }),
      index: 5,
    });
    const parsed = parsePocketGrid({
      width: 3,
      height: 3,
      cells: placed.cells.map((cell) => ({ kind: cell.kind })),
    });

    expect(parsed).toEqual(placed);
  });

  it("rebuilds a grid with a combined chunk", () => {
    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 3 }),
      index: 3,
    });
    const two = place({
      grid: dig({ grid: first, index: 4 }),
      index: 4,
    });
    const fused = combine({ grid: two, from: 3, to: 4 });
    const parsed = parsePocketGrid({
      width: 3,
      height: 3,
      cells: fused.cells.map((cell) => ({ kind: cell.kind })),
    });

    expect(parsed).toEqual(fused);
  });

  it("rejects the wrong size or an unknown cell", () => {
    expect(parsePocketGrid({ width: 2, height: 3, cells: [] })).toBeUndefined();
    expect(
      parsePocketGrid({
        width: 3,
        height: 3,
        cells: Array.from({ length: 8 }, () => ({ kind: "covered" })),
      }),
    ).toBeUndefined();
    expect(
      parsePocketGrid({
        width: 3,
        height: 3,
        cells: [
          { kind: "covered" },
          { kind: "covered" },
          { kind: "covered" },
          { kind: "covered" },
          { kind: "lava" },
          { kind: "covered" },
          { kind: "covered" },
          { kind: "covered" },
          { kind: "covered" },
        ],
      }),
    ).toBeUndefined();
  });
});

describe("settleStones", () => {
  it("does nothing with no elapsed time or no dug cells", () => {
    const grid = dig({ grid: createPocketGrid(), index: 0 });

    expect(settleStones({ grid, elapsedMs: 0 })).toEqual({ grid, settled: 0 });
    expect(
      settleStones({ grid: createPocketGrid(), elapsedMs: 60 * 60 * 1000 }),
    ).toEqual({ grid: createPocketGrid(), settled: 0 });
  });

  it("turns one dug cell into a stone per five minutes away", () => {
    let grid = createPocketGrid();
    for (const index of [3, 4] as const) {
      grid = dig({ grid, index });
    }
    const result = settleStones({
      grid,
      elapsedMs: 2 * 5 * 60 * 1000,
    });

    expect(result.settled).toBe(2);
    expect(result.grid.cells[3]).toEqual({ kind: "stone" });
    expect(result.grid.cells[4]).toEqual({ kind: "stone" });
  });

  it("caps the stones per absence and skips non-dug cells", () => {
    let grid = createPocketGrid();
    for (const index of [1, 4] as const) {
      grid = place({ grid: dig({ grid, index }), index });
    }
    for (const index of [0, 2] as const) {
      grid = dig({ grid, index });
    }
    const result = settleStones({ grid, elapsedMs: 24 * 60 * 60 * 1000 });

    expect(result.settled).toBe(2);
    expect(result.grid.cells[0]).toEqual({ kind: "stone" });
    expect(result.grid.cells[2]).toEqual({ kind: "stone" });
    expect(result.grid.cells[1]).toEqual({ kind: "stone" });
    expect(result.grid.cells[4]).toEqual({ kind: "stone" });
  });
});
