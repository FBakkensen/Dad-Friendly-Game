import type { PocketGrid } from "./grid";
import {
  parseGridSaveValue,
  serializeGridSave,
  type ParsedGridSave,
} from "./persist";

export const SESSION_SAVE_KEY = "dad-friendly-session";

/**
 * Guest saves live in localStorage so away-time survives closing the tab.
 * A save left in sessionStorage by an older build is moved over once.
 */
export function tryGetGuestStorage(): Storage | undefined {
  const storage = probeStorage(() => globalThis.localStorage);
  if (storage === undefined) {
    return probeStorage(() => globalThis.sessionStorage);
  }
  const legacy = probeStorage(() => globalThis.sessionStorage);
  if (legacy !== undefined) {
    migrateSessionSave({ from: legacy, to: storage });
  }
  return storage;
}

export function migrateSessionSave({
  from,
  to,
}: {
  from: Storage;
  to: Storage;
}): void {
  try {
    const legacy = readSessionSave({ storage: from });
    if (
      legacy !== undefined &&
      readSessionSave({ storage: to }) === undefined
    ) {
      to.setItem(SESSION_SAVE_KEY, from.getItem(SESSION_SAVE_KEY) ?? "");
    }
    from.removeItem(SESSION_SAVE_KEY);
  } catch {
    return;
  }
}

function probeStorage(get: () => Storage): Storage | undefined {
  try {
    const storage = get();
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
