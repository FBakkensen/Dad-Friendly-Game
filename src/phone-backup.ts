import type { Mountain } from "./mountain";
import { parseSaveValue, serializeSave, type ParsedSave } from "./persist";
import { compareSaveProgress } from "./save-progress";

const PHONE_BACKUP_PREFIX = "dad-friendly-phone-backup:";

export type PhoneConflict = {
  readonly remote: ParsedSave;
  readonly deviceLabel: string;
};

export type PhoneBackup =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" }
  | {
      readonly kind: "present";
      readonly save: ParsedSave;
      /** Last rev the server confirmed for this device. */
      readonly syncedRev?: number;
      /** This phone has changes the server has not confirmed. */
      readonly dirty?: boolean;
      /** The other copy, so a reload shows the same sheet. */
      readonly conflict?: PhoneConflict;
    };

export type PhoneBackupWrite = "wrote" | "kept" | "failed";

function backupKey(uid: string): string {
  return `${PHONE_BACKUP_PREFIX}${uid}`;
}

function parseStored(raw: string, uid: string): PhoneBackup {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "unreadable" };
  }
  if (typeof value !== "object" || value === null) {
    return { kind: "unreadable" };
  }
  if (!("uid" in value) || !("save" in value)) {
    return { kind: "unreadable" };
  }
  if (value.uid !== uid) {
    return { kind: "unreadable" };
  }
  const save = parseSaveValue(value.save);
  if (save === undefined) {
    return { kind: "unreadable" };
  }
  const extra = value as {
    syncedRev?: unknown;
    dirty?: unknown;
    conflict?: unknown;
  };
  const syncedRev = readRev(extra.syncedRev);
  const dirty = extra.dirty === true;
  const conflict = readConflict(extra.conflict);
  if (extra.conflict !== undefined && conflict === undefined) {
    return { kind: "unreadable" };
  }
  return {
    kind: "present",
    save,
    ...(syncedRev === undefined ? {} : { syncedRev }),
    ...(dirty ? { dirty: true } : {}),
    ...(conflict === undefined ? {} : { conflict }),
  };
}

function readRev(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function readConflict(value: unknown): PhoneConflict | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  if (!("remote" in value) || !("deviceLabel" in value)) {
    return undefined;
  }
  const remote = parseSaveValue(value.remote);
  const deviceLabel = value.deviceLabel;
  if (
    remote === undefined ||
    typeof deviceLabel !== "string" ||
    deviceLabel.length < 1 ||
    deviceLabel.length > 40
  ) {
    return undefined;
  }
  return { remote, deviceLabel };
}

/** The on-phone copy for this account. Never removed by the game. */
export function readPhoneBackup({
  storage,
  uid,
}: {
  storage: Storage;
  uid: string;
}): PhoneBackup {
  try {
    const raw = storage.getItem(backupKey(uid));
    if (raw === null) {
      return { kind: "absent" };
    }
    return parseStored(raw, uid);
  } catch {
    return { kind: "unreadable" };
  }
}

/**
 * Writes the full save for this account. A backup that is already ahead, or
 * one this build cannot read, is left byte for byte. The key is never removed.
 */
export function writePhoneBackup({
  storage,
  uid,
  mountain,
  lastSeen,
  rev,
  deviceId,
  syncedRev,
  dirty,
  conflict,
}: {
  storage: Storage;
  uid: string;
  mountain: Mountain;
  lastSeen: number;
  rev?: number | undefined;
  deviceId?: string | undefined;
  syncedRev?: number | undefined;
  dirty?: boolean | undefined;
  conflict?: PhoneConflict | undefined;
}): PhoneBackupWrite {
  const key = backupKey(uid);
  let raw: string;
  try {
    raw = JSON.stringify({
      uid,
      save: serializeSave({
        mountain,
        lastSeen,
        ...(rev === undefined ? {} : { rev }),
        ...(deviceId === undefined ? {} : { deviceId }),
      }),
      ...(syncedRev === undefined ? {} : { syncedRev }),
      ...(dirty === true ? { dirty: true } : {}),
      ...(conflict === undefined
        ? {}
        : {
            conflict: {
              remote: serializeSave({
                mountain: conflict.remote.mountain,
                lastSeen: conflict.remote.lastSeen ?? 0,
                ...(conflict.remote.rev === undefined
                  ? {}
                  : { rev: conflict.remote.rev }),
                ...(conflict.remote.deviceId === undefined
                  ? {}
                  : { deviceId: conflict.remote.deviceId }),
              }),
              deviceLabel: conflict.deviceLabel,
            },
          }),
    });
  } catch {
    return "failed";
  }
  try {
    const existing = storage.getItem(key);
    if (existing === raw) {
      return "kept";
    }
    if (existing !== null) {
      const parsed = parseStored(existing, uid);
      if (parsed.kind !== "present") {
        return "kept";
      }
      const existingRev = parsed.save.rev ?? 0;
      const incomingRev = rev ?? 0;
      if (existingRev > incomingRev) {
        return "kept";
      }
      if (
        existingRev === incomingRev &&
        compareSaveProgress(parsed.save, { mountain, lastSeen }) > 0
      ) {
        return "kept";
      }
    }
    storage.setItem(key, raw);
    return "wrote";
  } catch {
    return "failed";
  }
}

/** Identity of a write, so its own snapshot can be skipped. */
export function saveEchoKey(
  mountain: Mountain,
  lastSeen: number,
  rev = 0,
  deviceId = "",
): string {
  return JSON.stringify(
    serializeSave({
      mountain,
      lastSeen,
      ...(rev >= 1 && deviceId.length >= 8 ? { rev, deviceId } : {}),
    }),
  );
}
