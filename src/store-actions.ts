/**
 * What the player and the page do to the store: ticks, moves, trouble taps,
 * a new run, hide, and closing. Each runs the session step, then saves and
 * shows what changed.
 */
import {
  cancelQueuedWrite,
  persistCloudSoon,
  persistFieldLog,
} from "./cloud-writer";
import {
  keepFieldRing,
  persistPhoneBackup,
  persistSession,
} from "./local-saves";
import type { Mountain } from "./mountain";
import { freshServerRead } from "./server-read";
import {
  activeTrouble,
  hasNews,
  saveCounts,
  troubleMark,
  type DismissTarget,
  type SessionInput,
  type Stepped,
} from "./session";
import {
  canPlay,
  cancelRetry,
  isWriter,
  log,
  playBlock,
  record,
  signedIn,
  type PlayBlock,
  type StoreContext,
} from "./store-context";
import { emit, runStep, settleCrew, settleIfPlaying } from "./store-session";
import type { TroubleTier } from "./hazards";

/** What a dispatched move did (#409): applied, with what it spent and gained, or why not. */
export type DispatchResult =
  | {
      readonly kind: "applied";
      readonly spent: number;
      readonly gained: number;
    }
  | { readonly kind: "refused"; readonly reason: "not-playing" | "no-change" };

type Change = Extract<SessionInput, { kind: "move" } | { kind: "change" }>;

/**
 * Commits one change after settling the crew's work. Undefined when the
 * session is not playing (#409).
 */
export function commit(ctx: StoreContext, input: Change): Stepped | undefined {
  if (!canPlay(ctx)) {
    return undefined;
  }
  const beforeTrouble = troubleMark(ctx.session);
  const mined = settleCrew(ctx);
  const settled = ctx.session.mountain;
  const stepped = runStep(ctx, input);
  if (ctx.session.mountain === settled) {
    if (
      mined > 0 ||
      troubleMark(ctx.session) !== beforeTrouble ||
      ctx.session.news.pending
    ) {
      persistPhoneBackup(ctx);
      emit(ctx);
    }
    return stepped;
  }
  ctx.phoneDirty = true;
  persistCloudSoon(ctx);
  persistFieldLog(ctx, "interval");
  persistSession(ctx);
  persistPhoneBackup(ctx);
  emit(ctx);
  return stepped;
}

/** A move through the one commit path; the rules are `applyMove`'s. */
export function dispatchMove(
  ctx: StoreContext,
  input: Extract<Change, { kind: "move" }>,
): DispatchResult {
  const stepped = commit(ctx, input);
  if (stepped === undefined) {
    return { kind: "refused", reason: "not-playing" };
  }
  for (const effect of stepped.effects) {
    if (effect.kind === "moved" && effect.result.kind === "applied") {
      const { spent, gained } = effect.result;
      return { kind: "applied", spent, gained };
    }
  }
  return { kind: "refused", reason: "no-change" };
}

/** Settles helpers' work for display. A phone backup follows a change. */
export function tickStore(ctx: StoreContext): void {
  noteLoading(ctx);
  if (!canPlay(ctx)) {
    return;
  }
  const before = ctx.session;
  const beforeTrouble = troubleMark(before);
  const mined = settleCrew(ctx);
  const moved = ctx.session.mountain !== before.mountain;
  if (moved || ctx.session.lastSeen !== before.lastSeen) {
    persistPhoneBackup(ctx);
  }
  if (
    mined > 0 ||
    moved ||
    troubleMark(ctx.session) !== beforeTrouble ||
    ctx.session.news.pending
  ) {
    emit(ctx);
  }
}

/** How long the save may stay loading before the field log says so (#479). */
export const LOADING_LOG_MS = 30_000;

/**
 * A signed-in save still loading holds play back, and quietly: the board
 * shows the mountain while nothing can be bought or started over. Once that
 * lasts, the field log and the save line say so, and say when it ends.
 */
function noteLoading(ctx: StoreContext): void {
  const now = ctx.ports.now();
  const since = ctx.loadingSince;
  if (playBlock(ctx) !== "loading") {
    ctx.loadingSince = undefined;
    if (since?.logged === true) {
      record(ctx, "save.loaded", { ms: Math.round(now - since.at) });
      emit(ctx);
    }
    return;
  }
  if (since === undefined) {
    ctx.loadingSince = { at: now, logged: false };
    return;
  }
  if (since.logged || now - since.at < LOADING_LOG_MS) {
    return;
  }
  ctx.loadingSince = { at: since.at, logged: true };
  record(ctx, "save.stuck", {
    source: ctx.read.kind,
    ms: Math.round(now - since.at),
  });
  log(ctx, {
    level: "error",
    code: "save.stuck",
    detail: `read ${ctx.read.kind}, write ${ctx.write.kind}`,
    data: saveCounts(ctx.session.mountain),
  });
  emit(ctx);
}

