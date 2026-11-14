import type { Mountain } from "./mountain";
import { readSave, serializeSave, type ParsedSave } from "./persist";
import { compareSaveProgress } from "./save-progress";

/** The phone backup's key prefix (#558). Keys from before version 8 are never read or touched. */
const PHONE_BACKUP_PREFIX = "dad-friendly-game-backup:";

export type PhoneConflict = {
  readonly remote: ParsedSave;
  readonly deviceLabel: string;
};

export type PhoneBackup =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" }
  /** A later build wrote it: this build never writes over it. */
  | { readonly kind: "newer" }
  /** From before this version: set aside, with its run stamp, for a fresh mountain. */
  | {
      readonly kind: "older";
      readonly version: number;
      readonly startedAt: number;
      readonly raw: string;
    }
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

/** The backup record's save, as one of the backup's answers. */
function readStoredSave(
  value: unknown,
  raw: string,
): PhoneBackup | { readonly kind: "ok"; readonly save: ParsedSave } {
  const read = readSave(value);
  switch (read.kind) {
    case "ok":
      return read;
    case "newer":
      return { kind: "newer" };
    case "older":
      return {
        kind: "older",
        version: read.version,
        startedAt: read.startedAt,
        raw,
      };
    case "bad":
      return { kind: "unreadable" };
  }
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
  const stored = readStoredSave(value.save, raw);
  if (stored.kind !== "ok") {
    return stored;
  }
  const save = stored.save;
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
  const read = readSave(value.remote);
  const remote = read.kind === "ok" ? read.save : undefined;
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

type PhoneBackupInput = {
  storage: Storage;
  uid: string;
  mountain: Mountain;
  lastSeen: number;
  rev?: number | undefined;
  deviceId?: string | undefined;
  syncedRev?: number | undefined;
  dirty?: boolean | undefined;
  conflict?: PhoneConflict | undefined;
};

/**
 * Writes the full save for this account. A backup that is already ahead, or
 * one this build cannot read, is left byte for byte. The key is never removed.
 */
export function writePhoneBackup(input: PhoneBackupInput): PhoneBackupWrite {
  const { storage, uid } = input;
  const key = backupKey(uid);
  let raw: string;
  try {
    raw = JSON.stringify(backupRecord(input));
  } catch {
    return "failed";
  }
  try {
    const existing = storage.getItem(key);
    if (existing !== null && keepsExisting(existing, raw, input)) {
      return "kept";
    }
    storage.setItem(key, raw);
    return "wrote";
  } catch {
    return "failed";
  }
}

type SerializedSave = ReturnType<typeof serializeSave>;

type StoredConflict = {
  readonly remote: SerializedSave;
  readonly deviceLabel: string;
};

/** The JSON record under the backup key. */
type StoredBackup = {
  readonly uid: string;
  readonly save: SerializedSave;
  readonly syncedRev?: number;
  readonly dirty?: true;
  readonly conflict?: StoredConflict;
};

/** The stored record: the save, plus its sync state and any open conflict. */
function backupRecord({
  uid,
  mountain,
  lastSeen,
  rev,
  deviceId,
  syncedRev,
  dirty,
  conflict,
}: PhoneBackupInput): StoredBackup {
  return {
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
      : { conflict: serializeConflict(conflict) }),
  };
}

function serializeConflict(conflict: PhoneConflict): StoredConflict {
  const { remote } = conflict;
  return {
    remote: serializeSave({
      mountain: remote.mountain,
      lastSeen: remote.lastSeen ?? 0,
      ...(remote.rev === undefined ? {} : { rev: remote.rev }),
      ...(remote.deviceId === undefined ? {} : { deviceId: remote.deviceId }),
    }),
    deviceLabel: conflict.deviceLabel,
  };
}

/**
 * The stored backup stays when it already holds these bytes, cannot be read
 * by this build, has a higher rev, or is ahead at the same rev.
 */
function keepsExisting(
  existing: string,
  raw: string,
  { uid, mountain, lastSeen, rev }: PhoneBackupInput,
): boolean {
  if (existing === raw) {
    return true;
  }
  const parsed = parseStored(existing, uid);
  if (parsed.kind !== "present") {
    return true;
  }
  const existingRev = parsed.save.rev ?? 0;
  const incomingRev = rev ?? 0;
  if (existingRev !== incomingRev) {
    return existingRev > incomingRev;
  }
  return compareSaveProgress(parsed.save, { mountain, lastSeen }) > 0;
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
