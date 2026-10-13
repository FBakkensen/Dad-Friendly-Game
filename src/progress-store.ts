import type { AuthController } from "./auth";
import { BOOSTS } from "./boosts";
import {
  applySignedInSave,
  createNoopCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { staffExisting } from "./crew";
import { grantFirstEngineer } from "./engineers";
import {
  parseHomecomingNews,
  settle as settleExpeditions,
  type Homecoming,
} from "./expeditions";

/** Undismissed return notices. Not a mountain field, so a reload can still show them. */
const HOMECOMING_NEWS_KEY = "dad-friendly-homecomings";
import {
  closeHazards,
  freshHazards,
  fix as fixHazard,
  kindForTier,
  pressTrouble as pressHazard,
  stepHazards,
  type HazardState,
  type Trouble,
  type TroubleTier,
} from "./hazards";
import {
  APP_VERSION,
  EVENT_RING_LIMIT,
  EventRing,
  FIELD_LOG_COPY_COUNT,
  FIELD_LOG_WRITE_GAP_MS,
  fieldLogFingerprint,
  shouldWriteFieldLog,
  snapshot as fieldSnapshot,
  type FieldEvent,
  type FieldLog,
  type FieldLogDocument,
  type FieldLogWriteReason,
} from "./field-log";
import { passTheMine } from "./legacy";
import { createLogger, formatLogEvent, type Logger } from "./log";
import {
  accrue,
  accrueAway,
  createMountain,
  minedOut,
  runStartedAt,
  type AwayReport,
  type Mountain,
} from "./mountain";
import { effectiveRates } from "./rates";
import { relicsUncovered, type Relic } from "./relics";
import { TIERS, owned } from "./tiers";
import { UPGRADES, upgradeLevel } from "./upgrades";
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
  /** Free helpers hired on load so an older save's machines run (#89), once. */
  readonly crewJoined: number | undefined;
  /** Set once when an older save's first borer brings their first engineer. */
  readonly engineerJoined: true | undefined;
  /**
   * Parties who came home this session and have not been read yet.
   * Not a save field: the expedition already remembered the find.
   */
  readonly homecomings: readonly Homecoming[];
  /** Trouble at one machine this session. Never saved, gone after a reload. */
  readonly trouble: Trouble | undefined;
};

export type ProgressStore = {
  readonly getSnapshot: () => ProgressSnapshot;
  readonly subscribe: (
    listener: (snapshot: ProgressSnapshot) => void,
  ) => () => void;
  /** Applies a player action to the latest mountain (helpers' work settled first) and saves it. */
  readonly applyMutation: (
    update: (mountain: Mountain) => Mountain,
    note?: "vein.tap",
  ) => void;
  /** Snapshot plus the newest events the menu copies. Not part of the mountain save. */
  readonly fieldLog: () => FieldLog;
  /** Settles helpers' work up to now for display. Does not save; saves happen on actions, hide, and pagehide. */
  readonly tick: () => void;
  /** Closes the current relic reveal; the next one (if any) follows. */
  readonly dismissReveal: () => void;
  /**
   * Throws this player's single save away and starts a fresh mountain, on the
   * device and (signed in) in the cloud right away.
   */
  readonly startOver: () => void;
  /** Passes the finished mine to your kid (M6); false if it isn't finished. */
  readonly passTheMine: () => boolean;
  /** Closes the welcome-back card. */
  readonly dismissAway: () => void;
  /** One tap on a troubled card. The fifth tap fixes it. */
  readonly pressTrouble: (tier: TroubleTier) => void;
  /** A short hold on a troubled card fixes it. */
  readonly fixTrouble: (tier: TroubleTier) => void;
  /**
   * Shows trouble immediately. The dev boot and the layout check use this,
   * because trouble is never part of a save.
   */
  readonly previewTrouble: (tier: TroubleTier) => void;
  readonly flush: () => void;
  readonly dispose: () => void;
};

/** Firestore sustains about one write per second per document. */
const CLOUD_WRITE_GAP_MS = 1000;
/** Shorter absences still pay out, quietly, without the welcome-back card. */
export const WELCOME_MIN_AWAY_MS = 60 * 1000;
/** Longer than this between ticks and the game was not on screen. */
const LIVE_GAP_MS = 10 * 1000;

