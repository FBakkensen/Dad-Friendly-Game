import { describe, expect, it } from "vitest";
import {
  createPocketGrid,
  dig,
  dugCount,
  hand,
  parsePocketGrid,
  place,
} from "./grid";

describe("createPocketGrid", () => {
  it("starts every cell covered and holding a stone", () => {
    const grid = createPocketGrid();

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(3);
    expect(grid.cells.every((cell) => cell.kind === "covered")).toBe(true);
    expect(dugCount(grid)).toBe(0);
    expect(hand(grid)).toEqual({ kind: "stone" });
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
    expect(hand(grid)).toEqual({ kind: "stone" });
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
    expect(hand(placed)).toEqual({ kind: "empty" });
    expect(dugCount(placed)).toBe(1);
  });

  it("does not place on covered earth", () => {
    const grid = createPocketGrid();
    const placed = place({ grid, index: 0 });

    expect(placed).toBe(grid);
    expect(hand(placed)).toEqual({ kind: "stone" });
  });

  it("does not place a second stone", () => {
    const firstDug = dig({ grid: createPocketGrid(), index: 0 });
    const placed = place({ grid: firstDug, index: 0 });
    const secondDug = dig({ grid: placed, index: 1 });
    const twice = place({ grid: secondDug, index: 1 });

    expect(twice).toBe(secondDug);
    expect(twice.cells[0]).toEqual({ kind: "stone" });
    expect(twice.cells[1]).toEqual({ kind: "dug" });
    expect(hand(twice)).toEqual({ kind: "empty" });
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
    expect(hand(parsed ?? createPocketGrid())).toEqual({ kind: "empty" });
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
