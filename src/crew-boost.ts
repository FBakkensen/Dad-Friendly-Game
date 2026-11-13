import { boostById, boostLeft } from "./boosts";
import { RUSH_MS, rushLeft } from "./gold-rush";
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
      readonly source: "overtime" | "axle-grease" | "blasting-charge";
      readonly name: string;
      readonly multiplier: number;
      readonly leftMs: number;
      readonly fullMs: number;
    }
  | {
      /**
       * A Gold rush: held stones coming in, not a crew speed, so the dial
       * shows how many are still to come instead of a × (#525).
       */
      readonly kind: "rush";
      readonly name: string;
      readonly held: number;
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

/**
 * The crew timer the crew is running at: the strongest of Overtime, axle
 * grease and a blasting charge, the same rule as `effectiveRates`. A tie
 * goes to the one with the most time left. A Gold rush, which pays held
 * stones beside them, shows first.
 */
export function liveCrewBoost(mountain: Mountain, now: number): CrewBoost {
  // A Gold rush is the event of the moment, so the dial shows it first (#468):
  // the held stones still to come, while the crew's own speed stays on the gauge.
  const rush = rushLeft(mountain, now);
  if (rush > 0) {
    return {
      kind: "rush",
      name: GOLD_RUSH_NAME,
      held: mountain.rushBank,
      leftMs: rush,
      fullMs: RUSH_MS,
    };
  }
  const overtime = boostById("overtime");
  const left = boostLeft(mountain, "overtime", now);
  const candidates: Running[] = [];
  if (left > 0 && overtime.multiplier > 1) {
    candidates.push({
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
      candidates.push(found);
    }
  }
  let best: Running | undefined;
  for (const c of candidates) {
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
