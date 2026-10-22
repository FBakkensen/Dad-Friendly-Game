import type { AuthController } from "./auth";
import { BOOSTS } from "./boosts";
import {
  applySignedInSave,
  createNoopCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { readDeviceId } from "./device-id";
import { mergeSaves, type MergedSave } from "./save-merge";
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
  engineerFixDelay,
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
  fieldErrorId,
  fieldLogFingerprint,
  shouldWriteFieldLog,
  snapshot as fieldSnapshot,
  type FieldEvent,
  type FieldLog,
  type FieldLogDocument,
  type FieldLogWriteReason,
} from "./field-log";
import { LAYERS, layersEntered, type Layer } from "./layers";
import { passTheMine } from "./legacy";
import { createLogger, formatLogEvent, type Logger } from "./log";
import {
  accrue,
  accrueAway,
  createMountain,
  digStones,
  minedOut,
  runStartedAt,
  type AwayReport,
  type Mountain,
} from "./mountain";
import { effectiveRates } from "./rates";
import { relicsUncovered, type Relic } from "./relics";
import { readPhoneBackup, saveEchoKey, writePhoneBackup } from "./phone-backup";
import type { TabWriter } from "./tab-writer";
import { compareSaveProgress, type SaveMoment } from "./save-progress";
import { craftFittedWords } from "./screen-words";
import { TIERS, owned } from "./tiers";
import { UPGRADES, upgradeLevel } from "./upgrades";
import {
  RECIPE_IDS,
  craftedLevel,
  grantRecipes,
  layerRecipeIds,
  recipeById,
  type RecipeId,
} from "./workshop";
import { fittedEffect } from "./workshop-sheet";
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
  /**
   * Bands broken into this session and not yet read. A loaded save that
   * already sits in a band does not announce it again. Not a save field.
   */
  readonly layersArrived: readonly Layer[];
  /**
   * Crafts fitted this session and not yet read. The line is the real
   * effect at the moment it finished. Not a save field.
   */
  readonly craftsFitted: readonly CraftNotice[];
  /** Trouble at one machine this session. Never saved, gone after a reload. */
  readonly trouble: Trouble | undefined;
  /** This tab holds the one writer seat on the device. */
  readonly playing: boolean;
  /** Another tab has the mountain. This one shows the waiting card. */
  readonly elsewhere: boolean;
};

type CloudResume =
  | { readonly kind: "idle" }
  | { readonly kind: "reading"; readonly done: Promise<void> };

/** One fitted craft, named once, with the number the crew feels. */
type CraftNotice = {
  readonly id: RecipeId;
  readonly level: number;
  readonly line: string;
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
  /** Settles helpers' work up to now for display. A signed-in phone backup follows a change; cloud writes stay on actions, hide, and pagehide. */
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
  /** Closes the welcome-back card, including any layer or craft folded into it. */
  readonly dismissAway: () => void;
  /** Closes the layer card. The next unread band, if any, follows. */
  readonly dismissLayer: () => void;
  /** Closes the craft-done notice. The next unread fitting, if any, follows. */
  readonly dismissCraft: () => void;
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
  /**
   * On becoming visible: read the server before another cloud write.
   * Idle means this tab can settle immediately. Reading means wait.
   */
  readonly resume: () => CloudResume;
  /** Take the writer seat from the other tab, after it has saved. */
  readonly playHere: () => Promise<void>;
  readonly dispose: () => void;
};

