/**
 * The progress store: one session in play, kept in sync with the phone and
 * the cloud. The session core (`session.ts`) decides what each tick and
 * move does; the sync service (`cloud-writer`, `save-adopt`, `server-read`,
 * `save-load`, `save-watch`, `save-choice`) runs the effects through the
 * ports. This module composes them and is the store's public surface.
 */
import type { AuthController } from "./auth";
import {
  createNoopCloudSave,
  type ArchivedCopy,
  type CloudSave,
} from "./cloud-save";
import { fieldSnapshotNow } from "./cloud-writer";
import { readDeviceId } from "./device-id";
import type { Move } from "./economy/actions";
import {
  FIELD_LOG_COPY_COUNT,
  FIELD_LOG_WRITE_GAP_MS,
  type FieldEvent,
  type FieldLog,
} from "./field-log";
import type { TroubleTier } from "./hazards";
import { passTheMine } from "./legacy";
import { createLogger, type Logger } from "./log";
import { createMountain, type Mountain } from "./mountain";
import { reconcileRev } from "./save-adopt";
import {
  ARCHIVE_WAIT_MS,
  chooseSave,
  keepThenBegin,
  restoreCopy,
  savedCopies,
} from "./save-choice";
import { previewConflictView } from "./save-preview";
import { onAuthChange, onSeatChange, onYield } from "./save-watch";
import { createSession, type DismissTarget } from "./session";
import { tryGetGuestStorage } from "./session-save";
import {
  commit,
  disposeStore,
  dismissNews,
  dispatchMove,
  flushStore,
  previewTrouble,
  resumeStore,
  tickStore,
  troubleTap,
  type DispatchResult,
} from "./store-actions";
import {
  createStoreContext,
  type ProgressSnapshot,
  type SaveConflictView,
  type StoreContext,
} from "./store-context";
import { emit, snapshot } from "./store-session";
import type { TabWriter } from "./tab-writer";

export type {
  ProgressSnapshot,
  SaveConflictView,
  SaveSide,
} from "./store-context";
export { QUIET_AWAY_MS, WELCOME_MIN_AWAY_MS } from "./session";

/** Firestore sustains about one write per second per document. */
const CLOUD_WRITE_GAP_MS = 1000;
/** A fresh read that never returns must not hold the mountain. */
const RESUME_READ_TIMEOUT_MS = 5_000;

type CloudResume =
  | { readonly kind: "idle" }
  | { readonly kind: "reading"; readonly done: Promise<void> };

/**
 * How a screen part changes the game (#409). The screen hands its panels a wrapper around
 * the store's `dispatch` that also shows each move's spend on the odometer.
 */
export type Dispatch = (move: StoreMove) => DispatchResult;

/** Every move but `fixTrouble`: trouble presses and fixes are the store's own methods. */
type StoreMove = Exclude<Move, { readonly kind: "fixTrouble" }>;

/** The layout check's previews: the dev boot (`?trouble=cave-in`, `?saves=two`) and tests only. */
type StorePreview = {
  /** Shows trouble immediately, because trouble is never part of a save. */
  readonly trouble: (tier: TroubleTier) => void;
  /** Shows the conflict sheet without a second device. */
  readonly conflict: () => void;
};

