import { boostById, boostLeft } from "./boosts";
import { RUSH_MS, RUSH_MULTIPLIER, rushLeft } from "./gold-rush";
import type { Mountain } from "./mountain";
import {
  axleCrewMultiplier,
  chargeCrewMultiplier,
  hotTimers,
  recipeById,
  timerDurationMs,
  type TimerId,
} from "./workshop";

export type CrewBoost =
  | { readonly kind: "rested" }
  | {
      readonly kind: "running";
      readonly source:
        "overtime" | "axle-grease" | "blasting-charge" | "gold-rush";
      readonly name: string;
      readonly multiplier: number;
      readonly leftMs: number;
      readonly fullMs: number;
    };

type Running = Extract<CrewBoost, { kind: "running" }>;

/** The rush's name on the dial and its chip (Flemming, 11 Nov 2026). */
export const GOLD_RUSH_NAME = "Gold rush";

function timerBoost(
  mountain: Mountain,
  now: number,
  source: TimerId & Running["source"],
  multiplier: number,
): Running | undefined {
  if (multiplier <= 1) {
    return undefined;
  }
  const until = hotTimers(mountain, now).find((t) => t.id === source)?.until;
  if (until === undefined) {
    return undefined;
  }
  const fullMs = timerDurationMs(source);
  return {
    kind: "running",
    source,
    name: recipeById(source).name,
    multiplier,
    leftMs: Math.min(fullMs, Math.max(0, until - now)),
    fullMs,
  };
}

/** Every crew boost running now: the Gold rush first, then the crew timers. */
function runningCrewBoosts(mountain: Mountain, now: number): Running[] {
  const running: Running[] = [];
  const rush = rushLeft(mountain, now);
  if (rush > 0) {
    running.push({
      kind: "running",
      source: "gold-rush",
      name: GOLD_RUSH_NAME,
      multiplier: RUSH_MULTIPLIER,
      leftMs: rush,
      fullMs: RUSH_MS,
    });
  }
  const overtime = boostById("overtime");
  const left = boostLeft(mountain, "overtime", now);
  if (left > 0 && overtime.multiplier > 1) {
    running.push({
      kind: "running",
      source: "overtime",
      name: overtime.name,
      multiplier: overtime.multiplier,
      leftMs: left,
      fullMs: overtime.durationMs,
    });
  }
  for (const found of [
    timerBoost(mountain, now, "axle-grease", axleCrewMultiplier(mountain, now)),
    timerBoost(
      mountain,
      now,
      "blasting-charge",
      chargeCrewMultiplier(mountain, now),
    ),
  ]) {
    if (found !== undefined) {
      running.push(found);
    }
  }
  return running;
}

/**
 * The crew timer the crew is running at: the strongest of Overtime, axle
 * grease and a blasting charge, the same rule as `effectiveRates`. A tie
 * goes to the one with the most time left. A Gold rush, which multiplies on
 * top of them, shows first.
 */
export function liveCrewBoost(mountain: Mountain, now: number): CrewBoost {
  const running = runningCrewBoosts(mountain, now);
  // The Gold rush multiplies on top of the others, so the dial shows it (#468).
  const rush = running.find((boost) => boost.source === "gold-rush");
  if (rush !== undefined) {
    return rush;
  }
  let best: Running | undefined;
  for (const c of running) {
    if (
      best === undefined ||
      c.multiplier > best.multiplier ||
      (c.multiplier === best.multiplier && c.leftMs > best.leftMs)
    ) {
      best = c;
    }
  }
  return best ?? { kind: "rested" };
}

/** The dial's boost as last painted, and when. */
export interface SeenBoost {
  readonly boost: CrewBoost;
  readonly at: number;
}

/**
 * A paint this long after the last one is a return, not play he watched: a
 * boost that ended in between ended while he was away (#525).
 */
const WATCHED_GAP_MS = 5000;
/** Leeway for a paint that lands a little late on the 1s tick. */
const TICK_SLACK_MS = 1000;

/**
 * The boost the dial showed that has just run out on its clock while he
 * played, so the board can say why the crew slowed (#525). A boost a bigger
 * one took the dial from, one stopped early (Start over), or one that ended
 * while the game was away says nothing.
 */
export function boostRanOut(
  seen: SeenBoost | undefined,
  mountain: Mountain,
  now: number,
): Running | undefined {
  if (seen === undefined || seen.boost.kind !== "running") {
    return undefined;
  }
  const { boost } = seen;
  const since = now - seen.at;
  const ranOut =
    since >= 0 &&
    since <= WATCHED_GAP_MS &&
    boost.leftMs <= since + TICK_SLACK_MS &&
    !runningCrewBoosts(mountain, now).some((b) => b.source === boost.source);
  return ranOut ? boost : undefined;
}

/** Dial sheet frame: 0 rested, else 1..30 by the share of time left. */
export function dialFrame(boost: CrewBoost): number {
  if (boost.kind === "rested") {
    return 0;
  }
  return Math.min(
    30,
    Math.max(1, Math.ceil((boost.leftMs / boost.fullMs) * 30)),
  );
}
