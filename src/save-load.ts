/**
 * The cloud document as it arrives: the first copy of an open, another
 * device's newer save, an echo of our own write, or a failure to reach it.
 * Launch keeps the copy that is ahead (`observable-saves.md`).
 */
import { archiveWithin } from "./archive-wait";
import { applySignedInSave, type CloudLoadResult } from "./cloud-save";
import { healCloud, persistCloudSoon, takeEcho } from "./cloud-writer";
import {
  clearHomecomings,
  persistPhoneBackup,
  readHomecomings,
} from "./local-saves";
import {
  createMountain,
  minedOut,
  runStartedAt,
  type Mountain,
} from "./mountain";
import { applyMerged } from "./save-adopt";
import { compareSaveProgress, type SaveMoment } from "./save-progress";
import { freshServerRead } from "./server-read";
import { markWelcomed, openBaselines, saveCounts } from "./session";
import {
  adopt,
  canWrite,
  cloudDirty,
  holdNewer,
  holding,
  isWriter,
  LISTEN_BACKOFF_START_MS,
  log,
  logCounts,
  noteServerSeen,
  record,
  remoteSide,
  scheduleRetry,
  serverSeen,
  signedIn,
  uidOf,
  type StoreContext,
} from "./store-context";
import { emit, runStep } from "./store-session";

type Found = Extract<CloudLoadResult, { kind: "found" }>;

export function localMoment(ctx: StoreContext): SaveMoment {
  return { mountain: ctx.session.mountain, lastSeen: ctx.session.lastSeen };
}

/**
 * A phone that has never saved is not a copy: anything played or bought makes
 * it one. So does a later run, unless a set-aside only stamped a fresh
 * mountain with the run it replaced (#558).
 */
export function hasLocalProgress(ctx: StoreContext): boolean {
  const { mountain, lastSeen } = ctx.session;
  return lastSeen !== undefined || anyProgress(mountain, !ctx.blankReset);
}

function anyProgress(mountain: Mountain, countStamp: boolean): boolean {
  return (
    minedOut(mountain) > 0 ||
    (countStamp && runStartedAt(mountain) > 0) ||
    [
      mountain.pocket,
      mountain.helpers,
      mountain.carts,
      mountain.drills,
      mountain.borers,
      mountain.machines,
      mountain.kids,
      mountain.legacy,
    ].some((count) => count > 0)
  );
}

/**
 * A copy comes into play: the news baselines, the homecomings a reload
 * left, and the pay for time away since `since` (when `pay`). Returns the
 * stones paid.
 */
export function openSession(
  ctx: StoreContext,
  options: {
    readonly pay: boolean;
    readonly since: number | undefined;
    readonly rebase: boolean;
  },
): { paid: number } {
  ctx.session = openBaselines(ctx.session, options.rebase);
  runStep(ctx, { kind: "recall", homecomings: readHomecomings(ctx) });
  const paid = options.pay ? payAway(ctx, options.since) : 0;
  ctx.session = markWelcomed(ctx.session);
  return { paid };
}

/** A copy from before this version, and where it was (#558). */
export type SetAside = {
  readonly source: "guest" | "phone" | "cloud";
  readonly version: number;
  /** Its run stamp, else 0. */
  readonly startedAt: number;
};

/**
 * Copies from before this version were set aside: Tonight starts again. A
 * played copy of this version stays in play; otherwise a fresh mountain
 * does. Either is stamped with the latest of their runs, so it is never an
 * earlier run than the one it replaced. A fresh one is not a copy until it is
 * played (`blankReset`).
 */