export function createProgressStore({
  auth,
  cloudSave = createNoopCloudSave(),
  logger = createLogger({ limit: 20 }),
  sessionStorage: sessionArg,
  now = Date.now,
  cloudWriteGapMs = CLOUD_WRITE_GAP_MS,
  fieldLogWriteGapMs = FIELD_LOG_WRITE_GAP_MS,
  hazardSeed,
}: {
  auth: AuthController;
  cloudSave?: CloudSave;
  logger?: Logger;
  sessionStorage?: Storage;
  now?: () => number;
  cloudWriteGapMs?: number;
  fieldLogWriteGapMs?: number;
  /** Rolls the trouble schedule. Defaults to the clock, so each open differs. */
  hazardSeed?: number;
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
  let crewJoined: number | undefined;
  let engineerJoined: true | undefined;
  let homecomings: readonly Homecoming[] = [];
  /** Set when someone comes home, cleared when the screen is told. */
  let newsPending = false;
  let hazards: HazardState = freshHazards(hazardSeed ?? now());
  const activeTrouble = (): Trouble | undefined =>
    hazards.phase === "trouble" ? hazards.trouble : undefined;
  const troubleMark = (): string => {
    const trouble = activeTrouble();
    return trouble === undefined
      ? ""
      : `${trouble.tier}:${String(trouble.startedAt)}`;
  };
  /** Hires the one-time free staff for a loaded save; true if it changed. */
  const staffLoaded = (): boolean => {
    const result = staffExisting(mountain);
    if (result.mountain === mountain) {
      return false;
    }
    mountain = result.mountain;
    if (result.joined > 0) {
      crewJoined = (crewJoined ?? 0) + result.joined;
      logger.record({
        level: "info",
        code: "save.staffed",
        detail: `${String(result.joined)} workers joined`,
        data: saveCounts(mountain),
      });
    }
    return true;
  };
  /** The first borer's engineer, once, for a save that already owns one. */
  const grantEngineer = (): boolean => {
    const result = grantFirstEngineer(mountain);
    if (result.mountain === mountain) {
      return false;
    }
    mountain = result.mountain;
    engineerJoined = true;
    logger.record({
      level: "info",
      code: "save.engineer",
      detail: "first engineer",
      data: saveCounts(mountain),
    });
    return true;
  };
  let lastCloudWriteAt = Number.NEGATIVE_INFINITY;
  let pendingCloudWrite: ReturnType<typeof setTimeout> | undefined;
  let lastFieldLogAt: number | undefined;
  let lastFieldLogFingerprint: string | undefined;
  const listeners = new Set<(snapshot: ProgressSnapshot) => void>();
  const ring = new EventRing();
  const record = (
    code: string,
    data: Readonly<Record<string, string | number>>,
  ): void => {
    ring.push({ at: new Date(now()).toISOString(), code, data });
  };
  const noteChanges = (before: Mountain, after: Mountain): void => {
    for (const tier of TIERS) {
      const count = owned(after, tier);
      if (count > owned(before, tier)) {
        record("tier.buy", { id: tier.id, count });
      }
    }
    for (const upgrade of UPGRADES) {
      const count = upgradeLevel(after, upgrade.id);
      if (count > upgradeLevel(before, upgrade.id)) {
        record("upgrade.buy", { id: upgrade.id, count });
      }
    }
    for (const boost of BOOSTS) {
      const endsAt = after.boosts?.[boost.id];
      if (endsAt !== undefined && endsAt !== before.boosts?.[boost.id]) {
        record("boost.start", {
          id: boost.id,
          endsAt: new Date(endsAt).toISOString(),
        });
      }
    }
  };

  const snapshot = (): ProgressSnapshot => {
    const latest = logger.latest();
    return {
      mountain,
      saveKind,
      ready: auth.getState().kind !== "signed-in" || hydrated,
      log: latest === undefined ? undefined : formatLogEvent(latest),
      away,
      revealed: reveals[0],
      crewJoined,
      engineerJoined,
      homecomings,
      trouble: activeTrouble(),
    };
  };

  const rememberHomecomings = (): void => {
    if (sessionStore === undefined) {
      return;
    }
    try {
      if (homecomings.length === 0) {
        sessionStore.removeItem(HOMECOMING_NEWS_KEY);
        return;
      }
      sessionStore.setItem(HOMECOMING_NEWS_KEY, JSON.stringify(homecomings));
    } catch {
      return;
    }
  };

  const noteHomecomings = (arrived: readonly Homecoming[]): void => {
    const fresh = arrived.filter(
      (home) =>
        !homecomings.some(
          (have) =>
            have.engineer === home.engineer && have.sentAt === home.sentAt,
        ),
    );
    if (fresh.length === 0) {
      return;
    }
    homecomings = [...homecomings, ...fresh];
    newsPending = true;
    rememberHomecomings();
  };

  const recallHomecomings = (): void => {
    if (homecomings.length > 0 || sessionStore === undefined) {
      return;
    }
    let parsed: unknown;
    try {
      const raw = sessionStore.getItem(HOMECOMING_NEWS_KEY);
      parsed = raw === null ? undefined : JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed === undefined) {
      return;
    }
    const remembered = parseHomecomingNews(parsed);
    if (remembered.length === 0) {
      return;
    }
    homecomings = remembered;
    newsPending = true;
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
        record("relic.found", { id: relic.id });
      }
    }
    revealBaseline = mined;
  };

  const emit = (): void => {
    newsPending = false;
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
      record("save.error", { source: "session" });
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
            record("save.error", { source: "write" });
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

  const fieldSnapshotNow = (): FieldLog["snapshot"] => {
    const at = now();
    return fieldSnapshot(
      mountain,
      effectiveRates(mountain, at),
      at,
      APP_VERSION,
    );
  };

  const fieldLogDocument = (): FieldLogDocument => ({
    snapshot: fieldSnapshotNow(),
    events: ring.last(EVENT_RING_LIMIT),
    updatedAt: now(),
  });

  /**
   * Copies the ring for a signed-in dad. Interval writes wait out the gap;
   * hide and a new run write immediately. An unchanged log does not write.
   */
  const persistFieldLog = (reason: FieldLogWriteReason): void => {
    const state = auth.getState();
    if (state.kind !== "signed-in" || !hydrated || disposed) {
      return;
    }
    const log = fieldLogDocument();
    const fingerprint = fieldLogFingerprint(log);
    const changed =
      lastFieldLogFingerprint === undefined ||
      lastFieldLogFingerprint !== fingerprint;
    if (
      !shouldWriteFieldLog({
        changed,
        lastWrittenAt: lastFieldLogAt,
        now: now(),
        reason,
        gapMs: fieldLogWriteGapMs,
      })
    ) {
      return;
    }
    const generation = hydrateGeneration;
    lastFieldLogAt = now();
    lastFieldLogFingerprint = fingerprint;
    const uid = state.user.uid;
    void cloudSave.writeFieldLog({ uid, log }).then((result) => {
      if (disposed || generation !== hydrateGeneration) {
        return;
      }
      if (result.kind === "ok") {
        return;
      }
      lastFieldLogFingerprint = undefined;
      record("save.error", { source: "field-log" });
      logger.record({
        level: "error",
        code: "field-log.write",
        detail: result.message,
        data: {},
      });
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
    noteHomecomings(result.homecomings);
    lastSeen = result.settledAt;
    // Away is rest. Trouble ends, and the time away does not count toward the next one.
    hazards = closeHazards(hazards, mountain);
    if (result.mined === 0) {
      return 0;
    }
    // A reload or a quick app switch isn't "away": only greet after a real break.
    if (!welcomed && result.report.awayMs >= WELCOME_MIN_AWAY_MS) {
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
    record("away.report", { ms: result.report.awayMs, stones: result.mined });
    return result.mined;
  };

  const applyRemote = (remote: CloudLoadResult): void => {
    const localAhead = inFlightWrites > 0 || pendingCloudWrite !== undefined;
    if (localAhead && remote.kind === "found") {
      return;
    }
    if (
      hydrated &&
      remote.kind === "found" &&
      runStartedAt(remote.mountain) < runStartedAt(mountain)
    ) {
      // A snapshot from before "Start over" (or a stale device): keep the new run.
      logger.record({
        level: "info",
        code: "save.remote",
        detail: "older run ignored",
        data: saveCounts(remote.mountain),
      });
      persistCloudSoon();
      emit();
      return;
    }
    const next = applySignedInSave({ local: mountain, remote });
    mountain = next.mountain;
    const staffed = remote.kind === "found" && staffLoaded();
    const steppedUp = remote.kind === "found" && grantEngineer();
    let paid = 0;
    if (remote.kind === "found") {
      revealBaseline ??= minedOut(mountain);
      recallHomecomings();
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
        if (next.upload || paid > 0 || staffed || steppedUp) {
          persistCloudSoon();
        }
        break;
      case "unavailable":
      case "disabled":
        hydrated = false;
        saveKind = "error";
        record("save.error", { source: remote.kind });
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
    lastFieldLogAt = undefined;
    lastFieldLogFingerprint = undefined;
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
    const staffed = staffLoaded();
    const steppedUp = grantEngineer();
    revealBaseline = minedOut(mountain);
    recallHomecomings();
    const paid = settleSince(stored.lastSeen);
    welcomed = true;
    saveKind = "session";
    logger.record({
      level: "info",
      code: "save.session",
      detail: "resume",
      data: saveCounts(mountain),
    });
    if (paid > 0 || staffed || steppedUp) {
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
    lastFieldLogAt = undefined;
    lastFieldLogFingerprint = undefined;
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
    // The clock went back (time zone fix, manual change): restart from now
    // instead of waiting for it to catch up, paying nothing for the gap.
    if (lastSeen !== undefined && at < lastSeen) {
      lastSeen = at;
      // Same rule as lastSeen: a departure still in the future moves to now.
      const settled = settleExpeditions(mountain, at);
      mountain = settled.mountain;
      noteHomecomings(settled.homecomings);
      return 0;
    }
    // Ticks come every second while the game is on screen. A longer gap means
    // the app sat in the background: that is time away, paid like it.
    if (lastSeen !== undefined && at - lastSeen > LIVE_GAP_MS) {
      return settleSince(lastSeen);
    }
    // A live gap is at most ten seconds, so coming home at the end of it
    // pays that short stretch with the bonus. Away time splits exactly.
    const settled = settleExpeditions(mountain, at);
    mountain = settled.mountain;
    noteHomecomings(settled.homecomings);
    const from = lastSeen ?? at;
    const trouble = activeTrouble();
    const result = accrue({
      mountain,
      from,
      to: at,
      live: true,
      ...(trouble === undefined ? {} : { trouble }),
    });
    mountain = result.mountain;
    lastSeen = result.settledAt;
    hazards = stepHazards(hazards, {
      now: at,
      liveMs: Math.max(0, at - from),
      mountain,
    });
    return result.mined;
  };

  /** Starts a new run (Start over, or the mine passed down), saved at once. */
  const beginRun = (
    next: Mountain,
    detail: string,
    code: "run.start-over" | "run.pass",
  ): boolean => {
    if (disposed || !canPlay()) {
      return false;
    }
    cancelPendingCloudWrite();
    mountain = next;
    hazards = freshHazards(now());
    lastSeen = runStartedAt(next);
    away = undefined;
    homecomings = [];
    rememberHomecomings();
    reveals.length = 0;
    revealBaseline = 0;
    ring.clear();
    record(code, {});
    logger.record({
      level: "info",
      code: "save.reset",
      detail,
      data: saveCounts(mountain),
    });
    persistSession();
    persistCloud();
    persistFieldLog("reset");
    emit();
    return true;
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
    applyMutation: (update, note) => {
      if (!canPlay()) {
        return;
      }
      const beforeTrouble = troubleMark();
      const mined = settle();
      const before = mountain;
      const next = update(mountain);
      if (next === before) {
        if (mined > 0 || troubleMark() !== beforeTrouble || newsPending) {
          emit();
        }
        return;
      }
      mountain = next;
      noteChanges(before, next);
      if (note === "vein.tap") {
        record("vein.tap", { stones: next.pocket - before.pocket });
      }
      persistCloudSoon();
      persistFieldLog("interval");
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
    startOver: () => {
      beginRun(
        { ...createMountain(), startedAt: now() },
        "start over",
        "run.start-over",
      );
    },
    passTheMine: () => {
      const next = passTheMine(mountain, now());
      if (next === undefined) {
        return false;
      }
      return beginRun(next, "passed to the kid", "run.pass");
    },
    fieldLog: () => {
      const events: readonly FieldEvent[] = ring.last(FIELD_LOG_COPY_COUNT);
      return {
        snapshot: fieldSnapshotNow(),
        events,
      };
    },
    pressTrouble: (tier) => {
      if (!canPlay()) {
        return;
      }
      const before = troubleMark();
      settle();
      if (hazards.phase !== "trouble" || hazards.trouble.tier !== tier) {
        if (troubleMark() !== before) {
          emit();
        }
        return;
      }
      hazards = pressHazard(hazards, mountain);
      emit();
    },
    fixTrouble: (tier) => {
      if (!canPlay()) {
        return;
      }
      const before = troubleMark();
      settle();
      if (hazards.phase !== "trouble" || hazards.trouble.tier !== tier) {
        if (troubleMark() !== before) {
          emit();
        }
        return;
      }
      hazards = fixHazard(hazards, mountain);
      emit();
    },
    previewTrouble: (tier) => {
      if (!canPlay()) {
        return;
      }
      hazards = {
        phase: "trouble",
        seed: hazards.seed,
        taps: 0,
        trouble: { kind: kindForTier(tier), tier, startedAt: now() },
      };
      emit();
    },
    dismissAway: () => {
      if (
        away === undefined &&
        crewJoined === undefined &&
        engineerJoined === undefined &&
        homecomings.length === 0
      ) {
        return;
      }
      away = undefined;
      crewJoined = undefined;
      engineerJoined = undefined;
      homecomings = [];
      rememberHomecomings();
      emit();
    },
    tick: () => {
      if (!canPlay()) {
        return;
      }
      const before = mountain;
      const beforeTrouble = troubleMark();
      const mined = settle();
      if (
        mined > 0 ||
        mountain !== before ||
        troubleMark() !== beforeTrouble ||
        newsPending
      ) {
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
      persistFieldLog("hide");
      if (saveKind === "session") {
        persistSession();
      }
      if (newsPending) {
        emit();
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
