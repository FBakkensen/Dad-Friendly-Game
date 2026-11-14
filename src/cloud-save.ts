import type { FieldLogDocument } from "./field-log";
import { runStartedAt, type Mountain } from "./mountain";
import { compareSaveProgress } from "./save-progress";

export type CloudLoadResult =
  | {
      readonly kind: "found";
      readonly mountain: Mountain;
      readonly lastSeen?: number | undefined;
      /** 0 when the document has no rev yet (a v6 save). */
      readonly rev?: number;
      readonly deviceId?: string;
      /** Friendly name stored with the device id. Never the raw id. */
      readonly deviceLabel?: string;
      /** The write is in the local cache and the server has not accepted it. */
      readonly pending?: boolean;
      /** Served from the persistent cache, not the server. */
      readonly cached?: boolean;
    }
  | { readonly kind: "missing"; readonly cached?: boolean }
  /** A later build wrote it: this build never writes over it (#558). */
  | { readonly kind: "newer" }
  /** From before this version: set aside, with its rev and run stamp, for a fresh mountain. */
  | {
      readonly kind: "older";
      readonly version: number;
      readonly rev: number;
      readonly startedAt: number;
      readonly raw: unknown;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "disabled" };

export type CloudWriteResult =
  | { readonly kind: "ok" }
  /** Rules rejected the rev. The caller reads and merges. */
  | { readonly kind: "rejected"; readonly message: string }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Why a mountain went to Saved copies: the side not chosen in a conflict,
 * the one in play when a copy was restored, the one left by a Start over or
 * a pass (#480), or a copy from before this version, kept as it was stored
 * (#558).
 */
export const ARCHIVE_REASONS = [
  "conflict",
  "restore",
  "start-over",
  "pass",
  "reset",
] as const;

export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];

export type CloudSave = {
  readonly load: (args: {
    uid: string;
    /** Bypass the persistent cache and read the server. */
    fresh?: boolean;
  }) => Promise<CloudLoadResult>;
  readonly write: (args: {
    uid: string;
    mountain: Mountain;
    lastSeen?: number;
    rev: number;
    deviceId: string;
    deviceLabel?: string;
  }) => Promise<CloudWriteResult>;
  /** Keeps a mountain left behind for seven days. Owner create only. */
  readonly archiveCopy?: (args: {
    uid: string;
    mountain: Mountain;
    lastSeen: number;
    rev: number;
    deviceId: string;
    deviceLabel: string;
    reason: ArchiveReason;
  }) => Promise<CloudWriteResult>;
  /**
   * Keeps a copy from before this version as it was stored, for seven days
   * (#558). This build cannot read it, so Saved copies never lists it.
   */
  readonly archiveRaw?: (args: RawArchive) => Promise<CloudWriteResult>;
  /** Up to three copies that have not reached their expiry. */
  readonly listCopies?: (args: {
    uid: string;
    now: number;
  }) => Promise<readonly ArchivedCopy[]>;
  /** Overwrites this device's `fieldLogs/{uid}/devices/{deviceId}` (#485). The caller throttles. */
  readonly writeFieldLog: (args: {
    uid: string;
    deviceId: string;
    log: FieldLogDocument;
  }) => Promise<CloudWriteResult>;
  readonly watch: (args: {
    uid: string;
    onChange: (remote: CloudLoadResult) => void;
  }) => () => void;
};

/** A stored copy this build cannot read, on its way to Saved copies. */
export type RawArchive = {
  readonly uid: string;
  readonly raw: unknown;
  readonly version: number;
  readonly rev: number;
  readonly reason: ArchiveReason;
};

export type ArchivedCopy = {
  readonly id: string;
  readonly mountain: Mountain;
  readonly lastSeen: number;
  readonly rev: number;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly reason: ArchiveReason;
  readonly archivedAt: number;
  readonly expiresAt: number;
};

export function isArchiveReason(value: unknown): value is ArchiveReason {
  return ARCHIVE_REASONS.some((reason) => reason === value);
}

const ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000;

export type HydratedSave = {
  readonly mountain: Mountain;
  readonly upload: boolean;
};

export function applySignedInSave({
  local,
  localLastSeen,
  remote,
}: {
  local: Mountain;
  localLastSeen?: number;
  remote: CloudLoadResult;
}): HydratedSave {
  switch (remote.kind) {
    case "found": {
      const verdict = compareSaveProgress(
        { mountain: local, lastSeen: localLastSeen },
        { mountain: remote.mountain, lastSeen: remote.lastSeen },
      );
      if (verdict < 0) {
        return { mountain: remote.mountain, upload: false };
      }
      return { mountain: local, upload: verdict > 0 };
    }
    case "missing":
      return { mountain: local, upload: true };
    case "newer":
    case "older":
    case "unavailable":
    case "disabled":
      return { mountain: local, upload: false };
    default: {
      const _exhaustive: never = remote;
      return _exhaustive;
    }
  }
}

export function createNoopCloudSave(): CloudSave {
  return {
    load: () => Promise.resolve({ kind: "disabled" }),
    write: () => Promise.resolve({ kind: "ok" }),
    writeFieldLog: () => Promise.resolve({ kind: "ok" }),
    archiveCopy: () => Promise.resolve({ kind: "ok" }),
    archiveRaw: () => Promise.resolve({ kind: "ok" }),
    listCopies: () => Promise.resolve([]),
    watch: ({ onChange }) => {
      onChange({ kind: "disabled" });
      return () => {
        return;
      };
    },
  };
}

/** Where the memory cloud keeps one device's field log: `uid/deviceId`, as the document path. */
export function fieldLogKey(uid: string, deviceId: string): string {
  return `${uid}/${deviceId}`;
}

/** The account's one device's field log, for tests with one device. Throws on a second. */
export function fieldLogOf(
  fieldLogs: ReadonlyMap<string, FieldLogDocument>,
  uid: string,
): FieldLogDocument | undefined {
  const mine = [...fieldLogs].filter(([key]) => key.startsWith(`${uid}/`));
  if (mine.length > 1) {
    throw new Error(`${uid} has ${String(mine.length)} devices' field logs`);
  }
  return mine[0]?.[1];
}

/** The memory cloud's Saved copies: kept a week, newest first, three listed. */
function memoryArchive(
  archiveGate: { fail: boolean } | undefined,
  rawArchives: RawArchive[],
): Pick<CloudSave, "archiveCopy" | "archiveRaw" | "listCopies"> {
  const archives: {
    uid: string;
    copy: ArchivedCopy;
  }[] = [];
  let archiveSeq = 0;
  return {
    archiveCopy: ({
      uid,
      mountain,
      lastSeen,
      rev,
      deviceId,
      deviceLabel,
      reason,
    }) => {
      if (archiveGate?.fail) {
        return Promise.resolve({ kind: "failed", message: "unavailable" });
      }
      archiveSeq += 1;
      const archivedAt = Date.now() + archiveSeq;
      archives.push({
        uid,
        copy: {
          id: `copy-${String(archiveSeq)}`,
          mountain,
          lastSeen,
          rev,
          deviceId,
          deviceLabel,
          reason,
          archivedAt,
          expiresAt: archivedAt + ARCHIVE_MS,
        },
      });
      return Promise.resolve({ kind: "ok" });
    },
    archiveRaw: (copy) => {
      if (archiveGate?.fail) {
        return Promise.resolve({ kind: "failed", message: "unavailable" });
      }
      rawArchives.push(copy);
      return Promise.resolve({ kind: "ok" });
    },
    listCopies: ({ uid, now }) => {
      const fresh = archives
        .filter((item) => item.uid === uid && item.copy.expiresAt > now)
        .sort((left, right) => right.copy.archivedAt - left.copy.archivedAt)
        .slice(0, 3)
        .map((item) => item.copy);
      return Promise.resolve(fresh);
    },
  };
}

/** A document from before this version, as the memory cloud holds it. */
type OlderDoc = {
  readonly version: number;
  readonly rev: number;
  readonly startedAt: number;
  readonly raw: unknown;
};

export function createMemoryCloudSave({
  docs = new Map<string, Mountain>(),
  newerDocs = new Set<string>(),
  olderDocs = new Map<string, OlderDoc>(),
  rawArchives = [],
  fieldLogs = new Map<string, FieldLogDocument>(),
  holdEcho,
  archiveGate,
}: {
  docs?: Map<string, Mountain>;
  /** Accounts whose document a later build wrote: it reads `newer` and takes no write. */
  newerDocs?: Set<string>;
  /** Accounts whose document an earlier version wrote: it reads `older` until a write lands. */
  olderDocs?: Map<string, OlderDoc>;
  /** Where `archiveRaw` keeps what it was given, in order. */
  rawArchives?: RawArchive[];
  fieldLogs?: Map<string, FieldLogDocument>;
  /** While held, a write does not fan out to other tabs. */
  holdEcho?: { held: boolean };
  /** When fail is set, the archive write is refused and nothing is stored. */
  archiveGate?: { fail: boolean };
} = {}): CloudSave {
  const watchers = new Map<string, Set<(remote: CloudLoadResult) => void>>();
  const lastSeenByUid = new Map<string, number>();
  const revByUid = new Map<string, number>();
  const deviceByUid = new Map<string, string>();
  const labelByUid = new Map<string, string>();

  const current = (uid: string): CloudLoadResult => {
    if (newerDocs.has(uid)) {
      return { kind: "newer" };
    }
    const older = olderDocs.get(uid);
    if (older !== undefined) {
      return { kind: "older", ...older };
    }
    const mountain = docs.get(uid);
    if (mountain === undefined) {
      return { kind: "missing" };
    }
    const deviceId = deviceByUid.get(uid);
    const deviceLabel = labelByUid.get(uid);
    const lastSeen = lastSeenByUid.get(uid);
    return {
      kind: "found",
      mountain,
      rev: revByUid.get(uid) ?? 0,
      ...(lastSeen === undefined ? {} : { lastSeen }),
      ...(deviceId === undefined ? {} : { deviceId }),
      ...(deviceLabel === undefined ? {} : { deviceLabel }),
    };
  };

  const emit = (uid: string): void => {
    if (holdEcho?.held) {
      return;
    }
    const remote = current(uid);
    const listeners = watchers.get(uid);
    if (listeners === undefined) {
      return;
    }
    for (const listener of listeners) {
      listener(remote);
    }
  };

  return {
    load: ({ uid }) => Promise.resolve(current(uid)),
    write: ({ uid, mountain, lastSeen, rev, deviceId, deviceLabel }) => {
      if (newerDocs.has(uid)) {
        // The rules refuse a version that goes down.
        return Promise.resolve({
          kind: "rejected",
          message: "permission-denied",
        });
      }
      const older = olderDocs.get(uid);
      const stored = revByUid.get(uid) ?? older?.rev ?? 0;
      const storedMountain = docs.get(uid);
      const storedStamp =
        storedMountain === undefined
          ? (older?.startedAt ?? 0)
          : runStartedAt(storedMountain);
      if (
        !Number.isInteger(rev) ||
        rev !== stored + 1 ||
        runStartedAt(mountain) < storedStamp
      ) {
        return Promise.resolve({
          kind: "rejected",
          message: "permission-denied",
        });
      }
      olderDocs.delete(uid);
      docs.set(uid, mountain);
      revByUid.set(uid, rev);
      deviceByUid.set(uid, deviceId);
      if (deviceLabel !== undefined) {
        labelByUid.set(uid, deviceLabel);
      }
      if (lastSeen !== undefined) {
        lastSeenByUid.set(uid, lastSeen);
      }
      emit(uid);
      return Promise.resolve({ kind: "ok" });
    },
    writeFieldLog: ({ uid, deviceId, log }) => {
      fieldLogs.set(fieldLogKey(uid, deviceId), log);
      return Promise.resolve({ kind: "ok" });
    },
    ...memoryArchive(archiveGate, rawArchives),
    watch: ({ uid, onChange }) => {
      let listeners = watchers.get(uid);
      if (listeners === undefined) {
        listeners = new Set();
        watchers.set(uid, listeners);
      }
      listeners.add(onChange);
      onChange(current(uid));
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}

export function createUnavailableCloudSave(): CloudSave {
  return {
    load: () => Promise.resolve({ kind: "unavailable" }),
    write: () => Promise.resolve({ kind: "failed", message: "unavailable" }),
    writeFieldLog: () =>
      Promise.resolve({ kind: "failed", message: "unavailable" }),
    archiveCopy: () =>
      Promise.resolve({ kind: "failed", message: "unavailable" }),
    archiveRaw: () =>
      Promise.resolve({ kind: "failed", message: "unavailable" }),
    listCopies: () => Promise.resolve([]),
    watch: ({ onChange }) => {
      onChange({ kind: "unavailable" });
      return () => {
        return;
      };
    },
  };
}
