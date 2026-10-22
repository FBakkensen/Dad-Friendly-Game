import type { FieldLogDocument } from "./field-log";
import type { Mountain } from "./mountain";
import { compareSaveProgress } from "./save-progress";

export type CloudLoadResult =
  | {
      readonly kind: "found";
      readonly mountain: Mountain;
      readonly lastSeen?: number | undefined;
      /** 0 when the document has no rev yet (a v6 save). */
      readonly rev?: number;
      readonly deviceId?: string;
      /** The write is in the local cache and the server has not accepted it. */
      readonly pending?: boolean;
      /** Served from the persistent cache, not the server. */
      readonly cached?: boolean;
    }
  | { readonly kind: "missing"; readonly cached?: boolean }
  | { readonly kind: "unavailable" }
  | { readonly kind: "disabled" };

export type CloudWriteResult =
  | { readonly kind: "ok" }
  /** Rules rejected the rev. The caller reads and merges. */
  | { readonly kind: "rejected"; readonly message: string }
  | { readonly kind: "failed"; readonly message: string };

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
  }) => Promise<CloudWriteResult>;
  /** Overwrites `fieldLogs/{uid}`. The caller throttles. */
  readonly writeFieldLog: (args: {
    uid: string;
    log: FieldLogDocument;
  }) => Promise<CloudWriteResult>;
  readonly watch: (args: {
    uid: string;
    onChange: (remote: CloudLoadResult) => void;
  }) => () => void;
};

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
    watch: ({ onChange }) => {
      onChange({ kind: "disabled" });
      return () => {
        return;
      };
    },
  };
}

export function createMemoryCloudSave({
  docs = new Map<string, Mountain>(),
  fieldLogs = new Map<string, FieldLogDocument>(),
}: {
  docs?: Map<string, Mountain>;
  fieldLogs?: Map<string, FieldLogDocument>;
} = {}): CloudSave {
  const watchers = new Map<string, Set<(remote: CloudLoadResult) => void>>();
  const lastSeenByUid = new Map<string, number>();
  const revByUid = new Map<string, number>();
  const deviceByUid = new Map<string, string>();

  const current = (uid: string): CloudLoadResult => {
    const mountain = docs.get(uid);
    if (mountain === undefined) {
      return { kind: "missing" };
    }
    const deviceId = deviceByUid.get(uid);
    const lastSeen = lastSeenByUid.get(uid);
    return {
      kind: "found",
      mountain,
      rev: revByUid.get(uid) ?? 0,
      ...(lastSeen === undefined ? {} : { lastSeen }),
      ...(deviceId === undefined ? {} : { deviceId }),
    };
  };

  const emit = (uid: string): void => {
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
    write: ({ uid, mountain, lastSeen, rev, deviceId }) => {
      const stored = revByUid.get(uid) ?? 0;
      const expected = stored + 1;
      if (!Number.isInteger(rev) || rev !== expected) {
        return Promise.resolve({
          kind: "rejected",
          message: "permission-denied",
        });
      }
      docs.set(uid, mountain);
      revByUid.set(uid, rev);
      deviceByUid.set(uid, deviceId);
      if (lastSeen !== undefined) {
        lastSeenByUid.set(uid, lastSeen);
      }
      emit(uid);
      return Promise.resolve({ kind: "ok" });
    },
    writeFieldLog: ({ uid, log }) => {
      fieldLogs.set(uid, log);
      return Promise.resolve({ kind: "ok" });
    },
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
    watch: ({ onChange }) => {
      onChange({ kind: "unavailable" });
      return () => {
        return;
      };
    },
  };
}
