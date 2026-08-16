import { createPocketGrid, parsePocketGrid, type PocketGrid } from "./grid";

export const GRID_SAVE_KEY = "dad-friendly-game.pocket-grid";

type GridSaveV1 = {
  readonly version: 1;
  readonly grid: PocketGrid;
};

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
  return parseGridSave(raw) ?? createPocketGrid();
}

export function writeGridSave({
  storage,
  grid,
}: {
  storage: Storage;
  grid: PocketGrid;
}): void {
  const save = { version: 1, grid } satisfies GridSaveV1;
  try {
    storage.setItem(GRID_SAVE_KEY, JSON.stringify(save));
  } catch {
    return;
  }
}

function parseGridSave(raw: string): PocketGrid | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  if (!("version" in parsed) || !("grid" in parsed)) {
    return undefined;
  }
  if (parsed.version !== 1) {
    return undefined;
  }
  return parsePocketGrid(parsed.grid);
}
