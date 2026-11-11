/**
 * The session core: the game in play, its hazards, and the news this open
 * has not shown yet. `step(session, input, now)` is the one way a session
 * changes. It is pure: what the store must do about a change (record an
 * event, log a line, remember the homecomings, save a grant) comes back as
 * effects, and the store runs them through its ports.
 */
import { staffExisting } from "./crew";
import { grantFirstEngineer } from "./engineers";
import type { Homecoming } from "./expeditions";
import {
  engineerFixDelay,
  fix as fixHazard,
  freshHazards,
  kindForTier,
  pressTrouble as pressHazard,
  type HazardState,
  type Trouble,
  type TroubleTier,
} from "./hazards";
import { fieldEntry } from "./field-log";
import { LAYERS, layersEntered, type Layer } from "./layers";
import type { LogEvent } from "./log";
import {
  minedOut,
  runStartedAt,
  type AwayReport,
  type Mountain,
} from "./mountain";
import { relicsUncovered, type Relic } from "./relics";
import { advance, timeInput } from "./session-time";
import { recordFirstUse } from "./teach";
import {
  RECIPE_IDS,
  craftedLevel,
  grantRecipes,
  layerRecipeIds,
  type RecipeId,
} from "./workshop";
import {
  applyMove,
  type Move,
  type MoveEvent,
  type MoveResult,
} from "./economy/actions";

/** Shorter absences still pay out, quietly, without the welcome-back card. */
export const WELCOME_MIN_AWAY_MS = 60 * 1000;
/**
 * Under this (answering a text), the stones arrive with a small
 * "+N while you were away" note instead of the full card (#334).
 */
export const QUIET_AWAY_MS = 5 * 60 * 1000;

/** One settled stretch away: how long, and the moment it was settled. */
export type AwayGap = { readonly ms: number; readonly at: number };

/**
 * One fitted craft, named once. The screen words it from the mountain at
 * the moment it was fitted, so the number is the one the crew felt then.
 */
export type CraftNotice = {
  readonly id: RecipeId;
  readonly level: number;
  readonly mountain: Mountain;
  readonly at: number;
};

/** What this open has to tell, and has not shown yet. None of it is saved. */
export type SessionNews = {
  readonly away: AwayReport | undefined;
  readonly quietAway: number | undefined;
  readonly awayGap: AwayGap | undefined;
  /** The welcome-back card has had its chance this open. */
  readonly welcomed: boolean;
  readonly reveals: readonly Relic[];
  readonly layersArrived: readonly Layer[];
  readonly craftsFitted: readonly CraftNotice[];
  readonly crewJoined: number | undefined;
  readonly engineerJoined: true | undefined;
  readonly homecomings: readonly Homecoming[];
  /** Someone came home since the screen was last told. */
  readonly pending: boolean;
};

/**
 * Where news was last checked. Unset until a save is loaded, so relics,
 * bands and crafts already in a loaded save are never announced again.
 */
export type Baselines = {
  readonly reveal: number | undefined;
  readonly layer: number | undefined;
  readonly craft: Readonly<Partial<Record<RecipeId, number>>> | undefined;
};

export type Session = {
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
  readonly hazards: HazardState;
  readonly news: SessionNews;
  readonly baselines: Baselines;
};

/** A change to commit, and what the move did, for the field log. */
export type MountainChange = {
  readonly mountain: Mountain;
  readonly events: readonly MoveEvent[];
};

export type DismissTarget = "reveal" | "away" | "quiet" | "layer" | "craft";