export type ProgressStore = {
  readonly getSnapshot: () => ProgressSnapshot;
  readonly subscribe: (
    listener: (snapshot: ProgressSnapshot) => void,
  ) => () => void;
  /**
   * The one way the game changes (#409): applies a move to the latest mountain (helpers'
   * work settled first), saves it, and says whether it applied.
   */
  readonly dispatch: Dispatch;
  /**
   * A test seam: applies any change to the latest mountain, as `dispatch` does, but records
   * no move events in the field log (#413). Production
   * code changes the game only through `dispatch` (an ESLint rule holds it to that).
   */
  readonly applyMutation: (update: (mountain: Mountain) => Mountain) => void;
  /** Snapshot plus the newest events the menu copies. Not part of the mountain save. */
  readonly fieldLog: () => FieldLog;
  /**
   * The events since the mountain in play came into play, oldest first: since this run began,
   * or since a copy from elsewhere (a restore, the cloud's or another device's copy) took its
   * place. The Ledger's Tonight reads them.
   */
  readonly tonightEvents: () => readonly FieldEvent[];
  /** Settles helpers' work up to now for display. A signed-in phone backup follows a change; cloud writes stay on actions, hide, and pagehide. */
  readonly tick: () => void;
  /**
   * Closes the oldest notice of a kind; the next one (if any) follows.
   * `"away"` closes the whole welcome-back card, with any band or craft folded into it.
   */
  readonly dismiss: (what: DismissTarget) => void;
  /**
   * Starts a fresh mountain, on the device and (signed in) in the cloud right
   * away. Signed in, the mountain he leaves goes to Saved copies first (#480);
   * false when it could not, and the mountain stays in play.
   */
  readonly startOver: () => Promise<boolean>;
  /**
   * Passes the finished mine to your kid (M6), after keeping it in Saved
   * copies like a Start over; false if it isn't finished or was not kept.
   */
  readonly passTheMine: () => Promise<boolean>;
  /** One tap on a troubled card. The fifth tap fixes it. */
  readonly pressTrouble: (tier: TroubleTier) => void;
  /** A short hold on a troubled card fixes it. */
  readonly fixTrouble: (tier: TroubleTier) => void;
  /** A test seam, like `applyMutation`: an ESLint rule keeps it to the dev boot and tests. */
  readonly layoutPreview: StorePreview;
  /** Archive the other copy, then play the chosen one. */
  readonly chooseSave: (side: "local" | "remote") => Promise<"saved" | "kept">;
  /** Up to three copies still inside their seven days. */
  readonly savedCopies: () => Promise<readonly ArchivedCopy[]>;
  /** Archive the current mountain, then play a saved copy. */
  readonly restoreCopy: (id: string) => Promise<"saved" | "kept" | "missing">;
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

export function createProgressStore({
  auth,
  cloudSave = createNoopCloudSave(),
  logger = createLogger({ limit: 20 }),
  sessionStorage,
  now = Date.now,
  cloudWriteGapMs = CLOUD_WRITE_GAP_MS,
  fieldLogWriteGapMs = FIELD_LOG_WRITE_GAP_MS,
  hazardSeed,
  tabWriter,
  resumeReadTimeoutMs = RESUME_READ_TIMEOUT_MS,
  archiveWaitMs = ARCHIVE_WAIT_MS,
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
  /** How long a fresh server read may hold crew pay and cloud writes. */
  resumeReadTimeoutMs?: number;
  /** How long a move waits for the mountain it leaves to reach Saved copies. */
  archiveWaitMs?: number;
}): ProgressStore {
  const storage = sessionStorage ?? tryGetGuestStorage();
  const ctx = createStoreContext(
    {
      auth,
      cloudSave,
      logger,
      storage,
      now,
      tabWriter,
      cloudWriteGapMs,
      fieldLogWriteGapMs,
      resumeReadTimeoutMs,
      archiveWaitMs,
      deviceId: readDeviceId(storage),
    },
    createSession(createMountain(), hazardSeed ?? now()),
  );
  ctx.hooks = {
    emit: () => {
      emit(ctx);
    },
    reconcile: (uid, generation, counts) =>
      reconcileRev(ctx, uid, generation, counts),
  };
  tabWriter?.onYield(() => {
    onYield(ctx);
  });
  const unwatchSeat = tabWriter?.subscribe((next) => {
    onSeatChange(ctx, next);
  });
  const unsubscribeAuth = auth.subscribe(() => {
    onAuthChange(ctx);
  });
  return storeApi(ctx, () => {
    unwatchSeat?.();
    unsubscribeAuth();
  });
}

function storeApi(ctx: StoreContext, unsubscribe: () => void): ProgressStore {
  const now = ctx.ports.now;
  return {
    getSnapshot: () => snapshot(ctx),
    subscribe: (listener) => {
      ctx.listeners.add(listener);
      listener(snapshot(ctx));
      return () => {
        ctx.listeners.delete(listener);
      };
    },
    dispatch: (move) => dispatchMove(ctx, { kind: "move", move }),
    applyMutation: (update) => {
      commit(ctx, {
        kind: "change",
        update: (mountain) => ({ mountain: update(mountain), events: [] }),
      });
    },
    dismiss: (what) => {
      dismissNews(ctx, what);
    },
    startOver: () =>
      keepThenBegin(ctx, {
        reason: "start-over",
        next: () => ({ ...createMountain(), startedAt: now() }),
      }),
    passTheMine: () =>
      keepThenBegin(ctx, {
        reason: "pass",
        next: (playing) => passTheMine(playing, now()),
      }),
    tonightEvents: () => ctx.ring.sinceMark(),
    fieldLog: () => ({
      snapshot: fieldSnapshotNow(ctx),
      events: ctx.ring.last(FIELD_LOG_COPY_COUNT),
    }),
    pressTrouble: (tier) => {
      troubleTap(ctx, "press", tier);
    },
    fixTrouble: (tier) => {
      troubleTap(ctx, "fix", tier);
    },
    layoutPreview: storePreview(ctx),
    chooseSave: (side) => chooseSave(ctx, side),
    savedCopies: () => savedCopies(ctx),
    restoreCopy: (id) => restoreCopy(ctx, id),
    tick: () => {
      tickStore(ctx);
    },
    resume: () => resumeStore(ctx),
    playHere: () => ctx.ports.tabWriter?.playHere() ?? Promise.resolve(),
    flush: () => {
      flushStore(ctx);
    },
    dispose: () => {
      disposeStore(ctx, unsubscribe);
    },
  };
}

function storePreview(ctx: StoreContext): StorePreview {
  return {
    trouble: (tier) => {
      previewTrouble(ctx, tier);
    },
    conflict: () => {
      const view: SaveConflictView = previewConflictView(
        ctx.ports.now(),
        ctx.ports.deviceId,
      );
      ctx.session = {
        ...ctx.session,
        mountain: view.local.mountain,
        lastSeen: view.local.lastSeen,
      };
      ctx.hydrated = true;
      ctx.saveConflict = view;
      emit(ctx);
    },
  };
}
