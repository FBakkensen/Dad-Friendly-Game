import type { Mountain } from "./mountain";
import { readSave, serializeSave, type SaveRead } from "./persist";

/** The guest save's key (#558). Keys from before version 8 are never read or touched. */
export const SESSION_SAVE_KEY = "dad-friendly-game";

/** What the guest key holds: one of the four answers, or nothing. An older copy carries its text. */
export type SessionRead =
  | { readonly kind: "absent" }
  | Exclude<SaveRead, { readonly kind: "older" }>
  | (Extract<SaveRead, { readonly kind: "older" }> & { readonly raw: string });

/** Guest saves live in localStorage so away-time survives closing the tab. */
export function tryGetGuestStorage(): Storage | undefined {
  return (
    probeStorage(() => globalThis.localStorage) ??
    probeStorage(() => globalThis.sessionStorage)
  );
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
}): SessionRead {
  let raw: string | null;
  try {
    raw = storage.getItem(SESSION_SAVE_KEY);
  } catch {
    return { kind: "absent" };
  }
  if (raw === null) {
    return { kind: "absent" };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "bad" };
  }
  const read = readSave(value);
  return read.kind === "older" ? { ...read, raw } : read;
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