export type SessionInput =
  /** Helpers' work up to now, live or away by the gap. */
  | { readonly kind: "tick" }
  /** Time the save says we were gone. The first payout of an open is the welcome-back card. */
  | { readonly kind: "away"; readonly since: number | undefined }
  /**
   * A player move. The store settles the crew's work first (a tick), so the
   * clock and the trouble the move sees are the settled ones.
   */
  | { readonly kind: "move"; readonly move: Move }
  /** Any change, as a move is applied, with no move events (a test seam). */
  | {
      readonly kind: "change";
      readonly update: (mountain: Mountain) => MountainChange;
    }
  /** A tap on the troubled tier (the fifth fixes it), or a short hold that fixes it. */
  | { readonly kind: "press" | "fix"; readonly tier: TroubleTier }
  /** Shows trouble at once (the layout check), since trouble is never saved. */
  | { readonly kind: "preview-trouble"; readonly tier: TroubleTier }
  /** Relics, bands and crafts reached since the baselines. */
  | { readonly kind: "notice" }
  /** The one-time free staff and first engineer for a loaded save. */
  | { readonly kind: "loaded" }
  /** A new run (Start over, or the mine passed down). */
  | { readonly kind: "begin"; readonly mountain: Mountain }
  /** Homecomings remembered on the device from before a reload. */
  | { readonly kind: "recall"; readonly homecomings: readonly Homecoming[] }
  | { readonly kind: "dismiss"; readonly what: DismissTarget };

export type FieldData = Readonly<Record<string, string | number>>;

export type SessionEffect =
  /** An event for the field log's ring. */
  | { readonly kind: "record"; readonly code: string; readonly data: FieldData }
  | { readonly kind: "log"; readonly event: LogEvent }
  /** The homecomings changed: keep the device's copy of them in step. */
  | { readonly kind: "remember" }
  /** A band granted recipes: the mountain needs saving. */
  | { readonly kind: "granted" }
  | { readonly kind: "moved"; readonly result: MoveResult };

export type Stepped = {
  readonly session: Session;
  readonly effects: readonly SessionEffect[];
  /** Stones the crew mined in this step. */
  readonly mined: number;
};

const NO_NEWS: SessionNews = {
  away: undefined,
  quietAway: undefined,
  awayGap: undefined,
  welcomed: false,
  reveals: [],
  layersArrived: [],
  craftsFitted: [],
  crewJoined: undefined,
  engineerJoined: undefined,
  homecomings: [],
  pending: false,
};

const NO_BASELINES: Baselines = {
  reveal: undefined,
  layer: undefined,
  craft: undefined,
};

export function createSession(mountain: Mountain, hazardSeed: number): Session {
  return {
    mountain,
    lastSeen: undefined,
    hazards: freshHazards(hazardSeed),
    news: NO_NEWS,
    baselines: NO_BASELINES,
  };
}

export function saveCounts(mountain: Mountain): {
  mined: number;
  pocket: number;
} {
  return { mined: minedOut(mountain), pocket: mountain.pocket };
}

/** The trouble that is up, if any. */
export function activeTrouble(session: Session): Trouble | undefined {
  return session.hazards.phase === "trouble"
    ? session.hazards.trouble
    : undefined;
}

/** Changes when trouble starts or ends, so the store knows to show it. */
export function troubleMark(session: Session): string {
  const trouble = activeTrouble(session);
  return trouble === undefined
    ? ""
    : `${trouble.tier}:${String(trouble.startedAt)}`;
}

/** The band and the crafted levels, before away pay moves them. */
export function primeArrivals(session: Session): Session {
  return {
    ...session,
    baselines: {
      ...session.baselines,
      layer: minedOut(session.mountain),
      craft: { ...(session.mountain.crafted ?? {}) },
    },
  };
}

/** A fresh open: no baselines, no unread bands or crafts. */
export function forgetArrivals(session: Session): Session {
  return {
    ...session,
    baselines: NO_BASELINES,
    news: { ...session.news, layersArrived: [], craftsFitted: [] },
  };
}

/** A builder of one step's effects, so each rule reads as a list of what it did. */
class Effects {
  readonly list: SessionEffect[] = [];

  record(code: string, data: FieldData): void {
    this.list.push({ kind: "record", code, data });
  }

