/**
 * The device's own copies: the guest's session save, the signed-in phone
 * backup, the homecomings not yet read, and the field log's events. Each
 * failure is logged.
 */
import { parseHomecomingNews, type Homecoming } from "./expeditions";
import {
  EVENT_RING_LIMIT,
  shouldWriteFieldLog,
  type FieldEvent,
  type FieldLogWriteReason,
} from "./field-log";
import {
  keepEvents,
  mergeEvents,
  readKeptEvents,
  sameScope,
  withKept,
  type RingScope,
} from "./field-ring";
import { writePhoneBackup, type PhoneConflict } from "./phone-backup";
import { saveCounts } from "./session";
import { writeSessionSave } from "./session-save";
import {
  cloudDirty,
  isWriter,
  log,
  logCounts,
  record,
  signedIn,
  uidOf,
  type SaveConflictView,
  type StoreContext,
} from "./store-context";

/** Undismissed return notices. Not a mountain field, so a reload can still show them. */
const HOMECOMING_NEWS_KEY = "dad-friendly-homecomings";

/** The guest's save on this device. Signed in, the phone backup is the device's copy instead. */
export function persistSession(ctx: StoreContext): void {
  if (writeGuestSave(ctx)) {
    ctx.saveKind = "session";
    logCounts(ctx, "save.session", "ok");
  }
}

/**
 * The guest's save on a tick the crew moved it, with no log line: a phone
 * that kills the tab then loses at most one tick at the away rate (#573).
 * Signed in, the phone backup does the same on each tick.
 */
export function persistSessionQuietly(ctx: StoreContext): void {
  writeGuestSave(ctx);
}

/** True when the guest's save was written. A failed write is recorded. */
function writeGuestSave(ctx: StoreContext): boolean {
  const storage = ctx.ports.storage;
  if (!isWriter(ctx) || signedIn(ctx) || storage === undefined) {
    return false;
  }
  const { mountain, lastSeen } = ctx.session;
  if (
    !writeSessionSave({
      storage,
      mountain,
      lastSeen: lastSeen ?? ctx.ports.now(),
    })
  ) {
    record(ctx, "save.error", { source: "session" });
    return false;
  }
  return true;
}

/** The other copy of an open conflict, as the phone backup keeps it. */
export function phoneConflict(
  conflict: SaveConflictView | undefined,
): { conflict: PhoneConflict } | Record<string, never> {
  if (conflict === undefined) {
    return {};
  }
  const remote = conflict.remote;
  return {
    conflict: {
      remote: {
        mountain: remote.mountain,
        lastSeen: remote.lastSeen,
        rev: remote.rev,
        deviceId: remote.deviceId,
      },
      deviceLabel: remote.deviceLabel,
    },
  };
}

/** Full save on this phone. Skipped until the first reconcile, and never deletes the key. */
export function persistPhoneBackup(ctx: StoreContext): void {
  const storage = ctx.ports.storage;
  const uid = uidOf(ctx);
  if (
    !isWriter(ctx) ||
    uid === undefined ||
    storage === undefined ||
    !ctx.hydrated
  ) {
    return;
  }
  const { mountain, lastSeen } = ctx.session;
  const result = writePhoneBackup({
    storage,
    uid,
    mountain,
    lastSeen: lastSeen ?? ctx.ports.now(),
    rev: ctx.rev,
    deviceId: ctx.ports.deviceId,
    syncedRev: ctx.syncedRev,
    dirty: ctx.phoneDirty || cloudDirty(ctx) || ctx.saveConflict !== undefined,
    ...phoneConflict(ctx.saveConflict),
  });
  if (result !== "failed") {
    return;
  }
  record(ctx, "save.error", { source: "phone" });
  log(ctx, {
    level: "error",
    code: "save.phone",
    detail: "failed",
    data: saveCounts(mountain),
  });
}

