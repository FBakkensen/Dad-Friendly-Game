import { wearsSteelToes } from "./lost-tools";
import type { Mountain } from "./mountain";

/**
 * Trouble at the machines (M7 §5). Session-only: never saved, never during
 * time away, cleared on close or reload. One tier at a time, and only once
 * a borer is owned. See docs/DESIGN.md.
 */

/** Carts, drills, borers, or the Great Machine. */
export type TroubleTier = "cart" | "drill" | "borer" | "machine";

/** Cave-in on carts, flood on drills, jam on borers and the Great Machine. */
export type TroubleKind = "cave-in" | "flood" | "jam";

export type Trouble = {
  readonly kind: TroubleKind;
  readonly tier: TroubleTier;
  readonly startedAt: number;
};

/** Live play between troubles. Steel-toe boots stretch this (see BOOTS_GAP_SCALE). */
export const TROUBLE_MIN_MS = 3 * 60 * 1000;
export const TROUBLE_MAX_MS = 6 * 60 * 1000;

/**
 * Steel-toe boots make trouble rarer by this much. `wearsSteelToes` is the
 * query (#148); `boots: true` still forces it for a caller that already knows.
 */
export const BOOTS_GAP_SCALE = 2;

function troubleIsRarer(mountain: Mountain, boots?: boolean): boolean {
  return boots === true || wearsSteelToes(mountain);
}

/** The slowdown eases from a quarter to a half across this stretch. */
export const SLOW_EASE_MS = 2 * 60 * 1000;

/** Taps on the troubled card that put it right. */
export const FIX_TAPS = 5;

/** A short hold on the card fixes it without those taps. */
export const FIX_HOLD_MS = 600;

/**
 * An apprentice or journeyman tending the tier fixes it alone after this
 * long. A Master fixes it at once (delay 0).
 */
export const ENGINEER_FIX_MS = 30_000;

export type HazardState =
  | { readonly phase: "idle"; readonly seed: number }
  | {
      readonly phase: "waiting";
      readonly seed: number;
      readonly playedMs: number;
      readonly gapMs: number;
      readonly kind: TroubleKind;
      readonly tier: TroubleTier;
    }
  | {
      readonly phase: "trouble";
      readonly seed: number;
      readonly taps: number;
      readonly trouble: Trouble;
    };

export type ScheduledTrouble = {
  readonly seed: number;
  readonly gapMs: number;
  readonly trouble: Trouble;
};

/** A fresh session. Nothing is wrong, and nothing is scheduled yet. */
export function freshHazards(seed: number): HazardState {
  return { phase: "idle", seed };
}

export function kindForTier(tier: TroubleTier): TroubleKind {
  switch (tier) {
    case "cart":
      return "cave-in";
    case "drill":
      return "flood";
    case "borer":
    case "machine":
      return "jam";
  }
}

/**
 * The trouble that would begin at `now`, and how much live play leads up to it.
 * Undefined until a borer is owned. The same seed always rolls the same trouble.
 * Steel-toe boots (`wearsSteelToes`, or `boots`) stretch the gap.
 */
export function nextTrouble(
  seed: number,
  now: number,
  mountain: Mountain,
  boots = false,
): ScheduledTrouble | undefined {
  if (mountain.borers < 1) {
    return undefined;
  }
  const gapRoll = roll(seed);
  const tierRoll = roll(gapRoll.seed);
  const tiers = troubleTiers(mountain);
  const index = Math.min(
    tiers.length - 1,
    Math.floor(tierRoll.unit * tiers.length),
  );
  const tier = tiers[index];
  // A borer is always eligible when this runs.
  /* v8 ignore next 3 -- troubleTiers includes the borer here */
  if (tier === undefined) {
    return undefined;
  }
  const span = TROUBLE_MAX_MS - TROUBLE_MIN_MS;
  const gapMs = Math.round(TROUBLE_MIN_MS + gapRoll.unit * span);
  return {
    seed: tierRoll.seed,
    gapMs: troubleIsRarer(mountain, boots) ? gapMs * BOOTS_GAP_SCALE : gapMs,
    trouble: { kind: kindForTier(tier), tier, startedAt: now },
  };
}

/**
 * Speed kept while trouble is up: three quarters at the start, easing to a
 * half over two minutes, then staying there.
 */
export function slowedSpeed(
  speed: number,
  startedAt: number,
  now: number,
): number {
  const elapsed = Math.max(0, now - startedAt);
  const t = Math.min(1, elapsed / SLOW_EASE_MS);
  return (speed * (3 - t)) / 4;
}

