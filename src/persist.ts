import { createPocketGrid, parsePocketGrid, type PocketGrid } from "./grid";

export const GRID_SAVE_KEY = "dad-friendly-game.pocket-grid";

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

export function readGridSave({ storage }: { storage: Storage }): PocketGrid {
  let raw: string | null;
  try {
    raw = storage.getItem(GRID_SAVE_KEY);
  } catch {
    return createPocketGrid();
  }
  if (raw === null) {
    return createPocketGrid();
  }
  return parseGridSaveJson(raw) ?? createPocketGrid();
}

export function writeGridSave({
  storage,
  grid,
}: {
  storage: Storage;
  grid: PocketGrid;
}): void {
  const save = serializeGridSave({ grid });
  try {
    storage.setItem(GRID_SAVE_KEY, JSON.stringify(save));
  } catch {
    return;
  }
}

function parseGridSaveJson(raw: string): PocketGrid | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  return parseGridSaveValue(parsed);
}
