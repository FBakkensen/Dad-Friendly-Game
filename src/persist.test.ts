import { beforeEach, describe, expect, it } from "vitest";
import { createPocketGrid, dig } from "./grid";
import { GRID_SAVE_KEY, readGridSave, writeGridSave } from "./persist";

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
