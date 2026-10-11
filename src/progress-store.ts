import type { AuthController } from "./auth";
import {
  applySignedInSave,
  createNoopCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import {
  accrue,
  accrueAway,
  createMountain,
  minedOut,
  type AwayReport,
  type Mountain,
} from "./mountain";
import { relicsUncovered, type Relic } from "./relics";
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
  /** Set once per open when helpers mined while the game was closed. */
  readonly away: AwayReport | undefined;
  /** The next relic uncovered during this open and not yet celebrated. */
  readonly revealed: Relic | undefined;
};

export type ProgressStore = {
  readonly getSnapshot: () => ProgressSnapshot;
  readonly subscribe: (
    listener: (snapshot: ProgressSnapshot) => void,
  ) => () => void;
  /** Applies a player action to the latest mountain (helpers' work settled first) and saves it. */
  readonly applyMutation: (update: (mountain: Mountain) => Mountain) => void;
  /** Settles helpers' work up to now for display. Does not save; saves happen on actions, hide, and pagehide. */
  readonly tick: () => void;
  /** Closes the current relic reveal; the next one (if any) follows. */
  readonly dismissReveal: () => void;
  /** Closes the welcome-back card. */
  readonly dismissAway: () => void;
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
  let away: AwayReport | undefined;
  const reveals: Relic[] = [];
  /**
   * Stones mined when relics were last checked. Unset until a save is loaded,
   * so relics already in a loaded save are never celebrated again.
   */
  let revealBaseline: number | undefined;
  let welcomed = false;
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
      away,
      revealed: reveals[0],
    };
  };

  const noteReveals = (): void => {
    if (auth.getState().kind === "signed-in" && !hydrated) {
      return;
    }
    const mined = minedOut(mountain);
    if (revealBaseline !== undefined) {
      for (const relic of relicsUncovered({
        before: revealBaseline,
        after: mined,
      })) {
        reveals.push(relic);
        logger.record({
          level: "info",
          code: "relic.found",
          detail: relic.id,
          data: { mined },
        });
      }
    }
    revealBaseline = mined;
  };

  const emit = (): void => {
    noteReveals();
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

  /**
   * Pays helpers for time the save says we were gone. The first payout of an
   * open becomes the welcome-back card; later ones (another device's save
   * arriving) are paid silently. Returns stones mined.
   */
  const settleSince = (savedLastSeen: number | undefined): number => {
    const at = now();
    if (savedLastSeen === undefined) {
      lastSeen = at;
      return 0;
    }
    const result = accrueAway({ mountain, lastSeen: savedLastSeen, now: at });
    mountain = result.mountain;
    lastSeen = result.settledAt;
    if (result.mined === 0) {
      return 0;
    }
    if (!welcomed) {
      away = result.report;
    }
    logger.record({
      level: "info",
      code: "idle.away",
      detail: `${String(result.mined)} while away`,
      data: {
        mined: result.mined,
        awayMinutes: Math.round(result.report.awayMs / 60000),
      },
    });
    return result.mined;
  };

  const applyRemote = (remote: CloudLoadResult): void => {
    const localAhead = inFlightWrites > 0 || pendingCloudWrite !== undefined;
    if (localAhead && remote.kind === "found") {
      return;
    }
    const next = applySignedInSave({ local: mountain, remote });
    mountain = next.mountain;
    let paid = 0;
    if (remote.kind === "found") {
      revealBaseline ??= minedOut(mountain);
      paid = settleSince(remote.lastSeen);
    } else {
      lastSeen ??= now();
    }
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
        welcomed = true;
        if (next.upload || paid > 0) {
          persistCloudSoon();
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
    revealBaseline = minedOut(mountain);
    const paid = settleSince(stored.lastSeen);
    welcomed = true;
    saveKind = "session";
    logger.record({
      level: "info",
      code: "save.session",
      detail: "resume",
      data: saveCounts(mountain),
    });
    if (paid > 0) {
      persistSession();
    }
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
    revealBaseline = undefined;
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

  const canPlay = (): boolean =>
    !disposed && (auth.getState().kind !== "signed-in" || hydrated);

  /** Folds helpers' work since lastSeen into the mountain. Returns stones mined. */
  const settle = (): number => {
    const at = now();
    const result = accrue({ mountain, from: lastSeen ?? at, to: at });
    mountain = result.mountain;
    lastSeen = result.settledAt;
    return result.mined;
  };

  return {
    getSnapshot: snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    applyMutation: (update) => {
      if (!canPlay()) {
        return;
      }
      const mined = settle();
      const next = update(mountain);
      if (next === mountain) {
        if (mined > 0) {
          emit();
        }
        return;
      }
      mountain = next;
      persistCloudSoon();
      persistSession();
      emit();
    },
    dismissReveal: () => {
      if (reveals.length === 0) {
        return;
      }
      reveals.shift();
      emit();
    },
    dismissAway: () => {
      if (away === undefined) {
        return;
      }
      away = undefined;
      emit();
    },
    tick: () => {
      if (canPlay() && settle() > 0) {
        emit();
      }
    },
    flush: () => {
      if (disposed) {
        return;
      }
      if (canPlay()) {
        settle();
      }
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