/** Firestore sustains about one write per second per document. */
const CLOUD_WRITE_GAP_MS = 1000;
/** First wait after a listener error, then double, capped. */
const LISTEN_BACKOFF_START_MS = 1_000;
const LISTEN_BACKOFF_MAX_MS = 30_000;
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
  tabWriter,
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
  /** One writer tab on this device. Absent in tests that are the only tab. */
  tabWriter?: TabWriter;
}): ProgressStore {
  const sessionStore = sessionArg ?? tryGetGuestStorage();
  const isWriter = (): boolean =>
    tabWriter === undefined || tabWriter.seat() === "writer";
  let mountain: Mountain = createMountain();
  let lastSeen: number | undefined;
  let hydrateGeneration = 0;
  let hydrated = false;
  /** A server snapshot has been seen. Cache and pending writes do not count. */
  let serverSeen = false;
  /** Fresh read in flight. Cloud writes wait. The phone backup does not. */
  let resumeHold = false;
  /** One cloud write at a time. A newer mountain waits, then goes next. */
  let cloudFlight = false;
  let cloudDirty = false;
  /** Highest rev this device will trust. Never adopt a lower one. */
  let rev = 0;
  /** Rev we believe the server has. The next write is this plus one. */
  let acked = 0;
  let consecutiveRevMerges = 0;
  const deviceId = readDeviceId(sessionStore);
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
  /**
   * Stones mined when layers were last checked. Same rule as relics: a
   * loaded save does not announce the band it already sits in.
   */
  let layerBaseline: number | undefined;
  /** Crafted levels already named, or waiting to be, this open. */
  let craftBaseline: Readonly<Partial<Record<RecipeId, number>>> | undefined;
  const layersArrived: Layer[] = [];
  const craftsFitted: CraftNotice[] = [];
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
  const listeners = new Set<(snapshot: ProgressSnapshot) => void>();
  const ring = new EventRing();
  const record = (
    code: string,
    data: Readonly<Record<string, string | number>>,
  ): void => {
    ring.push({ at: new Date(now()).toISOString(), code, data });
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
      record("crew.staff", { count: result.joined });
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
  let listenRetry: ReturnType<typeof setTimeout> | undefined;
  let listenBackoffMs = LISTEN_BACKOFF_START_MS;
  /** Echoes of writes we sent, newest last. Capped so a dead listener cannot grow it. */
  const pendingEchoes: string[] = [];
  let lastFieldLogAt: number | undefined;
  let lastFieldLogFingerprint: string | undefined;
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
    const nextBench = after.bench;
    const prevBench = before.bench;
    if (
      nextBench !== undefined &&
      (prevBench === undefined ||
        prevBench.recipe !== nextBench.recipe ||
        prevBench.startedAt !== nextBench.startedAt)
    ) {
      record("craft.start", { id: nextBench.recipe });
    }
  };

  /** The band and the crafted levels, before away pay moves them. */
  const primeArrivals = (): void => {
    layerBaseline = minedOut(mountain);
    craftBaseline = { ...(mountain.crafted ?? {}) };
  };

  const clearArrivals = (): void => {
    layersArrived.length = 0;
    craftsFitted.length = 0;
  };

  /**
   * Promotion, a new post, and expeditions leaving or coming back empty.
   * A return is recorded from the homecoming, which carries the find.
   */
  const noteCrew = (before: Mountain, after: Mountain): void => {
    const beforeCrew = before.engineers ?? [];
    const afterCrew = after.engineers ?? [];
    const beforeByName = new Map(
      beforeCrew.map((engineer) => [engineer.name, engineer]),
    );
    const beforeTrips = new Map(
      (before.expeditions ?? []).map((trip) => [trip.engineer, trip]),
    );
    const afterTrips = new Map(
      (after.expeditions ?? []).map((trip) => [trip.engineer, trip]),
    );
    if (after.helpers < before.helpers) {
      for (const engineer of afterCrew) {
        if (!beforeByName.has(engineer.name)) {
          record("engineer.promote", {
            id: engineer.name,
            count: afterCrew.length,
          });
        }
      }
    }
    for (const [name, trip] of afterTrips) {
      if (!beforeTrips.has(name)) {
        record("expedition.send", { id: name, source: trip.tunnel });
      }
    }
    for (const [name, trip] of beforeTrips) {
      if (afterTrips.has(name)) {
        continue;
      }
      record("expedition.recall", { id: name, source: trip.tunnel });
      const landed = afterCrew.find((engineer) => engineer.name === name);
      if (
        landed !== undefined &&
        landed.post !== trip.home &&
        landed.post !== "tunnel"
      ) {
        record("engineer.station", { id: name, source: landed.post });
      }
    }
    for (const engineer of afterCrew) {
      const previous = beforeByName.get(engineer.name);
      if (previous === undefined || previous.post === engineer.post) {
        continue;
      }
      if (beforeTrips.has(engineer.name) || afterTrips.has(engineer.name)) {
        continue;
      }
      record("engineer.station", {
        id: engineer.name,
        source: engineer.post,
      });
    }
  };

  /**
   * Trouble starting, or ending by hand or by the engineer on that tier.
   * Leaving the game clears trouble without a fix. Dropping the last borer
   * does too: there is nothing left to trouble.
   */
  const noteHazards = (
    before: HazardState,
    after: HazardState,
    fixBy: "hand" | "engineer" = "engineer",
  ): void => {
    if (
      before.phase === "waiting" &&
      after.phase === "waiting" &&
      after.seed !== before.seed &&
      engineerFixDelay(mountain, before.tier) === 0
    ) {
      record("trouble.start", { id: before.tier, source: before.kind });
      record("trouble.fix", { id: before.tier, source: "engineer" });
      return;
    }
    const was = before.phase === "trouble" ? before.trouble : undefined;
    const next = after.phase === "trouble" ? after.trouble : undefined;
    if (
      was !== undefined &&
      (next === undefined || next.startedAt !== was.startedAt) &&
      !(after.phase === "idle" && mountain.borers < 1)
    ) {
      record("trouble.fix", { id: was.tier, source: fixBy });
    }
    if (
      next !== undefined &&
      (was === undefined || was.startedAt !== next.startedAt)
    ) {
      record("trouble.start", { id: next.tier, source: next.kind });
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
      layersArrived: [...layersArrived],
      craftsFitted: [...craftsFitted],
      trouble: activeTrouble(),
      playing: isWriter() && (auth.getState().kind !== "signed-in" || hydrated),
      elsewhere: tabWriter !== undefined && tabWriter.seat() === "other",
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
    for (const arrival of fresh) {
      record("expedition.return", {
        id: arrival.engineer,
        source: findToken(arrival.find),
      });
      if (arrival.find.kind === "recipe") {
        record("recipe.found", {
          id: arrival.find.id,
          source: arrival.tunnel,
        });
      }
    }
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

  /** A band broken into since the baseline. Once per layer this open. */
  const noteLayers = (): void => {
    if (auth.getState().kind === "signed-in" && !hydrated) {
      return;
    }
    const mined = minedOut(mountain);
    let granted = false;
    for (const layer of LAYERS) {
      if (layer.from === 0 || mined < layer.from) {
        continue;
      }
      const next = grantRecipes(mountain, layerRecipeIds(layer.id));
      if (next.found.length === 0) {
        continue;
      }
      mountain = next.mountain;
      granted = true;
      for (const id of next.found) {
        record("recipe.found", { id, source: layer.id });
      }
    }
    if (layerBaseline !== undefined) {
      for (const layer of layersEntered(layerBaseline, mined)) {
        layersArrived.push(layer);
        record("layer.enter", { id: layer.id });
      }
    }
    layerBaseline = mined;
    if (!granted) {
      return;
    }
    persistSession();
    persistCloudSoon();
  };

  /** A craft whose level rose since the baseline. The line keeps the number. */
  const noteCrafts = (): void => {
    if (auth.getState().kind === "signed-in" && !hydrated) {
      return;
    }
    const noted = craftBaseline;
    if (noted !== undefined) {
      for (const id of RECIPE_IDS) {
        const next = craftedLevel(mountain, id);
        const prev = noted[id] ?? 0;
        if (next <= prev) {
          continue;
        }
        record("craft.done", { id, count: next });
        craftsFitted.push({
          id,
          level: next,
          line: craftFittedWords(
            recipeById(id).name,
            fittedEffect(mountain, id, now()),
          ),
        });
      }
    }
    craftBaseline = { ...(mountain.crafted ?? {}) };
  };

  const emit = (): void => {
    newsPending = false;
    noteReveals();
    noteLayers();
    noteCrafts();
    const next = snapshot();
    for (const listener of [...listeners]) {
      listener(next);
    }
  };

  const persistSession = (): void => {
    if (
      !isWriter() ||
      auth.getState().kind === "signed-in" ||
      sessionStore === undefined
    ) {
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

  /** Hide and a new run send as soon as the in-flight write returns. */
  let expediteNext = false;

  const dropEcho = (echoKey: string): void => {
    const echoIndex = pendingEchoes.indexOf(echoKey);
    if (echoIndex >= 0) {
      pendingEchoes.splice(echoIndex, 1);
    }
  };

  const noteConflict = (merged: MergedSave): void => {
    if (!merged.conflict) {
      return;
    }
    record("save.conflict", {
      source: "merge",
      stones: minedOut(merged.mountain),
    });
    logger.record({
      level: "info",
      code: "save.conflict",
      detail: "kept the fuller save",
      data: {
        rev: merged.rev,
        deviceId,
        mined: minedOut(merged.mountain),
        pocket: merged.mountain.pocket,
      },
    });
  };

  const finishFlight = (): void => {
    cloudFlight = false;
    if (!cloudDirty || !isWriter() || resumeHold || !serverSeen) {
      return;
    }
    persistCloudSoon(false, expediteNext);
  };

  /**
   * Taps are unbounded. One write is in flight, and the next waits out a
   * second. The newest mountain is what that next write sends. Hide and a
   * new run skip the wait once the in-flight write returns.
   */
  const persistCloudSoon = (retry = false, expedite = false): void => {
    const state = auth.getState();
    if (state.kind !== "signed-in" || !hydrated || disposed) {
      return;
    }
    if (!retry) {
      consecutiveRevMerges = 0;
    }
    cloudDirty = true;
    if (expedite) {
      expediteNext = true;
    }
    if (cloudFlight) {
      return;
    }
    if (pendingCloudWrite !== undefined) {
      cancelPendingCloudWrite();
    }
    const rush = expedite || expediteNext;
    const wait = rush ? 0 : lastCloudWriteAt + cloudWriteGapMs - now();
    if (wait <= 0) {
      persistCloud(retry);
      return;
    }
    pendingCloudWrite = setTimeout(() => {
      pendingCloudWrite = undefined;
      persistCloud(retry);
    }, wait);
  };

  const persistCloud = (retry = false): void => {
    cancelPendingCloudWrite();
    const state = auth.getState();
    if (state.kind !== "signed-in" || !hydrated || disposed || !isWriter()) {
      return;
    }
    if (resumeHold || !serverSeen) {
      cloudDirty = true;
      return;
    }
    const uid = state.user.uid;
    const generation = hydrateGeneration;
    const sentMountain = mountain;
    const sentSeen = lastSeen ?? now();
    const sentRev = acked + 1;
    const echoKey = saveEchoKey(sentMountain, sentSeen, sentRev, deviceId);
    pendingEchoes.push(echoKey);
    if (pendingEchoes.length > 8) {
      pendingEchoes.shift();
    }
    cloudDirty = false;
    expediteNext = false;
    cloudFlight = true;
    lastCloudWriteAt = now();
    const counts = saveCounts(sentMountain);
    void cloudSave
      .write({
        uid,
        mountain: sentMountain,
        lastSeen: sentSeen,
        rev: sentRev,
        deviceId,
      })
      .then((result) => {
        if (disposed || generation !== hydrateGeneration) {
          return;
        }
        switch (result.kind) {
          case "ok":
            acked = sentRev;
            rev = Math.max(rev, sentRev);
            consecutiveRevMerges = 0;
            saveKind = "account";
            logger.record({
              level: "info",
              code: "save.write",
              detail: "ok",
              data: { ...counts, rev: sentRev, deviceId },
            });
            persistPhoneBackup();
            finishFlight();
            break;
          case "rejected":
            dropEcho(echoKey);
            void reconcileRev(uid, generation, counts);
            return;
          case "failed":
            dropEcho(echoKey);
            saveKind = "error";
            record("save.error", {
              source: "write",
              id: fieldErrorId(result.message),
            });
            logger.record({
              level: "error",
              code: "save.write",
              detail: result.message,
              data: { ...counts, rev: sentRev, deviceId },
            });
            cloudFlight = false;
            if (!retry) {
              persistCloudSoon(true);
            }
            break;
          /* v8 ignore next 5 -- exhaustiveness guard, unreachable */
          default: {
            const _exhaustive: never = result;
            return _exhaustive;
          }
        }
        emit();
      });
  };

  /** A rev the rules refused. Read the server copy, merge, write one higher. */
  const reconcileRev = (
    uid: string,
    generation: number,
    counts: { mined: number; pocket: number },
  ): Promise<void> =>
    cloudSave.load({ uid, fresh: true }).then((loaded) => {
      if (disposed || generation !== hydrateGeneration) {
        return;
      }
      if (loaded.kind !== "found" || loaded.pending === true) {
        cloudFlight = false;
        saveKind = "error";
        record("save.error", { source: "write", id: "permission-denied" });
        logger.record({
          level: "error",
          code: "save.write",
          detail: "permission-denied",
          data: { ...counts, rev, deviceId },
        });
        emit();
        return;
      }
      serverSeen = true;
      const serverRev = loaded.rev ?? 0;
      if (serverRev >= rev) {
        const merged = mergeSaves(
          { mountain, lastSeen, rev },
          {
            mountain: loaded.mountain,
            lastSeen: loaded.lastSeen,
            rev: serverRev,
          },
        );
        mountain = merged.mountain;
        if (merged.lastSeen !== undefined) {
          lastSeen = merged.lastSeen;
        }
        rev = merged.rev;
        noteConflict(merged);
      }
      acked = serverRev;
      consecutiveRevMerges += 1;
      cloudDirty = true;
      persistPhoneBackup();
      cloudFlight = false;
      if (consecutiveRevMerges > 5) {
        saveKind = "error";
        record("save.error", { source: "write", id: "rev" });
        logger.record({
          level: "error",
          code: "save.write",
          detail: "rev",
          data: { ...counts, rev: serverRev, deviceId },
        });
        emit();
        return;
      }
      persistCloudSoon(true);
      emit();
    });

  const fieldSnapshotNow = (): FieldLog["snapshot"] => {
    const at = now();
    return fieldSnapshot(
      mountain,
      effectiveRates(mountain, at),
      at,
      APP_VERSION,
      {
        deviceId,
        rev,
      },
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
    if (state.kind !== "signed-in" || !hydrated || disposed || !isWriter()) {
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
      record("save.error", {
        source: "field-log",
        id: fieldErrorId(result.message),
      });
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
    if (resumeHold) {
      return 0;
    }
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

  const localMoment = (): SaveMoment => ({
    mountain,
    lastSeen,
  });

  const hasLocalProgress = (): boolean =>
    lastSeen !== undefined ||
    minedOut(mountain) > 0 ||
    runStartedAt(mountain) > 0 ||
    mountain.pocket > 0 ||
    mountain.helpers > 0 ||
    mountain.carts > 0 ||
    mountain.drills > 0 ||
    mountain.borers > 0 ||
    mountain.machines > 0 ||
    mountain.kids > 0 ||
    (mountain.legacy ?? 0) > 0;

  /** Full save on this phone. Skipped until the first reconcile, and never deletes the key. */
  const persistPhoneBackup = (): void => {
    const state = auth.getState();
    if (
      !isWriter() ||
      state.kind !== "signed-in" ||
      sessionStore === undefined ||
      !hydrated
    ) {
      return;
    }
    const result = writePhoneBackup({
      storage: sessionStore,
      uid: state.user.uid,
      mountain,
      lastSeen: lastSeen ?? now(),
      rev,
      deviceId,
    });
    if (result !== "failed") {
      return;
    }
    record("save.error", { source: "phone" });
    logger.record({
      level: "error",
      code: "save.phone",
      detail: "failed",
      data: saveCounts(mountain),
    });
  };

  /**
   * The cloud is behind the phone. Skip when a write is already queued:
   * rescheduling it would postpone the burst the throttle test is holding.
   */
  const healCloud = (): void => {
    if (pendingCloudWrite !== undefined || cloudFlight) {
      return;
    }
    persistCloudSoon();
  };

  const takeEcho = (remote: {
    mountain: Mountain;
    lastSeen?: number | undefined;
    rev?: number;
    deviceId?: string;
  }): boolean => {
    const key = saveEchoKey(
      remote.mountain,
      remote.lastSeen ?? 0,
      remote.rev ?? 0,
      remote.deviceId ?? "",
    );
    const index = pendingEchoes.lastIndexOf(key);
    if (index < 0) {
      return false;
    }
    pendingEchoes.splice(index, 1);
    return true;
  };

  /** First open, or a cloud copy that is strictly ahead. Settles once from `paidLastSeen`. */
  const openFresh = (
    paidLastSeen: number | undefined,
    upload: boolean,
    detail: string,
  ): void => {
    const writing = isWriter();
    const staffed = writing ? staffLoaded() : false;
    const steppedUp = writing ? grantEngineer() : false;
    revealBaseline ??= minedOut(mountain);
    if (layerBaseline === undefined) {
      primeArrivals();
    }
    recallHomecomings();
    const paid = writing ? settleSince(paidLastSeen) : 0;
    hydrated = true;
    saveKind = "account";
    welcomed = true;
    logger.record({
      level: "info",
      code: "save.remote",
      detail,
      data: saveCounts(mountain),
    });
    if (serverSeen && (upload || paid > 0 || staffed || steppedUp)) {
      persistCloudSoon();
    }
    if (!serverSeen) {
      void freshServerRead();
    }
    persistPhoneBackup();
    emit();
  };

  const cancelListenRetry = (): void => {
    if (listenRetry === undefined) {
      return;
    }
    clearTimeout(listenRetry);
    listenRetry = undefined;
  };

  const attachWatch = (): void => {
    const state = auth.getState();
    if (disposed || state.kind !== "signed-in") {
      return;
    }
    unwatch?.();
    const generation = hydrateGeneration;
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

  const scheduleListenRetry = (): void => {
    if (disposed || listenRetry !== undefined) {
      return;
    }
    if (auth.getState().kind !== "signed-in") {
      return;
    }
    const delay = listenBackoffMs;
    listenBackoffMs = Math.min(delay * 2, LISTEN_BACKOFF_MAX_MS);
    listenRetry = setTimeout(() => {
      listenRetry = undefined;
      if (disposed || auth.getState().kind !== "signed-in") {
        return;
      }
      logger.record({
        level: "info",
        code: "save.watch",
        detail: "retry",
        data: saveCounts(mountain),
      });
      attachWatch();
    }, delay);
  };

  const noteRemoteFailure = (kind: "unavailable" | "disabled"): void => {
    if (kind === "unavailable" && !hydrated && hasLocalProgress()) {
      const staffed = staffLoaded();
      const steppedUp = grantEngineer();
      revealBaseline ??= minedOut(mountain);
      if (layerBaseline === undefined) {
        primeArrivals();
      }
      recallHomecomings();
      const paid = settleSince(lastSeen);
      hydrated = true;
      welcomed = true;
      if (paid > 0 || staffed || steppedUp) {
        persistPhoneBackup();
      }
    }
    if (hydrated) {
      persistPhoneBackup();
    }
    saveKind = "error";
    record("save.error", { source: kind });
    logger.record({
      level: "error",
      code: "save.remote",
      detail: kind,
      data: saveCounts(mountain),
    });
    if (kind === "unavailable") {
      scheduleListenRetry();
    }
    emit();
  };

  const applyRemote = (remote: CloudLoadResult): void => {
    if (remote.kind === "unavailable" || remote.kind === "disabled") {
      noteRemoteFailure(remote.kind);
      return;
    }
    if (resumeHold) {
      return;
    }
    if (remote.kind === "found" && remote.pending === true) {
      if (takeEcho(remote)) {
        return;
      }
      if (!hydrated) {
        openFresh(lastSeen, false, "pending");
      }
      return;
    }
    if (remote.cached === true) {
      if (!hydrated) {
        openFresh(lastSeen, false, "cache");
      }
      return;
    }
    let sawServer = false;
    if (!serverSeen) {
      serverSeen = true;
      sawServer = true;
    }
    const releaseHeld = (): void => {
      if (
        sawServer &&
        cloudDirty &&
        !cloudFlight &&
        pendingCloudWrite === undefined &&
        !resumeHold &&
        isWriter()
      ) {
        persistCloudSoon();
      }
    };
    try {
      applyAuthoritative(remote);
    } finally {
      releaseHeld();
    }
  };

  const applyAuthoritative = (remote: CloudLoadResult): void => {
    /* v8 ignore next 3 -- applyRemote already handled these */
    if (remote.kind === "unavailable" || remote.kind === "disabled") {
      return;
    }
    listenBackoffMs = LISTEN_BACKOFF_START_MS;
    if (remote.kind === "found" && takeEcho(remote)) {
      if (
        compareSaveProgress(localMoment(), {
          mountain: remote.mountain,
          lastSeen: remote.lastSeen,
        }) > 0
      ) {
        healCloud();
      }
      return;
    }
    if (remote.kind === "found" && (remote.rev ?? 0) < rev) {
      logger.record({
        level: "info",
        code: "save.remote",
        detail: "stale rev",
        data: {
          ...saveCounts(remote.mountain),
          rev: remote.rev ?? 0,
          deviceId,
        },
      });
      if (!hydrated) {
        openFresh(lastSeen, true, "stale rev");
      } else {
        healCloud();
        emit();
      }
      return;
    }
    if (remote.kind === "found" && (remote.rev ?? 0) > rev) {
      const serverRev = remote.rev ?? 0;
      if (!hasLocalProgress()) {
        mountain = remote.mountain;
        rev = serverRev;
        acked = serverRev;
        openFresh(remote.lastSeen, false, "found");
        return;
      }
      const merged = mergeSaves(
        { mountain, lastSeen, rev },
        {
          mountain: remote.mountain,
          lastSeen: remote.lastSeen,
          rev: serverRev,
        },
      );
      mountain = merged.mountain;
      if (merged.lastSeen !== undefined) {
        lastSeen = merged.lastSeen;
      }
      rev = merged.rev;
      acked = serverRev;
      noteConflict(merged);
      openFresh(
        merged.lastSeen,
        merged.differsFromRemote,
        merged.conflict ? "conflict" : "found",
      );
      return;
    }
    if (remote.kind === "found") {
      acked = Math.max(acked, remote.rev ?? 0);
      rev = Math.max(rev, remote.rev ?? 0);
    }
    const next = applySignedInSave({
      local: mountain,
      ...(lastSeen === undefined ? {} : { localLastSeen: lastSeen }),
      remote,
    });
    if (remote.kind === "found" && next.mountain !== mountain) {
      mountain = remote.mountain;
      openFresh(remote.lastSeen, false, "found");
      return;
    }
    // A blank phone is not a copy. A cloud document that ties it on the
    // progress stamp (same run, no stones mined, same clock) is still the save.
    if (!hydrated && remote.kind === "found" && !hasLocalProgress()) {
      mountain = remote.mountain;
      openFresh(remote.lastSeen, false, "found");
      return;
    }
    if (!hydrated) {
      openFresh(lastSeen, next.upload, remote.kind);
      return;
    }
    if (next.upload) {
      logger.record({
        level: "info",
        code: "save.remote",
        detail:
          remote.kind === "found" &&
          runStartedAt(remote.mountain) < runStartedAt(mountain)
            ? "older run ignored"
            : "behind",
        data: saveCounts(remote.kind === "found" ? remote.mountain : mountain),
      });
      healCloud();
      persistPhoneBackup();
      emit();
    }
  };

  const stopWatch = (): void => {
    cancelPendingCloudWrite();
    cancelListenRetry();
    cloudFlight = false;
    cloudDirty = false;
    expediteNext = false;
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
    if (!isWriter()) {
      mountain = stored.mountain;
      lastSeen = stored.lastSeen;
      revealBaseline = minedOut(mountain);
      saveKind = "session";
      emit();
      return;
    }
    mountain = stored.mountain;
    const staffed = staffLoaded();
    const steppedUp = grantEngineer();
    revealBaseline = minedOut(mountain);
    primeArrivals();
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

  /**
   * The guest scratch and the phone backup are both local. Keep the one
   * that is ahead, copy it onto the phone, then drop the guest key.
   * An unreadable backup is left untouched.
   */
  const prepareLocal = (uid: string): void => {
    if (sessionStore === undefined) {
      return;
    }
    const session = readSessionSave({ storage: sessionStore });
    if (
      session !== undefined &&
      compareSaveProgress(session, localMoment()) > 0
    ) {
      mountain = session.mountain;
      lastSeen = session.lastSeen;
    }
    const backup = readPhoneBackup({ storage: sessionStore, uid });
    if (
      backup.kind === "present" &&
      compareSaveProgress(backup.save, localMoment()) > 0
    ) {
      mountain = backup.save.mountain;
      lastSeen = backup.save.lastSeen;
    }
    const seenRev = Math.max(
      session?.rev ?? 0,
      backup.kind === "present" ? (backup.save.rev ?? 0) : 0,
    );
    if (seenRev > rev) {
      rev = seenRev;
      acked = seenRev;
    }
    if (backup.kind === "unreadable") {
      return;
    }
    if (!hasLocalProgress()) {
      clearSessionSave({ storage: sessionStore });
      return;
    }
    const wrote = writePhoneBackup({
      storage: sessionStore,
      uid,
      mountain,
      lastSeen: lastSeen ?? now(),
      rev,
      deviceId,
    });
    if (wrote !== "failed") {
      clearSessionSave({ storage: sessionStore });
    }
  };

  const startCloudWatch = (): void => {
    const state = auth.getState();
    if (state.kind !== "signed-in") {
      resumeFromSession();
      return;
    }
    rev = 0;
    acked = 0;
    consecutiveRevMerges = 0;
    prepareLocal(state.user.uid);
    cancelListenRetry();
    listenBackoffMs = LISTEN_BACKOFF_START_MS;
    hydrateGeneration += 1;
    hydrated = false;
    lastFieldLogAt = undefined;
    lastFieldLogFingerprint = undefined;
    revealBaseline = undefined;
    layerBaseline = undefined;
    craftBaseline = undefined;
    clearArrivals();
    saveKind = "loading";
    unwatch?.();
    unwatch = undefined;
    logger.record({
      level: "info",
      code: "save.watch",
      detail: "start",
      data: saveCounts(mountain),
    });
    emit();
    attachWatch();
  };

  const pullPhoneIfAhead = (uid: string): void => {
    if (sessionStore === undefined) {
      return;
    }
    const backup = readPhoneBackup({ storage: sessionStore, uid });
    if (
      backup.kind === "present" &&
      compareSaveProgress(backup.save, localMoment()) > 0
    ) {
      mountain = backup.save.mountain;
      lastSeen = backup.save.lastSeen;
      const seen = backup.save.rev ?? 0;
      if (seen > rev) {
        rev = seen;
        acked = seen;
      }
    }
  };

  /**
   * Read the server before the next cloud write. Taps during the read stay
   * on the phone and are dug back on if the merge would drop them.
   */
  let freshFlight: Promise<void> | undefined;
  const freshServerRead = (): Promise<void> => {
    if (freshFlight !== undefined) {
      return freshFlight;
    }
    freshFlight = readServer().finally(() => {
      freshFlight = undefined;
    });
    return freshFlight;
  };

  const readServer = (): Promise<void> => {
    if (!isWriter() || disposed) {
      return Promise.resolve();
    }
    const state = auth.getState();
    /* v8 ignore next 3 -- resume and openFresh only call this once hydrated */
    if (state.kind !== "signed-in" || !hydrated) {
      return Promise.resolve();
    }
    const generation = hydrateGeneration;
    const minedAtHold = minedOut(mountain);
    resumeHold = true;
    cancelPendingCloudWrite();
    persistPhoneBackup();
    const uid = state.user.uid;
    return cloudSave
      .load({ uid, fresh: true })
      .then((loaded) => {
        if (disposed || generation !== hydrateGeneration || !isWriter()) {
          resumeHold = false;
          return;
        }
        const tapped = minedOut(mountain) - minedAtHold;
        if (loaded.kind === "found" && loaded.pending !== true) {
          serverSeen = true;
          const serverRev = loaded.rev ?? 0;
          const merged = mergeSaves(
            { mountain, lastSeen, rev },
            {
              mountain: loaded.mountain,
              lastSeen: loaded.lastSeen,
              rev: serverRev,
            },
          );
          let next = merged.mountain;
          if (tapped > 0 && minedOut(next) === minedOut(loaded.mountain)) {
            next = digStones(next, tapped);
          }
          const keptTap = next !== merged.mountain;
          mountain = next;
          if (merged.lastSeen !== undefined) {
            lastSeen = merged.lastSeen;
          }
          rev = Math.max(rev, merged.rev, serverRev);
          acked = serverRev;
          noteConflict(merged);
          if (merged.differsFromRemote || keptTap) {
            cloudDirty = true;
          }
          record("save.resume", { rev: serverRev, stones: minedOut(mountain) });
          logger.record({
            level: "info",
            code: "save.resume",
            detail: merged.conflict ? "conflict" : "fresh",
            data: { ...saveCounts(mountain), rev: serverRev, deviceId },
          });
          persistPhoneBackup();
          emit();
        } else if (loaded.kind === "missing") {
          serverSeen = true;
          cloudDirty = true;
          record("save.resume", { rev, stones: minedOut(mountain) });
          logger.record({
            level: "info",
            code: "save.resume",
            detail: "missing",
            data: { ...saveCounts(mountain), rev, deviceId },
          });
        } else {
          serverSeen = false;
          record("save.resume", { rev, stones: minedOut(mountain) });
          logger.record({
            level: "error",
            code: "save.resume",
            detail: loaded.kind,
            data: { ...saveCounts(mountain), rev, deviceId },
          });
        }
        resumeHold = false;
        if (serverSeen && cloudDirty && isWriter()) {
          persistCloudSoon(false, true);
        }
      })
      .catch(() => {
        serverSeen = false;
        resumeHold = false;
      });
  };

  const onBecameWriter = (): Promise<void> => {
    /* v8 ignore next 3 -- seat changes only call this once this tab is the writer */
    if (disposed || !isWriter()) {
      return Promise.resolve();
    }
    cloudDirty = false;
    const state = auth.getState();
    if (state.kind !== "signed-in") {
      resumeFromSession();
      return Promise.resolve();
    }
    pullPhoneIfAhead(state.user.uid);
    if (!hydrated) {
      emit();
      return Promise.resolve();
    }
    return freshServerRead();
  };

  let writerAnnounced =
    tabWriter === undefined || tabWriter.seat() === "writer";
  tabWriter?.onYield(() => {
    if (disposed || !isWriter()) {
      return;
    }
    if (canPlay()) {
      settle();
    }
    persistPhoneBackup();
    persistSession();
    if (serverSeen && hydrated) {
      persistCloudSoon(false, true);
    }
  });
  const unwatchSeat = tabWriter?.subscribe((next) => {
    if (next === "other") {
      writerAnnounced = false;
      cancelPendingCloudWrite();
      cloudDirty = false;
      emit();
      return;
    }
    if (next !== "writer" || writerAnnounced) {
      return;
    }
    writerAnnounced = true;
    void onBecameWriter();
  });

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
    !disposed &&
    isWriter() &&
    (auth.getState().kind !== "signed-in" || hydrated);

  /** Folds helpers' work since lastSeen into the mountain. Returns stones mined. */
  const settle = (): number => {
    if (resumeHold) {
      return 0;
    }
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
    const beforeHazards = hazards;
    hazards = stepHazards(hazards, {
      now: at,
      liveMs: Math.max(0, at - from),
      mountain,
    });
    noteHazards(beforeHazards, hazards);
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
    clearArrivals();
    primeArrivals();
    ring.clear();
    record(code, {});
    logger.record({
      level: "info",
      code: "save.reset",
      detail,
      data: saveCounts(mountain),
    });
    persistPhoneBackup();
    persistSession();
    persistCloudSoon(false, true);
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
          persistPhoneBackup();
          emit();
        }
        return;
      }
      mountain = next;
      noteChanges(before, next);
      noteCrew(before, next);
      if (note === "vein.tap") {
        record("vein.tap", { stones: next.pocket - before.pocket });
      }
      persistCloudSoon();
      persistFieldLog("interval");
      persistSession();
      persistPhoneBackup();
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
      const beforeHazards = hazards;
      hazards = pressHazard(hazards, mountain);
      noteHazards(beforeHazards, hazards, "hand");
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
      const beforeHazards = hazards;
      hazards = fixHazard(hazards, mountain);
      noteHazards(beforeHazards, hazards, "hand");
      emit();
    },
    previewTrouble: (tier) => {
      if (!canPlay()) {
        return;
      }
      const before = activeTrouble();
      const trouble = { kind: kindForTier(tier), tier, startedAt: now() };
      hazards = {
        phase: "trouble",
        seed: hazards.seed,
        taps: 0,
        trouble,
      };
      if (before === undefined || before.startedAt !== trouble.startedAt) {
        record("trouble.start", { id: trouble.tier, source: trouble.kind });
      }
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
      clearArrivals();
      rememberHomecomings();
      emit();
    },
    dismissLayer: () => {
      if (layersArrived.length === 0) {
        return;
      }
      layersArrived.shift();
      emit();
    },
    dismissCraft: () => {
      if (craftsFitted.length === 0) {
        return;
      }
      craftsFitted.shift();
      emit();
    },
    tick: () => {
      if (!canPlay()) {
        return;
      }
      const before = mountain;
      const seen = lastSeen;
      const beforeTrouble = troubleMark();
      const mined = settle();
      if (mountain !== before || lastSeen !== seen) {
        persistPhoneBackup();
      }
      if (
        mined > 0 ||
        mountain !== before ||
        troubleMark() !== beforeTrouble ||
        newsPending
      ) {
        emit();
      }
    },
    resume: () => {
      tabWriter?.confirm();
      if (!isWriter() || auth.getState().kind !== "signed-in" || !hydrated) {
        return { kind: "idle" };
      }
      return { kind: "reading", done: freshServerRead() };
    },
    playHere: () => tabWriter?.playHere() ?? Promise.resolve(),
    flush: () => {
      if (disposed) {
        return;
      }
      if (canPlay()) {
        settle();
      }
      persistPhoneBackup();
      persistCloudSoon(false, true);
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
      unwatchSeat?.();
      tabWriter?.dispose();
      cancelPendingCloudWrite();
      cancelListenRetry();
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

/** The find the ring stores. A quiet tunnel has no shelf id. */
function findToken(find: Homecoming["find"]): string {
  switch (find.kind) {
    case "glimmer":
      return find.relic;
    case "tool":
    case "keepsake":
      return find.id;
    case "engineer":
      return find.name;
    case "recipe":
      return find.id;
    case "quiet":
      return "quiet";
  }
}
