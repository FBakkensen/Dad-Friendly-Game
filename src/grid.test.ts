import { describe, expect, it } from "vitest";
import { createPocketGrid, dig, dugCount, parsePocketGrid } from "./grid";

describe("createPocketGrid", () => {
  it("starts every cell covered", () => {
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
