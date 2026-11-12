/**
 * The progress store's shared state: the session in play and the sync
 * service's write state, with the ports they run through. The store's
 * modules (`cloud-writer`, `save-adopt`, `server-read`, `save-load`,
 * `save-choice`) are functions over one `StoreContext`.
 */
import type { AuthController } from "./auth";
import type { CloudSave } from "./cloud-save";
import { readDeviceLabel } from "./device-label";
import type { RingScope } from "./field-ring";
import { EventRing, type FieldEvent } from "./field-log";
import type { LogEvent, Logger } from "./log";
import type { Homecoming } from "./expeditions";
import type { Trouble } from "./hazards";
import type { Mountain } from "./mountain";
import {
  saveCounts,
  type AwayGap,
  type Notice,
  type FieldData,
  type Session,
} from "./session";
import type { TabWriter } from "./tab-writer";

type SaveKind = "unsigned" | "session" | "loading" | "account" | "error";

export type ProgressSnapshot = {
  readonly mountain: Mountain;
  readonly saveKind: SaveKind;
  readonly ready: boolean;
  readonly log: string | undefined;
  /**
   * News this open has not shown yet, in arrival order. Not a save field.
   * Read it with `firstNotice` and `noticesOf`.
   */
  readonly notices: readonly Notice[];
  /**
   * The last time away this open settled, and when (#468). A gap of an hour
   * or more makes the next golden vein a quick one. Not a save field.
   */
  readonly awayGap: AwayGap | undefined;
  /**
   * Parties who came home this session and have not been read yet.
   * Not a save field: the expedition already remembered the find.
   */
  readonly homecomings: readonly Homecoming[];
  /** Trouble at one machine this session. Never saved, gone after a reload. */
  readonly trouble: Trouble | undefined;
  /** This tab holds the one writer seat on the device. */
  readonly playing: boolean;
  /** Another tab has the mountain. This one shows the waiting card. */
  readonly elsewhere: boolean;
  /** Two real copies. Play waits until the player picks one. */
  readonly saveConflict?: SaveConflictView;
};

export type SaveSide = {
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
  readonly rev: number;
  readonly deviceId: string;
  readonly deviceLabel: string;
};

export type SaveConflictView = {
  readonly local: SaveSide;
  readonly remote: SaveSide;
  /** Storing the other copy failed: the sheet says to try again. */
  readonly error?: "archive-failed";
};

type Timer = ReturnType<typeof setTimeout>;

/**
 * The cloud write pipeline. One write is in flight at a time; a newer
 * mountain waits (`next: "waiting"`) and goes when it returns. A queued write
 * waits out the gap between writes. `expedite` sends the next write as soon
 * as nothing is in flight (hide, a new run, a fresh read's result).
 */
type CloudWrite =
  | { readonly kind: "clean"; readonly expedite: boolean }
  | { readonly kind: "dirty"; readonly expedite: boolean }
  | {
      readonly kind: "queued";
      readonly expedite: boolean;
      readonly timer: Timer;
    }
  | {
      readonly kind: "flying";
      readonly next: "none" | "waiting";
      readonly expedite: boolean;
    };

/**
 * What this device knows of the server. Cache and pending writes do not
 * count as seeing it. While a fresh read is in flight (`holding`), cloud
 * writes and the crew's pay wait; the phone backup does not.
 */
type ServerRead =
  | { readonly kind: "unseen" }
  | { readonly kind: "seen" }
  | { readonly kind: "holding"; readonly wasSeen: boolean };

export type StorePorts = {
  readonly auth: AuthController;
  readonly cloudSave: CloudSave;
  readonly logger: Logger;
  readonly storage: Storage | undefined;
  readonly now: () => number;
  /** One writer tab on this device. Absent in tests that are the only tab. */
  readonly tabWriter: TabWriter | undefined;
  readonly cloudWriteGapMs: number;
  readonly fieldLogWriteGapMs: number;
  readonly resumeReadTimeoutMs: number;
  /** How long a move waits for the mountain it leaves to reach Saved copies (#480). */
  readonly archiveWaitMs: number;
  readonly deviceId: string;
};

/** Calls that point back up the module stack, wired by `createProgressStore`. */
type StoreHooks = {
  readonly emit: () => void;
  /** A rev the rules refused: read the server copy, merge, write one higher. */
  readonly reconcile: (
    uid: string,
    generation: number,
    counts: { mined: number; pocket: number },
  ) => Promise<void>;
};

/** The listen and fresh-read retries: one timer each, and a doubling wait. */
export type Retry = {
  timer: Timer | undefined;
  backoffMs: number;
};