  log(event: LogEvent): void {
    this.list.push({ kind: "log", event });
  }

  push(effect: SessionEffect): void {
    this.list.push(effect);
  }
}

export function step(
  session: Session,
  input: SessionInput,
  now: number,
): Stepped {
  const out = new Effects();
  const done = (next: Session, mined = 0): Stepped => ({
    session: next,
    effects: out.list,
    mined,
  });
  switch (input.kind) {
    case "tick": {
      const ticked = tick(session, now, out);
      return done(ticked.session, ticked.mined);
    }
    case "away": {
      const paid = settleAway(session, input.since, now, out);
      return done(paid.session, paid.mined);
    }
    case "move":
      return done(applyPlayerMove(session, input.move, now, out));
    case "change":
      return done(commitChange(session, input.update, out));
    case "press":
    case "fix":
      return done(handleTrouble(session, input.kind, input.tier, out));
    case "preview-trouble":
      return done(previewTrouble(session, input.tier, now, out));
    case "notice":
      return done(notice(session, now, out));
    case "loaded":
      return done(loaded(session, out));
    case "begin":
      return done(beginRun(session, input.mountain, now, out));
    case "recall":
      return done(recall(session, input.homecomings));
    case "dismiss":
      return done(dismiss(session, input.what, out));
  }
}

/** A short break with plain stones only: a small note, not the card (#334). Ore needs its line. */
function isQuietAway(report: AwayReport): boolean {
  return (
    report.awayMs < QUIET_AWAY_MS &&
    Object.values(report.materials).every((count) => count === 0)
  );
}

/** Folds helpers' work since lastSeen into the mountain. */
function tick(
  session: Session,
  now: number,
  out: Effects,
): { session: Session; mined: number } {
  const input = timeInput(session.lastSeen, now);
  if (input.kind === "away") {
    return settleAway(session, session.lastSeen, now, out);
  }
  const moved = advance(session, input);
  const next = noteHomecomings(
    {
      ...session,
      mountain: moved.mountain,
      hazards: moved.hazards,
      lastSeen: moved.settledAt,
    },
    moved.homecomings,
    out,
  );
  if (input.kind === "live") {
    noteHazards(session.hazards, next.hazards, next.mountain, "engineer", out);
  }
  return { session: next, mined: moved.mined };
}

/**
 * Pays helpers for time the save says we were gone. The first payout of an
 * open becomes the welcome-back card; later ones (another device's save
 * arriving) are paid silently.
 */
function settleAway(
  session: Session,
  since: number | undefined,
  now: number,
  out: Effects,
): { session: Session; mined: number } {
  if (since === undefined) {
    return { session: { ...session, lastSeen: now }, mined: 0 };
  }
  const moved = advance(session, { kind: "away", from: since, to: now });
  const report = moved.away;
  /* v8 ignore next 3 -- away time always reports */
  if (report === undefined) {
    return { session, mined: 0 };
  }
  const paid = noteHomecomings(
    {
      ...session,
      mountain: moved.mountain,
      hazards: moved.hazards,
      lastSeen: moved.settledAt,
      news: { ...session.news, awayGap: { ms: report.awayMs, at: now } },
    },
    moved.homecomings,
    out,
  );
  if (moved.mined === 0) {
    return { session: paid, mined: 0 };
  }
  out.log({
    level: "info",
    code: "idle.away",
    detail: `${String(moved.mined)} while away`,
    data: {
      mined: moved.mined,
      awayMinutes: Math.round(report.awayMs / 60000),
    },
  });
  out.record("away.report", { ms: report.awayMs, stones: moved.mined });
  return { session: welcome(paid, report, moved.mined), mined: moved.mined };
}

/** A reload or a quick app switch isn't "away": only greet after a real break. */
function welcome(session: Session, report: AwayReport, mined: number): Session {
  if (session.news.welcomed || report.awayMs < WELCOME_MIN_AWAY_MS) {
    return session;
  }
  return {
    ...session,
    news: isQuietAway(report)
      ? { ...session.news, quietAway: mined }
      : { ...session.news, away: report },
  };
}

