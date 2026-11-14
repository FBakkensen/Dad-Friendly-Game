/**
 * Following the account and the writer seat: watch the cloud while signed
 * in, play the guest's session save while signed out, and read the server
 * again when this tab takes the seat back.
 */
import { markCloudClean, persistCloudSoon, resetWrite } from "./cloud-writer";
import {
  persistPhoneBackup,
  persistSession,
  phoneConflict,
  restoreFieldRing,
  setAsideLocal,
} from "./local-saves";
import { minedOut } from "./mountain";
import {
  phoneBackupKey,
  readPhoneBackup,
  writePhoneBackup,
  type PhoneBackup,
} from "./phone-backup";
import type { ParsedSave } from "./persist";
import { compareSaveProgress } from "./save-progress";
import {
  attachWatch,
  hasLocalProgress,
  localMoment,
  openSession,
  resetFresh,
  type SetAside,
} from "./save-load";
import { endResumeRead, freshServerRead } from "./server-read";
import { forgetArrivals } from "./session";
import {
  clearSessionSave,
  readSessionSave,
  SESSION_SAVE_KEY,
  type SessionRead,
} from "./session-save";
import {
  cancelRetry,
  holdNewer,
  isWriter,
  LISTEN_BACKOFF_START_MS,
  localSide,
  logCounts,
  serverSeen,
  setGame,
  uidOf,
  type StoreContext,
} from "./store-context";
import { emit, settleIfPlaying } from "./store-session";

/**
 * The old watch's reads and writes are over (#481): a write still in flight
 * or a read on resume still held would otherwise wedge the next watch, which
 * drops their late answers by generation.
 */
function endCloudWork(ctx: StoreContext): void {
  resetWrite(ctx);
  cancelRetry(ctx.listenRetry);
  endResumeRead(ctx);
  ctx.hydrateGeneration += 1;
  ctx.hydrated = false;
}

/** Stops following the cloud: late answers from the old watch are dropped. */
function stopWatch(ctx: StoreContext): void {
  endCloudWork(ctx);
  ctx.fieldLogAt = undefined;
  ctx.fieldLogFingerprint = undefined;
  ctx.unwatch?.();
  ctx.unwatch = undefined;
}

/** Signed out: play the guest's session save on this device, if there is one. */
function resumeFromSession(ctx: StoreContext): void {
  stopWatch(ctx);
  const storage = ctx.ports.storage;
  const read =
    storage === undefined
      ? ({ kind: "absent" } as const)
      : readSessionSave({ storage });
  if (read.kind === "newer") {
    holdNewer(ctx, "guest");
    emit(ctx);
    return;
  }
  if (read.kind === "older") {
    resetFresh(ctx, setAsideOlder(ctx, read, undefined));
  }
  if (read.kind !== "ok") {
    ctx.saveKind = "unsigned";
    emit(ctx);
    return;
  }
  const stored = read.save;
  if (!isWriter(ctx)) {
    setGame(ctx, stored.mountain, stored.lastSeen);
    ctx.session = {
      ...ctx.session,
      baselines: {
        ...ctx.session.baselines,
        reveal: minedOut(stored.mountain),
      },
    };
    ctx.saveKind = "session";
    emit(ctx);
    return;
  }
  setGame(ctx, stored.mountain, ctx.session.lastSeen);
  const opened = openSession(ctx, {
    pay: true,
    since: stored.lastSeen,
    rebase: true,
  });
  ctx.saveKind = "session";
  logCounts(ctx, "save.session", "resume");
  if (opened.paid > 0) {
    persistSession(ctx);
  }
  emit(ctx);
}

/**
 * Moves the guest save and the phone backup from before this version aside
 * on the phone (#558), and says which went.
 */
