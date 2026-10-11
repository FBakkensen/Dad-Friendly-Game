import type { Mountain } from "./mountain";
import { parseSaveValue, serializeSave, type ParsedSave } from "./persist";

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
    const raw = from.getItem(SESSION_SAVE_KEY);
    const legacyValid =
      raw !== null && readSessionSave({ storage: from }) !== undefined;
    if (legacyValid && readSessionSave({ storage: to }) === undefined) {
      to.setItem(SESSION_SAVE_KEY, raw);
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
}): ParsedSave | undefined {
  try {
    const raw = storage.getItem(SESSION_SAVE_KEY);
    if (raw === null) {
      return undefined;
    }
    return parseSaveValue(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function writeSessionSave({
  storage,
  mountain,
  lastSeen,
}: {
  storage: Storage;
  mountain: Mountain;
  lastSeen: number;
}): boolean {
  try {
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify(serializeSave({ mountain, lastSeen })),
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