function noteHomecomings(
  session: Session,
  arrived: readonly Homecoming[],
  out: Effects,
): Session {
  const have = session.news.homecomings;
  const fresh = arrived.filter(
    (home) =>
      !have.some(
        (known) =>
          known.engineer === home.engineer && known.sentAt === home.sentAt,
      ),
  );
  if (fresh.length === 0) {
    return session;
  }
  out.push({ kind: "remember" });
  for (const arrival of fresh) {
    out.record("expedition.return", {
      id: arrival.engineer,
      source: findToken(arrival.find),
    });
    if (arrival.find.kind === "recipe") {
      out.record("recipe.found", {
        id: arrival.find.id,
        source: arrival.tunnel,
      });
    }
  }
  return {
    ...session,
    news: { ...session.news, homecomings: [...have, ...fresh], pending: true },
  };
}

/** The find the ring stores. A quiet tunnel has no shelf id. */
function findToken(find: Homecoming["find"]): string {
  switch (find.kind) {
    case "glimmer":
      return find.relic;
    case "tool":
    case "keepsake":
      return find.id;
    case "engineer":
      return find.name;
    case "recipe":
      return find.id;
    case "quiet":
      return "quiet";
  }
}

/**
 * Trouble starting, or ending by hand or by the engineer on that tier.
 * Leaving the game clears trouble without a fix. Dropping the last borer
 * does too: there is nothing left to trouble.
 */
function noteHazards(
  before: HazardState,
  after: HazardState,
  mountain: Mountain,
  fixBy: "hand" | "engineer",
  out: Effects,
): void {
  if (
    before.phase === "waiting" &&
    after.phase === "waiting" &&
    after.seed !== before.seed &&
    engineerFixDelay(mountain, before.tier) === 0
  ) {
    out.record("trouble.start", { id: before.tier, source: before.kind });
    out.record("trouble.fix", { id: before.tier, source: "engineer" });
    return;
  }
  const was = before.phase === "trouble" ? before.trouble : undefined;
  const next = after.phase === "trouble" ? after.trouble : undefined;
  if (
    was !== undefined &&
    (next === undefined || next.startedAt !== was.startedAt) &&
    !(after.phase === "idle" && mountain.borers < 1)
  ) {
    out.record("trouble.fix", { id: was.tier, source: fixBy });
  }
  if (
    next !== undefined &&
    (was === undefined || was.startedAt !== next.startedAt)
  ) {
    out.record("trouble.start", { id: next.tier, source: next.kind });
  }
}

/** The clock and the trouble the move sees are the settled ones. */
function applyPlayerMove(
  settled: Session,
  move: Move,
  now: number,
  out: Effects,
): Session {
  const result = applyMove(settled.mountain, move, now, {
    trouble: activeTrouble(settled),
  });
  out.push({ kind: "moved", result });
  return result.kind === "applied"
    ? commitChange(
        settled,
        () => ({ mountain: result.mountain, events: result.events }),
        out,
      )
    : settled;
}

/** A first use teaches its mark, and each event goes to the field log. */
function commitChange(
  session: Session,
  update: (mountain: Mountain) => MountainChange,
  out: Effects,
): Session {
  const change = update(session.mountain);
  const mountain = recordFirstUse(change.mountain);
  if (mountain === session.mountain) {
    return session;
  }
  for (const event of change.events) {
    const entry = fieldEntry(event);
    out.record(entry.code, entry.data);
  }
  return { ...session, mountain };
}

