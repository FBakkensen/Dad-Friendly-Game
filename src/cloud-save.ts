import type { FirebaseWebConfig, FirebaseWebOptions } from "./auth";
import type { PocketGrid } from "./grid";

export type CloudLoadResult =
  | { readonly kind: "found"; readonly grid: PocketGrid }
  | { readonly kind: "missing" }
  | { readonly kind: "unavailable" };

export type CloudSave = {
  readonly load: (args: { uid: string }) => Promise<CloudLoadResult>;
  readonly write: (args: { uid: string; grid: PocketGrid }) => Promise<void>;
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
      return { grid: local, upload: false };
    default: {
      const _exhaustive: never = remote;
      return _exhaustive;
    }
  }
}

export function createNoopCloudSave(): CloudSave {
  return {
    load: () => Promise.resolve({ kind: "missing" }),
    write: () => Promise.resolve(),
  };
}

export function createMemoryCloudSave({
  docs = new Map<string, PocketGrid>(),
}: {
  docs?: Map<string, PocketGrid>;
} = {}): CloudSave {
  return {
    load: ({ uid }) => {
      const grid = docs.get(uid);
      if (grid === undefined) {
        return Promise.resolve({ kind: "missing" });
      }
      return Promise.resolve({ kind: "found", grid });
    },
    write: ({ uid, grid }) => {
      docs.set(uid, grid);
      return Promise.resolve();
    },
  };
}

export function createUnavailableCloudSave(): CloudSave {
  return {
    load: () => Promise.resolve({ kind: "unavailable" }),
    write: () => Promise.resolve(),
  };
}

export function createCloudSave({
  config,
  hostname,
  createFirebase,
}: {
  config: FirebaseWebConfig;
  hostname: string;
  createFirebase: (args: { options: FirebaseWebOptions }) => CloudSave;
}): CloudSave {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return createNoopCloudSave();
  }
  switch (config.kind) {
    case "ready":
      return createFirebase({ options: config.options });
    case "absent":
      return createNoopCloudSave();
    default: {
      const _exhaustive: never = config;
      return _exhaustive;
    }
  }
}