export function resetFresh(
  ctx: StoreContext,
  aside: readonly SetAside[],
): void {
  for (const { source, version, startedAt } of aside) {
    record(ctx, "save.set-aside", { source, id: `v${String(version)}` });
    log(ctx, {
      level: "info",
      code: "save.set-aside",
      detail: `${source} v${String(version)}`,
      data: { version, startedAt },
    });
  }
  const playing = ctx.session.mountain;
  const startedAt = Math.max(
    runStartedAt(playing),
    ...aside.map((each) => each.startedAt),
  );
  if (hasLocalProgress(ctx)) {
    // A played copy of this version is never given up for a blank one: it
    // only takes the later run stamp, so it is never an earlier run either.
    ctx.session = { ...ctx.session, mountain: { ...playing, startedAt } };
    return;
  }
  adopt(ctx, { ...createMountain(), startedAt }, undefined);
  ctx.blankReset = true;
  clearHomecomings(ctx);
}

/** Pays the time a save says we were gone, unless a fresh read or the conflict sheet holds play. */
export function payAway(ctx: StoreContext, since: number | undefined): number {
  if (holding(ctx) || ctx.saveConflict !== undefined) {
    return 0;
  }
  return runStep(ctx, { kind: "away", since }).mined;
}

/** First open, or a cloud copy that is strictly ahead. Settles once from `paidLastSeen`. */
function openFresh(
  ctx: StoreContext,
  paidLastSeen: number | undefined,
  upload: boolean,
  detail: string,
): void {
  const writing = isWriter(ctx);
  const opened = openSession(ctx, {
    pay: writing,
    since: paidLastSeen,
    rebase: false,
  });
  ctx.hydrated = true;
  ctx.saveKind = "account";
  logCounts(ctx, "save.remote", detail);
  const changed = upload || opened.paid > 0;
  if (serverSeen(ctx) && changed) {
    persistCloudSoon(ctx);
  }
  if (!serverSeen(ctx)) {
    void freshServerRead(ctx);
  }
  persistPhoneBackup(ctx);
  emit(ctx);
}

export function attachWatch(ctx: StoreContext): void {
  const uid = uidOf(ctx);
  if (ctx.disposed || uid === undefined) {
    return;
  }
  ctx.unwatch?.();
  const generation = ctx.hydrateGeneration;
  ctx.unwatch = ctx.ports.cloudSave.watch({
    uid,
    onChange: (remote) => {
      if (ctx.disposed || generation !== ctx.hydrateGeneration) {
        return;
      }
      applyRemote(ctx, remote);
    },
  });
}

function scheduleListenRetry(ctx: StoreContext): void {
  if (ctx.disposed || ctx.listenRetry.timer !== undefined || !signedIn(ctx)) {
    return;
  }
  scheduleRetry(ctx.listenRetry, () => {
    if (ctx.disposed || !signedIn(ctx)) {
      return;
    }
    logCounts(ctx, "save.watch", "retry");
    attachWatch(ctx);
  });
}

/** The cloud cannot be reached. A phone with progress plays on from its backup. */
function noteRemoteFailure(
  ctx: StoreContext,
  kind: "unavailable" | "disabled",
): void {
  if (kind === "unavailable" && !ctx.hydrated && hasLocalProgress(ctx)) {
    const opened = openSession(ctx, {
      pay: true,
      since: ctx.session.lastSeen,
      rebase: false,
    });
    ctx.hydrated = true;
    if (opened.paid > 0) {
      persistPhoneBackup(ctx);
    }
  }
  if (ctx.hydrated) {
    persistPhoneBackup(ctx);
  }
  ctx.saveKind = "error";
  record(ctx, "save.error", { source: kind });
  log(ctx, {
    level: "error",
    code: "save.remote",
    detail: kind,
    data: saveCounts(ctx.session.mountain),
  });
  if (kind === "unavailable") {
    scheduleListenRetry(ctx);
  }
  emit(ctx);
}

/** Under the conflict sheet a snapshot changes nothing but the save line. */
function remoteUnderConflict(ctx: StoreContext, remote: CloudLoadResult): void {
  if (remote.kind === "unavailable" || remote.kind === "disabled") {
    ctx.saveKind = "error";
  } else if (remote.kind === "found" && remote.pending !== true) {
    noteServerSeen(ctx, true);
  }
  if (!ctx.hydrated && remote.kind !== "unavailable") {
    ctx.hydrated = true;
    ctx.saveKind = ctx.saveKind === "error" ? "error" : "account";
  }
  emit(ctx);
}