/**
 * Milliseconds until a tending engineer clears this tier, or undefined when
 * nobody is tending it. A Master is 0.
 */
export function engineerFixDelay(
  mountain: Mountain,
  tier: TroubleTier,
): number | undefined {
  let best: number | undefined;
  for (const engineer of mountain.engineers ?? []) {
    if (engineer.post !== tier) {
      continue;
    }
    const delay = engineer.rank === 2 ? 0 : ENGINEER_FIX_MS;
    if (best === undefined || delay < best) {
      best = delay;
    }
  }
  return best;
}

/** Clears trouble and starts the next wait. The same state when nothing is wrong. */
export function fix(
  state: HazardState,
  mountain: Mountain,
  boots = false,
): HazardState {
  if (state.phase !== "trouble") {
    return state;
  }
  return schedule(state.seed, mountain, boots);
}

/** One tap on the troubled card. The fifth tap fixes it. */
export function pressTrouble(
  state: HazardState,
  mountain: Mountain,
  boots = false,
): HazardState {
  if (state.phase !== "trouble") {
    return state;
  }
  const taps = state.taps + 1;
  if (taps < FIX_TAPS) {
    return { ...state, taps };
  }
  return fix(state, mountain, boots);
}

/**
 * Live play moved forward by `liveMs`. Away time is not passed in, so it
 * never starts or worsens trouble. `playerFixMs` is the sim dad putting it
 * right; the real player uses taps and the hold instead.
 */
export function stepHazards(
  state: HazardState,
  options: {
    readonly now: number;
    readonly liveMs: number;
    readonly mountain: Mountain;
    readonly boots?: boolean;
    readonly playerFixMs?: number;
  },
): HazardState {
  const boots = options.boots === true;
  const liveMs = Math.max(0, options.liveMs);
  if (options.mountain.borers < 1) {
    return { phase: "idle", seed: state.seed };
  }

  let current: HazardState =
    state.phase === "idle"
      ? schedule(state.seed, options.mountain, boots)
      : state;

  if (current.phase === "trouble") {
    const elapsed = options.now - current.trouble.startedAt;
    const delay = engineerFixDelay(options.mountain, current.trouble.tier);
    const engineerClears = delay !== undefined && elapsed >= delay;
    const playerClears =
      options.playerFixMs !== undefined && elapsed >= options.playerFixMs;
    if (!engineerClears && !playerClears) {
      return current;
    }
    current = schedule(current.seed, options.mountain, boots);
  }

  // Scheduling with a borer always waits; the idle phase already returned.
  /* v8 ignore next 3 -- phase is waiting whenever a borer is owned */
  if (current.phase !== "waiting") {
    return current;
  }

  const playedMs = current.playedMs + liveMs;
  if (playedMs < current.gapMs) {
    return { ...current, playedMs };
  }

  const trouble: Trouble = {
    kind: current.kind,
    tier: current.tier,
    startedAt: options.now,
  };
  // A Master tending this tier never lets the trouble stick.
  if (engineerFixDelay(options.mountain, trouble.tier) === 0) {
    return schedule(current.seed, options.mountain, boots);
  }
  return { phase: "trouble", seed: current.seed, taps: 0, trouble };
}

/** Close or a stretch away: trouble ends, and the next wait starts over. */
export function closeHazards(
  state: HazardState,
  mountain: Mountain,
  boots = false,
): HazardState {
  return schedule(state.seed, mountain, boots);
}

function schedule(
  seed: number,
  mountain: Mountain,
  boots: boolean,
): HazardState {
  const next = nextTrouble(seed, 0, mountain, boots);
  if (next === undefined) {
    return { phase: "idle", seed };
  }
  return {
    phase: "waiting",
    seed: next.seed,
    playedMs: 0,
    gapMs: next.gapMs,
    kind: next.trouble.kind,
    tier: next.trouble.tier,
  };
}

function troubleTiers(mountain: Mountain): readonly TroubleTier[] {
  // Caller already knows a borer is owned, so that tier is always eligible.
  const tiers: TroubleTier[] = [];
  if (mountain.carts > 0) {
    tiers.push("cart");
  }
  if (mountain.drills > 0) {
    tiers.push("drill");
  }
  tiers.push("borer");
  if (mountain.machines > 0) {
    tiers.push("machine");
  }
  return tiers;
}

/** One deterministic 0..1 step. The next seed always moves. */
function roll(seed: number): { readonly unit: number; readonly seed: number } {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  const next = (x ^ (x >>> 16)) >>> 0;
  return { unit: next / 4294967296, seed: (next + 1) >>> 0 };
}