/** A tap (the fifth fixes it) or a short hold on the troubled tier. */
function handleTrouble(
  session: Session,
  kind: "press" | "fix",
  tier: TroubleTier,
  out: Effects,
): Session {
  const hazards = session.hazards;
  if (hazards.phase !== "trouble" || hazards.trouble.tier !== tier) {
    return session;
  }
  const next =
    kind === "press"
      ? pressHazard(hazards, session.mountain)
      : fixHazard(hazards, session.mountain);
  noteHazards(hazards, next, session.mountain, "hand", out);
  return { ...session, hazards: next };
}

function previewTrouble(
  session: Session,
  tier: TroubleTier,
  now: number,
  out: Effects,
): Session {
  const before = activeTrouble(session);
  const trouble = { kind: kindForTier(tier), tier, startedAt: now };
  if (before === undefined || before.startedAt !== trouble.startedAt) {
    out.record("trouble.start", { id: trouble.tier, source: trouble.kind });
  }
  return {
    ...session,
    hazards: {
      phase: "trouble",
      seed: session.hazards.seed,
      taps: 0,
      trouble,
    },
  };
}

/** Relics, bands and crafts reached since the baselines, in that order. */
function notice(session: Session, now: number, out: Effects): Session {
  return noteCrafts(noteLayers(noteReveals(session, out), out), now, out);
}

function noteReveals(session: Session, out: Effects): Session {
  const mined = minedOut(session.mountain);
  const before = session.baselines.reveal;
  const found =
    before === undefined ? [] : relicsUncovered({ before, after: mined });
  for (const relic of found) {
    out.log({
      level: "info",
      code: "relic.found",
      detail: relic.id,
      data: { mined },
    });
    out.record("relic.found", { id: relic.id });
  }
  return {
    ...session,
    news:
      found.length === 0
        ? session.news
        : { ...session.news, reveals: [...session.news.reveals, ...found] },
    baselines: { ...session.baselines, reveal: mined },
  };
}

/** A band broken into since the baseline, once per layer this open. Each band grants its recipes. */
function noteLayers(session: Session, out: Effects): Session {
  const mined = minedOut(session.mountain);
  let mountain = session.mountain;
  for (const layer of LAYERS) {
    if (layer.from === 0 || mined < layer.from) {
      continue;
    }
    const next = grantRecipes(mountain, layerRecipeIds(layer.id));
    if (next.found.length === 0) {
      continue;
    }
    mountain = next.mountain;
    for (const id of next.found) {
      out.record("recipe.found", { id, source: layer.id });
    }
  }
  const before = session.baselines.layer;
  const entered = before === undefined ? [] : layersEntered(before, mined);
  for (const layer of entered) {
    out.record("layer.enter", { id: layer.id });
  }
  if (mountain !== session.mountain) {
    out.push({ kind: "granted" });
  }
  return {
    ...session,
    mountain,
    news:
      entered.length === 0
        ? session.news
        : {
            ...session.news,
            layersArrived: [...session.news.layersArrived, ...entered],
          },
    baselines: { ...session.baselines, layer: mined },
  };
}

/** A craft whose level rose since the baseline, with the mountain the screen words it from. */
function noteCrafts(session: Session, now: number, out: Effects): Session {
  const noted = session.baselines.craft;
  const fitted: CraftNotice[] = [];
  for (const id of noted === undefined ? [] : RECIPE_IDS) {
    const level = craftedLevel(session.mountain, id);
    if (level <= (noted?.[id] ?? 0)) {
      continue;
    }
    out.record("craft.done", { id, count: level });
    fitted.push({ id, level, mountain: session.mountain, at: now });
  }
  return {
    ...session,
    news:
      fitted.length === 0
        ? session.news
        : {
            ...session.news,
            craftsFitted: [...session.news.craftsFitted, ...fitted],
          },
    baselines: {
      ...session.baselines,
      craft: { ...(session.mountain.crafted ?? {}) },
    },
  };
}

