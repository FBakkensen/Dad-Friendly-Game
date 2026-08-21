import type { PocketGrid } from "./grid";

export type CloudLoadResult =
  | {
      readonly kind: "found";
      readonly grid: PocketGrid;
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
    grid: PocketGrid;
    lastSeen?: number;
  }) => Promise<CloudWriteResult>;
  readonly watch: (args: {
    uid: string;
    onChange: (remote: CloudLoadResult) => void;
  }) => () => void;
};

export type HydratedSave = {
  readonly grid: PocketGrid;
  readonly upload: boolean;
};

export function applySignedInSave({
  local,
  remote,
}: {
  local: PocketGrid;
  remote: CloudLoadResult;
}): HydratedSave {
  switch (remote.kind) {
    case "found":
      return { grid: remote.grid, upload: false };
    case "missing":
      return { grid: local, upload: true };
    case "unavailable":
    case "disabled":
      return { grid: local, upload: false };
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
    watch: ({ onChange }) => {
      onChange({ kind: "disabled" });
      return () => {
        return;
      };
    },
  };
}

export function createMemoryCloudSave({
  docs = new Map<string, PocketGrid>(),
}: {
  docs?: Map<string, PocketGrid>;
} = {}): CloudSave {
  const watchers = new Map<string, Set<(remote: CloudLoadResult) => void>>();
  const lastSeenByUid = new Map<string, number>();

  const current = (uid: string): CloudLoadResult => {
    const grid = docs.get(uid);
    if (grid === undefined) {
      return { kind: "missing" };
    }
    return { kind: "found", grid, lastSeen: lastSeenByUid.get(uid) };
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
    write: ({ uid, grid, lastSeen }) => {
      docs.set(uid, grid);
      if (lastSeen !== undefined) {
        lastSeenByUid.set(uid, lastSeen);
      }
      emit(uid);
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
    watch: ({ onChange }) => {
      onChange({ kind: "unavailable" });
      return () => {
        return;
      };
    },
  };
}
