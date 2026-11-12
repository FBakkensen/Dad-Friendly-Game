/**
 * The fresh server read on becoming visible: cloud writes and the crew's pay
 * wait for it. Taps during the read stay on the phone and are dug back on if
 * the merge would drop them. A read that never returns gives up and retries.
 */
import type { CloudLoadResult } from "./cloud-save";
import {
  cancelQueuedWrite,
  markCloudDirty,
  persistCloudSoon,
} from "./cloud-writer";
import { persistPhoneBackup } from "./local-saves";
import { minedOut } from "./mountain";
import { applyMerged } from "./save-adopt";
import { stonesLeft } from "./scale";
import { saveCounts } from "./session";
import {
  cancelRetry,
  cloudDirty,
  endHold,
  isWriter,
  LISTEN_BACKOFF_START_MS,
  log,
  noteServerSeen,
  record,
  remoteSide,
  scheduleRetry,
  serverSeen,
  uidOf,
  type StoreContext,
} from "./store-context";
import { emit } from "./store-session";

type ReadOutcome = CloudLoadResult | "timeout" | "rejected";

/** One fresh read at a time: a second ask shares the first. */
export function freshServerRead(ctx: StoreContext): Promise<void> {
  if (ctx.freshFlight !== undefined) {
    return ctx.freshFlight;
  }
  const flight = readServer(ctx).finally(() => {
    if (ctx.freshFlight === flight) {
      ctx.freshFlight = undefined;
    }
  });
  ctx.freshFlight = flight;
  return flight;
}

function readServer(ctx: StoreContext): Promise<void> {
  if (!isWriter(ctx) || ctx.disposed || ctx.saveConflict !== undefined) {
    return Promise.resolve();
  }
  const uid = uidOf(ctx);
  /* v8 ignore next 3 -- resume and openFresh only call this once hydrated */
  if (uid === undefined || !ctx.hydrated) {
    return Promise.resolve();
  }
  const generation = ctx.hydrateGeneration;
  // Counted in pocket stones: deep bands and kid runs dig less than one
  // stone of depth per stone, so a depth difference is not a tap count.
  const leftAtHold = stonesLeft(ctx.session.mountain);
  ctx.read = { kind: "holding", wasSeen: serverSeen(ctx) };
  cancelQueuedWrite(ctx);
  persistPhoneBackup(ctx);
  return loadOrGiveUp(ctx, uid).then((loaded) => {
    if (ctx.disposed || generation !== ctx.hydrateGeneration) {
      // The watch it was for is over, and that ended its hold.
      return;
    }
    if (!isWriter(ctx)) {
      endHold(ctx);
      return;
    }
    if (loaded === "timeout" || loaded === "rejected") {
      gaveUp(ctx, loaded);
      return;
    }
    if (
      !readAnswered(ctx, loaded, leftAtHold - stonesLeft(ctx.session.mountain))
    ) {
      return;
    }
    ctx.resumeRetry.backoffMs = LISTEN_BACKOFF_START_MS;
    endHold(ctx);
    if (serverSeen(ctx) && cloudDirty(ctx) && isWriter(ctx)) {
      persistCloudSoon(ctx, false, true);
    }
  });
}

/**
 * The watch changed hands (#481): its read on resume, the give-up timer and
 * the retry end with it, so the next watch starts with nothing held.
 */
export function endResumeRead(ctx: StoreContext): void {
  if (ctx.resumeTimer !== undefined) {
    clearTimeout(ctx.resumeTimer);
    ctx.resumeTimer = undefined;
  }
  cancelRetry(ctx.resumeRetry);
  ctx.resumeRetry.backoffMs = LISTEN_BACKOFF_START_MS;
  ctx.freshFlight = undefined;
  ctx.read = { kind: "unseen" };
}

/** The server's answer, or a give-up after the timeout or a rejected read. */
function loadOrGiveUp(ctx: StoreContext, uid: string): Promise<ReadOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: ReadOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      // A read from an account that has gone leaves the next one's timer.
      if (ctx.resumeTimer === timer) {
        ctx.resumeTimer = undefined;
      }
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish("timeout");
    }, ctx.ports.resumeReadTimeoutMs);
    ctx.resumeTimer = timer;
    ctx.ports.cloudSave.load({ uid, fresh: true }).then(
      (loaded) => {
        finish(loaded);
      },
      () => {
        finish("rejected");
      },
    );
  });
}

function resumeLine(
  ctx: StoreContext,
  level: "info" | "error",
  detail: string,
  rev: number,
): void {
  const mountain = ctx.session.mountain;
  record(ctx, "save.resume", { rev, stones: minedOut(mountain) });
  log(ctx, {
    level,
    code: "save.resume",
    detail,
    data: { ...saveCounts(mountain), rev, deviceId: ctx.ports.deviceId },
  });
}

function gaveUp(ctx: StoreContext, why: "timeout" | "rejected"): void {
  ctx.read = { kind: "unseen" };
  resumeLine(ctx, "error", why, ctx.rev);
  scheduleResumeRetry(ctx);
}

/**
 * Merges what the server said. False when the conflict sheet opened, which
 * ends the hold and leaves the copies to the player.
 */
function readAnswered(
  ctx: StoreContext,
  loaded: CloudLoadResult,
  tapped: number,
): boolean {
  if (loaded.kind === "found" && loaded.pending !== true) {
    noteServerSeen(ctx, true);
    const serverRev = loaded.rev ?? 0;
    const outcome = applyMerged(
      ctx,
      remoteSide({ ...loaded, rev: serverRev }),
      tapped,
    );
    resumeLine(
      ctx,
      "info",
      outcome === "conflict" ? "conflict" : "fresh",
      serverRev,
    );
    if (outcome === "conflict") {
      endHold(ctx);
      return false;
    }
    persistPhoneBackup(ctx);
    emit(ctx);
    return true;
  }
  if (loaded.kind === "missing") {
    noteServerSeen(ctx, true);
    markCloudDirty(ctx);
    resumeLine(ctx, "info", "missing", ctx.rev);
    return true;
  }
  noteServerSeen(ctx, false);
  resumeLine(ctx, "error", loaded.kind, ctx.rev);
  return true;
}

function scheduleResumeRetry(ctx: StoreContext): void {
  if (ctx.disposed || ctx.resumeRetry.timer !== undefined) {
    return;
  }
  scheduleRetry(ctx.resumeRetry, () => {
    if (ctx.disposed || !isWriter(ctx) || serverSeen(ctx)) {
      return;
    }
    void freshServerRead(ctx);
  });
}