function setAsideOlder(
  ctx: StoreContext,
  guest: SessionRead,
  backup: { readonly uid: string; readonly read: PhoneBackup } | undefined,
): readonly SetAside[] {
  const aside: SetAside[] = [];
  if (guest.kind === "older") {
    setAsideLocal(ctx, SESSION_SAVE_KEY, guest.raw, guest.version);
    aside.push({ source: "guest", ...guest });
  }
  const phone = backup?.read;
  if (backup !== undefined && phone?.kind === "older") {
    setAsideLocal(ctx, phoneBackupKey(backup.uid), phone.raw, phone.version);
    aside.push({ source: "phone", ...phone });
  }
  return aside.map(({ source, version, startedAt }) => ({
    source,
    version,
    startedAt,
  }));
}

/** Plays a local copy that is ahead of the one in play. */
function takeIfAhead(ctx: StoreContext, save: ParsedSave | undefined): void {
  if (save !== undefined && compareSaveProgress(save, localMoment(ctx)) > 0) {
    setGame(ctx, save.mountain, save.lastSeen);
  }
}

/** The revs and the dirty mark the guest save and the phone backup carry. */
function takeRevs(
  ctx: StoreContext,
  session: ParsedSave | undefined,
  backup: PhoneBackup,
): void {
  const present = backup.kind === "present" ? backup : undefined;
  const seenRev = Math.max(session?.rev ?? 0, present?.save.rev ?? 0);
  if (seenRev > ctx.rev) {
    ctx.rev = seenRev;
  }
  if (present?.syncedRev !== undefined) {
    ctx.syncedRev = present.syncedRev;
  } else if (seenRev > ctx.syncedRev) {
    ctx.syncedRev = seenRev;
  }
  if (present?.dirty === true) {
    ctx.phoneDirty = true;
  }
}

/** A conflict the phone kept over a reload: the same sheet comes back. */
function takeConflict(ctx: StoreContext, backup: PhoneBackup): void {
  if (backup.kind !== "present" || backup.conflict === undefined) {
    return;
  }
  const remote = backup.conflict.remote;
  ctx.saveConflict = {
    local: localSide(ctx),
    remote: {
      mountain: remote.mountain,
      lastSeen: remote.lastSeen,
      rev: remote.rev ?? 0,
      deviceId: remote.deviceId ?? "",
      deviceLabel: backup.conflict.deviceLabel,
    },
  };
  ctx.phoneDirty = true;
}

/**
 * The guest scratch and the phone backup are both local. Keep the one
 * that is ahead, copy it onto the phone, then drop the guest key.
 * An unreadable backup is left untouched.
 */
function prepareLocal(ctx: StoreContext, uid: string): void {
  const storage = ctx.ports.storage;
  if (storage === undefined) {
    return;
  }
  const guest = readSessionSave({ storage });
  const backup = readPhoneBackup({ storage, uid });
  if (guest.kind === "newer" || backup.kind === "newer") {
    holdNewer(ctx, guest.kind === "newer" ? "guest" : "phone");
    return;
  }
  const session = guest.kind === "ok" ? guest.save : undefined;
  takeIfAhead(ctx, session);
  takeIfAhead(ctx, backup.kind === "present" ? backup.save : undefined);
  takeRevs(ctx, session, backup);
  takeConflict(ctx, backup);
  const aside = setAsideOlder(ctx, guest, { uid, read: backup });
  if (aside.length > 0) {
    resetFresh(ctx, aside);
  }
  if (backup.kind === "unreadable") {
    return;
  }
  if (!hasLocalProgress(ctx)) {
    clearSessionSave({ storage });
    return;
  }
  const { mountain, lastSeen } = ctx.session;
  const wrote = writePhoneBackup({
    storage,
    uid,
    mountain,
    lastSeen: lastSeen ?? ctx.ports.now(),
    rev: ctx.rev,
    deviceId: ctx.ports.deviceId,
    syncedRev: ctx.syncedRev,
    dirty: ctx.phoneDirty,
    ...phoneConflict(ctx.saveConflict),
  });
  if (wrote !== "failed") {
    clearSessionSave({ storage });
  }
}

