/**
 * The player picks a copy: one side of a conflict, or a saved copy from the
 * shelf. The other copy is archived first, so nothing is lost.
 */
import type { ArchivedCopy } from "./cloud-save";
import { markCloudDirty, persistCloudSoon } from "./cloud-writer";
import { persistPhoneBackup } from "./local-saves";
import { minedOut, runStartedAt, type Mountain } from "./mountain";
import { conflictFacts } from "./save-adopt";
import { payAway } from "./save-load";
import { markWelcomed } from "./session";
import {
  adopt,
  deviceLabel,
  isWriter,
  log,
  record,
  uidOf,
  type StoreContext,
} from "./store-context";
import { emit } from "./store-session";

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

/** Archive the current mountain, then play a saved copy. An earlier run is not restored. */
export async function restoreCopy(
  ctx: StoreContext,
  id: string,
): Promise<"saved" | "kept" | "missing"> {
  const uid = uidOf(ctx);
  const { listCopies, archiveCopy } = ctx.ports.cloudSave;
  if (
    ctx.saveConflict !== undefined ||
    !isWriter(ctx) ||
    uid === undefined ||
    listCopies === undefined ||
    archiveCopy === undefined
  ) {
    return "kept";
  }
  const copies = await listCopies({ uid, now: ctx.ports.now() });
  const found = copies.find((copy) => copy.id === id);
  if (found === undefined) {
    return "missing";
  }
  const { mountain, lastSeen } = ctx.session;
  if (runStartedAt(found.mountain) < runStartedAt(mountain)) {
    return "kept";
  }
  const archived = await archiveCopy({
    uid,
    mountain,
    lastSeen: lastSeen ?? ctx.ports.now(),
    rev: ctx.rev,
    deviceId: ctx.ports.deviceId,
    deviceLabel: deviceLabel(ctx),
  });
  if (archived.kind !== "ok") {
    return "kept";
  }
  playChosen(ctx, found.mountain, found.lastSeen);
  const data = { rev: ctx.syncedRev + 1, mined: minedOut(found.mountain) };
  record(ctx, "save.restore", data);
  log(ctx, { level: "info", code: "save.restore", detail: id, data });
  saveChosen(ctx, found.lastSeen);
  return "saved";
}
