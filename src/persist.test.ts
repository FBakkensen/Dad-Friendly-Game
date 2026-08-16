import { beforeEach, describe, expect, it } from "vitest";
import { createPocketGrid, dig } from "./grid";
import {
  GRID_SAVE_KEY,
  parseGridSaveValue,
  readGridSave,
  serializeGridSave,
  writeGridSave,
} from "./persist";

beforeEach(() => {
  sessionStorage.removeItem(GRID_SAVE_KEY);
});

describe("writeGridSave and readGridSave", () => {
  it("round-trips a dug grid", () => {
    const grid = dig({ grid: createPocketGrid(), index: 6 });

    writeGridSave({ storage: sessionStorage, grid });

    expect(readGridSave({ storage: sessionStorage })).toEqual(grid);
  });

  it("starts fresh when storage is empty, garbage, or a later version", () => {
    const fresh = createPocketGrid();

    expect(readGridSave({ storage: sessionStorage })).toEqual(fresh);

    sessionStorage.setItem(GRID_SAVE_KEY, "not-json");
    expect(readGridSave({ storage: sessionStorage })).toEqual(fresh);

    sessionStorage.setItem(
      GRID_SAVE_KEY,
      JSON.stringify({ version: 2, grid: createPocketGrid() }),
    );
    expect(readGridSave({ storage: sessionStorage })).toEqual(fresh);
  });
});

describe("serializeGridSave and parseGridSaveValue", () => {
  it("round-trips a dug grid object", () => {
    const grid = dig({ grid: createPocketGrid(), index: 3 });

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
