import type { FieldLogDocument } from "./field-log";
import type { Mountain } from "./mountain";

export type CloudLoadResult =
  | {
      readonly kind: "found";
      readonly mountain: Mountain;
      readonly lastSeen?: number | undefined;
    }
  | { readonly kind: "missing" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "disabled" };

export type CloudWriteResult =
  | { readonly kind: "ok" }
  | { readonly kind: "failed"; readonly message: string };

export type CloudSave = {
  readonly load: (args: { uid: string }) => Promise<CloudLoadResult>;
  readonly write: (args: {
    uid: string;
    mountain: Mountain;
    lastSeen?: number;
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
  remote,
}: {
  local: Mountain;
  remote: CloudLoadResult;
}): HydratedSave {
  switch (remote.kind) {
    case "found":
      return { mountain: remote.mountain, upload: false };
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

  const current = (uid: string): CloudLoadResult => {
    const mountain = docs.get(uid);
    if (mountain === undefined) {
      return { kind: "missing" };
    }
    return { kind: "found", mountain, lastSeen: lastSeenByUid.get(uid) };
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
    write: ({ uid, mountain, lastSeen }) => {
      docs.set(uid, mountain);
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