/** Signed in: bring the phone's copies up, then watch the cloud document. */
function startCloudWatch(ctx: StoreContext, uid: string): void {
  ctx.rev = 0;
  ctx.syncedRev = 0;
  ctx.phoneDirty = false;
  ctx.saveConflict = undefined;
  ctx.consecutiveRevMerges = 0;
  endCloudWork(ctx);
  prepareLocal(ctx, uid);
  ctx.listenRetry.backoffMs = LISTEN_BACKOFF_START_MS;
  ctx.fieldLogAt = undefined;
  ctx.fieldLogFingerprint = undefined;
  ctx.session = forgetArrivals(ctx.session);
  ctx.saveKind = "loading";
  ctx.unwatch?.();
  ctx.unwatch = undefined;
  logCounts(ctx, "save.watch", "start");
  emit(ctx);
  attachWatch(ctx);
}

/**
 * The account changed: watch the new one, or go back to the guest save. The
 * same account reported again (a token refresh) changes nothing (#481).
 */
export function onAuthChange(ctx: StoreContext): void {
  /* v8 ignore next 3 -- dispose unsubscribes from the account before anything else can call */
  if (ctx.disposed) {
    return;
  }
  const uid = uidOf(ctx);
  if (uid !== undefined && uid === ctx.watchedUid) {
    return;
  }
  restoreFieldRing(ctx);
  const leaveAccount = ctx.watchedUid !== undefined;
  ctx.watchedUid = uid;
  if (uid !== undefined) {
    startCloudWatch(ctx, uid);
    return;
  }
  if (leaveAccount) {
    stopWatch(ctx);
    persistSession(ctx);
    emit(ctx);
    return;
  }
  resumeFromSession(ctx);
}

/** The phone backup, if another tab left it ahead of this one. */
function pullPhoneIfAhead(ctx: StoreContext, uid: string): void {
  const storage = ctx.ports.storage;
  if (storage === undefined) {
    return;
  }
  const backup = readPhoneBackup({ storage, uid });
  if (backup.kind === "newer") {
    holdNewer(ctx, "phone");
    emit(ctx);
    return;
  }
  if (
    backup.kind !== "present" ||
    compareSaveProgress(backup.save, localMoment(ctx)) <= 0
  ) {
    return;
  }
  setGame(ctx, backup.save.mountain, backup.save.lastSeen);
  const seen = backup.save.rev ?? 0;
  if (seen > ctx.rev) {
    ctx.rev = seen;
    ctx.syncedRev = seen;
  }
}

/** This tab took the seat back: catch up on what the other tab saved. */
function onBecameWriter(ctx: StoreContext): Promise<void> {
  /* v8 ignore next 3 -- seat changes only call this once this tab is the writer */
  if (ctx.disposed || !isWriter(ctx)) {
    return Promise.resolve();
  }
  markCloudClean(ctx);
  const uid = uidOf(ctx);
  if (uid === undefined) {
    resumeFromSession(ctx);
    return Promise.resolve();
  }
  pullPhoneIfAhead(ctx, uid);
  if (!ctx.hydrated) {
    emit(ctx);
    return Promise.resolve();
  }
  return freshServerRead(ctx);
}

/** The seat moved: hand it over cleanly, or take it back. */
export function onSeatChange(
  ctx: StoreContext,
  next: "pending" | "writer" | "other",
): void {
  if (next === "other") {
    ctx.writerAnnounced = false;
    markCloudClean(ctx);
    emit(ctx);
    return;
  }
  if (next !== "writer" || ctx.writerAnnounced) {
    return;
  }
  ctx.writerAnnounced = true;
  void onBecameWriter(ctx);
}

/** Another tab asked for the seat: save everything before it goes. */
export function onYield(ctx: StoreContext): void {
  if (ctx.disposed || !isWriter(ctx)) {
    return;
  }
  settleIfPlaying(ctx);
  persistPhoneBackup(ctx);
  persistSession(ctx);
  if (serverSeen(ctx) && ctx.hydrated) {
    persistCloudSoon(ctx, false, true);
  }
}
