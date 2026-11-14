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
  canWrite,
  log,
  record,
  uidOf,
  type StoreContext,
} from "./store-context";
import { beginRun } from "./store-actions";
import { emit } from "./store-session";
import { settleWithin, type GaveUp } from "./settle-within";

/** How long a move waits for the mountain it leaves to reach Saved copies (#480). */
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
    !canWrite(ctx) ||
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

/** The save a wait began on: a new account, a dispose or a held play since then ends the move. */
type Stance = { readonly uid: string; readonly generation: number };

function stanceOf(ctx: StoreContext, uid: string): Stance {
  return { uid, generation: ctx.hydrateGeneration };
}

function stillOn(ctx: StoreContext, stance: Stance): boolean {
  return (
    canPlay(ctx) &&
    uidOf(ctx) === stance.uid &&
    ctx.hydrateGeneration === stance.generation
  );
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
  if (!canPlay(ctx) || uid === undefined || listCopies === undefined) {
    return "kept";
  }
  const stance = stanceOf(ctx, uid);
  const copies = await listCopies({ uid, now: ctx.ports.now() });
  const found = copies.find((copy) => copy.id === id);
  if (found === undefined) {
    return "missing";
  }
  if (!stillOn(ctx, stance)) {
    return "kept";
  }
  // A mountain with nothing mined is not kept: it would only crowd the shelf.
  // A copy that lands checks the save again (keepInPlay).
  if (
    minedOut(ctx.session.mountain) > 0 &&
    !(await keepInPlay(ctx, stance, "restore"))
  ) {
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
 * Keeps the mountain in play in Saved copies, and says how it went in the
 * field log and on the save line. A copy that does not land within the
 * archive wait fails, so a move never waits on an offline phone. False when
 * it failed, or the save moved on (another account, a dispose) meanwhile.
 */
async function keepInPlay(
  ctx: StoreContext,
  stance: Stance,
  reason: ArchiveReason,
): Promise<boolean> {
  const archiveCopy = ctx.ports.cloudSave.archiveCopy;
  if (archiveCopy === undefined) {
    return false;
  }
  const { mountain, lastSeen } = ctx.session;
  const mined = minedOut(mountain);
  const answer = await settleWithin(
    archiveCopy({
      uid: stance.uid,
      mountain,
      lastSeen: lastSeen ?? ctx.ports.now(),
      rev: ctx.rev,
      deviceId: ctx.ports.deviceId,
      deviceLabel: deviceLabel(ctx),
      reason,
    }),
    ctx.ports.archiveWaitMs,
  );
  if (!stillOn(ctx, stance)) {
    return false;
  }
  const failed = archiveFailure(answer);
  if (failed !== undefined) {
    record(ctx, "save.archive", { id: reason, source: failed });
    log(ctx, {
      level: "error",
      code: "save.archive",
      detail: `${reason} ${failed}`,
      data: { mined },
    });
    emit(ctx);
    return false;
  }
  record(ctx, "save.archive", { id: reason, stones: mined });
  return true;
}

/** Why the copy did not land, or undefined when it did. */
function archiveFailure(answer: CloudWriteResult | GaveUp): string | undefined {
  if (typeof answer === "string") {
    return answer;
  }
  return answer.kind === "ok" ? undefined : answer.message;
}

/** A new run: Start over, or the mine passed down. */
export type NewRun = {
  readonly reason: "start-over" | "pass";
  /** The new run's mountain from the one in play, or undefined when it cannot start. */
  readonly next: (playing: Mountain) => Mountain | undefined;
  /** Asked once the copy lands: false when he backed out while it was on its way. */
  readonly stillWanted?: () => boolean;
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
 * (#480). A copy that does not land keeps the mountain in play, and says so.
 * Signed out, or with nothing mined yet, there is nothing to keep, and the
 * run starts at once.
 */
export async function keepThenBegin(
  ctx: StoreContext,
  run: NewRun,
): Promise<boolean> {
  const left = ctx.session.mountain;
  const uid = uidOf(ctx);
  if (
    !canPlay(ctx) ||
    uid === undefined ||
    ctx.ports.cloudSave.archiveCopy === undefined ||
    minedOut(left) === 0 ||
    run.next(left) === undefined
  ) {
    return startRun(ctx, run);
  }
  if (ctx.keepingLeft) {
    record(ctx, "run.refused", { id: run.reason, source: "keeping" });
    return false;
  }
  ctx.keepingLeft = true;
  const kept = await keepInPlay(ctx, stanceOf(ctx, uid), run.reason).finally(
    () => {
      ctx.keepingLeft = false;
    },
  );
  if (!kept) {
    return false;
  }
  // Another device's run arrived meanwhile: that run is not the one he left.
  const why =
    runStartedAt(ctx.session.mountain) !== runStartedAt(left)
      ? "newer-run"
      : run.stillWanted?.() === false
        ? "backed-out"
        : undefined;
  if (why !== undefined) {
    record(ctx, "run.refused", { id: run.reason, source: why });
    emit(ctx);
    return false;
  }
  return startRun(ctx, run);
}