export type StoreContext = {
  readonly ports: StorePorts;
  hooks: StoreHooks;
  session: Session;
  saveKind: SaveKind;
  /** The first reconcile with the cloud is done (always true signed out). */
  hydrated: boolean;
  /** Bumped when the account or the watch changes; late answers from before are dropped. */
  hydrateGeneration: number;
  disposed: boolean;
  /** Highest rev this device will trust. Never adopt a lower one. */
  rev: number;
  /** Rev we believe the server has. The next write is this plus one. */
  syncedRev: number;
  /** Unconfirmed changes, including ones reloaded from the phone backup. */
  phoneDirty: boolean;
  consecutiveRevMerges: number;
  saveConflict: SaveConflictView | undefined;
  write: CloudWrite;
  lastCloudWriteAt: number;
  /** Echoes of writes we sent, newest last. Capped so a dead listener cannot grow it. */
  readonly echoes: string[];
  read: ServerRead;
  resumeTimer: Timer | undefined;
  readonly resumeRetry: Retry;
  freshFlight: Promise<void> | undefined;
  unwatch: (() => void) | undefined;
  readonly listenRetry: Retry;
  /** The account whose cloud document this page watches, if any. */
  watchedUid: string | undefined;
  /** This tab has acted on holding the writer seat. */
  writerAnnounced: boolean;
  fieldLogAt: number | undefined;
  fieldLogFingerprint: string | undefined;
  readonly ring: EventRing;
  /** A Start over or a pass is keeping the left mountain in Saved copies (#480). */
  keepingLeft: boolean;
  /** Whose kept events the ring holds (#479); undefined until the account is known. */
  ringScope: RingScope | undefined;
  /** The ring as last kept on this device: its push count, when, and whether that write failed. */
  ringKept: {
    readonly pushes: number;
    readonly at: number | undefined;
    readonly failed: boolean;
  };
  /** Since when play has been held back while the save loads, and whether that is logged (#479). */
  loadingSince: { readonly at: number; readonly logged: boolean } | undefined;
  readonly listeners: Set<(snapshot: ProgressSnapshot) => void>;
};

/** First wait after a listener error, then double, capped. */
export const LISTEN_BACKOFF_START_MS = 1_000;
const LISTEN_BACKOFF_MAX_MS = 30_000;

export function createStoreContext(
  ports: StorePorts,
  session: Session,
): StoreContext {
  const unwired = (): never => {
    /* v8 ignore next -- createProgressStore wires the hooks before any use */
    throw new Error("store hooks are not wired");
  };
  return {
    ports,
    hooks: { emit: unwired, reconcile: unwired },
    session,
    saveKind: "unsigned",
    hydrated: false,
    hydrateGeneration: 0,
    disposed: false,
    rev: 0,
    syncedRev: 0,
    phoneDirty: false,
    consecutiveRevMerges: 0,
    saveConflict: undefined,
    write: { kind: "clean", expedite: false },
    lastCloudWriteAt: Number.NEGATIVE_INFINITY,
    echoes: [],
    read: { kind: "unseen" },
    resumeTimer: undefined,
    resumeRetry: { timer: undefined, backoffMs: LISTEN_BACKOFF_START_MS },
    freshFlight: undefined,
    unwatch: undefined,
    listenRetry: { timer: undefined, backoffMs: LISTEN_BACKOFF_START_MS },
    watchedUid: undefined,
    writerAnnounced:
      ports.tabWriter === undefined || ports.tabWriter.seat() === "writer",
    fieldLogAt: undefined,
    fieldLogFingerprint: undefined,
    ring: new EventRing(),
    keepingLeft: false,
    ringScope: undefined,
    ringKept: { pushes: 0, at: undefined, failed: false },
    loadingSince: undefined,
    listeners: new Set(),
  };
}

export function isWriter(ctx: StoreContext): boolean {
  const writer = ctx.ports.tabWriter;
  return writer === undefined || writer.seat() === "writer";
}

export function signedIn(ctx: StoreContext): boolean {
  return ctx.ports.auth.getState().kind === "signed-in";
}

/** The signed-in uid, or undefined signed out. */
export function uidOf(ctx: StoreContext): string | undefined {
  const state = ctx.ports.auth.getState();
  return state.kind === "signed-in" ? state.user.uid : undefined;
}

/** Signed out plays at once; signed in waits for the first reconcile. */
export function ready(ctx: StoreContext): boolean {
  return !signedIn(ctx) || ctx.hydrated;
}

/** Why play is held back now, or undefined while it runs. */
export type PlayBlock = "closed" | "conflict" | "other-tab" | "loading";

