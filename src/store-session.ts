/**
 * Runs the session core for the store: each step's effects go through the
 * store's ports, and each change is shown to the listeners as one snapshot.
 */
import { persistCloudSoon } from "./cloud-writer";
import { formatLogEvent } from "./log";
import {
  keepFieldRing,
  persistSession,
  rememberHomecomings,
} from "./local-saves";
import {
  activeTrouble,
  step,
  type SessionEffect,
  type SessionInput,
  type Stepped,
} from "./session";
import {
  canPlay,
  holding,
  isWriter,
  log,
  ready,
  record,
  type ProgressSnapshot,
  type StoreContext,
} from "./store-context";

/** One session step, its effects run in order. */
export function runStep(ctx: StoreContext, input: SessionInput): Stepped {
  const stepped = step(ctx.session, input, ctx.ports.now());
  ctx.session = stepped.session;
  for (const effect of stepped.effects) {
    applyEffect(ctx, effect);
  }
  return stepped;
}

function applyEffect(ctx: StoreContext, effect: SessionEffect): void {
  switch (effect.kind) {
    case "record":
      record(ctx, effect.code, effect.data);
      return;
    case "log":
      log(ctx, effect.event);
      return;
    case "remember":
      rememberHomecomings(ctx);
      return;
    case "granted":
      persistSession(ctx);
      persistCloudSoon(ctx);
      return;
    case "moved":
      return;
  }
}

/** The crew's work up to now, unless a fresh read holds it. Returns stones mined. */
export function settleCrew(ctx: StoreContext): number {
  return holding(ctx) ? 0 : runStep(ctx, { kind: "tick" }).mined;
}

/** Settles the crew's work if this tab is playing (hide, a yield). */
export function settleIfPlaying(ctx: StoreContext): void {
  if (canPlay(ctx)) {
    settleCrew(ctx);
  }
}

export function snapshot(ctx: StoreContext): ProgressSnapshot {
  const latest = ctx.ports.logger.latest();
  const news = ctx.session.news;
  const tabWriter = ctx.ports.tabWriter;
  return {
    mountain: ctx.session.mountain,
    saveKind: ctx.saveKind,
    ready: ready(ctx),
    log: latest === undefined ? undefined : formatLogEvent(latest),
    notices: news.notices,
    awayGap: news.awayGap,
    homecomings: news.homecomings,
    trouble: activeTrouble(ctx.session),
    playing: isWriter(ctx) && ready(ctx),
    elsewhere: tabWriter !== undefined && tabWriter.seat() === "other",
    ...(ctx.saveConflict === undefined
      ? {}
      : { saveConflict: ctx.saveConflict }),
  };
}

/**
 * Notes the relics, bands and crafts reached (not while a signed-in save is
 * still loading, nor under the conflict sheet), then tells every listener.
 */
export function emit(ctx: StoreContext): void {
  ctx.session = {
    ...ctx.session,
    news: { ...ctx.session.news, pending: false },
  };
  if (ctx.saveConflict === undefined && ready(ctx)) {
    runStep(ctx, { kind: "notice" });
  }
  keepFieldRing(ctx, false);
  const next = snapshot(ctx);
  for (const listener of [...ctx.listeners]) {
    listener(next);
  }
}