/** The one-time free staff, then the first borer's engineer, for a loaded save. */
function loaded(session: Session, out: Effects): Session {
  const staffed = staffExisting(session.mountain);
  let next = session;
  if (staffed.mountain !== session.mountain) {
    next = { ...next, mountain: staffed.mountain };
    if (staffed.joined > 0) {
      next = {
        ...next,
        news: {
          ...next.news,
          crewJoined: (next.news.crewJoined ?? 0) + staffed.joined,
        },
      };
      out.record("crew.staff", { count: staffed.joined });
      out.log({
        level: "info",
        code: "save.staffed",
        detail: `${String(staffed.joined)} workers joined`,
        data: saveCounts(next.mountain),
      });
    }
  }
  const engineer = grantFirstEngineer(next.mountain);
  if (engineer.mountain === next.mountain) {
    return next;
  }
  out.log({
    level: "info",
    code: "save.engineer",
    detail: "first engineer",
    data: saveCounts(engineer.mountain),
  });
  return {
    ...next,
    mountain: engineer.mountain,
    news: { ...next.news, engineerJoined: true },
  };
}

function beginRun(
  session: Session,
  mountain: Mountain,
  now: number,
  out: Effects,
): Session {
  out.push({ kind: "remember" });
  return primeArrivals({
    mountain,
    hazards: freshHazards(now),
    lastSeen: runStartedAt(mountain),
    news: {
      ...session.news,
      away: undefined,
      quietAway: undefined,
      homecomings: [],
      reveals: [],
      layersArrived: [],
      craftsFitted: [],
    },
    baselines: { ...session.baselines, reveal: 0 },
  });
}

function recall(session: Session, homecomings: readonly Homecoming[]): Session {
  if (session.news.homecomings.length > 0 || homecomings.length === 0) {
    return session;
  }
  return {
    ...session,
    news: { ...session.news, homecomings, pending: true },
  };
}

function dismiss(session: Session, what: DismissTarget, out: Effects): Session {
  const news = session.news;
  switch (what) {
    case "reveal":
      return { ...session, news: { ...news, reveals: news.reveals.slice(1) } };
    case "quiet":
      return { ...session, news: { ...news, quietAway: undefined } };
    case "layer":
      return {
        ...session,
        news: { ...news, layersArrived: news.layersArrived.slice(1) },
      };
    case "craft":
      return {
        ...session,
        news: { ...news, craftsFitted: news.craftsFitted.slice(1) },
      };
    case "away":
      out.push({ kind: "remember" });
      return {
        ...session,
        news: {
          ...news,
          away: undefined,
          crewJoined: undefined,
          engineerJoined: undefined,
          homecomings: [],
          layersArrived: [],
          craftsFitted: [],
        },
      };
  }
}

/** True when there is something for `dismiss` to close. */
export function hasNews(session: Session, what: DismissTarget): boolean {
  const news = session.news;
  switch (what) {
    case "reveal":
      return news.reveals.length > 0;
    case "quiet":
      return news.quietAway !== undefined;
    case "layer":
      return news.layersArrived.length > 0;
    case "craft":
      return news.craftsFitted.length > 0;
    case "away":
      return (
        news.away !== undefined ||
        news.crewJoined !== undefined ||
        news.engineerJoined !== undefined ||
        news.homecomings.length > 0
      );
  }
}

/**
 * Where news counts from for a copy coming into play. `rebase` starts both
 * from this mountain; otherwise a baseline already set is kept.
 */
export function openBaselines(session: Session, rebase: boolean): Session {
  const withReveal: Session = {
    ...session,
    baselines: {
      ...session.baselines,
      reveal:
        rebase || session.baselines.reveal === undefined
          ? minedOut(session.mountain)
          : session.baselines.reveal,
    },
  };
  return rebase || withReveal.baselines.layer === undefined
    ? primeArrivals(withReveal)
    : withReveal;
}

/** The welcome-back card has had its chance this open. */
export function markWelcomed(session: Session): Session {
  return { ...session, news: { ...session.news, welcomed: true } };
}