/** One tap, or a short hold, on a troubled card. */
export function troubleTap(
  ctx: StoreContext,
  kind: "press" | "fix",
  tier: TroubleTier,
): void {
  if (!canPlay(ctx)) {
    return;
  }
  const before = troubleMark(ctx.session);
  settleCrew(ctx);
  if (activeTrouble(ctx.session)?.tier !== tier) {
    if (troubleMark(ctx.session) !== before) {
      emit(ctx);
    }
    return;
  }
  runStep(ctx, { kind, tier });
  emit(ctx);
}

export function previewTrouble(ctx: StoreContext, tier: TroubleTier): void {
  if (!canPlay(ctx)) {
    return;
  }
  runStep(ctx, { kind: "preview-trouble", tier });
  emit(ctx);
}

/**
 * A new run the store will not start, said in the field log and on the save
 * line (#479): a press that does nothing must at least leave a trace.
 */
function refuseRun(
  ctx: StoreContext,
  code: "run.start-over" | "run.pass",
  block: PlayBlock,
): void {
  if (block === "closed") {
    return;
  }
  const id = code === "run.pass" ? "pass" : "start-over";
  record(ctx, "run.refused", { id, source: block });
  log(ctx, {
    level: "error",
    code: "run.refused",
    detail: `${id} ${block}`,
    data: saveCounts(ctx.session.mountain),
  });
  emit(ctx);
}

/** Starts a new run (Start over, or the mine passed down), saved at once. */
export function beginRun(
  ctx: StoreContext,
  next: Mountain,
  detail: string,
  code: "run.start-over" | "run.pass",
): boolean {
  const block = playBlock(ctx);
  if (block !== undefined) {
    refuseRun(ctx, code, block);
    return false;
  }
  cancelQueuedWrite(ctx);
  runStep(ctx, { kind: "begin", mountain: next });
  // Tonight starts with the new run; the field log keeps the old one (#479).
  ctx.ring.mark();
  record(ctx, code, {});
  log(ctx, {
    level: "info",
    code: "save.reset",
    detail,
    data: saveCounts(ctx.session.mountain),
  });
  persistPhoneBackup(ctx);
  persistSession(ctx);
  persistCloudSoon(ctx, false, true);
  persistFieldLog(ctx, "reset");
  keepFieldRing(ctx, true);
  emit(ctx);
  return true;
}

export function dismissNews(ctx: StoreContext, what: DismissTarget): void {
  if (!hasNews(ctx.session, what)) {
    return;
  }
  runStep(ctx, { kind: "dismiss", what });
  emit(ctx);
}

/** Hide and pagehide: settle, then save everywhere at once. */
export function flushStore(ctx: StoreContext): void {
  if (ctx.disposed) {
    return;
  }
  settleIfPlaying(ctx);
  persistPhoneBackup(ctx);
  persistCloudSoon(ctx, false, true);
  persistFieldLog(ctx, "hide");
  keepFieldRing(ctx, true);
  if (ctx.saveKind === "session") {
    persistSession(ctx);
  }
  if (ctx.session.news.pending) {
    emit(ctx);
  }
}

/** On becoming visible: read the server before another cloud write. */
export function resumeStore(
  ctx: StoreContext,
):
  | { readonly kind: "idle" }
  | { readonly kind: "reading"; readonly done: Promise<void> } {
  ctx.ports.tabWriter?.confirm();
  if (!isWriter(ctx) || !signedIn(ctx) || !ctx.hydrated) {
    return { kind: "idle" };
  }
  return { kind: "reading", done: freshServerRead(ctx) };
}

export function disposeStore(ctx: StoreContext, unsubscribe: () => void): void {
  ctx.disposed = true;
  if (ctx.resumeTimer !== undefined) {
    clearTimeout(ctx.resumeTimer);
    ctx.resumeTimer = undefined;
  }
  cancelRetry(ctx.resumeRetry);
  unsubscribe();
  ctx.ports.tabWriter?.dispose();
  cancelQueuedWrite(ctx);
  cancelRetry(ctx.listenRetry);
  ctx.hydrateGeneration += 1;
  ctx.unwatch?.();
  ctx.unwatch = undefined;
  ctx.listeners.clear();
}
