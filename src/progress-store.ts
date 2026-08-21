import type { AuthController } from "./auth";
import {
  applySignedInSave,
  createNoopCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { createPocketGrid, dugCount, type PocketGrid } from "./grid";
import { createLogger, formatLogEvent, type Logger } from "./log";
import {
  clearSessionSave,
  readSessionSave,
  tryGetSessionStorage,
  writeSessionSave,
} from "./session-save";

type SaveKind = "unsigned" | "session" | "loading" | "account" | "error";

export type ProgressSnapshot = {
  readonly grid: PocketGrid;
  readonly saveKind: SaveKind;
  readonly ready: boolean;
  readonly log: string | undefined;
};

export type ProgressStore = {
  readonly getSnapshot: () => ProgressSnapshot;
  readonly subscribe: (
    listener: (snapshot: ProgressSnapshot) => void,
  ) => () => void;
  readonly applyMutation: (grid: PocketGrid) => void;
  readonly flush: () => void;
  readonly dispose: () => void;
};

export function createProgressStore({
  auth,
  cloudSave = createNoopCloudSave(),
  logger = createLogger({ limit: 20 }),
  sessionStorage: sessionArg,
}: {
  auth: AuthController;
  cloudSave?: CloudSave;
  logger?: Logger;
  sessionStorage?: Storage;
}): ProgressStore {
  const sessionStore = sessionArg ?? tryGetSessionStorage();
  let grid: PocketGrid = createPocketGrid();
  let hydrateGeneration = 0;
  let hydrated = false;
  let inFlightWrites = 0;
  let saveKind: SaveKind = "unsigned";
  let watchingCloud = false;
  let unwatch: (() => void) | undefined;
  let disposed = false;
  const listeners = new Set<(snapshot: ProgressSnapshot) => void>();

  const snapshot = (): ProgressSnapshot => {
    const latest = logger.latest();
    return {
      grid,
      saveKind,
      ready: auth.getState().kind !== "signed-in" || hydrated,
      log: latest === undefined ? undefined : formatLogEvent(latest),
    };
  };

  const emit = (): void => {
    const next = snapshot();
    for (const listener of [...listeners]) {
      listener(next);
    }
  };

  const persistSession = (): void => {
    if (auth.getState().kind === "signed-in" || sessionStore === undefined) {
      return;
    }
    if (!writeSessionSave({ storage: sessionStore, grid })) {
      return;
    }
    saveKind = "session";
    logger.record({
      level: "info",
      code: "save.session",
      detail: "ok",
      data: saveCounts(grid),
    });
  };

  const persistCloud = (): void => {
    const state = auth.getState();
    if (state.kind !== "signed-in" || !hydrated) {
      return;
    }
    const uid = state.user.uid;
    const generation = hydrateGeneration;
    const counts = saveCounts(grid);
    inFlightWrites += 1;
    void cloudSave.write({ uid, grid }).then((result) => {
      inFlightWrites -= 1;
      if (disposed || generation !== hydrateGeneration) {
        return;
      }
      switch (result.kind) {
        case "ok":
          saveKind = "account";
          logger.record({
            level: "info",
            code: "save.write",
            detail: "ok",
            data: counts,
          });
          break;
        case "failed":
          saveKind = "error";
          logger.record({
            level: "error",
            code: "save.write",
            detail: result.message,
            data: counts,
          });
          break;
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
      emit();
    });
  };

  const applyRemote = (remote: CloudLoadResult): void => {
    if (inFlightWrites > 0 && remote.kind === "found") {
      return;
    }
    const next = applySignedInSave({ local: grid, remote });
    grid = next.grid;
    logger.record({
      level: remote.kind === "unavailable" ? "error" : "info",
      code: "save.remote",
      detail: remote.kind,
      data: saveCounts(grid),
    });
    switch (remote.kind) {
      case "found":
      case "missing":
        hydrated = true;
        saveKind = "account";
        if (next.upload) {
          persistCloud();
        }
        break;
      case "unavailable":
      case "disabled":
        hydrated = false;
        saveKind = "error";
        break;
      default: {
        const _exhaustive: never = remote;
        return _exhaustive;
      }
    }
    emit();
  };

  const stopWatch = (): void => {
    hydrateGeneration += 1;
    hydrated = false;
    unwatch?.();
    unwatch = undefined;
  };

  const resumeFromSession = (): void => {
    stopWatch();
    if (sessionStore === undefined) {
      saveKind = "unsigned";
      emit();
      return;
    }
    const stored = readSessionSave({ storage: sessionStore });
    if (stored === undefined) {
      saveKind = "unsigned";
      emit();
      return;
    }
    grid = stored;
    saveKind = "session";
    logger.record({
      level: "info",
      code: "save.session",
      detail: "resume",
      data: saveCounts(grid),
    });
    emit();
  };

  const startCloudWatch = (): void => {
    const state = auth.getState();
    if (state.kind !== "signed-in") {
      resumeFromSession();
      return;
    }
    if (sessionStore !== undefined) {
      clearSessionSave({ storage: sessionStore });
    }
    const generation = (hydrateGeneration += 1);
    hydrated = false;
    saveKind = "loading";
    unwatch?.();
    logger.record({
      level: "info",
      code: "save.watch",
      detail: "start",
      data: saveCounts(grid),
    });
    emit();
    unwatch = cloudSave.watch({
      uid: state.user.uid,
      onChange: (remote) => {
        if (disposed || generation !== hydrateGeneration) {
          return;
        }
        applyRemote(remote);
      },
    });
  };

  const unsubscribeAuth = auth.subscribe((state) => {
    if (disposed) {
      return;
    }
    if (state.kind === "signed-in") {
      watchingCloud = true;
      startCloudWatch();
      return;
    }
    const leaveAccount = watchingCloud;
    watchingCloud = false;
    if (leaveAccount) {
      stopWatch();
      persistSession();
      emit();
      return;
    }
    resumeFromSession();
  });

  return {
    getSnapshot: snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    applyMutation: (next) => {
      if (disposed) {
        return;
      }
      if (auth.getState().kind === "signed-in" && !hydrated) {
        return;
      }
      if (next === grid) {
        return;
      }
      grid = next;
      persistCloud();
      persistSession();
      emit();
    },
    flush: () => {
      if (disposed) {
        return;
      }
      persistCloud();
      if (saveKind === "session") {
        persistSession();
      }
    },
    dispose: () => {
      disposed = true;
      hydrateGeneration += 1;
      unwatch?.();
      unwatch = undefined;
      unsubscribeAuth();
      listeners.clear();
    },
  };
}

function saveCounts(grid: PocketGrid): { dug: number } {
  return { dug: dugCount(grid) };
}
