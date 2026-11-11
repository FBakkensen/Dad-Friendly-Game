/**
 * The cloud write pipeline and the field log's copy. Taps are unbounded:
 * one write is in flight, the next waits out a second, and the newest
 * mountain is what that next write sends. Every result is logged.
 */
import {
  APP_VERSION,
  EVENT_RING_LIMIT,
  fieldErrorId,
  fieldLogFingerprint,
  shouldWriteFieldLog,
  snapshot as fieldSnapshot,
  type FieldLog,
  type FieldLogDocument,
  type FieldLogWriteReason,
} from "./field-log";
import { persistPhoneBackup } from "./local-saves";
import type { Mountain } from "./mountain";
import { saveEchoKey } from "./phone-backup";
import { effectiveRates } from "./rates";
import { saveCounts } from "./session";
import {
  cloudDirty,
  deviceLabel,
  holding,
  isWriter,
  log,
  record,
  serverSeen,
  uidOf,
  type StoreContext,
} from "./store-context";

/** A change waits for the cloud. A write in flight takes it next. */
export function markCloudDirty(ctx: StoreContext, expedite = false): void {
  const write = ctx.write;
  const rush = write.expedite || expedite;
  ctx.write =
    write.kind === "flying"
      ? { kind: "flying", next: "waiting", expedite: rush }
      : write.kind === "queued"
        ? { ...write, expedite: rush }
        : { kind: "dirty", expedite: rush };
}

/** Nothing waits for the cloud: a queued write is dropped, one in flight takes nothing after it. */
export function markCloudClean(ctx: StoreContext): void {
  cancelQueuedWrite(ctx);
  const write = ctx.write;
  ctx.write =
    write.kind === "flying"
      ? { ...write, next: "none" }
      : { kind: "clean", expedite: write.expedite };
}

/** Stops waiting out the gap. The change still waits for the cloud. */
export function cancelQueuedWrite(ctx: StoreContext): void {
  const write = ctx.write;
  if (write.kind !== "queued") {
    return;
  }
  clearTimeout(write.timer);
  ctx.write = { kind: "dirty", expedite: write.expedite };
}

/** Back to no write in flight: a newer change that waited is still dirty. */
export function landWrite(ctx: StoreContext): void {
  const write = ctx.write;
  if (write.kind !== "flying") {
    return;
  }
  ctx.write =
    write.next === "waiting"
      ? { kind: "dirty", expedite: write.expedite }
      : { kind: "clean", expedite: write.expedite };
}

/** Forgets the pipeline: the account or the watch changed. */
export function resetWrite(ctx: StoreContext): void {
  cancelQueuedWrite(ctx);
  ctx.write = { kind: "clean", expedite: false };
}

/** A write is queued or in flight. */
function writeUnderway(ctx: StoreContext): boolean {
  return ctx.write.kind === "queued" || ctx.write.kind === "flying";
}

/**
 * Sends the newest mountain once the gap since the last write has passed.
 * Hide and a new run (`expedite`) skip the wait once the in-flight write
 * returns.
 */
export function persistCloudSoon(
  ctx: StoreContext,
  retry = false,
  expedite = false,
): void {
  if (
    uidOf(ctx) === undefined ||
    !ctx.hydrated ||
    ctx.disposed ||
    ctx.saveConflict !== undefined
  ) {
    return;
  }
  if (!retry) {
    ctx.consecutiveRevMerges = 0;
  }
  markCloudDirty(ctx, expedite);
  if (ctx.write.kind === "flying") {
    return;
  }
  cancelQueuedWrite(ctx);
  const rush = ctx.write.expedite;
  const now = ctx.ports.now();
  const wait = rush
    ? 0
    : ctx.lastCloudWriteAt + ctx.ports.cloudWriteGapMs - now;
  if (wait <= 0) {
    persistCloud(ctx, retry);
    return;
  }
  const timer = setTimeout(() => {
    ctx.write = { kind: "dirty", expedite: ctx.write.expedite };
    persistCloud(ctx, retry);
  }, wait);
  ctx.write = { kind: "queued", expedite: rush, timer };
}

/** The cloud is behind the phone. A write already queued or in flight carries it. */
export function healCloud(ctx: StoreContext): void {
  if (writeUnderway(ctx)) {
    return;
  }
  persistCloudSoon(ctx);
}

