import { parsePocketGrid, type PocketGrid } from "./grid";

export type GridSaveV2 = {
  readonly version: 2;
  readonly grid: PocketGrid;
  readonly lastSeen: number;
};

export type ParsedGridSave = {
  readonly grid: PocketGrid;
  readonly lastSeen: number | undefined;
};

export function serializeGridSave({
  grid,
  lastSeen,
}: {
  grid: PocketGrid;
  lastSeen: number;
}): GridSaveV2 {
  return { version: 2, grid, lastSeen };
}

/** Accepts the v2 shape and the legacy v1 shape (no timestamp yet). */
export function parseGridSaveValue(value: unknown): ParsedGridSave | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  if (!("version" in value) || !("grid" in value)) {
    return undefined;
  }
  const grid = parsePocketGrid(value.grid);
  if (grid === undefined) {
    return undefined;
  }
  switch (value.version) {
    case 1:
      return { grid, lastSeen: undefined };
    case 2: {
      const lastSeen = (value as { lastSeen?: unknown }).lastSeen;
      if (typeof lastSeen !== "number" || !Number.isFinite(lastSeen)) {
        return undefined;
      }
      return { grid, lastSeen };
    }
    default:
      return undefined;
  }
}
