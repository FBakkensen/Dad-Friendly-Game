/**
 * The player picks a copy: one side of a conflict, a saved copy from the
 * shelf, or a new run. The mountain left behind is archived first, so
 * nothing is lost.
 */
import type {
  ArchiveReason,
  ArchivedCopy,
  CloudWriteResult,
} from "./cloud-save";
import { markCloudDirty, persistCloudSoon } from "./cloud-writer";
import { persistPhoneBackup } from "./local-saves";
import { minedOut, runStartedAt, type Mountain } from "./mountain";
import { conflictFacts } from "./save-adopt";
import { payAway } from "./save-load";
import { markWelcomed, openBaselines } from "./session";
import {
  adopt,
  canPlay,
  deviceLabel,
  isWriter,
  log,
  record,
  uidOf,
  type StoreContext,
} from "./store-context";
import { beginRun } from "./store-actions";
import { emit } from "./store-session";

/** How long a new run waits for the left mountain to reach Saved copies (#480). */
export const ARCHIVE_WAIT_MS = 10_000;

/** The chosen copy is in play: pay its time away, save it everywhere at once. */
function playChosen(
  ctx: StoreContext,
  mountain: Mountain,
  lastSeen: number | undefined,
): void {
  adopt(ctx, mountain, lastSeen);
  ctx.phoneDirty = false;
  markCloudDirty(ctx);
}

function saveChosen(ctx: StoreContext, lastSeen: number | undefined): void {
  payAway(ctx, lastSeen);
  ctx.session = markWelcomed(ctx.session);
  persistPhoneBackup(ctx);
  persistCloudSoon(ctx, false, true);
  emit(ctx);
}

/** Archive the other copy, then play the chosen one. */
export async function chooseSave(
  ctx: StoreContext,
  side: "local" | "remote",
): Promise<"saved" | "kept"> {
  const conflict = ctx.saveConflict;
  const uid = uidOf(ctx);
  const archiveCopy = ctx.ports.cloudSave.archiveCopy;
  if (
    conflict === undefined ||
    !isWriter(ctx) ||
    uid === undefined ||
    archiveCopy === undefined
  ) {
    return "kept";
  }
  const chosen = side === "local" ? conflict.local : conflict.remote;
  const other = side === "local" ? conflict.remote : conflict.local;
  const archived = await archiveCopy({
    uid,
    mountain: other.mountain,
    lastSeen: other.lastSeen ?? ctx.ports.now(),
    rev: other.rev,
    deviceId: other.deviceId.length >= 8 ? other.deviceId : ctx.ports.deviceId,
    deviceLabel: other.deviceLabel,
    reason: "conflict",
  });
  if (ctx.saveConflict !== conflict) {
    return "kept";
  }
  if (archived.kind !== "ok") {
    ctx.saveConflict = { ...conflict, error: "archive-failed" };
    emit(ctx);
    return "kept";
  }
  const confirmed = ctx.syncedRev;
  // This phone's copy is the mountain in play, so only the other one starts Tonight afresh.
  playChosen(ctx, chosen.mountain, chosen.lastSeen);
  ctx.rev = Math.max(ctx.rev, conflict.remote.rev);
  ctx.syncedRev = conflict.remote.rev;
  ctx.saveConflict = undefined;
  const data = { ...conflictFacts(ctx, side, conflict), syncedRev: confirmed };
  record(ctx, "save.conflict", data);
  log(ctx, { level: "info", code: "save.conflict", detail: side, data });
  saveChosen(ctx, chosen.lastSeen);
  return "saved";
}

/** Up to three copies still inside their seven days. */
export async function savedCopies(
  ctx: StoreContext,
): Promise<readonly ArchivedCopy[]> {
  const uid = uidOf(ctx);
  const listCopies = ctx.ports.cloudSave.listCopies;
  if (uid === undefined || listCopies === undefined) {
    return [];
  }
  const copies = await listCopies({ uid, now: ctx.ports.now() });
  return copies.slice(0, 3);
}

/**
 * Archive the current mountain, then play a saved copy. A copy from an
 * earlier run comes back as a new run (#480): a later start, so the
 * later-run rule holds, and no time away, since the other run was played.
 */
