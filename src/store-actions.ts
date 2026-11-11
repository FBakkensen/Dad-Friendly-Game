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
import { persistPhoneBackup, persistSession } from "./local-saves";
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
import { settleNow } from "./save-watch";
import {
  canPlay,
  cancelRetry,
  holding,
  isWriter,
  log,
  record,
  signedIn,
  type StoreContext,
} from "./store-context";
import { emit, runStep } from "./store-session";
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

/** The crew's work up to now, unless a fresh read holds it. Returns stones mined. */
function settle(ctx: StoreContext): number {
  return holding(ctx) ? 0 : runStep(ctx, { kind: "tick" }).mined;
}

/**
 * Commits one change after settling the crew's work. Undefined when the
 * session is not playing (#409).
 */
export function commit(ctx: StoreContext, input: Change): Stepped | undefined {
  if (!canPlay(ctx)) {
    return undefined;
  }
  const beforeTrouble = troubleMark(ctx.session);
  const mined = settle(ctx);
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
  if (!canPlay(ctx)) {
    return;
  }
  const before = ctx.session;
  const beforeTrouble = troubleMark(before);
  const mined = settle(ctx);
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
  settle(ctx);
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

/** Starts a new run (Start over, or the mine passed down), saved at once. */
export function beginRun(
  ctx: StoreContext,
  next: Mountain,
  detail: string,
  code: "run.start-over" | "run.pass",
): boolean {
  if (!canPlay(ctx)) {
    return false;
  }
  cancelQueuedWrite(ctx);
  runStep(ctx, { kind: "begin", mountain: next });
  ctx.ring.clear();
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
  settleNow(ctx);
  persistPhoneBackup(ctx);
  persistCloudSoon(ctx, false, true);
  persistFieldLog(ctx, "hide");
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