export function playBlock(ctx: StoreContext): PlayBlock | undefined {
  if (ctx.disposed) {
    return "closed";
  }
  if (ctx.saveConflict !== undefined) {
    return "conflict";
  }
  if (!isWriter(ctx)) {
    return "other-tab";
  }
  return ready(ctx) ? undefined : "loading";
}

export function canPlay(ctx: StoreContext): boolean {
  return playBlock(ctx) === undefined;
}

/** The server has answered (a hold keeps what was known before it). */
export function serverSeen(ctx: StoreContext): boolean {
  const read = ctx.read;
  return read.kind === "seen" || (read.kind === "holding" && read.wasSeen);
}

export function holding(ctx: StoreContext): boolean {
  return ctx.read.kind === "holding";
}

export function record(ctx: StoreContext, code: string, data: FieldData): void {
  ctx.ring.push({
    at: new Date(ctx.ports.now()).toISOString(),
    code,
    data,
  } satisfies FieldEvent);
}

export function log(ctx: StoreContext, event: LogEvent): void {
  ctx.ports.logger.record(event);
}

/** An info line with the mountain's counts. */
export function logCounts(
  ctx: StoreContext,
  code: string,
  detail: string,
): void {
  log(ctx, {
    level: "info",
    code,
    detail,
    data: saveCounts(ctx.session.mountain),
  });
}

/** Puts a mountain and its clock in play, keeping the session's news. */
export function setGame(
  ctx: StoreContext,
  mountain: Mountain,
  lastSeen: number | undefined,
): void {
  ctx.session = { ...ctx.session, mountain, lastSeen };
}

/** A copy from elsewhere comes into play: Tonight starts fresh, unless it is this mountain. */
export function adopt(
  ctx: StoreContext,
  next: Mountain,
  lastSeen: number | undefined,
): void {
  if (next !== ctx.session.mountain) {
    ctx.ring.mark();
  }
  setGame(ctx, next, lastSeen);
}

export function deviceLabel(ctx: StoreContext): string {
  return readDeviceLabel(ctx.ports.storage);
}

/** This device's copy, as one side of a save conflict. */
export function localSide(ctx: StoreContext): SaveSide {
  return {
    mountain: ctx.session.mountain,
    lastSeen: ctx.session.lastSeen,
    rev: ctx.rev,
    deviceId: ctx.ports.deviceId,
    deviceLabel: deviceLabel(ctx),
  };
}

/** A loaded cloud copy as one side of a save conflict. */
export function remoteSide(loaded: {
  mountain: Mountain;
  lastSeen?: number | undefined;
  rev?: number;
  deviceId?: string;
  deviceLabel?: string;
}): SaveSide {
  return {
    mountain: loaded.mountain,
    lastSeen: loaded.lastSeen,
    rev: loaded.rev ?? 0,
    deviceId: loaded.deviceId ?? "",
    deviceLabel:
      loaded.deviceLabel !== undefined && loaded.deviceLabel.length > 0
        ? loaded.deviceLabel
        : "Another phone",
  };
}

/** Clears one retry's timer, if it is set. */
export function cancelRetry(retry: Retry): void {
  if (retry.timer === undefined) {
    return;
  }
  clearTimeout(retry.timer);
  retry.timer = undefined;
}

/** Waits the retry's backoff, doubling it for next time, then runs `fire`. */
export function scheduleRetry(retry: Retry, fire: () => void): void {
  const delay = retry.backoffMs;
  retry.backoffMs = Math.min(delay * 2, LISTEN_BACKOFF_MAX_MS);
  retry.timer = setTimeout(() => {
    retry.timer = undefined;
    fire();
  }, delay);
}

/** A change the cloud has not been sent yet (a queued write counts; one in flight does not). */
export function cloudDirty(ctx: StoreContext): boolean {
  const write = ctx.write;
  switch (write.kind) {
    case "clean":
      return false;
    case "dirty":
    case "queued":
      return true;
    case "flying":
      return write.next === "waiting";
  }
}

/** Whether the server has answered. A hold in flight keeps holding, and remembers it. */
export function noteServerSeen(ctx: StoreContext, seen: boolean): void {
  ctx.read =
    ctx.read.kind === "holding"
      ? { kind: "holding", wasSeen: seen }
      : seen
        ? { kind: "seen" }
        : { kind: "unseen" };
}

/** A fresh read ends: writes and pay go on, with what is known of the server. */
export function endHold(ctx: StoreContext): void {
  if (ctx.read.kind === "holding") {
    ctx.read = ctx.read.wasSeen ? { kind: "seen" } : { kind: "unseen" };
  }
}