/** Sends one write now, unless a hold, an unseen server, or the conflict sheet keeps it waiting. */
function persistCloud(ctx: StoreContext, retry: boolean): void {
  cancelQueuedWrite(ctx);
  const uid = uidOf(ctx);
  if (uid === undefined || !ctx.hydrated || ctx.disposed || !isWriter(ctx)) {
    return;
  }
  if (holding(ctx) || !serverSeen(ctx) || ctx.saveConflict !== undefined) {
    markCloudDirty(ctx);
    return;
  }
  const { mountain, lastSeen } = ctx.session;
  const sent = {
    uid,
    mountain,
    lastSeen: lastSeen ?? ctx.ports.now(),
    rev: ctx.syncedRev + 1,
    deviceId: ctx.ports.deviceId,
    deviceLabel: deviceLabel(ctx),
  };
  const echo = saveEchoKey(mountain, sent.lastSeen, sent.rev, sent.deviceId);
  ctx.echoes.push(echo);
  if (ctx.echoes.length > 8) {
    ctx.echoes.shift();
  }
  ctx.write = { kind: "flying", next: "none", expedite: false };
  ctx.lastCloudWriteAt = ctx.ports.now();
  const flight: Flight = {
    uid,
    generation: ctx.hydrateGeneration,
    rev: sent.rev,
    echo,
    counts: saveCounts(mountain),
    retry,
  };
  void ctx.ports.cloudSave.write(sent).then((result) => {
    if (ctx.disposed || flight.generation !== ctx.hydrateGeneration) {
      return;
    }
    switch (result.kind) {
      case "ok":
        writeAccepted(ctx, flight);
        break;
      case "rejected":
        dropEcho(ctx, echo);
        void ctx.hooks.reconcile(uid, flight.generation, flight.counts);
        return;
      case "failed":
        writeFailed(ctx, flight, result.message);
        break;
      /* v8 ignore next 5 -- exhaustiveness guard, unreachable */
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
    ctx.hooks.emit();
  });
}

/** One write in flight, as its result needs it. */
type Flight = {
  readonly uid: string;
  readonly generation: number;
  readonly rev: number;
  readonly echo: string;
  readonly counts: { mined: number; pocket: number };
  readonly retry: boolean;
};

function writeAccepted(ctx: StoreContext, flight: Flight): void {
  ctx.syncedRev = flight.rev;
  ctx.rev = Math.max(ctx.rev, flight.rev);
  ctx.phoneDirty = false;
  ctx.consecutiveRevMerges = 0;
  ctx.saveKind = "account";
  log(ctx, {
    level: "info",
    code: "save.write",
    detail: "ok",
    data: { ...flight.counts, rev: flight.rev, deviceId: ctx.ports.deviceId },
  });
  persistPhoneBackup(ctx);
  finishFlight(ctx);
}

function writeFailed(ctx: StoreContext, flight: Flight, message: string): void {
  dropEcho(ctx, flight.echo);
  ctx.saveKind = "error";
  record(ctx, "save.error", { source: "write", id: fieldErrorId(message) });
  log(ctx, {
    level: "error",
    code: "save.write",
    detail: message,
    data: { ...flight.counts, rev: flight.rev, deviceId: ctx.ports.deviceId },
  });
  landWrite(ctx);
  if (!flight.retry) {
    persistCloudSoon(ctx, true);
  }
}

/** The write returned. A newer mountain that waited goes next. */
function finishFlight(ctx: StoreContext): void {
  landWrite(ctx);
  if (!cloudDirty(ctx) || !isWriter(ctx) || holding(ctx) || !serverSeen(ctx)) {
    return;
  }
  persistCloudSoon(ctx);
}

function dropEcho(ctx: StoreContext, echo: string): void {
  const index = ctx.echoes.indexOf(echo);
  if (index >= 0) {
    ctx.echoes.splice(index, 1);
  }
}

/** True, and forgotten, when a snapshot is the echo of a write we sent. */
export function takeEcho(
  ctx: StoreContext,
  remote: {
    mountain: Mountain;
    lastSeen?: number | undefined;
    rev?: number;
    deviceId?: string;
  },
): boolean {
  const key = saveEchoKey(
    remote.mountain,
    remote.lastSeen ?? 0,
    remote.rev ?? 0,
    remote.deviceId ?? "",
  );
  const index = ctx.echoes.lastIndexOf(key);
  if (index < 0) {
    return false;
  }
  ctx.echoes.splice(index, 1);
  return true;
}

export function fieldSnapshotNow(ctx: StoreContext): FieldLog["snapshot"] {
  const at = ctx.ports.now();
  const mountain = ctx.session.mountain;
  return fieldSnapshot(
    mountain,
    effectiveRates(mountain, at),
    at,
    APP_VERSION,
    { deviceId: ctx.ports.deviceId, rev: ctx.rev },
  );
}

/**
 * Copies the ring for a signed-in dad. Interval writes wait out the gap;
 * hide and a new run write immediately. An unchanged log does not write.
 */
export function persistFieldLog(
  ctx: StoreContext,
  reason: FieldLogWriteReason,
): void {
  const uid = uidOf(ctx);
  if (uid === undefined || !ctx.hydrated || ctx.disposed || !isWriter(ctx)) {
    return;
  }
  const now = ctx.ports.now();
  const logDocument: FieldLogDocument = {
    snapshot: fieldSnapshotNow(ctx),
    events: ctx.ring.last(EVENT_RING_LIMIT),
    updatedAt: now,
  };
  const fingerprint = fieldLogFingerprint(logDocument);
  const changed =
    ctx.fieldLogFingerprint === undefined ||
    ctx.fieldLogFingerprint !== fingerprint;
  if (
    !shouldWriteFieldLog({
      changed,
      lastWrittenAt: ctx.fieldLogAt,
      now,
      reason,
      gapMs: ctx.ports.fieldLogWriteGapMs,
    })
  ) {
    return;
  }
  const generation = ctx.hydrateGeneration;
  ctx.fieldLogAt = now;
  ctx.fieldLogFingerprint = fingerprint;
  void ctx.ports.cloudSave
    .writeFieldLog({ uid, log: logDocument })
    .then((result) => {
      if (
        ctx.disposed ||
        generation !== ctx.hydrateGeneration ||
        result.kind === "ok"
      ) {
        return;
      }
      ctx.fieldLogFingerprint = undefined;
      record(ctx, "save.error", {
        source: "field-log",
        id: fieldErrorId(result.message),
      });
      log(ctx, {
        level: "error",
        code: "field-log.write",
        detail: result.message,
        data: {},
      });
      ctx.hooks.emit();
    });
}
