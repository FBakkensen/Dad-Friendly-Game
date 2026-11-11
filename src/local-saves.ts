/**
 * The device's own copies: the guest's session save, the signed-in phone
 * backup, and the homecomings not yet read. Each failure is logged.
 */
import { parseHomecomingNews, type Homecoming } from "./expeditions";
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
  const storage = ctx.ports.storage;
  if (!isWriter(ctx) || signedIn(ctx) || storage === undefined) {
    return;
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
    return;
  }
  ctx.saveKind = "session";
  logCounts(ctx, "save.session", "ok");
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