/** A snapshot from the cache or a pending write: it opens a first load, nothing more. */
function provisional(ctx: StoreContext, remote: CloudLoadResult): boolean {
  if (remote.kind === "found" && remote.pending === true) {
    if (!takeEcho(ctx, remote) && !ctx.hydrated) {
      openFresh(ctx, ctx.session.lastSeen, false, "pending");
    }
    return true;
  }
  if (
    (remote.kind === "found" || remote.kind === "missing") &&
    remote.cached === true
  ) {
    if (!ctx.hydrated) {
      openFresh(ctx, ctx.session.lastSeen, false, "cache");
    }
    return true;
  }
  return false;
}

function applyRemote(ctx: StoreContext, remote: CloudLoadResult): void {
  if (ctx.newer || remote.kind === "newer") {
    // Once a copy came from a later build, this one only waits for the update.
    holdNewer(ctx, "cloud");
    emit(ctx);
    return;
  }
  if (remote.kind === "older") {
    void setAsideCloud(ctx, remote);
    return;
  }
  if (ctx.saveConflict !== undefined) {
    remoteUnderConflict(ctx, remote);
    return;
  }
  if (remote.kind === "unavailable" || remote.kind === "disabled") {
    noteRemoteFailure(ctx, remote.kind);
    return;
  }
  if (holding(ctx) || provisional(ctx, remote)) {
    return;
  }
  const sawServer = !serverSeen(ctx);
  noteServerSeen(ctx, true);
  try {
    applyAuthoritative(ctx, remote);
  } finally {
    // Writes held until the server answered go now.
    if (
      sawServer &&
      ctx.write.kind === "dirty" &&
      !holding(ctx) &&
      isWriter(ctx)
    ) {
      persistCloudSoon(ctx);
    }
  }
}

/**
 * A cloud copy from before this version (#558): the board is held while it
 * goes to Saved copies as it was stored, then the fresh mountain (or this
 * phone's copy of this version) is written over it at the next rev. A copy
 * that does not land keeps the hold and says so on the save line.
 */
async function setAsideCloud(
  ctx: StoreContext,
  remote: Extract<CloudLoadResult, { kind: "older" }>,
): Promise<void> {
  const uid = uidOf(ctx);
  const generation = ctx.hydrateGeneration;
  if (uid === undefined || !canWrite(ctx) || ctx.settingAside === generation) {
    return;
  }
  ctx.settingAside = generation;
  ctx.hydrated = false;
  ctx.saveKind = "loading";
  emit(ctx);
  const archiveRaw = ctx.ports.cloudSave.archiveRaw;
  const { version, rev, startedAt } = remote;
  const write =
    archiveRaw === undefined
      ? Promise.resolve({ kind: "failed", message: "no archive" } as const)
      : archiveRaw({ uid, raw: remote.raw, version, rev, reason: "reset" });
  const landed = await archiveWithin(
    ctx,
    write,
    "reset",
    0,
    () =>
      !ctx.disposed &&
      generation === ctx.hydrateGeneration &&
      uidOf(ctx) === uid &&
      !ctx.hydrated,
  ).finally(() => {
    if (ctx.settingAside === generation) {
      ctx.settingAside = undefined;
    }
  });
  if (!landed) {
    if (!ctx.disposed && generation === ctx.hydrateGeneration) {
      ctx.saveKind = "error";
      emit(ctx);
    }
    return;
  }
  ctx.rev = Math.max(ctx.rev, rev);
  ctx.syncedRev = rev;
  resetFresh(ctx, [{ source: "cloud", version, startedAt }]);
  noteServerSeen(ctx, true);
  openFresh(ctx, ctx.session.lastSeen, true, "set aside");
}

