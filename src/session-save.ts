import type { PocketGrid } from "./grid";
import {
  parseGridSaveValue,
  serializeGridSave,
  type ParsedGridSave,
} from "./persist";

export const SESSION_SAVE_KEY = "dad-friendly-session";

export function tryGetSessionStorage(): Storage | undefined {
  try {
    const storage = globalThis.sessionStorage;
    const probe = `${SESSION_SAVE_KEY}:probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return undefined;
  }
}

export function readSessionSave({
  storage,
}: {
  storage: Storage;
}): ParsedGridSave | undefined {
  try {
    const raw = storage.getItem(SESSION_SAVE_KEY);
    if (raw === null) {
      return undefined;
    }
    return parseGridSaveValue(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function writeSessionSave({
  storage,
  grid,
  lastSeen,
}: {
  storage: Storage;
  grid: PocketGrid;
  lastSeen: number;
}): boolean {
  try {
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify(serializeGridSave({ grid, lastSeen })),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSessionSave({ storage }: { storage: Storage }): void {
  try {
    storage.removeItem(SESSION_SAVE_KEY);
  } catch {
    return;
  }
}
