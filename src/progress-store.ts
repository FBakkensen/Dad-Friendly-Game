import type { AuthController } from "./auth";
import {
  applySignedInSave,
  createNoopCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { createMountain, minedOut, type Mountain } from "./mountain";
import { createLogger, formatLogEvent, type Logger } from "./log";
import {
  clearSessionSave,
  readSessionSave,
  tryGetGuestStorage,
  writeSessionSave,
} from "./session-save";

type SaveKind = "unsigned" | "session" | "loading" | "account" | "error";

export type ProgressSnapshot = {
  readonly mountain: Mountain;
  readonly saveKind: SaveKind;
  readonly ready: boolean;
  readonly log: string | undefined;
};

export type ProgressStore = {
  readonly getSnapshot: () => ProgressSnapshot;
  readonly subscribe: (
    listener: (snapshot: ProgressSnapshot) => void,
  ) => () => void;
  readonly applyMutation: (mountain: Mountain) => void;
  readonly flush: () => void;
  readonly dispose: () => void;
};

/** Firestore sustains about one write per second per document. */
const CLOUD_WRITE_GAP_MS = 1000;

export function createProgressStore({
  auth,
  cloudSave = createNoopCloudSave(),
  logger = createLogger({ limit: 20 }),
  sessionStorage: sessionArg,
  now = Date.now,
  cloudWriteGapMs = CLOUD_WRITE_GAP_MS,
}: {
  auth: AuthController;
  cloudSave?: CloudSave;
  logger?: Logger;
  sessionStorage?: Storage;
  now?: () => number;
  cloudWriteGapMs?: number;
}): ProgressStore {
  const sessionStore = sessionArg ?? tryGetGuestStorage();
  let mountain: Mountain = createMountain();
  let lastSeen: number | undefined;
  let hydrateGeneration = 0;
  let hydrated = false;
  let inFlightWrites = 0;
  let saveKind: SaveKind = "unsigned";
  let watchingCloud = false;
  let unwatch: (() => void) | undefined;
  let disposed = false;
  let lastCloudWriteAt = Number.NEGATIVE_INFINITY;
  let pendingCloudWrite: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(snapshot: ProgressSnapshot) => void>();

  const snapshot = (): ProgressSnapshot => {
    const latest = logger.latest();
    return {
      mountain,
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
    if (
      !writeSessionSave({
        storage: sessionStore,
        mountain,
        lastSeen: lastSeen ?? now(),
      })
    ) {
      return;
    }
    saveKind = "session";
    logger.record({
      level: "info",
      code: "save.session",
      detail: "ok",
      data: saveCounts(mountain),
    });
  };

  const cancelPendingCloudWrite = (): void => {
    if (pendingCloudWrite !== undefined) {
      clearTimeout(pendingCloudWrite);
      pendingCloudWrite = undefined;
    }
  };

  /** Taps are unbounded, so cloud writes are throttled; the last tap always lands. */
  const persistCloudSoon = (): void => {
    if (pendingCloudWrite !== undefined) {
      return;
    }
    const wait = lastCloudWriteAt + cloudWriteGapMs - now();
    if (wait <= 0) {
      persistCloud();
      return;
    }
    pendingCloudWrite = setTimeout(() => {
      pendingCloudWrite = undefined;
      if (!disposed) {
        persistCloud();
      }
    }, wait);
  };

  const persistCloud = (): void => {
    cancelPendingCloudWrite();
    const state = auth.getState();
    if (state.kind !== "signed-in" || !hydrated) {
      return;
    }
    const uid = state.user.uid;
    const generation = hydrateGeneration;
    lastCloudWriteAt = now();
    const counts = saveCounts(mountain);
    inFlightWrites += 1;
    void cloudSave
      .write({ uid, mountain, lastSeen: lastSeen ?? now() })
      .then((result) => {
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
    const localAhead = inFlightWrites > 0 || pendingCloudWrite !== undefined;
    if (localAhead && remote.kind === "found") {
      return;
    }
    const next = applySignedInSave({ local: mountain, remote });
    mountain = next.mountain;
    lastSeen = now();
    logger.record({
      level: remote.kind === "unavailable" ? "error" : "info",
      code: "save.remote",
      detail: remote.kind,
      data: saveCounts(mountain),
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
    cancelPendingCloudWrite();
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
    mountain = stored.mountain;
    lastSeen = now();
    saveKind = "session";
    logger.record({
      level: "info",
      code: "save.session",
      detail: "resume",
      data: saveCounts(mountain),
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
      data: saveCounts(mountain),
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
      if (next === mountain) {
        return;
      }
      mountain = next;
      lastSeen = now();
      persistCloudSoon();
      persistSession();
      emit();
    },
    flush: () => {
      if (disposed) {
        return;
      }
      lastSeen = now();
      persistCloud();
      if (saveKind === "session") {
        persistSession();
      }
    },
    dispose: () => {
      disposed = true;
      cancelPendingCloudWrite();
      hydrateGeneration += 1;
      unwatch?.();
      unwatch = undefined;
      unsubscribeAuth();
      listeners.clear();
    },
  };
}

function saveCounts(mountain: Mountain): { mined: number; pocket: number } {
  return { mined: minedOut(mountain), pocket: mountain.pocket };
}
