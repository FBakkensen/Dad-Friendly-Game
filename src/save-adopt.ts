/**
 * Bringing another copy into play: fast-forward when one copy leads, open
 * the conflict sheet on a real split, and recover from a refused rev.
 */
import {
  cancelQueuedWrite,
  landWrite,
  markCloudDirty,
  persistCloudSoon,
} from "./cloud-writer";
import { persistPhoneBackup } from "./local-saves";
import { digStones, minedOut } from "./mountain";
import { conflictIsReal, mergeSaves, type MergeResult } from "./save-merge";
import {
  adopt,
  cloudDirty,
  isWriter,
  localSide,
  log,
  noteServerSeen,
  record,
  remoteSide,
  type SaveConflictView,
  type SaveSide,
  type StoreContext,
} from "./store-context";
import { emit } from "./store-session";

/** The facts a conflict logs, with the side the player chose (or "ask"). */
export function conflictFacts(
  ctx: StoreContext,
  side: "ask" | "local" | "remote",
  conflict: SaveConflictView,
): Readonly<Record<string, string | number>> {
  return {
    localRev: conflict.local.rev,
    remoteRev: conflict.remote.rev,
    syncedRev: ctx.syncedRev,
    deviceIds: `${conflict.local.deviceId},${conflict.remote.deviceId}`,
    minedLocal: minedOut(conflict.local.mountain),
    minedRemote: minedOut(conflict.remote.mountain),
    chosen: side,
  };
}

function openConflict(ctx: StoreContext, remote: SaveSide): void {
  if (!isWriter(ctx) || ctx.saveConflict !== undefined) {
    return;
  }
  cancelQueuedWrite(ctx);
  const conflict: SaveConflictView = { local: localSide(ctx), remote };
  ctx.saveConflict = conflict;
  const data = conflictFacts(ctx, "ask", conflict);
  record(ctx, "save.conflict", data);
  log(ctx, { level: "info", code: "save.conflict", detail: "ask", data });
  persistPhoneBackup(ctx);
  emit(ctx);
}

/** Both copies changed since they last agreed, and neither leads. */
function unsettledCopy(ctx: StoreContext, remote: SaveSide): boolean {
  return (
    isWriter(ctx) &&
    conflictIsReal({
      serverRev: remote.rev,
      syncedRev: ctx.syncedRev,
      dirty: cloudDirty(ctx) || ctx.phoneDirty,
      remoteDeviceId: remote.deviceId,
      localDeviceId: ctx.ports.deviceId,
    })
  );
}

/** A split that is not real: take the server's copy, or keep ours and write it over. */
function settleFalseSplit(ctx: StoreContext, remote: SaveSide): void {
  if (!cloudDirty(ctx) && !ctx.phoneDirty) {
    adopt(ctx, remote.mountain, remote.lastSeen ?? ctx.session.lastSeen);
    ctx.rev = Math.max(ctx.rev, remote.rev);
    ctx.syncedRev = Math.max(ctx.syncedRev, remote.rev);
    return;
  }
  ctx.rev = Math.max(ctx.rev, remote.rev);
  if (remote.rev > ctx.syncedRev) {
    ctx.syncedRev = remote.rev;
  }
  markCloudDirty(ctx);
  ctx.phoneDirty = true;
}

/** One copy leads: play it, keeping taps the merge would drop. */
function fastForward(
  ctx: StoreContext,
  merged: MergedCopy,
  remote: SaveSide,
  tapped: number,
): void {
  let next = merged.mountain;
  if (tapped > 0 && minedOut(next) === minedOut(remote.mountain)) {
    next = digStones(next, tapped);
  }
  const keptTap = next !== merged.mountain;
  adopt(ctx, next, merged.lastSeen ?? ctx.session.lastSeen);
  ctx.rev = Math.max(ctx.rev, merged.rev, remote.rev);
  ctx.syncedRev = Math.max(ctx.syncedRev, remote.rev);
  if (merged.differsFromRemote || keptTap) {
    markCloudDirty(ctx);
    ctx.phoneDirty = true;
  } else {
    ctx.phoneDirty = false;
  }
}

type MergedCopy = Exclude<MergeResult, { kind: "conflict" }>;

/**
 * Fast-forward when one copy leads. A real split opens the sheet and
 * leaves both copies alone. Returns "conflict" when the sheet is up.
 */
export function applyMerged(
  ctx: StoreContext,
  remote: SaveSide,
  tapped = 0,
): "conflict" | "applied" {
  if (ctx.saveConflict !== undefined) {
    return "conflict";
  }
  const { mountain, lastSeen } = ctx.session;
  const merged = mergeSaves(
    { mountain, lastSeen, rev: ctx.rev },
    { mountain: remote.mountain, lastSeen: remote.lastSeen, rev: remote.rev },
  );
  if (merged.kind !== "conflict") {
    fastForward(ctx, merged, remote, tapped);
    return "applied";
  }
  if (unsettledCopy(ctx, remote)) {
    openConflict(ctx, remote);
    return "conflict";
  }
  settleFalseSplit(ctx, remote);
  return "applied";
}

/** A rev the rules refused. Read the server copy, merge, write one higher. */
export function reconcileRev(
  ctx: StoreContext,
  uid: string,
  generation: number,
  counts: { mined: number; pocket: number },
): Promise<void> {
  return ctx.ports.cloudSave.load({ uid, fresh: true }).then((loaded) => {
    if (ctx.disposed || generation !== ctx.hydrateGeneration) {
      return;
    }
    if (loaded.kind !== "found" || loaded.pending === true) {
      landWrite(ctx);
      writeRefused(ctx, "permission-denied", { ...counts, rev: ctx.rev });
      return;
    }
    noteServerSeen(ctx, true);
    const serverRev = loaded.rev ?? 0;
    if (
      serverRev >= ctx.rev &&
      applyMerged(ctx, remoteSide({ ...loaded, rev: serverRev })) === "conflict"
    ) {
      landWrite(ctx);
      return;
    }
    ctx.syncedRev = serverRev;
    ctx.consecutiveRevMerges += 1;
    markCloudDirty(ctx);
    ctx.phoneDirty = true;
    persistPhoneBackup(ctx);
    landWrite(ctx);
    if (ctx.consecutiveRevMerges > 5) {
      writeRefused(ctx, "rev", { ...counts, rev: serverRev });
      return;
    }
    persistCloudSoon(ctx, true);
    emit(ctx);
  });
}

function writeRefused(
  ctx: StoreContext,
  id: "permission-denied" | "rev",
  data: { mined: number; pocket: number; rev: number },
): void {
  ctx.saveKind = "error";
  record(ctx, "save.error", { source: "write", id });
  log(ctx, {
    level: "error",
    code: "save.write",
    detail: id,
    data: { ...data, deviceId: ctx.ports.deviceId },
  });
  emit(ctx);
}