/** Keeps the device's copy of the unread homecomings in step with the session. */
export function rememberHomecomings(ctx: StoreContext): void {
  const storage = ctx.ports.storage;
  if (storage === undefined) {
    return;
  }
  const homecomings = ctx.session.news.homecomings;
  try {
    if (homecomings.length === 0) {
      storage.removeItem(HOMECOMING_NEWS_KEY);
      return;
    }
    storage.setItem(HOMECOMING_NEWS_KEY, JSON.stringify(homecomings));
  } catch {
    return;
  }
}

/** The homecomings a reload left unread, or none. */
export function readHomecomings(ctx: StoreContext): readonly Homecoming[] {
  const storage = ctx.ports.storage;
  if (storage === undefined) {
    return [];
  }
  let parsed: unknown;
  try {
    const raw = storage.getItem(HOMECOMING_NEWS_KEY);
    parsed = raw === null ? undefined : JSON.parse(raw);
  } catch {
    return [];
  }
  return parsed === undefined ? [] : parseHomecomingNews(parsed);
}

/** The field log's events go to the device at most this often, unless the page hides or a run starts. */
export const FIELD_RING_GAP_MS = 10_000;

/** Whose events this page keeps now: the signed-in account, or the guest. */
function ringScopeOf(ctx: StoreContext): RingScope {
  const uid = uidOf(ctx);
  return uid === undefined ? { kind: "guest" } : { kind: "account", uid };
}

/**
 * The account is known or changed (#479): the ring goes on from the events
 * this device kept for it. Events from before the first answer stay with it;
 * another account's never do.
 */
export function restoreFieldRing(ctx: StoreContext): void {
  const scope = ringScopeOf(ctx);
  const before = ctx.ringScope;
  if (before !== undefined && sameScope(before, scope)) {
    return;
  }
  if (before !== undefined) {
    // The account that leaves keeps its last few seconds first.
    keepFieldRing(ctx, "hide");
  }
  const storage = ctx.ports.storage;
  const kept = storage === undefined ? [] : readKeptEvents(storage, scope);
  ctx.ring.restore(
    before === undefined
      ? mergeEvents(kept, ctx.ring.last(EVENT_RING_LIMIT))
      : kept,
  );
  ctx.ringScope = scope;
  ctx.ringKept = {
    pushes: ctx.ring.pushes,
    at: ctx.ports.now(),
    failed: false,
  };
}

/**
 * The events the cloud log uploads: this page's ring with what this device
 * kept for the account, so another tab's events reach the cloud too (#484).
 */
export function fieldEventsToUpload(ctx: StoreContext): readonly FieldEvent[] {
  const mine = ctx.ring.last(EVENT_RING_LIMIT);
  const storage = ctx.ports.storage;
  const scope = ctx.ringScope;
  if (storage === undefined || scope === undefined) {
    return mine;
  }
  return withKept(storage, scope, mine);
}

/**
 * Keeps the field log's events on this device for the account in play, so a
 * reload, a crash or a new run never empties it. Paced as the cloud copy is
 * (`shouldWriteFieldLog`), on the device's shorter gap.
 */
export function keepFieldRing(
  ctx: StoreContext,
  reason: FieldLogWriteReason,
): void {
  const storage = ctx.ports.storage;
  const scope = ctx.ringScope;
  if (storage === undefined || scope === undefined || ctx.disposed) {
    return;
  }
  const pushes = ctx.ring.pushes;
  const at = ctx.ports.now();
  const due = shouldWriteFieldLog({
    changed: pushes !== ctx.ringKept.pushes,
    lastWrittenAt: ctx.ringKept.at,
    now: at,
    reason,
    gapMs: FIELD_RING_GAP_MS,
  });
  if (!due) {
    return;
  }
  const events = ctx.ring.last(EVENT_RING_LIMIT);
  const kept = keepEvents(storage, scope, events);
  const failedBefore = ctx.ringKept.failed;
  ctx.ringKept = { pushes, at, failed: !kept };
  if (kept || failedBefore) {
    return;
  }
  // Logged once until a write lands, and not an event: a refused copy would
  // only grow the ring it could not keep.
  log(ctx, {
    level: "error",
    code: "field-log.keep",
    detail: "failed",
    data: { events: events.length },
  });
}
