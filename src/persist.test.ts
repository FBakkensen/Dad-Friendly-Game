import { describe, expect, it } from "vitest";
import { createPocketGrid, dig, place } from "./grid";
import { parseGridSaveValue, serializeGridSave } from "./persist";

describe("serializeGridSave and parseGridSaveValue", () => {
  it("round-trips a dug grid object", () => {
    const grid = dig({ grid: createPocketGrid(), index: 3 });

    expect(parseGridSaveValue(serializeGridSave({ grid }))).toEqual(grid);
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

    expect(parseGridSaveValue(serializeGridSave({ grid }))).toEqual(grid);
  });

  it("rejects missing fields, the wrong version, or a bad grid", () => {
    expect(parseGridSaveValue(null)).toBeUndefined();
    expect(parseGridSaveValue({ version: 1 })).toBeUndefined();
    expect(
      parseGridSaveValue({ version: 2, grid: createPocketGrid() }),
    ).toBeUndefined();
    expect(
      parseGridSaveValue({
        version: 1,
        grid: { width: 2, height: 2, cells: [] },
      }),
    ).toBeUndefined();
  });
});
