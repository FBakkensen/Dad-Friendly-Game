import { describe, expect, it } from "vitest";
import { combine, createPocketGrid, dig, place } from "./grid";
import { parseGridSaveValue, serializeGridSave } from "./persist";

describe("serializeGridSave and parseGridSaveValue", () => {
  const lastSeen = 1_700_000_000_000;

  it("round-trips a dug grid object", () => {
    const grid = dig({ grid: createPocketGrid(), index: 3 });

    expect(parseGridSaveValue(serializeGridSave({ grid, lastSeen }))).toEqual({
      grid,
      lastSeen,
    });
  });

  it("round-trips two placed stones", () => {
    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 3 }),
      index: 3,
    });
    const grid = place({
      grid: dig({ grid: first, index: 4 }),
      index: 4,
    });

    expect(parseGridSaveValue(serializeGridSave({ grid, lastSeen }))).toEqual({
      grid,
      lastSeen,
    });
  });

  it("round-trips a combined chunk", () => {
    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 3 }),
      index: 3,
    });
    const two = place({
      grid: dig({ grid: first, index: 4 }),
      index: 4,
    });
    const grid = combine({ grid: two, from: 3, to: 4 });

    expect(parseGridSaveValue(serializeGridSave({ grid, lastSeen }))).toEqual({
      grid,
      lastSeen,
    });
  });

  it("parses a legacy v1 save without a timestamp", () => {
    const grid = createPocketGrid();

    expect(parseGridSaveValue({ version: 1, grid })).toEqual({
      grid,
      lastSeen: undefined,
    });
  });

  it("rejects missing fields, the wrong version, or a bad grid", () => {
    expect(parseGridSaveValue(null)).toBeUndefined();
    expect(parseGridSaveValue({ version: 1 })).toBeUndefined();
    expect(
      parseGridSaveValue({ version: 2, grid: createPocketGrid() }),
    ).toBeUndefined();
    expect(
      parseGridSaveValue({
        version: 2,
        grid: createPocketGrid(),
        lastSeen: "x",
      }),
    ).toBeUndefined();
    expect(
      parseGridSaveValue({
        version: 1,
        grid: { width: 2, height: 2, cells: [] },
      }),
    ).toBeUndefined();
  });
});