/** The server's own copy (not the cache, not a pending write). */
function applyAuthoritative(
  ctx: StoreContext,
  remote: Found | Extract<CloudLoadResult, { kind: "missing" }>,
): void {
  ctx.listenRetry.backoffMs = LISTEN_BACKOFF_START_MS;
  if (remote.kind === "found" && foundAgainstRev(ctx, remote)) {
    return;
  }
  if (remote.kind === "found") {
    ctx.syncedRev = Math.max(ctx.syncedRev, remote.rev ?? 0);
    ctx.rev = Math.max(ctx.rev, remote.rev ?? 0);
  }
  const { mountain, lastSeen } = ctx.session;
  const next = applySignedInSave({
    local: mountain,
    ...(lastSeen === undefined ? {} : { localLastSeen: lastSeen }),
    remote,
  });
  // A blank phone is not a copy. A cloud document that ties it on the
  // progress stamp (same run, no stones mined, same clock) is still the save.
  if (
    remote.kind === "found" &&
    (next.mountain !== mountain || (!ctx.hydrated && !hasLocalProgress(ctx)))
  ) {
    adopt(ctx, remote.mountain, ctx.session.lastSeen);
    openFresh(ctx, remote.lastSeen, false, "found");
    return;
  }
  if (!ctx.hydrated) {
    openFresh(ctx, lastSeen, next.upload, remote.kind);
    return;
  }
  if (next.upload) {
    cloudBehind(ctx, remote);
  }
}

/**
 * Our echo, an older rev, or a newer one: each is settled here. False for
 * the same rev, which the launch rule decides.
 */
function foundAgainstRev(ctx: StoreContext, remote: Found): boolean {
  if (takeEcho(ctx, remote)) {
    const moment = { mountain: remote.mountain, lastSeen: remote.lastSeen };
    if (compareSaveProgress(localMoment(ctx), moment) > 0) {
      healCloud(ctx);
    }
    return true;
  }
  const serverRev = remote.rev ?? 0;
  if (serverRev < ctx.rev) {
    staleRev(ctx, remote, serverRev);
    return true;
  }
  if (serverRev > ctx.rev) {
    newerRev(ctx, remote, serverRev);
    return true;
  }
  return false;
}

function staleRev(ctx: StoreContext, remote: Found, serverRev: number): void {
  log(ctx, {
    level: "info",
    code: "save.remote",
    detail: "stale rev",
    data: {
      ...saveCounts(remote.mountain),
      rev: serverRev,
      deviceId: ctx.ports.deviceId,
    },
  });
  if (!ctx.hydrated) {
    openFresh(ctx, ctx.session.lastSeen, true, "stale rev");
    return;
  }
  healCloud(ctx);
  emit(ctx);
}

function newerRev(ctx: StoreContext, remote: Found, serverRev: number): void {
  if (!hasLocalProgress(ctx)) {
    adopt(ctx, remote.mountain, ctx.session.lastSeen);
    ctx.rev = serverRev;
    ctx.syncedRev = serverRev;
    ctx.phoneDirty = false;
    openFresh(ctx, remote.lastSeen, false, "found");
    return;
  }
  const outcome = applyMerged(ctx, remoteSide({ ...remote, rev: serverRev }));
  if (outcome === "conflict") {
    ctx.hydrated = true;
    ctx.saveKind = "account";
    return;
  }
  openFresh(ctx, ctx.session.lastSeen, cloudDirty(ctx), "found");
}

/** The cloud is behind this phone: write ours over it. */
function cloudBehind(
  ctx: StoreContext,
  remote: Found | Extract<CloudLoadResult, { kind: "missing" }>,
): void {
  const mountain = ctx.session.mountain;
  log(ctx, {
    level: "info",
    code: "save.remote",
    detail:
      remote.kind === "found" &&
      runStartedAt(remote.mountain) < runStartedAt(mountain)
        ? "older run ignored"
        : "behind",
    data: saveCounts(remote.kind === "found" ? remote.mountain : mountain),
  });
  healCloud(ctx);
  persistPhoneBackup(ctx);
  emit(ctx);
}