export async function restoreCopy(
  ctx: StoreContext,
  id: string,
): Promise<"saved" | "kept" | "missing"> {
  const uid = uidOf(ctx);
  const { listCopies } = ctx.ports.cloudSave;
  if (
    ctx.saveConflict !== undefined ||
    !isWriter(ctx) ||
    uid === undefined ||
    listCopies === undefined
  ) {
    return "kept";
  }
  const copies = await listCopies({ uid, now: ctx.ports.now() });
  const found = copies.find((copy) => copy.id === id);
  if (found === undefined) {
    return "missing";
  }
  const archived = await archiveInPlay(ctx, "restore");
  if (archived.kind !== "ok") {
    return "kept";
  }
  const { mountain, lastSeen } = comeBack(ctx, found);
  playChosen(ctx, mountain, lastSeen);
  // Its relics and layers were found when it was played: news counts from here, as a watch's copy.
  ctx.session = openBaselines(ctx.session, true);
  const data = { rev: ctx.syncedRev + 1, mined: minedOut(mountain) };
  record(ctx, "save.restore", data);
  log(ctx, { level: "info", code: "save.restore", detail: id, data });
  saveChosen(ctx, lastSeen);
  return "saved";
}

/** The copy as it comes back: as it was, or an earlier run as a new run. */
function comeBack(
  ctx: StoreContext,
  copy: ArchivedCopy,
): { readonly mountain: Mountain; readonly lastSeen: number } {
  const playing = runStartedAt(ctx.session.mountain);
  if (runStartedAt(copy.mountain) >= playing) {
    return { mountain: copy.mountain, lastSeen: copy.lastSeen };
  }
  const now = ctx.ports.now();
  const startedAt = Math.max(now, playing + 1);
  return { mountain: { ...copy.mountain, startedAt }, lastSeen: now };
}

/**
 * Keeps the mountain in play in Saved copies. Undefined when there is no
 * shelf: signed out, or no archive. A copy that does not land in time is
 * a failure, so a new run never waits on an offline phone.
 */
function archiveInPlay(
  ctx: StoreContext,
  reason: ArchiveReason,
): Promise<CloudWriteResult> {
  const uid = uidOf(ctx);
  const archiveCopy = ctx.ports.cloudSave.archiveCopy;
  if (uid === undefined || archiveCopy === undefined) {
    return Promise.resolve({ kind: "failed", message: "no-shelf" });
  }
  const { mountain, lastSeen } = ctx.session;
  const write = archiveCopy({
    uid,
    mountain,
    lastSeen: lastSeen ?? ctx.ports.now(),
    rev: ctx.rev,
    deviceId: ctx.ports.deviceId,
    deviceLabel: deviceLabel(ctx),
    reason,
  });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ kind: "failed", message: "timeout" });
    }, ARCHIVE_WAIT_MS);
    const settle = (result: CloudWriteResult): void => {
      clearTimeout(timer);
      resolve(result);
    };
    write.then(settle, () => {
      settle({ kind: "failed", message: "rejected" });
    });
  });
}

/** A new run: Start over, or the mine passed down. */
export type NewRun = {
  readonly reason: "start-over" | "pass";
  /** The new run's mountain from the one in play, or undefined when it cannot start. */
  readonly next: (playing: Mountain) => Mountain | undefined;
};

const RUN_WORDS = {
  "start-over": { detail: "start over", code: "run.start-over" },
  pass: { detail: "passed to the kid", code: "run.pass" },
} as const;

function startRun(ctx: StoreContext, run: NewRun): boolean {
  const next = run.next(ctx.session.mountain);
  const { detail, code } = RUN_WORDS[run.reason];
  return next !== undefined && beginRun(ctx, next, detail, code);
}

/**
 * Keeps the mountain he leaves in Saved copies, then starts the new run
 * (#480). A copy that does not land keeps the mountain in play, and says so
 * on the save line. Signed out, or with nothing mined yet, there is nothing
 * to keep, and the run starts at once.
 */
export async function keepThenBegin(
  ctx: StoreContext,
  run: NewRun,
): Promise<boolean> {
  const left = ctx.session.mountain;
  if (
    !canPlay(ctx) ||
    uidOf(ctx) === undefined ||
    ctx.ports.cloudSave.archiveCopy === undefined ||
    minedOut(left) === 0 ||
    run.next(left) === undefined
  ) {
    return startRun(ctx, run);
  }
  if (ctx.keepingLeft) {
    return false;
  }
  ctx.keepingLeft = true;
  const archived = await archiveInPlay(ctx, run.reason).finally(() => {
    ctx.keepingLeft = false;
  });
  if (archived.kind !== "ok") {
    record(ctx, "save.archive", { id: run.reason, source: archived.message });
    log(ctx, {
      level: "error",
      code: "save.archive",
      detail: `${run.reason} ${archived.message}`,
      data: { mined: minedOut(left) },
    });
    emit(ctx);
    return false;
  }
  record(ctx, "save.archive", { id: run.reason, stones: minedOut(left) });
  // Another device's run arrived meanwhile: that run is not the one he left.
  if (runStartedAt(ctx.session.mountain) !== runStartedAt(left)) {
    return false;
  }
  return startRun(ctx, run);
}
