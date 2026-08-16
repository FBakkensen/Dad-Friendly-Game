import { parsePocketGrid, type PocketGrid } from "./grid";

export type GridSaveV1 = {
  readonly version: 1;
  readonly grid: PocketGrid;
};

export function serializeGridSave({ grid }: { grid: PocketGrid }): GridSaveV1 {
  return { version: 1, grid };
}

export function parseGridSaveValue(value: unknown): PocketGrid | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  if (!("version" in value) || !("grid" in value)) {
    return undefined;
  }
  if (value.version !== 1) {
    return undefined;
  }
  return parsePocketGrid(value.grid);
}
